// src/renderer/editor/block-raw-focus.ts
//
// In edit (WYSIWYG) mode, the top-level block containing the caret is shown
// as its literal markdown SOURCE — inline marks render as their delimiter
// characters (e.g. `**bold**`, `==hi==`) instead of formatted text. The caret
// stays inside the block and edits the source directly; moving the caret to
// another block re-parses the edited source back into rendered nodes.
//
// Mechanism: a ProseMirror plugin watches selection changes. When the caret's
// top-level block changes, it (1) restores the previously-raw block by
// re-parsing its now-edited text content, then (2) swaps the newly-focused
// block's content to a single plain-text node holding the serialized markdown
// of that block. The swap is a real (historied) transaction so undo/redo stay
// coherent; it is tagged so the dirty/autosnapshot side effects can skip the
// pure display transition.
//
// Serialization safety: while a block is in its raw state the editor's doc
// holds literal source text (e.g. a paragraph whose text is "a **b** c"). To
// keep save/snapshot/dirty comparisons correct, consumers MUST serialize via
// `rawFocusSerialize(editor)`, which rebuilds a normalized doc (raw blocks
// re-parsed) before serializing — never serialize `editor.state.doc` directly
// while a block may be raw-focused.

import { Extension } from '@tiptap/core'
import type { Editor, JSONContent } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection, NodeSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { Node as PmNode } from '@tiptap/pm/model'
import { getMarkdownManager } from './markdown-manager'

const key = new PluginKey('blockRawFocus')
// Meta key signalling this extension drove a transaction. Carried on swap and
// restore transactions so DocSession's update listener can skip the spurious
// dirty/autosnapshot that the display transition would otherwise trigger.
export const RAW_FOCUS_META = 'rawFocusSwap'

// Text blocks whose inline marks are worth exposing as source, PLUS media
// atom nodes (video/audio) whose markdown syntax (`<video src>`) is the
// editable source. Images manage their own node-view surface (resize +
// alignment controls) and are NOT raw-swapped. Tables, code blocks, math,
// and ai-plan also manage their own surfaces.
const RAWABLE: Record<string, true> = {
  paragraph: true, heading: true, video: true, audio: true,
}

// Media atom types that always expose their markdown syntax when focused.
const MEDIA_ATOM_TYPES: Record<string, true> = { video: true, audio: true }

/**
 * Whether `node` carries inline markup worth exposing as editable markdown
 * source when the caret enters it.
 *
 * Headings always qualify (their `#` level prefix is the exposed source).
 * Paragraphs qualify only when they contain at least one marked text run or
 * an inline node such as an image — i.e. there is hidden markup to reveal.
 *
 * A *plain* paragraph whose text merely happens to contain characters the
 * serializer escapes (e.g. a literal backtick `` ` `` → `` \` ``) must NOT
 * qualify: there is no mark to expose, and swapping would replace the user's
 * text with its escaped form (the stray `\` bug). Comparing serialized
 * markdown to `textContent` is unreliable for exactly this reason, so we
 * inspect marks directly.
 */
function hasExposedMarkup(node: {
  type: { name: string }
  forEach: (cb: (child: PmNode) => void) => void
}): boolean {
  if (node.type.name === 'heading') return true
  // Media atoms (image/video/audio) always expose their markdown syntax.
  if (MEDIA_ATOM_TYPES[node.type.name]) return true
  let found = false
  node.forEach((child) => {
    if (found) return
    if (child.isText) {
      if (child.marks.length > 0) found = true
    } else if (child.type.name !== 'hardBreak') {
      // An inline node (image, etc.) — its `![alt](url)` syntax is the
      // exposed source. hardBreak is not meaningful markup to edit.
      found = true
    }
  })
  return found
}

type RawState = { rawFrom: number | null }

/**
 * Narrow a ProseMirror plugin state value to RawState. Plugin state is typed
 * `any` by the library; validate at this boundary so callers get a typed value.
 */
function readRawState(value: unknown): RawState {
  if (value && typeof value === 'object' && 'rawFrom' in value) {
    const rawFrom = value.rawFrom
    return { rawFrom: typeof rawFrom === 'number' ? rawFrom : null }
  }
  return { rawFrom: null }
}

