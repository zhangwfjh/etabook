import { openSearchPanel } from '@codemirror/search'
import { type EditorView } from '@codemirror/view'

/** Open the CodeMirror search panel in the active editor. */
export function openFind(view: EditorView | null): void {
  if (!view) return
  openSearchPanel(view)
  view.focus()
}
