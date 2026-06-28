/**
 * LineOps — line-level operations on the top-level block containing the caret.
 *
 * Three commands, all edit-mode gated (no-op when `editor.isEditable` is false)
 * and each a single undo step (one transaction):
 *   - duplicateLine: clone the caret's block and insert the clone immediately
 *     after the original; caret lands at the start of the clone.
 *   - moveLineUp: swap the caret's block with the previous sibling; no-op on
 *     the first block.
 *   - moveLineDown: swap the caret's block with the next sibling; no-op on
 *     the last block.
 *
 * Block resolution reuses `resolveTopLevelBlockPos` from turn-into-targets so
 * the "current line" definition stays identical to the rest of the editor.
 */

import { Extension } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { resolveTopLevelBlockPos } from './turn-into-targets'

export const LineOps = Extension.create({
  name: 'lineOps',

  addCommands() {
    return {
      duplicateLine:
        () =>
        ({ editor, tr, state, dispatch }) => {
          if (!editor.isEditable) return false
          const { selection, doc } = state
          const blockPos = resolveTopLevelBlockPos(editor, selection.from)
          const blockNode = doc.nodeAt(blockPos)
          if (!blockNode) return false
          const blockEnd = blockPos + blockNode.nodeSize
          // Clone the block and insert immediately after the original.
          const slice = doc.slice(blockPos, blockEnd)
          tr.insert(blockEnd, slice.content)
          // Caret at the start of the clone.
          tr.setSelection(TextSelection.near(tr.doc.resolve(blockEnd + 1)))
          if (dispatch) dispatch(tr)
          return true
        },

      moveLineUp:
        () =>
        ({ editor, tr, state, dispatch }) => {
          if (!editor.isEditable) return false
          const { selection, doc } = state
          const blockPos = resolveTopLevelBlockPos(editor, selection.from)
          const $block = doc.resolve(blockPos)
          const index = $block.index(0)
          if (index < 1) return false // already first
          const blockNode = doc.nodeAt(blockPos)
          if (!blockNode) return false
          const blockEnd = blockPos + blockNode.nodeSize
          // The previous sibling begins one position before this block's
          // `before` position; resolve its own `before`.
          const prevStart = doc.resolve(blockPos - 1).before(1)
          // Slice first (before any mutation shifts positions), then cut the
          // current block and paste it before the previous sibling.
          const slice = doc.slice(blockPos, blockEnd)
          tr.delete(blockPos, blockEnd).insert(prevStart, slice.content)
          // The moved block now starts at prevStart; caret inside it.
          tr.setSelection(TextSelection.near(tr.doc.resolve(prevStart + 1)))
          if (dispatch) dispatch(tr)
          return true
        },

      moveLineDown:
        () =>
        ({ editor, tr, state, dispatch }) => {
          if (!editor.isEditable) return false
          const { selection, doc } = state
          const blockPos = resolveTopLevelBlockPos(editor, selection.from)
          const blockNode = doc.nodeAt(blockPos)
          if (!blockNode) return false
          const blockEnd = blockPos + blockNode.nodeSize
          // No next sibling when this block runs to the end of the doc.
          if (blockEnd >= doc.content.size) return false // already last
          // The next sibling starts exactly at this block's end position.
          const nextNode = doc.nodeAt(blockEnd)
          if (!nextNode) return false
          const nextEnd = blockEnd + nextNode.nodeSize
          // Slice the next block first, then cut it and paste it before the
          // current block — net effect: the two swap positions.
          const slice = doc.slice(blockEnd, nextEnd)
          tr.delete(blockEnd, nextEnd).insert(blockPos, slice.content)
          // After the swap the moved (current) block begins at
          // blockPos + nextNode.nodeSize; place the caret inside it.
          tr.setSelection(
            TextSelection.near(tr.doc.resolve(blockPos + nextNode.nodeSize + 1)),
          )
          if (dispatch) dispatch(tr)
          return true
        },
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    lineOps: {
      duplicateLine: () => ReturnType
      moveLineUp: () => ReturnType
      moveLineDown: () => ReturnType
    }
  }
}
