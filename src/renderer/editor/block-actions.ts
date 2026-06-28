// src/renderer/editor/block-actions.ts
// Block gutter: + (insert) and ⠿ (actions menu) wired through the vendored
// DragHandle extension's render() and onNodeChange() hooks. Zero edits to
// drag-handle.ts — see docs/superpowers/specs/2026-06-24-block-gutter-design.md

import { Extension, type Editor } from '@tiptap/core'
import type { Node, Schema } from '@tiptap/pm/model'
import { DOMSerializer, DOMParser } from '@tiptap/pm/model'
import {
  resolveTopLevelBlockPos,
  isTurnableTarget,
} from './turn-into-targets'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { getBlockSourceEditStorage } from './block-source-edit'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'
import { toast } from 'sonner'
import { useWorkspace } from '@/state/store'
import { BlockActionsMenu } from './BlockActionsMenu'

// Shape the vendored plugin delivers to onNodeChange(): { editor, node, pos }.
// node is null and pos is -1 when the gutter leaves a block.
export type HoveredBlock = {
  editor: Editor
  node: Node
  pos: number
} | null

let hovered: HoveredBlock = null

/** The block the gutter is currently hovering, or null. */
export function getHoveredBlock(): HoveredBlock {
  return hovered
}

/**
 * In-memory clipboard for within-editor block cut/paste. The async
 * navigator.clipboard API can strip custom MIME types (our
 * application/x-etabook-block JSON), losing callout/code/table structure.
 * cutBlock stashes the exact ProseMirror node here; pasteBlock checks it
 * before falling back to the OS clipboard.
 */
let inMemoryClipboard: Node | null = null

export function blockActionsOnNodeChange({
  editor,
  node,
  pos,
}: {
  editor: Editor
  node: Node | null
  pos: number
}) {
  if (!node || pos < 0) {
    hovered = null
    return
  }
  hovered = { editor, node, pos }
}

/**
 * Factory for the drag-handle element. Returns a container with a single
 * child: the ⠿ grip. Clicking the grip opens the block actions menu;
 * dragging reorders blocks (drag-vs-click disambiguated by movement < 5px /
 * duration < 300ms). Block insertion now lives on the between-block bar.
 */
export function createBlockHandleElement(): HTMLDivElement {
  const container = document.createElement('div')
  container.classList.add('drag-handle')

  // Keep the handle visible while the mouse is over it. The vendored plugin
  // hides the handle 300ms after the mouse leaves the editor DOM. The handle
  // lives outside the editor DOM, so mousemove never fires on the editor to
  // cancel that timer. Forward the real mouse coordinates from the handle to
  // the editor — the vendored handler resolves them to the correct block and
  // cancels the hide.
  container.addEventListener('mousemove', (e) => {
    const h = hovered
    if (!h) return
    h.editor.view.dom.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        clientX: e.clientX,
        clientY: e.clientY,
      }),
    )
  })

  const grip = document.createElement('span')
  grip.className = 'drag-handle-grip'
  grip.textContent = '⠿'
  grip.setAttribute('aria-label', 'Block actions')

  let downX = 0
  let downY = 0
  let downT = 0
  grip.addEventListener('mousedown', (e) => {
    downX = e.clientX
    downY = e.clientY
    downT = Date.now()
  })
  grip.addEventListener('mouseup', (e) => {
    const dx = e.clientX - downX
    const dy = e.clientY - downY
    const dt = Date.now() - downT
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5 && dt < 300) {
      e.preventDefault()
      e.stopPropagation()
      openBlockActionsMenu(grip)
    }
  })

  container.appendChild(grip)
  return container
}

/**
 * Swap the two top-level blocks adjacent to `seam` (the start position of the
 * lower block). No-op when `seam` doesn't sit between two siblings. Drives the
 * ↑/↓ buttons on the between-block insert bar.
 */
