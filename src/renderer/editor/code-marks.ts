/**
 * Code-block and inline-code extensions that preserve the user's original
 * fence markup through the parse→serialize round-trip.
 *
 * The stock TipTap extensions always serialize fenced code blocks as
 * 3-backtick fences and inline code with a single backtick pair. When a file
 * containing a 4-backtick fence, a tilde fence (`~~~`), or double-backtick
 * inline code (`` `` `x` `` ````) is loaded, parsed, and re-serialized, the
 * original markup is silently rewritten — violating the principle that user
 * content is immutable until the user explicitly edits it.
 *
 * Fix: capture the fence character and length at parse time (from the
 * marked.js token's `raw` field) and store them as node/mark attributes,
 * then use them during serialization.
 */

import type { JSONContent, MarkdownToken } from '@tiptap/core'
import { textblockTypeInputRule } from '@tiptap/core'
import { Code as BaseCode } from '@tiptap/extension-code'
import { CodeBlockLowlight as BaseCodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'

const BACKTICK = '`'
const TILDE = '~'
const DEFAULT_FENCE_LENGTH = 3

/**
 * Parse the fence character and length from a marked.js `code` token's
 * `raw` field. The raw includes the opening fence line, e.g.
 * `` ````\ncode\n```` `` or `~~~\ncode\n~~~`.
 *
 * Falls back to a 3-backtick fence when the raw cannot be parsed (which
 * also covers indented code blocks, though those are not fenced).
 */
function fenceFromRaw(raw: string | undefined): { char: string; length: number } {
  const firstLine = (raw ?? '').split('\n', 1)[0] ?? ''
  const match = /^(`+|~+)/.exec(firstLine)
  if (!match || !match[1]) {
    return { char: BACKTICK, length: DEFAULT_FENCE_LENGTH }
  }
  const run = match[1]
  const char = run[0] === TILDE ? TILDE : BACKTICK
  return { char, length: run.length }
}

/**
 * Minimum backtick count needed to wrap `text` as an unambiguous code span:
 * one more than the longest run of backticks in the content (at least 1).
 * A span with no backtick in its content needs only a single pair; a span
 * containing a backtick needs enough to fence it.
 */
function minNeededBackticks(text: string | undefined): number {
  const longest = (text ?? '').match(/`+/g)?.reduce((m, s) => Math.max(m, s.length), 0) ?? 0
  return Math.max(1, longest + 1)
}

/**
 * CodeBlockLowlight override that preserves the fence character (`` ` `` vs
 * `~`) and fence length across the round-trip.
 *
 * Extends the lowlight variant so syntax highlighting and its node-view keep
 * working; it only swaps in fence-preserving `parseMarkdown` /
 * `renderMarkdown` and adds the `fenceChar` / `fenceLength` attributes.
 */
export const CodeBlock = BaseCodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      language: {
        default: null,
        parseHTML: (element) => {
          const { languageClassPrefix } = this.options
          if (!languageClassPrefix) {
            return null
          }
          const classNames = [...(element.firstElementChild?.classList ?? [])]
          const languages = classNames
            .filter((className) => className.startsWith(languageClassPrefix))
            .map((className) => className.replace(languageClassPrefix, ''))
          return languages[0] ?? null
        },
        rendered: false,
      },
      fenceChar: {
        default: BACKTICK,
        renderHTML: () => ({}),
        parseHTML: () => ({}),
      },
      fenceLength: {
        default: DEFAULT_FENCE_LENGTH,
        renderHTML: () => ({}),
        parseHTML: () => ({}),
      },
    }
  },

  parseMarkdown(token: MarkdownToken, helpers: {
    createNode: (
      type: string,
      attrs?: Record<string, unknown>,
      content?: JSONContent[],
    ) => JSONContent
    createTextNode: (text: string) => JSONContent
  }) {
    const raw = token.raw
    // Indented code blocks have no fence; only accept fenced styles.
    if (
      raw?.startsWith(BACKTICK) === false &&
      raw?.startsWith(TILDE) === false &&
      token.codeBlockStyle !== 'indented'
    ) {
      return []
    }
    const { char, length } = fenceFromRaw(raw)
    return helpers.createNode(
      'codeBlock',
      {
        language: token.lang || null,
        fenceChar: char,
        fenceLength: length,
      },
      token.text ? [helpers.createTextNode(token.text)] : [],
    )
  },

  renderMarkdown(node: JSONContent, h: {
    renderChildren: (nodes: JSONContent | JSONContent[]) => string
  }) {
    const char = node.attrs?.fenceChar === TILDE ? TILDE : BACKTICK
    const length =
      typeof node.attrs?.fenceLength === 'number' && node.attrs.fenceLength >= DEFAULT_FENCE_LENGTH
        ? node.attrs.fenceLength
        : DEFAULT_FENCE_LENGTH
    const openFence = char.repeat(length)
    const language = node.attrs?.language || ''
    if (!node.content) {
      return `${openFence}${language}\n\n${openFence}`
    }
    return [`${openFence}${language}`, h.renderChildren(node.content), openFence].join('\n')
  },

  addInputRules() {
    const type = this.type
    return [
      textblockTypeInputRule({
        find: /^```([a-zA-Z0-9+#.-]*)?[\s\n]$/,
        type,
        getAttributes: (match) => ({
          language: match[1] || null,
          fenceChar: BACKTICK,
          fenceLength: 3,
        }),
      }),
      textblockTypeInputRule({
        find: /^~~~([a-zA-Z0-9+#.-]*)?[\s\n]$/,
        type,
        getAttributes: (match) => ({
          language: match[1] || null,
          fenceChar: TILDE,
          fenceLength: 3,
        }),
      }),
    ]
  },
})

/**
 * Inline Code mark override — correctness only, style normalized.
 *
 * Stylistic markup is normalized (a gratuitous double-backtick code span with
 * no backtick in its content collapses to a single pair, matching Obsidian).
 * What is preserved is *correctness*: a code span whose content contains a
 * backtick must be wrapped with enough backticks to stay unambiguous, or the
 * inner backticks break the span and the literal is corrupted/lost.
 *
 * Implementation note: `@tiptap/markdown` serializes a mark by calling
 * `renderMarkdown` with a *synthetic placeholder node* (never the real text)
 * to derive the opening/closing syntax. The real content is unavailable at
 * serialize time, so the required backtick count is captured at PARSE time
 * (from the codespan's text) into a `backticks` mark attribute and read back
 * via `node.attrs`. The count is the minimum needed (longest backtick run in
 * the content + 1), so it is deterministic and idempotent.
 */
export const Code = BaseCode.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backticks: {
        default: 1,
        renderHTML: () => ({}),
        parseHTML: () => ({}),
      },
    }
  },

  parseMarkdown(token: MarkdownToken, helpers: {
    applyMark: (
      markType: string,
      content: JSONContent[],
      attrs?: Record<string, unknown>,
    ) => { mark: string; content: JSONContent[]; attrs?: Record<string, unknown> }
  }) {
    return helpers.applyMark(
      'code',
      [{ type: 'text', text: token.text || '' }],
      { backticks: minNeededBackticks(token.text) },
    )
  },

  renderMarkdown(node: JSONContent, h: {
    renderChildren: (nodes: JSONContent | JSONContent[]) => string
  }) {
    const count =
      typeof node.attrs?.backticks === 'number' && node.attrs.backticks >= 1
        ? node.attrs.backticks
        : 1
    const fence = BACKTICK.repeat(count)
    const inner = h.renderChildren(node.content ?? [])
    // Multi-backtick spans pad with a space so the closing fence stays
    // unambiguous when the content itself contains backticks. marked.js
    // strips a single leading/trailing space from codespan content on parse,
    // so always padding multi-backtick spans is round-trip safe.
    const body = count > 1 ? ` ${inner} ` : inner
    return `${fence}${body}${fence}`
  },
})

