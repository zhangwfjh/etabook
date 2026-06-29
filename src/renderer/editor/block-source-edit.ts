import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import { Fragment } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'
import type { Editor, JSONContent } from '@tiptap/core'
import { getMarkdownManager } from './markdown-manager'

// StarterKit bundles TrailingNode, whose appendTransaction inserts a trailing
// paragraph whenever the last top-level block isn't a paragraph. It fires on
// *any* applied transaction — including meta-only ones (start/stop) that don't
// touch the doc. Marking our transactions with this meta key tells TrailingNode
// to skip, preventing a spurious paragraph insertion (which would change the
// doc, fire 'update', and mark the file dirty on a no-op double-click+blur).
const SKIP_TRAILING_NODE = 'skipTrailingNode'

const key = new PluginKey('blockSourceEdit')

type Editing = { from: number; to: number }

/**
 * Programmatic entry into raw-source edit mode for the top-level block at
 * `pos`. Returns false when a block is already being edited or `pos` does not
 * land inside an editable top-level block.
 */
export type StartEditAt = (pos: number) => boolean

/** Shape of this extension's storage, for safe cross-extension access. */
export interface BlockSourceEditStorage {
  startEditAt: StartEditAt | null
}

/**
 * Narrow an editor's extensionStorage to this extension's storage via a
 * runtime check on the `startEditAt` member. Returns null when the extension
 * isn't loaded or the storage shape doesn't match.
 */