export function swapBlocks(editor: Editor, seam: number): void {
  const { doc, tr } = editor.state
  const $seam = doc.resolve(seam)
  if ($seam.index(0) < 1) return
  const above = $seam.index(0) - 1
  const below = above + 1
  if (below >= doc.childCount) return

  const aboveNode = doc.child(above)
  const belowNode = doc.child(below)
  // Start position of the above block.
  let aboveStart = 0
  for (let i = 0; i < above; i++) aboveStart += doc.child(i).nodeSize
  const aboveEnd = aboveStart + aboveNode.nodeSize
  const belowEnd = aboveEnd + belowNode.nodeSize

  // Replace the range with the two nodes in swapped order.
  tr.replaceWith(aboveStart, belowEnd, [belowNode, aboveNode])
  editor.view.dispatch(tr)
}

/**
 * Move the top-level block at `pos` before its previous sibling.
 * No-op when the block is already the first child of the document.
 */
export function moveBlockUp(editor: Editor, pos: number): void {
  const { doc, tr } = editor.state
  const blockPos = resolveTopLevelBlockPos(editor, pos)
  const $block = doc.resolve(blockPos)
  const index = $block.index(0)
  if (index === 0) return

  const node = doc.child(index)
  // Start position of the previous sibling: sum of nodeSizes of all earlier children.
  let target = 0
  for (let i = 0; i < index - 1; i++) target += doc.child(i).nodeSize

 tr.delete(blockPos, blockPos + node.nodeSize)
 tr.insert(target, node)
 editor.view.dispatch(tr)
}

/**
 * Move the top-level block at `pos` after its next sibling.
 * No-op when the block is already the last child of the document.
 */
export function moveBlockDown(editor: Editor, pos: number): void {
  const { doc, tr } = editor.state
  const blockPos = resolveTopLevelBlockPos(editor, pos)
  const $block = doc.resolve(blockPos)
  const index = $block.index(0)
  if (index === doc.childCount - 1) return

  const node = doc.child(index)
  // End position of the next sibling.
  let nextEnd = 0
  for (let i = 0; i <= index + 1; i++) nextEnd += doc.child(i).nodeSize
  // Insertion point shifts left by the current block's size once it is deleted.
  const target = nextEnd - node.nodeSize

  tr.delete(blockPos, blockPos + node.nodeSize)
  tr.insert(target, node)
  editor.view.dispatch(tr)
}

/**
 * Delete the top-level block at `pos`. If it is the only top-level child,
 * replace it with an empty paragraph to preserve ProseMirror's "doc must have
 * at least one block" invariant.
 */
export function deleteBlock(editor: Editor, pos: number): void {
  const { doc, tr, schema } = editor.state
  const blockPos = resolveTopLevelBlockPos(editor, pos)

  if (doc.childCount === 1) {
    const node = doc.child(0)
    tr.replaceWith(blockPos, blockPos + node.nodeSize, schema.nodes.paragraph.create())
    editor.view.dispatch(tr)
    return
  }

  const $block = doc.resolve(blockPos)
  const index = $block.index(0)
  const node = $block.nodeAfter
  if (!node) return

  // Compute the cursor target BEFORE deleting (positions shift after delete).
  // Land at end of previous block's text content — blocks stay independent,
  // no merge.
  let cursorPos = -1
  if (index > 0) {
    let prevStart = 0
    for (let i = 0; i < index; i++) prevStart += doc.child(i).nodeSize
    const prevNode = doc.child(index - 1)
    // After deleting current block, prev block is unchanged at same position.
    // Cursor goes at end of its text content (inside the block).
    cursorPos = prevStart - prevNode.nodeSize + prevNode.content.size + 1
  }

  tr.delete(blockPos, blockPos + node.nodeSize)
  if (cursorPos >= 0) {
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos), -1))
  }
  editor.view.dispatch(tr)
}

/**
 * Insert an empty paragraph below the top-level block at `pos` and return the
 * new block's document position. The caller may pass it to
 * BlockSourceEdit.startEditAt to focus the block.
 */
