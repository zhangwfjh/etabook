import { undo, redo, undoDepth, redoDepth } from '@codemirror/commands'
import {
  SearchQuery,
  findNext,
  replaceAll,
  getSearchQuery,
  setSearchQuery
} from '@codemirror/search'
import { getActiveEditorView } from '@renderer/lib/activeView'

/**
 * Programmatic editor command surface for the interactive test harness
 * (mirrors the `__editorView` bridge; bare `@codemirror/*` specifiers are
 * not importable from evaluate()).
 */
export type EditorApi = {
  undo(): boolean
  redo(): boolean
  undoDepth(): number
  redoDepth(): number
  setQuery(search: string, replace: string, opts?: { caseSensitive?: boolean; regexp?: boolean }): void
  query(): { search: string; caseSensitive: boolean; regexp: boolean }
  findNext(): boolean
  replaceAll(): number | null
  doc(): string
  stateDoc(): string
  dirty(): string | null
}

export function installEditorApi(): void {
  const win = window as unknown as { __editorApi?: EditorApi }
  win.__editorApi = {
    undo: () => {
      const v = getActiveEditorView()
      return v ? undo(v) : false
    },
    redo: () => {
      const v = getActiveEditorView()
      return v ? redo(v) : false
    },
    undoDepth: () => {
      const v = getActiveEditorView()
      return v ? undoDepth(v.state) : -1
    },
    redoDepth: () => {
      const v = getActiveEditorView()
      return v ? redoDepth(v.state) : -1
    },
    setQuery: (search, replace, opts) => {
      const v = getActiveEditorView()
      if (!v) return
      const q = new SearchQuery({
        search,
        replace,
        caseSensitive: opts?.caseSensitive ?? false,
        regexp: opts?.regexp ?? false
      })
      v.dispatch({ effects: setSearchQuery.of(q) })
    },
    query: () => {
      const v = getActiveEditorView()
      const q = v ? getSearchQuery(v.state) : null
      return { search: q?.search ?? '', caseSensitive: q?.caseSensitive ?? false, regexp: q?.regexp ?? false }
    },
    findNext: () => {
      const v = getActiveEditorView()
      return v ? findNext(v) : false
    },
    replaceAll: () => {
      const v = getActiveEditorView()
      if (!v) return null
      const before = v.state.doc.toString()
      replaceAll(v)
      const after = v.state.doc.toString()
      return before === after ? 0 : 1
    },
    doc: () => getActiveEditorView()?.state.doc.toString() ?? '',
    stateDoc: () => {
      const get = (window as unknown as { __storeGetState?: () => { docs: { content: string; dirty: boolean }[] } })
        .__storeGetState
      return get?.().docs.map((d) => d.content).join('\u0000') ?? ''
    },
    dirty: () => {
      const get = (window as unknown as { __storeGetState?: () => { docs: { dirty: boolean }[] } }).__storeGetState
      return get?.().docs.map((d) => (d.dirty ? 1 : 0)).join('') ?? null
    }
  }
}

