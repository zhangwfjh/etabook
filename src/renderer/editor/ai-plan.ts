import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { AIPlanNodeView } from './ai-plan-node-view'

export const AIPlan = Node.create({
  name: 'aiPlan',
  group: 'block',
  content: 'block+',
  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      model: { default: 'claude-sonnet-4.5' },
      id: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'aside[data-ai-plan]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'aside',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-ai-plan': '',
      }),
      0,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(AIPlanNodeView)
  },
})