export function insertBlockBelow(editor: Editor, pos: number): number {
  const { doc, tr, schema } = editor.state
  const blockPos = resolveTopLevelBlockPos(editor, pos)
  const node = doc.resolve(blockPos).nodeAfter
  if (!node) return -1

  const newBlockPos = blockPos + node.nodeSize
  const p = schema.nodes.paragraph.create()
  tr.insert(newBlockPos, p)
  tr.setMeta('skipTrailingNode', true)
  editor.view.dispatch(tr)
  return newBlockPos
}

/**
 * Insert an empty paragraph above the top-level block at `pos` and return the
 * new block's document position. The caller may pass it to
 * BlockSourceEdit.startEditAt to focus the block.
 */
export function insertBlockAbove(editor: Editor, pos: number): number {
  const { tr, schema } = editor.state
  const blockPos = resolveTopLevelBlockPos(editor, pos)

  const p = schema.nodes.paragraph.create()
  tr.insert(blockPos, p)
  tr.setMeta('skipTrailingNode', true)
  editor.view.dispatch(tr)
  return blockPos
}


// ─── Heading slugs (Copy link / Ctrl+Shift+K) ───────────────────────────────

/** GitHub-flavored slug: lowercase, spaces→hyphens, strip non-alphanumeric, collapse repeats. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // strip non-word, non-space, non-hyphen
    .replace(/[\s_]+/g, '-') // spaces and underscores → hyphen
    .replace(/-+/g, '-') // collapse repeats
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
}

function nodeText(node: Node): string {
  return node.isText ? (node.text ?? '') : node.textContent
}

/**
 * Resolve `pos` to its top-level block. If that block is a heading, return its
 * slug. Otherwise walk backwards through top-level blocks until a heading is
 * found and return its slug, or null when none precedes it.
 */
export function findNearestHeadingSlug(editor: Editor, pos: number): string | null {
  const blockPos = resolveTopLevelBlockPos(editor, pos)
  const blockNode = editor.state.doc.nodeAt(blockPos)
  if (blockNode && blockNode.type.name === 'heading') {
    const slug = slugify(nodeText(blockNode))
    return slug || null
  }
  // Walk backwards through top-level blocks.
  const $block = editor.state.doc.resolve(blockPos)
  const startIndex = $block.index(0)
  for (let i = startIndex; i >= 0; i--) {
    const node = editor.state.doc.child(i)
    if (node.type.name === 'heading') {
      const slug = slugify(nodeText(node))
      return slug || null
    }
  }
  return null
}

// ─── Clipboard serialize / deserialize ─────────────────────────────────────

export type ClipboardData = Record<string, string>

/** Serialize a ProseMirror node into the three clipboard MIME types. */
export function serializeBlockForClipboard(node: Node): ClipboardData {
  const json = JSON.stringify(node.toJSON())
  const plain = node.textContent
  const serializer = DOMSerializer.fromSchema(node.type.schema)
  const fragment = serializer.serializeNode(node)
  const wrapper = document.createElement('div')
  wrapper.appendChild(fragment)
  const html = wrapper.innerHTML
  return {
    'application/x-etabook-block': json,
    'text/html': html,
    'text/plain': plain,
  }
}

/**
 * Deserialize a block from clipboard data. Priority:
 *   1. application/x-etabook-block (ProseMirror JSON)
 *   2. text/html (parsed via ProseMirror DOMParser)
 *   3. text/plain (wrapped in a paragraph)
 * Returns null if no compatible data.
 */