export function getBlockSourceEditStorage(
  editor: Editor,
): BlockSourceEditStorage | null {
  const raw = (editor.extensionStorage as unknown as Record<string, unknown>)
    .blockSourceEdit
  if (raw == null || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (typeof s.startEditAt !== 'function' && s.startEditAt !== null) return null
  return { startEditAt: s.startEditAt as StartEditAt | null }
}

// Node types that manage their own editing surface and must not be
// hijacked by raw-source editing.
const SKIP_TYPES: Record<string, true> = { aiPlan: true, mathInline: true, mathBlock: true }

function autoresize(ta: HTMLTextAreaElement) {
  ta.style.height = 'auto'
  ta.style.height = `${ta.scrollHeight}px`
}

/**
 * Double-click a top-level block to drop into a raw-markdown editor for just
 * that block. The rendered block is hidden via a node decoration while a
 * textarea widget (the block's serialized markdown) takes its place. Clicking
 * elsewhere (blur), pressing Cmd/Ctrl+Enter, or Escape commits or cancels and
 * the block re-renders from the edited source.
 */
export const BlockSourceEdit = Extension.create({
  name: 'blockSourceEdit',

  addStorage() {
    return {
      // Programmatic entry point set inside addProseMirrorPlugins. Mirrors
      // handleDoubleClick so other extensions (e.g. the between-block insert
      // bar) can drop a freshly inserted block straight into source-edit.
      startEditAt: null as StartEditAt | null,
    }
  },
  addProseMirrorPlugins() {
    const editor = this.editor
    const storage = this.storage
    let active: HTMLTextAreaElement | null = null
    let range: Editing | null = null
    let committed = false

    function cancel(view: EditorView) {
      if (committed) return
      committed = true
      view.dispatch(view.state.tr.setMeta(key, { type: 'stop' }).setMeta(SKIP_TRAILING_NODE, true))
      active = null
      range = null
    }

    function commit(view: EditorView, initialMd: string) {
      if (committed || !active || !range) return
      // No edits: leave the document untouched. Even though the re-parsed
      // content is structurally identical (ProseMirror marks don't preserve
      // delimiter style like __ vs **), re-dispatching a replaceWith would
      // still fire 'update' for docs whose last block isn't a paragraph
      // (TrailingNode), and would rewrite normalized syntax on next serialize.
      if (active.value === initialMd) {
        cancel(view)
        return
      }
      committed = true
      const md = active.value
      const { from, to } = range

      const mgr = getMarkdownManager()
      let content: JSONContent[]
      try {
        const parsed = mgr.parse(md)
        content = parsed?.content ?? []
      } catch {
        content = []
      }
      // Never leave the document without a block — fall back to an empty
      // paragraph when the source parses to nothing.
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
      const fragment = Fragment.from(nodes)

      const tr = view.state.tr.replaceWith(from, to, fragment)
      tr.setMeta(key, { type: 'stop' })
      tr.setMeta(SKIP_TRAILING_NODE, true)
      view.dispatch(tr)
      view.focus()
      active = null
      range = null
    }

    function startEdit(
      view: EditorView,
      from: number,
      to: number,
      markdown: string,
      minHeight: number,
    ) {
      const ta = document.createElement('textarea')
      ta.className = 'etabook-source-edit'
      ta.spellcheck = false
      const initialMd = markdown.replace(/\n+$/, '')
      ta.value = initialMd
      ta.rows = Math.max(ta.value.split('\n').length, 2)
      ta.style.minHeight = `${Math.max(minHeight, 40)}px`
      ta.setAttribute('aria-label', 'Edit block markdown source')

      ta.addEventListener('input', () => autoresize(ta))
      ta.addEventListener('blur', () => commit(view, initialMd))
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          cancel(view)
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          commit(view, initialMd)
        }
      })

      active = ta
      range = { from, to }
      committed = false

      view.dispatch(
        view.state.tr
          .setMeta(key, { type: 'start', from, to })
          .setMeta(SKIP_TRAILING_NODE, true),
      )
      // Focus once ProseMirror has mounted the widget into the DOM.
      requestAnimationFrame(() => {
        autoresize(ta)
        ta.focus()
        const end = ta.value.length
        ta.setSelectionRange(end, end)
      })
    }

    /**
     * Drop the top-level block at `pos` into raw-source edit mode — the same
     * path handleDoubleClick takes. Exposed on storage.startEditAt so other
     * extensions (between-block insert bar) can focus a freshly inserted
     * block exactly like double-clicking it.
     */
    function startEditAtPos(view: EditorView, pos: number): boolean {
      if (active) return false
      const $pos = view.state.doc.resolve(pos)
      if ($pos.depth < 1) return false
      const node = $pos.node(1)
      if (!node || SKIP_TYPES[node.type.name]) return false
      const from = $pos.before(1)
      const to = from + node.nodeSize

      const blockEl = view.nodeDOM(from) as HTMLElement | null
      const minHeight = blockEl ? blockEl.getBoundingClientRect().height : 0

      const mgr = getMarkdownManager()
      const md = mgr.serialize({ type: 'doc', content: [node.toJSON()] } as JSONContent)

      startEdit(view, from, to, md, minHeight)
      return true
    }
    // Bind the editor's view so external callers only need a position — same
    // focus behavior as double-clicking a block. editor.view is populated
    // once the EditorView is constructed, well before any runtime click.
    storage.startEditAt = (pos: number): boolean => startEditAtPos(editor.view, pos)
    return [
      new Plugin({
        key,
        state: {
          init() {
            return null as Editing | null
          },
          apply(tr, oldValue) {
            const meta = tr.getMeta(key) as { type: string; from?: number; to?: number } | undefined
            if (meta?.type === 'start' && meta.from != null && meta.to != null) {
              return { from: meta.from, to: meta.to }
            }
            if (meta?.type === 'stop') return null
            const v = oldValue as Editing | null
            if (!v) return null
            if (tr.docChanged) {
              return { from: tr.mapping.map(v.from), to: tr.mapping.map(v.to, -1) }
            }
            return v
          },
        },
        props: {
          handleDoubleClick(view: EditorView, pos: number) {
            // Only trigger raw-source edit in view (read-only) mode. In edit
            // mode the editor is WYSIWYG and double-click should select a
            // word, not hijack the gesture into a source-edit overlay.
            if (editor.isEditable) return false
            return startEditAtPos(view, pos)
          },
          decorations(state: EditorState) {
            const ed = key.getState(state) as Editing | null
            if (!ed) return null
            const decos: Decoration[] = []
            if (active) decos.push(Decoration.widget(ed.from, active, { side: -1 }))
            decos.push(Decoration.node(ed.from, ed.to, { class: 'etabook-source-hidden' }))
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})
