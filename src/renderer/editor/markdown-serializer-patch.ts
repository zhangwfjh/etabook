/**
 * Runtime patch for `@tiptap/markdown`'s MarkdownManager to stop normalizing
 * raw markdown text during serialization.
 *
 * # The problem
 *
 * `@tiptap/markdown` v3.26.0 runs two private transforms on every text node
 * during serialization:
 *
 *   1. `encodeHtmlEntities` — `&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`
 *   2. `escapeMarkdownSyntax` — backslash-escapes `\ `[ ` ] `*` `_` `` ` `` `~`
 *
 * Both are `private` with no config option, no protected access, no hook.
 * They run unconditionally on all non-code text, mangling content:
 *
 *   - `[[Note]]`    → `\[\[Note\]\]`   (wikilinks, footnotes `[^1]`, task `[?]`)
 *   - `Tom & Jerry` → `Tom &amp; Jerry`
 *   - `a < b`       → `a &lt; b`
 *
 * The parse path symmetrically decodes/strips, so the *second* round-trip is
 * stable — but the first round-trip (first save) silently
 * rewrites the user's original text.
 *
 * # The fix
 *
 * Swap the private methods on the prototype before any instance is created:
 *
 *   - `encodeTextForMarkdown` — skip `encodeHtmlEntities` entirely. Raw `&`,
 *     `<`, `>` are valid markdown text; they only need encoding inside HTML
 *     contexts, which the library handles separately for `parseHTML` tokens.
 *
 *   - `escapeMarkdownSyntax` — escape `\` and `` ` `` unconditionally (they
 *     are unambiguous syntax), escape `*` `_` `~` unconditionally (safe — the
 *     backslash is stripped on re-parse, and these are genuine emphasis
 *     delimiters that *should* be escaped in literal text). But make `[` and
 *     `]` **context-aware**: a `[` only needs escaping when it begins a
 *     construct the parser would recognise as a link, image, or footnote.
 *     A `[` in mid-prose (`"press [ENTER]"`) is harmless.
 *
 * # Why a prototype patch instead of a fork?
 *
 * MarkdownManager is ~1,700 lines of battle-tested mark-boundary logic.
 * The broken behavior is 4 lines in two private methods. Patching via
 * `Object.defineProperty` on the prototype is surgical and auditable.
 *
 * # Safety
 *
 * - Applied once (module-level sentinel).
 * - Replacement functions are pure string transforms.
 * - If upstream changes internals, the guard throws at startup.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Permissive type for accessing/assigning private methods on the prototype.
type AnyMethodRecord = Record<string, (...args: any[]) => any>

let applied = false

/**
 * Patch MarkdownManager's prototype to stop normalizing raw text.
 * Call once before constructing any MarkdownManager instance.
 *
 * Accepts the class explicitly (no `require` — the renderer is ESM-bundled).
 */
export function patchSerializerEscape(MarkdownManagerClass: unknown): void {
  if (applied) return

  const proto = (MarkdownManagerClass as { prototype: AnyMethodRecord }).prototype

  // ── Guard: verify the methods still exist ─────────────────────────────
  const originalEncode = proto['encodeTextForMarkdown']
  const originalEscape = proto['escapeMarkdownSyntax']
  if (typeof originalEncode !== 'function') {
    throw new Error(
      'markdown-serializer-patch: MarkdownManager.prototype.encodeTextForMarkdown not found. ' +
      '@tiptap/markdown may have been updated — audit the new serialize path.',
    )
  }
  if (typeof originalEscape !== 'function') {
    throw new Error(
      'markdown-serializer-patch: MarkdownManager.prototype.escapeMarkdownSyntax not found. ' +
      '@tiptap/markdown may have been updated — audit the new serialize path.',
    )
  }

  // ── 1. encodeTextForMarkdown: drop HTML entity encoding ───────────────
  //
  // Stock: `escapeMarkdownSyntax(encodeHtmlEntities(text))`
  // Patched: `escapeMarkdownSyntax(text)` — no entity encoding.
  //
  // We must re-check the code-context guard since we replace the whole method.
  // `codeTypes` is a private Set on the instance; read it via bracket notation.
  proto['encodeTextForMarkdown'] = function (this: any, text: string, node: any, parentNode?: any): string {
    const codeTypes: Set<string> | undefined = this.codeTypes
    const isInsideCode =
      (parentNode?.type != null && codeTypes?.has(parentNode.type)) ||
      (node.marks || []).some((m: any) => codeTypes?.has(typeof m === 'string' ? m : m.type))

    if (isInsideCode) {
      return text
    }

    return escapeMarkdownSyntaxPatched(text)
  }

  // ── 2. escapeMarkdownSyntax: context-aware brackets ───────────────────
  //
  // Stock: escape all of `\ `[ ` ] `*` `_` `` ` `` `~`
  // Patched: escape `\ `[ ` `*` `_` `` ` `` `~` unconditionally, but make
  // `[` context-aware (see escapeMarkdownSyntaxPatched).
  proto['escapeMarkdownSyntax'] = function (text: string): string {
    return escapeMarkdownSyntaxPatched(text)
  }

  applied = true
}

/**
 * Escaping strategy:
 *
 * - `\` and `` ` `` — always escape. These are unambiguous syntax chars.
 *   A bare backtick opens a code span; a bare backslash modifies the next char.
 *
 * - `*`, `_`, `~` — always escape. These are genuine emphasis/strikethrough
 *   delimiters. Escaping them in literal text is correct and idempotent
 *   (backslash stripped on re-parse). The cost is a `\*` in a few places where
 *   the surrounding whitespace would have prevented emphasis anyway, but
 *   correctness > aesthetics for the raw markdown.
 *
 * - `[` — context-aware. Only escape when the `[` begins a pattern that the
 *   parser would recognise as a link / image / footnote reference. A `[`
 *   in mid-prose is left alone, preserving `[[wikilinks]]`, `[^footnotes]`,
 *   and `[custom statuses]`.
 *
 * - `]` — never escape. A `]` is only meaningful as a *closing* delimiter for
 *   a `[` that was already escaped. Since we handle `[` contextually, `]`
 *   never needs escaping on its own.
 *
 * - `&`, `<`, `>` — never touch. Raw HTML characters are valid markdown text.
 *   The parse path still decodes entities from externally-authored content.
 */
function escapeMarkdownSyntaxPatched(text: string): string {
  // Step 1: Always escape backslash and backtick.
  let out = text.replace(/([\\`])/g, '\\$1')

  // Step 2: Escape emphasis markers. Safe and correct in literal text.
  out = out.replace(/([*_~])/g, '\\$1')

  // Step 3: Context-aware bracket escaping.
  //
  // Escape `[` only when it begins a construct the marked.js parser would
  // actually consume as a link or image. A `[` in mid-prose (`"press [ENTER]"`)
  // or in Obsidian syntax (`[[wikilink]]`, `[^footnote]`, `- [?]`) is left
  // alone — without a corresponding extension, the parser treats these as
  // literal text, so escaping them would only mangle the raw markdown.
  //
  //   - `[text](url)`  — inline link          → escape if `](` follows
  //   - `[text][ref]`  — reference link       → escape if `][` follows
  //   - `![alt](url)`  — image                → escape the `!` too
  out = out.replace(/\[(?=[^[\]]*\]\()/g, '\\[')      // [text](
  out = out.replace(/\[(?=[^[\]]*\]\[)/g, '\\[')       // [text][
  out = out.replace(/!\[(?=[^[\]]*\]\()/g, '\\![')     // ![alt](

  return out
}