export function deserializeBlockFromClipboard(
  data: ClipboardData,
  schema: Schema,
): Node | null {
  const json = data['application/x-etabook-block']
  if (json) {
    try {
      const parsed = JSON.parse(json)
      return schema.nodeFromJSON(parsed)
    } catch {
      // fall through to HTML
    }
  }
  const html = data['text/html']
  if (html) {
    try {
      const wrapper = document.createElement('div')
      wrapper.innerHTML = html
      const parsed = DOMParser.fromSchema(schema).parse(wrapper)
      if (parsed.childCount > 0) return parsed.child(0)
    } catch {
      // fall through to plain text
    }
  }
  const plain = data['text/plain']
  if (plain) {
    return schema.nodes.paragraph.create(null, plain ? schema.text(plain) : null)
  }
  return null
}

// ─── Turn into (block type conversion) ──────────────────────────────────────

// Re-export the shared turn-into definitions for existing callers.
export type { TurnIntoTarget } from './turn-into-targets'
export { TURN_INTO_TARGETS, isTurnableTarget, resolveTopLevelBlockPos } from './turn-into-targets'

/**
 * Convert the block at `pos` into the target type. For list types and headings,
 * uses StarterKit toggle commands to preserve inline marks. For paragraph and
 * callout, extracts text and rebuilds the node.
 */
export function turnInto(
  editor: Editor,
  pos: number,
  targetType: string,
  attrs?: Record<string, unknown>,
): void {
  const blockPos = resolveTopLevelBlockPos(editor, pos)
  const node = editor.state.doc.nodeAt(blockPos)
  if (!node) return
  if (!isTurnableTarget(editor, pos)) return

  // For list types, headings, blockquote, code: use toggle commands.
  editor.commands.setTextSelection(blockPos + 1)
  if (targetType === 'heading') {
    const level = (attrs?.level as 1 | 2 | 3 | 4 | 5 | 6) ?? 1
    editor.chain().focus().toggleHeading({ level }).run()
    return
  }
  if (targetType === 'bulletList') {
    editor.chain().focus().toggleBulletList().run()
    return
  }
  if (targetType === 'orderedList') {
    editor.chain().focus().toggleOrderedList().run()
    return
  }
  if (targetType === 'taskList') {
    editor.chain().focus().toggleTaskList().run()
    return
  }
  if (targetType === 'blockquote') {
    editor.chain().focus().toggleBlockquote().run()
    return
  }
  if (targetType === 'codeBlock') {
    editor.chain().focus().toggleCodeBlock().run()
    return
  }

  // For paragraph and callout: extract text and rebuild.
  const text = node.textContent
  const tr = editor.state.tr
  const schema = editor.state.schema
  let newNode: Node
  if (targetType === 'callout') {
    const calloutAttrs = { type: 'note', title: '', ...(attrs ?? {}) }
    const para = schema.nodes.paragraph.create(null, text ? schema.text(text) : [])
    newNode = schema.nodes.callout.create(calloutAttrs, para)
  } else {
    newNode = schema.nodes.paragraph.create(null, text ? schema.text(text) : [])
  }
  tr.replaceWith(blockPos, blockPos + node.nodeSize, newNode)
  editor.view.dispatch(tr)
}


// ─── Actions menu orchestration ─────────────────────────────────────────────

let menuRoot: Root | null = null

export function closeBlockActionsMenu(): void {
  if (menuRoot) {
    menuRoot.unmount()
    menuRoot = null
  }
}

export function openBlockActionsMenu(anchorEl: HTMLElement): void {
  const h = hovered
  if (!h) return
  const { editor, pos } = h
  closeBlockActionsMenu()

  const el = document.createElement('div')
  menuRoot = createRoot(el)
  menuRoot.render(
    React.createElement(BlockActionsMenu, {
      editor,
      pos,
      anchorEl,
      onRun: (id: string) => {
        void runBlockAction(editor, pos, id)
      },
      onClose: () => closeBlockActionsMenu(),
    }),
  )
  document.body.appendChild(el)
}

