import {
  openSearchPanel,
  closeSearchPanel,
  findNext,
  findPrevious,
  gotoLine
} from '@codemirror/search'
import { type EditorView } from '@codemirror/view'

/** Open the CodeMirror search panel in the active editor. */
export function openFind(view: EditorView | null): void {
  if (!view) return
  openSearchPanel(view)
  view.focus()
}

/** Close the search panel if open. */
export function closeFind(view: EditorView | null): void {
  if (!view) return
  closeSearchPanel(view)
}

/** Open the search panel and focus its replace field. */
export function openReplace(view: EditorView | null): void {
  if (!view) return
  openSearchPanel(view)
  // The panel's fields are plain cm-textfields; replace is the second one.
  const fields = view.dom.querySelectorAll<HTMLInputElement>('input.cm-textfield')
  fields[1]?.focus()
}

/** Jump to the next match of the current search query. */
export function findNextMatch(view: EditorView | null): void {
  if (!view) return
  findNext(view)
  view.focus()
}

/** Jump to the previous match of the current search query. */
export function findPrevMatch(view: EditorView | null): void {
  if (!view) return
  findPrevious(view)
  view.focus()
}

/** Prompt for a line number and scroll to it. */
export function promptGotoLine(view: EditorView | null): void {
  if (!view) return
  gotoLine(view)
}