/** True iff `editor` currently has a block in raw-source display. */
export function hasRawFocus(editor: Editor): boolean {
  return readRawState(key.getState(editor.state)).rawFrom != null
}

/**
 * Explicitly restore any raw-swapped block back to its rendered form.
 * Called on mode switch (edit→view) as a belt-and-suspenders trigger
 * alongside the plugin's update() handler, which may not fire reliably
 * when setEditable dispatches updateState with the same state object.
 * Returns true if a restore was performed.
 */
export function forceRestoreRawBlocks(editor: Editor): boolean {
  const rawFrom = readRawState(key.getState(editor.state)).rawFrom
  if (rawFrom == null) return false
  const doc = editor.state.doc
  const node = doc.nodeAt(rawFrom)
  if (!node) return false
  const text = node.textContent
  const mgr = getMarkdownManager()
  let content: JSONContent[]
  try {
    const parsed = mgr.parse(text)
    content = parsed?.content ?? []
  } catch {
    content = []
  }
  if (content.length === 0) content = [{ type: 'paragraph' }]
  const schema = editor.state.schema
  const nodes = content
    .map((j) => {
      try {
        return schema.nodeFromJSON(j)
      } catch {
        return null
      }
    })
    .filter((n): n is NonNullable<PmNode> => n !== null)
  const to = rawFrom + node.nodeSize
  const tr = editor.state.tr.replaceWith(rawFrom, to, nodes)
  tr.setMeta(key, { rawFrom: null })
  tr.setMeta(RAW_FOCUS_META, true)
  tr.setMeta('skipTrailingNode', true)
  editor.view.dispatch(tr)
  return true
}

/**
 * Serialize `editor`'s document to markdown, NORMALIZING any raw-focused block
 * back to its rendered form first. Call this everywhere the doc is serialized
 * for persistence / dirty comparison / snapshots. Falls through to the normal
 * serializer when no block is raw-focused.
 */
export function rawFocusSerialize(editor: Editor): string | null {
  const mgr = getMarkdownManager()
  const rawFrom = readRawState(key.getState(editor.state)).rawFrom
  if (rawFrom == null) {
    return mgr.serialize(editor.state.doc.toJSON() as JSONContent)
  }
  // Rebuild a doc JSON where the raw block is replaced by its re-parsed
  // rendered content.
  const out: JSONContent[] = []
  editor.state.doc.forEach((node, offset) => {
    if (offset === rawFrom && RAWABLE[node.type.name]) {
      const parsed = mgr.parse(node.textContent)
      const content = parsed?.content ?? [{ type: 'paragraph' }]
      out.push(...content)
    } else {
      out.push(node.toJSON())
    }
  })
  return mgr.serialize({ type: 'doc', content: out } as JSONContent)
}

/** Resolve the current selection to its rawable top-level block start, or null. */
function topBlockFrom(view: EditorView): number | null {
  const sel = view.state.selection
  if (!sel) return null
  // NodeSelection on a top-level atom (image/video/audio): the selection IS
  // the block. NodeSelection.from is the position before the node, which is
  // depth 0 — the standard depth>=1 path below would miss it.
  if (sel instanceof NodeSelection) {
    const node = sel.node
    if (node && RAWABLE[node.type.name]) return sel.from
    return null
  }
  const $f = view.state.doc.resolve(sel.from)
  if ($f.depth < 1) return null
  const node = $f.node(1)
  if (!node || !RAWABLE[node.type.name]) return null
  return $f.before(1)
}