export async function runBlockAction(editor: Editor, pos: number, id: string): Promise<void> {
  const preDragEditable = editor.isEditable
  const restore = () => {
    if (!preDragEditable) editor.setEditable(false)
  }
  if (!preDragEditable) editor.setEditable(true)

  try {
    if (id === 'insert-above') {
      const newPos = insertBlockAbove(editor, pos)
      focusNewBlock(editor, newPos)
    } else if (id === 'insert-below') {
      const newPos = insertBlockBelow(editor, pos)
      focusNewBlock(editor, newPos)
    } else if (id === 'move-up') moveBlockUp(editor, pos)
    else if (id === 'move-down') moveBlockDown(editor, pos)
    else if (id === 'delete') deleteBlock(editor, pos)
    else if (id === 'cut') cutBlock(editor, pos)
    else if (id === 'paste') await pasteBlock(editor, pos)
    else if (id === 'copy-link') copyBlockLink(editor, pos)
    else if (id === 'select') selectBlock(editor, pos)
    else if (id.startsWith('turn-into:')) {
      const rest = id.slice('turn-into:'.length)
      const colonIdx = rest.indexOf(':')
      const targetType = colonIdx === -1 ? rest : rest.slice(0, colonIdx)
      const attrs = colonIdx === -1 ? undefined : JSON.parse(rest.slice(colonIdx + 1))
      turnInto(editor, pos, targetType, attrs)
    }
  } finally {
    restore()
  }
}

/**
 * Drop the freshly inserted block at `newBlockPos` into raw-source edit mode,
 * the same focus behavior as double-clicking it. No-op when newPos is invalid
 * or BlockSourceEdit isn't loaded.
 */
function focusNewBlock(editor: Editor, newBlockPos: number): void {
  if (newBlockPos < 0) return
  const storage = getBlockSourceEditStorage(editor)
  if (!storage?.startEditAt) return
  // +1 resolves inside the new paragraph (depth 1) so the guard passes.
  const startEditAt = storage.startEditAt
  requestAnimationFrame(() => startEditAt(newBlockPos + 1))
}

function cutBlock(editor: Editor, pos: number): void {
  const blockPos = resolveTopLevelBlockPos(editor, pos)
  const node = editor.state.doc.nodeAt(blockPos)
  if (!node) return
  // Stash the exact node in memory so pasteBlock can recover the full
  // structure (callout attrs, code block language, table) even when the
  // async clipboard API strips our custom MIME type.
  inMemoryClipboard = node
  const data = serializeBlockForClipboard(node)
  void writeClipboard(data)
  deleteBlock(editor, pos)
}

export async function pasteBlock(editor: Editor, pos: number): Promise<void> {
  // Prefer the in-memory clipboard — it preserves the exact ProseMirror
  // node regardless of OS-clipboard sanitization.
  let node: Node | null = null
  if (inMemoryClipboard) {
    node = inMemoryClipboard
  } else {
    let data: ClipboardData | null = null
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const out: ClipboardData = {}
        for (const type of item.types) {
          if (type === 'application/x-etabook-block' || type === 'text/html' || type === 'text/plain') {
            const blob = await item.getType(type)
            out[type] = await blob.text()
          }
        }
        if (Object.keys(out).length) {
          data = out
          break
        }
      }
    } catch {
      data = null
    }
    if (!data) {
      toast.error('Nothing to paste')
      return
    }
    node = deserializeBlockFromClipboard(data, editor.state.schema)
  }
  if (!node) return

  // `pos` can be a seam (boundary between two blocks, depth 0) from the
  // insert bar, or a position inside a block from the menu. Resolve it to
  // a safe insertion point: if inside a block, insert after it; if at a
  // boundary, insert directly there.
  const $pos = editor.state.doc.resolve(pos)
  const insertPos = $pos.depth >= 1
    ? (() => {
        const blockPos = $pos.before(1)
        const blockNode = editor.state.doc.nodeAt(blockPos)
        return blockNode ? blockPos + blockNode.nodeSize : pos
      })()
    : pos

  const clamped = Math.min(insertPos, editor.state.doc.content.size)
  const tr = editor.state.tr
  tr.insert(clamped, node)
  editor.view.dispatch(tr)
}

