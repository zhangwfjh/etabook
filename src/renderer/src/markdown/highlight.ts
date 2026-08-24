import { HighlightStyle, LanguageDescription } from '@codemirror/language'
import { tags as t, highlightCode, type Highlighter } from '@lezer/highlight'
import type { Parser } from '@lezer/common'
import { languages } from '@codemirror/language-data'

/**
 * Shared code-highlight primitive.
 *
 * One `HighlightStyle` drives BOTH the on-screen editor (via
 * `syntaxHighlighting(codeHighlightStyle)`) and the export serializer
 * (`highlightCodeToHtml`), so fenced-code colors are identical in Live,
 * Reading, and exported HTML/PDF — the single-renderer unification.
 *
 * Colors read from `--hl-*` CSS variables, defined for both themes in
 * base.css. For export, `codeHighlightCss()` emits the matching CSS rules.
 */

export const codeHighlightStyle: HighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--hl-keyword)' },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: 'var(--hl-variable)' },
  { tag: [t.function(t.variableName), t.labelName], color: 'var(--hl-function)' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: 'var(--hl-atom)' },
  { tag: [t.typeName, t.className, t.number, t.changed], color: 'var(--hl-type)' },
  { tag: t.string, color: 'var(--hl-string)' },
  { tag: t.regexp, color: 'var(--hl-regexp)' },
  { tag: t.atom, color: 'var(--hl-atom)' },
  { tag: t.meta, color: 'var(--hl-comment)' },
  { tag: t.comment, color: 'var(--hl-comment)', fontStyle: 'italic' },
  { tag: t.propertyName, color: 'var(--hl-property)' },
  { tag: t.punctuation, color: 'var(--hl-punctuation)' },
  { tag: t.unit, color: 'var(--hl-number)' }
])

// --- Parser resolution (lazy grammars) ---------------------------------------

// Common short aliases that LanguageDescription does not fuzzy-match
// (verified: `py` fails while `python` resolves). Applied before matching.
export const LANG_ALIASES: Record<string, string> = {
  py: 'python',
  rb: 'ruby',
  js: 'javascript',
  ts: 'typescript',
  sh: 'shell',
  zsh: 'shell',
  yml: 'yaml',
  md: 'markdown',
  kt: 'kotlin',
  rs: 'rust',
  cs: 'csharp',
  fs: 'fsharp',
  'c++': 'cpp',
  hs: 'haskell'
}
const parserCache = new Map<string, Parser | null>()

/** Resolve a Lezer parser for a fenced-code info string; null if unknown. */
export async function resolveCodeParser(lang: string): Promise<Parser | null> {
  const key = (lang || '').trim().toLowerCase()
  if (!key) return null
  if (parserCache.has(key)) return parserCache.get(key) ?? null
  let result: Parser | null = null
  try {
    const desc = LanguageDescription.matchLanguageName(languages, LANG_ALIASES[key] ?? key)
    if (desc) {
      const support = await desc.load()
      result = support.language.parser ?? null
    }
  } catch {
    result = null
  }
  parserCache.set(key, result)
  return result
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Highlight code → self-contained `<pre><code>` HTML with token classes. */
export function highlightCodeToHtml(code: string, parser: Parser | null): string {
  if (!parser) {
    return `<pre><code>${esc(code)}</code></pre>`
  }
  const tree = parser.parse(code)
  let html = ''
  highlightCode(
    code,
    tree,
    codeHighlightStyle as unknown as Highlighter,
    (text: string, classes: string) => {
      html += classes ? `<span class="${classes}">${esc(text)}</span>` : esc(text)
    },
    () => {
      html += '\n'
    }
  )
  return `<pre><code>${html}</code></pre>`
}

/** CSS rules matching the classes emitted by `highlightCodeToHtml`. */
export function codeHighlightCss(): string {
  const mod = codeHighlightStyle.module as unknown as { rules?: string[] } | undefined
  return mod?.rules?.join('\n') ?? ''
}