export const BlockRawFocus = Extension.create({
  name: 'blockRawFocus',

  addProseMirrorPlugins() {
    const editor = this.editor
    // Re-entrancy guard: swap/restore dispatch transactions, which re-trigger
    // view.update. While `applying` is set, ignore updates.
    let applying = false

    function swapBlock(view: EditorView, from: number): void {
      // `from` is the position of the top-level block (before it for
      // content nodes, ON it for atom nodes). nodeAt() works for both.
      const doc = view.state.doc
      const node = doc.nodeAt(from)
      if (!node || !RAWABLE[node.type.name]) return
      // Only swap when there is inline markup to expose. A plain paragraph
      // (no marks, no inline nodes) has nothing to reveal — and its text may
      // contain syntax chars the serializer would escape, so swapping would
      // corrupt the visible text (the stray `\` bug). See hasExposedMarkup.
      if (!hasExposedMarkup(node)) return
      const mgr = getMarkdownManager()
      const mdRaw = mgr.serialize({ type: 'doc', content: [node.toJSON()] } as JSONContent)
      if (mdRaw == null) return
      const md = mdRaw.replace(/\n+$/, '')
      const schema = view.state.schema
      const textNode = md.length > 0 ? schema.text(md) : null
      const para = schema.nodes.paragraph.create(null, textNode)
      const to = from + node.nodeSize
      const tr = view.state.tr.replaceWith(from, to, para)
      // Place the caret at the start of the raw text.
      tr.setSelection(TextSelection.near(tr.doc.resolve(from + 1)))
      tr.setMeta(key, { rawFrom: from })
      tr.setMeta(RAW_FOCUS_META, true)
      tr.setMeta('skipTrailingNode', true)
      view.dispatch(tr)
    }

    function restoreBlock(view: EditorView, from: number): void {
      // `from` is the position of the (now paragraph) block. After a swap,
      // the original node was replaced with a paragraph containing raw text.
      const doc = view.state.doc
      const node = doc.nodeAt(from)
      if (!node) return
      const text = node.textContent
      const mgr = getMarkdownManager()
      let content: JSONContent[]
      try {
        const parsed = mgr.parse(text)
        content = parsed?.content ?? []
      } catch {
        content = []
      }
      if (content.length === 0) content = [{ type: 'paragraph' }]
      const schema = view.state.schema
      const nodes = content
        .map((j) => {
          try {
            return schema.nodeFromJSON(j)
          } catch {
            return null
          }
        })
        .filter((n): n is NonNullable<typeof n> => n !== null)
      const to = from + node.nodeSize
      const tr = view.state.tr.replaceWith(from, to, nodes)
      tr.setMeta(key, { rawFrom: null })
      tr.setMeta(RAW_FOCUS_META, true)
      tr.setMeta('skipTrailingNode', true)
      view.dispatch(tr)
    }

    return [
      new Plugin({
        key,
        state: {
          init(): RawState {
            return { rawFrom: null }
          },
          apply(tr, oldVal: RawState): RawState {
            const meta = tr.getMeta(key)
            if (meta && typeof meta === 'object' && 'rawFrom' in meta) {
              const rawFrom = meta.rawFrom
              return { rawFrom: typeof rawFrom === 'number' ? rawFrom : null }
            }
            if (tr.docChanged && oldVal.rawFrom != null) {
              return { rawFrom: tr.mapping.map(oldVal.rawFrom) }
            }
            return oldVal
          },
        },
        view() {
          return {
            update(view: EditorView) {
              if (applying) return
              const rawFrom = readRawState(key.getState(view.state)).rawFrom
              // Restore immediately when leaving edit mode.
              if (!editor.isEditable) {
                if (rawFrom != null) {
                  applying = true
                  try {
                    restoreBlock(view, rawFrom)
                  } finally {
                    applying = false
                  }
                }
                return
              }
              const cur = topBlockFrom(view)
              if (cur === rawFrom) return // same block (incl. both null)
              applying = true
              try {
                if (rawFrom != null) restoreBlock(view, rawFrom)
                // recompute: restore may have shifted positions
                const next = topBlockFrom(view)
                if (next != null) swapBlock(view, next)
              } finally {
                applying = false
              }
            },
            destroy() {
              // Restore on teardown so a raw block is never left dangling.
              applying = true
              try {
                const rawFrom = readRawState(key.getState(editor.state)).rawFrom
                if (rawFrom != null && !editor.isDestroyed) {
                  restoreBlock(editor.view, rawFrom)
                }
              } finally {
                applying = false
              }
            },
          }
        },
      }),
    ]
  },
})
