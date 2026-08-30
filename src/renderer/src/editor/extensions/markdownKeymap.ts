import { openTableShapePicker } from './table'
import { type EditorView, type KeyBinding, keymap } from '@codemirror/view'
import { EditorSelection, type Extension, Prec } from '@codemirror/state'

/** Wrap the current selection with leading/trailing markup (e.g. ** **). */
function wrap(view: EditorView, before: string, after = before): boolean {
  const { state, dispatch } = view
  const changes = state.changeByRange((range) => {
    const selected = state.doc.sliceString(range.from, range.to)
    const text = before + selected + after
    const sel = selected
      ? EditorSelection.range(range.from + before.length, range.from + before.length + selected.length)
      : EditorSelection.cursor(range.from + before.length)
    return { changes: { from: range.from, to: range.to, insert: text }, range: sel }
  })
  dispatch(changes, { scrollIntoView: true, userEvent: 'input.wrap' })
  view.focus()
  return true
}

/** Prefix each selected line with `prefix` (numbered if requested). */
function linePrefix(view: EditorView, prefix: string, numbered = false): boolean {
  const { state, dispatch } = view
  const changes = state.changeByRange((range) => {
    const startLine = state.doc.lineAt(range.from).number
    const endLine = state.doc.lineAt(range.to).number
    const inserts: { from: number; insert: string }[] = []
    let totalInserted = 0
    let firstLen = 0
    for (let n = startLine; n <= endLine; n++) {
      const line = state.doc.line(n)
      const pref = numbered ? `${n - startLine + 1}. ` : prefix
      if (n === startLine) firstLen = pref.length
      totalInserted += pref.length
      inserts.push({ from: line.from, insert: pref })
    }
    return {
      changes: inserts,
      range: EditorSelection.range(range.from + firstLen, range.to + totalInserted)
    }
  })
  dispatch(changes, { scrollIntoView: true, userEvent: 'input.list' })
  view.focus()
  return true
}

/** Insert a block template at the start of the current line. */
function insertBlock(view: EditorView, template: string): boolean {
  const { state, dispatch } = view
  const line = state.doc.lineAt(state.selection.main.from)
  const insert = template + '\n'
  const pos = line.from + insert.length
  dispatch({
    changes: { from: line.from, to: line.from, insert },
    selection: EditorSelection.cursor(pos),
    scrollIntoView: true,
    userEvent: 'input.block'
  })
  view.focus()
  return true
}

/** Set an ATX heading level on the current line (replacing any existing). */
function heading(view: EditorView, level: number): boolean {
  const { state, dispatch } = view
  const changes = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from)
    const text = line.text.replace(/^\s{0,3}#{1,6}\s+/, '')
    const prefix = '#'.repeat(level) + ' '
    return {
      changes: { from: line.from, to: line.to, insert: prefix + text },
      range: EditorSelection.range(line.from + prefix.length, line.from + prefix.length + text.length)
    }
  })
  dispatch(changes, { scrollIntoView: true, userEvent: 'input.heading' })
  view.focus()
  return true
}

/** Insert a link wrapper around the selection: [sel](url). */
function link(view: EditorView): boolean {
  const { state, dispatch } = view
  const changes = state.changeByRange((range) => {
    const sel = state.doc.sliceString(range.from, range.to) || 'text'
    const text = `[${sel}](https://)`
    // Place cursor on the URL.
    const urlStart = range.from + 1 + sel.length + 2
    return {
      changes: { from: range.from, to: range.to, insert: text },
      range: EditorSelection.range(urlStart, urlStart + 8)
    }
  })
  dispatch(changes, { scrollIntoView: true, userEvent: 'input.link' })
  view.focus()
  return true
}

export const markdownCommands = {
  bold: (v: EditorView) => wrap(v, '**'),
  italic: (v: EditorView) => wrap(v, '*'),
  strike: (v: EditorView) => wrap(v, '~~'),
  code: (v: EditorView) => wrap(v, '`'),
  h1: (v: EditorView) => heading(v, 1),
  h2: (v: EditorView) => heading(v, 2),
  h3: (v: EditorView) => heading(v, 3),
  h4: (v: EditorView) => heading(v, 4),
  h5: (v: EditorView) => heading(v, 5),
  h6: (v: EditorView) => heading(v, 6),
  link,
  image: (v: EditorView) => insertBlock(v, '![alt text](https://)'),
  bullet: (v: EditorView) => linePrefix(v, '- '),
  ordered: (v: EditorView) => linePrefix(v, '1. ', true),
  task: (v: EditorView) => linePrefix(v, '- [ ] '),
  quote: (v: EditorView) => linePrefix(v, '> '),
  codeBlock: (v: EditorView) => insertBlock(v, '```js\n\n```'),
  table: (v: EditorView) => {
    openTableShapePicker(v)
    return true
  },
  hr: (v: EditorView) => insertBlock(v, '---')
}

export const markdownKeymapBindings: KeyBinding[] = [
  { key: 'Mod-b', run: markdownCommands.bold, preventDefault: true },
  { key: 'Mod-i', run: markdownCommands.italic, preventDefault: true },
  { key: 'Mod-Shift-x', run: markdownCommands.strike, preventDefault: true },
  { key: 'Mod-e', run: markdownCommands.code, preventDefault: true },
  { key: 'Mod-Shift-k', run: markdownCommands.link, preventDefault: true }
]

export function markdownKeymapExtension(): Extension {
  return Prec.highest(keymap.of(markdownKeymapBindings))
}
