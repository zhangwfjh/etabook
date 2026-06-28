import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { MathInlineNodeView, MathBlockNodeView } from './math-node-view'

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      latex: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-math-inline]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-math-inline': '' }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineNodeView)
  },

  markdownTokenName: 'mathInline',

  markdownTokenizer: {
    name: 'mathInline',
    level: 'inline' as const,
    start(src: string) {
      const m = src.match(/\$(?!\s)([^\n$]+?)(?<!\s)\$/)
      return m ? m.index ?? -1 : -1
    },
    tokenize(src: string) {
      const m = src.match(/^\$(?!\s)([^\n$]+?)(?<!\s)\$/)
      if (!m) return undefined
      return {
        type: 'mathInline',
        raw: m[0],
        latex: m[1],
      }
    },
  },

  parseMarkdown(token: any) {
    return {
      type: 'mathInline',
      attrs: { latex: token.latex },
    }
  },

  renderMarkdown(node: any) {
    return `$${node.attrs?.latex ?? ''}$`
  },
})

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      latex: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-math-block]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-math-block': '' }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockNodeView)
  },

  markdownTokenName: 'mathBlock',

  markdownTokenizer: {
    name: 'mathBlock',
    level: 'block' as const,
    start(src: string) {
      const m = src.match(/^\s*\$\$/m)
      return m ? m.index ?? -1 : -1
    },
    tokenize(src: string) {
      const m = src.match(/^\s*\$\$([\s\S]+?)\$\$(?:\n|$)/)
      if (!m) return undefined
      return {
        type: 'mathBlock',
        raw: m[0],
        latex: m[1].trim(),
      }
    },
  },

  parseMarkdown(token: any) {
    return {
      type: 'mathBlock',
      attrs: { latex: token.latex },
    }
  },

  renderMarkdown(node: any) {
    return `$$\n${node.attrs?.latex ?? ''}\n$$`
  },
})
