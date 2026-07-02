import { Node, mergeAttributes, type JSONContent } from '@tiptap/core'

/**
 * Embedded media nodes (video / audio).
 *
 * Markdown has no native syntax for video or audio, so these nodes round-trip
 * through raw HTML — `<video src=… controls></video>` and
 * `<audio src=… controls></audio>`. The `@tiptap/markdown` manager parses
 * block-HTML tokens via `parseHTMLToken` → `generateJSON`, which consults the
 * registered extensions' `parseHTML` rules (browser/Electron only — it needs a
 * DOMParser). Serialization back to markdown is always available through
 * `renderMarkdown`, which emits the HTML tag verbatim.
 *
 * Both nodes are block-level atoms: draggable, non-editable, rendered by the
 * native HTML5 element (`<video controls>` / `<audio controls>`).
 */

interface MediaAttrs {
  src: string
  controls: boolean
}

function readMediaAttrs(el: HTMLElement): MediaAttrs {
  return {
    src: el.getAttribute('src') ?? '',
    controls: el.hasAttribute('controls'),
  }
}

/** Shared attribute spec for src + controls. */
function mediaAttributes() {
  return {
    src: { default: '' },
    controls: { default: true },
  }
}

export const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return mediaAttributes()
  },

  parseHTML() {
    return [
      {
        tag: 'video',
        getAttrs: (el) => (typeof el === 'string' ? false : readMediaAttrs(el)),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'video',
      mergeAttributes({ controls: true }, HTMLAttributes),
    ]
  },

  renderMarkdown(node: JSONContent): string {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
    const controls = node.attrs?.controls !== false
    const attrs = [`src="${src}"`]
    if (controls) attrs.push('controls')
    return `<video ${attrs.join(' ')}></video>`
  },
})

export const Audio = Node.create({
  name: 'audio',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return mediaAttributes()
  },

  parseHTML() {
    return [
      {
        tag: 'audio',
        getAttrs: (el) => (typeof el === 'string' ? false : readMediaAttrs(el)),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'audio',
      mergeAttributes({ controls: true }, HTMLAttributes),
    ]
  },

  renderMarkdown(node: JSONContent): string {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
    const controls = node.attrs?.controls !== false
    const attrs = [`src="${src}"`]
    if (controls) attrs.push('controls')
    return `<audio ${attrs.join(' ')}></audio>`
  },
})
