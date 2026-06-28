// Shared block utilities extracted to avoid circular imports between
// block-actions.ts (orchestration, imports BlockActionsMenu) and
// BlockActionsMenu.tsx (UI, needs turn-into data + isTurnableTarget).

import type { Editor } from '@tiptap/core'

export interface TurnIntoTarget {
  type: string
  label: string
  hotkey: string
  attrs?: Record<string, unknown>
}

export const TURN_INTO_TARGETS: readonly TurnIntoTarget[] = [
  { type: 'paragraph', label: 'Text', hotkey: 'p' },
  { type: 'heading', attrs: { level: 1 }, label: 'Heading 1', hotkey: '1' },
  { type: 'heading', attrs: { level: 2 }, label: 'Heading 2', hotkey: '2' },
  { type: 'heading', attrs: { level: 3 }, label: 'Heading 3', hotkey: '3' },
  { type: 'heading', attrs: { level: 4 }, label: 'Heading 4', hotkey: '4' },
  { type: 'heading', attrs: { level: 5 }, label: 'Heading 5', hotkey: '5' },
  { type: 'heading', attrs: { level: 6 }, label: 'Heading 6', hotkey: '6' },
  { type: 'bulletList', label: 'Bullet list', hotkey: 'b' },
  { type: 'orderedList', label: 'Ordered list', hotkey: 'o' },
  { type: 'taskList', label: 'Task list', hotkey: 't' },
  { type: 'blockquote', label: 'Quote', hotkey: 'q' },
  { type: 'callout', attrs: { type: 'note', title: '' }, label: 'Callout', hotkey: 'c' },
  { type: 'codeBlock', attrs: { language: 'text' }, label: 'Code', hotkey: 'x' },
]

/** Block types that cannot be "turned into" (atoms without clean text extraction). */
const NON_TURNABLE_TYPES: Record<string, true> = {
  table: true,
  mathInline: true,
  mathBlock: true,
  image: true,
  aiPlan: true,
}

/**
 * Resolve any position to the `before` position of the top-level block that
 * contains it. For a position already at a block boundary this is a no-op.
 */
export function resolveTopLevelBlockPos(editor: Editor, pos: number): number {
  return editor.state.doc.resolve(pos).before(1)
}

/** Returns true if the block at `pos` can be converted via turnInto. */
export function isTurnableTarget(editor: Editor, pos: number): boolean {
  const blockPos = resolveTopLevelBlockPos(editor, pos)
  const node = editor.state.doc.nodeAt(blockPos)
  if (!node) return false
  return !(node.type.name in NON_TURNABLE_TYPES)
}
