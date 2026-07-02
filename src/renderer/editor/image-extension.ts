import { mergeAttributes } from '@tiptap/core'
import type { JSONContent, MarkdownToken } from '@tiptap/core'
import { Image as BaseImage } from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ImageNodeView } from './image-node-view'

/**
 * Extended Image node with alignment, Obsidian width syntax, and caption.
 *
 * Adds two attributes beyond the stock extension:
 * - `align` — 'left' | 'center' | 'right' (presentation-only, no markdown
 *   persistence). Controls the figure's text-align.
 * - `width` — pixel width that round-trips through Obsidian's
 *   `![alt|W](src)` pipe syntax embedded in the alt text.
 *
 * The node view (`ImageNodeView`) provides drag-resize handles and alignment
 * hover-buttons when the image is selected in edit mode.
 */

type Align = 'left' | 'center' | 'right'

/** Parse Obsidian `Alt|W` or `Alt|WxH` from the alt text → { alt, width }. */
function parseAltPipe(rawAlt: string): { alt: string; width: number | null } {
  const m = rawAlt.match(/^(.+?)\|(\d+)(?:x(\d+))?$/)
  if (!m) return { alt: rawAlt, width: null }
  return { alt: m[1], width: parseInt(m[2], 10) }
}

/** Reassemble alt text with Obsidian width pipe when width is set. */
function formatAltPipe(alt: string, width: number | null): string {
  if (width && width > 0) return `${alt || ''}|${width}`
  return alt || ''
}

export const Image = BaseImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'center' as Align,
        renderHTML: (attrs) => {
          const a = (attrs.align as Align) || 'center'
          return { 'data-align': a }
        },
        parseHTML: (el) => {
          const a = el.getAttribute('data-align')
          return a === 'left' || a === 'right' ? a : 'center'
        },
      },
      width: {
        default: null,
        renderHTML: (attrs) => {
          const w = attrs.width
          return typeof w === 'number' && w > 0 ? { width: String(w) } : {}
        },
        parseHTML: (el) => {
          const w = el.getAttribute('width')
          return w ? parseInt(w, 10) || null : null
        },
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView)
  },

  // ── Markdown round-trip: Obsidian |W width syntax ──────────────────
  parseMarkdown(token: MarkdownToken, helpers: {
    createNode: (
      type: string,
      attrs?: Record<string, unknown>,
      content?: JSONContent[],
    ) => JSONContent
  }) {
    const rawAlt = (token.text as string) ?? ''
    const { alt, width } = parseAltPipe(rawAlt)
    return helpers.createNode('image', {
      src: token.href ?? '',
      title: token.title ?? null,
      alt,
      width,
    })
  },

  renderMarkdown(node: JSONContent): string {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
    const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''
    const title = typeof node.attrs?.title === 'string' ? node.attrs.title : ''
    const width = typeof node.attrs?.width === 'number' ? node.attrs.width : null
    const fullAlt = formatAltPipe(alt, width)
    return title ? `![${fullAlt}](${src} "${title}")` : `![${fullAlt}](${src})`
  },
})

// Re-export for extensions.ts convenience.
export { mergeAttributes }