export function copyBlockLink(editor: Editor, pos: number): void {
  const slug = findNearestHeadingSlug(editor, pos)
  const ws = useWorkspace.getState()
  const active = ws.activeFilePath
  const relPath =
    active && ws.workspacePath && active.startsWith(ws.workspacePath)
      ? active.slice(ws.workspacePath.length).replace(/^[\\/]/, '')
      : (active ?? '')
  const link = slug ? `${relPath}#${slug}` : relPath
  void writeClipboard({ 'text/plain': link })
  toast.success(`Copied: ${link}`)
}

function selectBlock(editor: Editor, pos: number): void {
  const blockPos = resolveTopLevelBlockPos(editor, pos)
  const tr = editor.state.tr
  tr.setSelection(NodeSelection.create(editor.state.doc, blockPos))
  editor.view.dispatch(tr)
}

function writeClipboard(data: ClipboardData): Promise<void> {
  if (navigator.clipboard && navigator.clipboard.write) {
    // Build a SINGLE ClipboardItem containing all MIME types — splitting
    // across multiple items causes only the first to reliably reach the OS
    // clipboard on Chromium/Electron.
    const payload: Record<string, Blob> = {}
    for (const [mime, value] of Object.entries(data)) {
      payload[mime] = new Blob([value], { type: mime })
    }
    const item = new ClipboardItem(payload)
    return navigator.clipboard.write([item]).catch(() => fallbackWriteClipboard(data))
  }
  return Promise.resolve(fallbackWriteClipboard(data))
}

function fallbackWriteClipboard(data: ClipboardData): void {
  const listener = (e: ClipboardEvent) => {
    if (e.clipboardData) {
      for (const [mime, value] of Object.entries(data)) {
        e.clipboardData.setData(mime, value)
      }
    }
    e.preventDefault()
    document.removeEventListener('copy', listener)
  }
  document.addEventListener('copy', listener)
  document.execCommand('copy')
}

export const BlockActionsKeymap = Extension.create({
  name: 'blockActionsKeymap',

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-ArrowUp': () => {
        const { from } = this.editor.state.selection
        const preDragEditable = this.editor.isEditable
        if (!preDragEditable) this.editor.setEditable(true)
        moveBlockUp(this.editor, from)
        if (!preDragEditable) this.editor.setEditable(false)
        return true
      },
      'Mod-Shift-ArrowDown': () => {
        const { from } = this.editor.state.selection
        const preDragEditable = this.editor.isEditable
        if (!preDragEditable) this.editor.setEditable(true)
        moveBlockDown(this.editor, from)
        if (!preDragEditable) this.editor.setEditable(false)
        return true
      },
      'Mod-Shift-k': () => {
        const { from } = this.editor.state.selection
        copyBlockLink(this.editor, from)
        return true
      },
      'Backspace': () => {
        const { empty, from } = this.editor.state.selection
        if (!empty) return false
        const $from = this.editor.state.doc.resolve(from)
        if ($from.parentOffset !== 0) return false
        const blockPos = $from.before(1)
        if (blockPos <= 0) return false

        const node = this.editor.state.doc.nodeAt(blockPos)
        if (!node) return false

        if (node.textContent === '') {
          // Empty block: delete it, cursor to end of previous block.
          const preDragEditable = this.editor.isEditable
          if (!preDragEditable) this.editor.setEditable(true)
          deleteBlock(this.editor, blockPos)
          if (!preDragEditable) this.editor.setEditable(false)
          return true
        }

        // Non-empty block at start: prevent default merge. Cursor stays.
        return true
      },
    }
  },
})

// HMR: clear module-level singletons so stale editor references don't
// survive a hot reload and cause the black-screen crash.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    closeBlockActionsMenu()
    hovered = null
    inMemoryClipboard = null
  })
}