import { Mark, mergeAttributes } from '@tiptap/core'
import type { JSONContent, MarkdownToken } from '@tiptap/core'

/**
 * OFM highlight: `==text==`. Mark that wraps text in a translucent amber
 * background. Mirrors the emphasis rule: rejects inner whitespace adjacent
 * to the delimiters (`== text ==` is left literal).
 */
export const Highlight = Mark.create({
  name: 'highlight',

  parseHTML() {
    return [{ tag: 'mark[data-highlight]' }]
  },

  renderHTML() {
    return ['mark', mergeAttributes({ 'data-highlight': '', class: 'etabook-highlight' })]
  },

  markdownTokenName: 'highlight',

  markdownTokenizer: {
    name: 'highlight',
    level: 'inline' as const,
    start(src: string) {
      const m = src.match(/==(?!\s)([^=\n]+?)(?<!\s)==/)
      return m ? m.index ?? -1 : -1
    },
    tokenize(src: string) {
      const m = src.match(/^==(?!\s)([^=\n]+?)(?<!\s)==/)
      if (!m) return undefined
      return {
        type: 'highlight',
        raw: m[0],
        text: m[1],
      }
    },
  },

  parseMarkdown(token: MarkdownToken, helpers: {
    applyMark: (
      markType: string,
      content: JSONContent[],
      attrs?: Record<string, unknown>,
    ) => { mark: string; content: JSONContent[]; attrs?: Record<string, unknown> }
    tokenizeInline?: (src: string) => MarkdownToken[]
    parseInline: (tokens: MarkdownToken[]) => JSONContent[]
  }) {
    // marked does not auto-reparse a custom token's `text`, so re-tokenize
    // the inner content ourselves — this lets nested marks (e.g. `==**bold**==`)
    // compose with the highlight. `tokenizeInline` is optional on the helper
    // type, so fall back to a literal text node when unavailable.
    const inner = token.text || ''
    const innerTokens = helpers.tokenizeInline?.(inner) ?? []
    const content = innerTokens.length > 0
      ? helpers.parseInline(innerTokens)
      : [{ type: 'text', text: inner }]
    return helpers.applyMark('highlight', content)
  },
  renderMarkdown(_node: JSONContent, h: {
    renderChildren: (nodes: JSONContent | JSONContent[]) => string
  }) {
    return `==${h.renderChildren([])}==`
  },
})
