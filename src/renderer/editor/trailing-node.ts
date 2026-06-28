/**
 * TrailingNode replacement that only fires on doc-changing transactions.
 *
 * The upstream `@tiptap/extensions` TrailingNode calls `appendTransaction` on
 * EVERY transaction — including selection-only ones (clicks, cursor moves,
 * focus changes). When the document does not end in a paragraph, this means
 * every click spuriously inserts a trailing paragraph, which changes the doc,
 * fires TipTap's `update` event, and marks the file dirty — even though the
 * user did nothing.
 *
 * Fix: add a guard so `appendTransaction` only runs when at least one
 * transaction in the batch actually changed the document. The trailing
 * paragraph is still inserted after real edits (typing, deleting, pasting),
 * but never after a pure selection or cursor move.
 *
 * The rest of the logic (plugin key, state init/apply, skip-meta check) is
 * identical to upstream.
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { NodeType } from '@tiptap/pm/model'

const SKIP_META = 'skipTrailingNode'

function nodeEqualsType(types: NodeType[], node: { type: NodeType } | null | undefined): boolean {
  if (!node) return false
  return types.includes(node.type)
}

export const TrailingNode = Extension.create({
  name: 'trailingNode',

  addOptions() {
    return {
      node: undefined as string | undefined,
      notAfter: [] as string[],
    }
  },

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey('trailingNode')
    const defaultNode =
      this.options.node ??
      this.editor.schema.topNodeType.contentMatch.defaultType?.name ??
      'paragraph'
    const disabledNames = (this.options.notAfter ?? []).concat(defaultNode)
    const disabledNodes = Object.values(this.editor.schema.nodes).filter((n) =>
      disabledNames.includes(n.name),
    )

    return [
      new Plugin({
        key: pluginKey,
        appendTransaction: (transactions, _oldState, state) => {
          // Preserve the explicit skip-meta escape hatch.
          if (transactions.some((tr) => tr.getMeta(SKIP_META))) return
          // NEW: never fire on selection-only / meta-only transactions.
          if (!transactions.some((tr) => tr.docChanged)) return

          if (!pluginKey.getState(state)) return

          const type = state.schema.nodes[defaultNode]
          if (!type) return
          return state.tr.insert(state.doc.content.size, type.create())
        },
        state: {
          init: (_config, state) => {
            const lastNode = state.tr.doc.lastChild
            return !nodeEqualsType(disabledNodes, lastNode)
          },
          apply: (tr, value) => {
            if (!tr.docChanged) return value
            if (tr.getMeta('__uniqueIDTransaction')) return value
            const lastNode = tr.doc.lastChild
            return !nodeEqualsType(disabledNodes, lastNode)
          },
        },
      }),
    ]
  },
})
