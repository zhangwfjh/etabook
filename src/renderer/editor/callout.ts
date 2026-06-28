import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { CalloutNodeView } from './callout-node-view'
import { resolveCalloutType } from './callout-types'

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block*',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      type: { default: 'note' },
      title: { default: '' },
      rawType: { default: '' },
      // Obsidian foldable marker: '+', '-', or '' (non-foldable).
      // Preserved through the round-trip so `[!faq]- Title` ≠ `[!faq] Title`.
      foldable: { default: '' },
    }
  },

  parseHTML() {
    return [
      { tag: 'aside[data-callout]' },
      { tag: 'div[data-callout]' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const type = HTMLAttributes.type ?? 'note'
    return [
      'aside',
      mergeAttributes(HTMLAttributes, {
        'data-callout': type,
        'data-callout-type': type,
        'data-raw-type': HTMLAttributes.rawType || undefined,
      }),
      0,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutNodeView)
  },

  // ── marked integration ──────────────────────────────────────────────

  markdownTokenizer: {
    name: 'callout',
    level: 'block' as const,
    start(src: string) {
      return /^>\s*\[!/.test(src) ? 0 : -1
    },
    tokenize(src: string, _tokens: unknown, helpers: any) {
      // Match only the outermost callout's `>`-prefixed lines. We must NOT
      // greedily consume lines belonging to a *sibling* blockquote/callout
      // that follows after a blank `>` separator. The block ends at the
      // first line that doesn't start with `>`.
      const blockMatch = src.match(/^(?:>[^\n]*(?:\n|$))+/)
      if (!blockMatch) return undefined
      const block = blockMatch[0]

      // Strip one level of `>` prefix from each line. Lines that were `> >`
      // (nested) become `>`, preserving nesting for the body tokenizer.
      const lines = block.replace(/\n$/, '').split('\n').map((l) => l.replace(/^>\s?/, ''))
      const head = lines[0] ?? ''

      // Match: [!type] optionally followed by foldable marker (+/-) and title.
      // Obsidian syntax: `[!type]` or `[!type]+` (expanded) or `[!type]-` (collapsed),
      // then an optional title after a space.
      const typeMatch = head.match(/^\s*\[!([^\]]+)\]\s*([+-])?\s*(.*)$/)
      if (!typeMatch) return undefined

      const rawType = typeMatch[1].trim()
      const foldable = typeMatch[2] ?? ''  // '+', '-', or ''
      const title = typeMatch[3].trim()
      const body = lines.slice(1).join('\n').replace(/^\n+/, '')

      const bodyTokens = body ? helpers.blockTokens(body + '\n') : []

      return {
        type: 'callout',
        raw: block,
        calloutType: rawType,
        title,
        foldable,
        tokens: bodyTokens,
      }
    },
  },

  parseMarkdown(token: any, helpers: any) {
    const { canonical, rawType } = resolveCalloutType(token.calloutType || 'note')
    return {
      type: 'callout',
      attrs: {
        type: canonical,
        title: token.title || '',
        rawType: rawType === canonical ? '' : rawType,
        foldable: token.foldable || '',
      },
      content: helpers.parseBlockChildren(token.tokens || []),
    }
  },
  renderMarkdown(node: any, helpers: any) {
    const type = node.attrs?.type ?? 'note'
    const rawType = node.attrs?.rawType || type
    const title = node.attrs?.title ?? ''
    const foldable = node.attrs?.foldable ?? ''
    // Reconstruct: `> [!type]` + optional fold marker (`-`/`+`, no space before)
    // + optional title (space before). Obsidian syntax is `[!type]- Title`,
    // NOT `[!type] - Title`.
    const fold = foldable ? foldable : ''
    const header = `> [!${rawType}]${fold}${title ? ' ' + title : ''}`

    const body = node.content?.length ? helpers.renderChildren(node, '\n\n') : ''
    if (!body.trim()) {
      // Empty-body callout: just the header. The manager inserts the block
      // separator (`\n\n` between siblings), so we must NOT append our own.
      return header
    }

    const prefixed = body
      .split('\n')
      .map((line: string) => (line ? `> ${line}` : '>'))
      .join('\n')

    // Prefix every body line with `> `. The header and body are separated
    // by a blank `>` line (Obsidian convention) so the callout's title and
    // its body content are distinct paragraphs — matching the canonical
    // `> [!type] Title\n>\n> Body` form.
    return `${header}\n>\n${prefixed}`
  },
})
