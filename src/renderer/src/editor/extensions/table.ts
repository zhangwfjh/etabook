import {
  EditorSelection,
  Prec,
  StateEffect,
  StateField,
  type Extension
} from '@codemirror/state'
import { EditorView, keymap, showTooltip } from '@codemirror/view'

/**
 * GFM table editing — structural operations on the pipe-table source.
 *
 * Everything here is source-text surgery: the commands parse the table block
 * around the cursor, rebuild it with aligned pipes, and place the cursor in
 * the logically corresponding cell. The same commands serve Live Preview and
 * Source Mode (both edit source text); Reading Mode never sees them (read-only).
 *
 * The shape picker (slash "Table", toolbar, palette) is a CodeMirror tooltip
 * hosting an 8×8 hover grid; picking a shape inserts that table at the cursor.
 */

// ---- Parsing ----------------------------------------------------------------

type Align = 'left' | 'center' | 'right' | null

type TableModel = {
  /** Doc position of the header line start. */
  from: number
  /** Doc position of the last row line end. */
  to: number
  /** Row 0 is the header; the delimiter row is not a content row. */
  rows: string[][]
  aligns: Align[]
  /** Line start position of each content row (index matches `rows`). */
  rowLineStarts: number[]
  /** Doc positions of every line the table spans (for whole-block delete). */
  blockFrom: number
  blockTo: number
}

/** Split a table row into trimmed cells on unescaped pipes. */
function splitRow(text: string): string[] {
  let t = text.trim()
  if (t.startsWith('|')) t = t.slice(1)
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1)
  return t.split(/(?<!\\)\|/).map((c) => c.trim())
}

function hasUnescapedPipe(text: string): boolean {
  return /(?<!\\)\|/.test(text)
}

function isDelimiter(text: string): boolean {
  const cells = splitRow(text)
  return cells.length >= 1 && cells.every((c) => /^:?-+:?$/.test(c))
}

function parseAlign(cell: string): Align {
  const l = cell.startsWith(':')
  const r = cell.endsWith(':')
  if (l && r) return 'center'
  if (l) return 'left'
  if (r) return 'right'
  return null
}

/** Parse the GFM table block around `pos`, or null when not inside one. */
export function tableAround(state: { doc: EditorView['state']['doc'] }, pos: number): TableModel | null {
  const doc = state.doc
  const rowish = (n: number): boolean => {
    const t = doc.line(n).text
    return t.trim() !== '' && hasUnescapedPipe(t)
  }

  const num = doc.lineAt(pos).number
  // Walk up over consecutive row-ish lines to the top of the block.
  let top = num
  while (top > 1 && rowish(top) && !isDelimiter(doc.line(top).text)) top--

  let delimNum: number
  if (isDelimiter(doc.line(top).text)) {
    delimNum = top
  } else if (top + 1 <= doc.lines && isDelimiter(doc.line(top + 1).text)) {
    delimNum = top + 1
  } else {
    return null
  }

  const headerNum = delimNum - 1
  if (headerNum < 1) return null
  const headerText = doc.line(headerNum).text
  const headerCells = splitRow(headerText)
  const delimCells = splitRow(doc.line(delimNum).text)
  if (headerCells.length !== delimCells.length || headerCells.length === 0) return null

  const rows = [headerCells]
  const rowLineStarts = [doc.line(headerNum).from]
  let n = delimNum + 1
  while (n <= doc.lines && rowish(n) && !isDelimiter(doc.line(n).text)) {
    rows.push(splitRow(doc.line(n).text))
    rowLineStarts.push(doc.line(n).from)
    n++
  }
  const lastLine = doc.line(n - 1)
  return {
    rows,
    aligns: delimCells.map(parseAlign),
    rowLineStarts,
    from: doc.line(headerNum).from,
    to: lastLine.to,
    blockFrom: doc.line(headerNum).from,
    blockTo: lastLine.to
  }
}

// ---- Formatting ---------------------------------------------------------------

/** Rebuild the table text with aligned pipes. Returns one string per line. */
function formatTable(rows: string[][], aligns: Align[]): string[] {
  const cols = aligns.length
  const norm = rows.map((r) => {
    const c = [...r]
    while (c.length < cols) c.push('')
    return c.slice(0, cols)
  })
  const widths = aligns.map((_, i) => Math.max(3, ...norm.map((r) => r[i].length)))
  const rowLine = (cells: string[]): string =>
    '| ' + cells.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |'
  const delimCell = (a: Align, i: number): string => {
    const len = Math.max(3, widths[i])
    const l = a === 'left' || a === 'center'
    const r = a === 'right' || a === 'center'
    const dashes = Math.max(1, len - (l ? 1 : 0) - (r ? 1 : 0))
    return (l ? ':' : '') + '-'.repeat(dashes) + (r ? ':' : '')
  }
  return [rowLine(norm[0]), '| ' + aligns.map(delimCell).join(' | ') + ' |', ...norm.slice(1).map(rowLine)]
}

/** Offsets of each cell segment (between unescaped pipes) within a row line. */
function cellSegments(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  let i = text.startsWith('|') ? 1 : 0
  let cur = i
  while (i < text.length) {
    if (text[i] === '|' && text[i - 1] !== '\\') {
      out.push({ start: cur, end: i })
      cur = i + 1
    }
    i++
  }
  out.push({ start: cur, end: text.length })
  // A trailing pipe produces a trailing empty segment — drop it.
  if (text.endsWith('|') && !text.endsWith('\\|') && out.length > 1) out.pop()
  return out
}

/** Column index the cursor sits in on this row line (clamped). */
function colAtCursor(text: string, offset: number): number {
  let pipes = 0
  for (let i = 0; i < Math.min(offset, text.length); i++) {
    if (text[i] === '|' && (i === 0 || text[i - 1] !== '\\')) pipes++
  }
  const cols = cellSegments(text).length
  const col = text.startsWith('|') ? pipes - 1 : pipes
  return Math.max(0, Math.min(col, cols - 1))
}

/** Row index (0 = header) for a cursor position. The delimiter line sits
 * between header (0) and body row 1, so a cursor there resolves to row 0. */
function rowAt(model: TableModel, pos: number): number {
  for (let r = model.rowLineStarts.length - 1; r >= 0; r--) {
    if (pos >= model.rowLineStarts[r]) return r
  }
  return 0
}

// ---- Cursor placement ---------------------------------------------------------

/** Place the cursor at the start of `col`'s content on a row line. */
function cursorInCell(lineStart: number, lineText: string, col: number): number {
  const segs = cellSegments(lineText)
  const seg = segs[Math.max(0, Math.min(col, segs.length - 1))]
  let off = seg.start
  if (lineText[off] === ' ') off++
  return lineStart + off
}

type TableOp =
  | { t: 'replace'; rows: string[][]; aligns: Align[]; cursor: { row: number; col: number } }
  | { t: 'nav'; row: number; col: number }
  | { t: 'delete-block' }

/** Apply an op to the table around the cursor. Returns false when not in one. */
function applyOp(view: EditorView, op: (m: TableModel, row: number, col: number) => TableOp | null): boolean {
  const pos = view.state.selection.main.head
  const model = tableAround(view.state, pos)
  if (!model) return false
  const row = rowAt(model, pos)
  const lineText = view.state.doc.lineAt(model.rowLineStarts[row]).text
  const col = colAtCursor(lineText, pos - model.rowLineStarts[row])
  const plan = op(model, row, col)
  if (!plan) return false

  if (plan.t === 'delete-block') {
    // Remove the whole block including its trailing newline when present.
    const doc = view.state.doc
    const end = model.blockTo < doc.length ? model.blockTo + 1 : model.blockTo
    view.dispatch({
      changes: { from: model.blockFrom, to: end, insert: '' },
      selection: EditorSelection.cursor(Math.min(model.blockFrom, doc.length)),
      scrollIntoView: true,
      userEvent: 'input.table'
    })
    return true
  }

  if (plan.t === 'nav') {
    const lineStart = model.rowLineStarts[Math.min(plan.row, model.rowLineStarts.length - 1)]
    const text = view.state.doc.lineAt(lineStart).text
    view.dispatch({
      selection: EditorSelection.cursor(cursorInCell(lineStart, text, plan.col))
    })
    return true
  }

  const lines = formatTable(plan.rows, plan.aligns)
  const text = lines.join('\n')
  // Row r occupies formatted line r+1 relative to `from` (line 1 is the delimiter).
  const targetLineStart = model.from + lines.slice(0, plan.cursor.row + 1).reduce((a, l) => a + l.length + 1, 0)
  const targetText = lines[plan.cursor.row + 1]
  const sel = cursorInCell(targetLineStart, targetText, plan.cursor.col)
  view.dispatch({
    changes: { from: model.from, to: model.to, insert: text },
    selection: EditorSelection.cursor(sel),
    scrollIntoView: true,
    userEvent: 'input.table'
  })
  return true
}

// ---- Commands -----------------------------------------------------------------

const emptyRow = (cols: number): string[] => new Array(cols).fill('')

export const tableCommands = {
  nextCell(view: EditorView): boolean {
    return applyOp(view, (m, row, col) => {
      if (col + 1 < m.aligns.length) return { t: 'nav', row, col: col + 1 }
      if (row + 1 < m.rows.length) return { t: 'nav', row: row + 1, col: 0 }
      // Last cell — append a row and move into it (Notion behavior).
      return { t: 'replace', rows: [...m.rows, emptyRow(m.aligns.length)], aligns: m.aligns, cursor: { row: row + 1, col: 0 } }
    })
  },

  prevCell(view: EditorView): boolean {
    return applyOp(view, (m, row, col) => {
      if (col > 0) return { t: 'nav', row, col: col - 1 }
      if (row > 0) return { t: 'nav', row: row - 1, col: m.aligns.length - 1 }
      return null // first cell — fall through to default Tab behavior
    })
  },

  nextRow(view: EditorView): boolean {
    return applyOp(view, (m, row, col) => {
      if (row + 1 < m.rows.length) return { t: 'nav', row: row + 1, col }
      return { t: 'replace', rows: [...m.rows, emptyRow(m.aligns.length)], aligns: m.aligns, cursor: { row: row + 1, col } }
    })
  },

  insertRowAbove(view: EditorView): boolean {
    return applyOp(view, (m, row, col) => ({
      t: 'replace',
      rows: [...m.rows.slice(0, row), emptyRow(m.aligns.length), ...m.rows.slice(row)],
      aligns: m.aligns,
      cursor: { row, col }
    }))
  },

  insertRowBelow(view: EditorView): boolean {
    return applyOp(view, (m, row, col) => ({
      t: 'replace',
      rows: [...m.rows.slice(0, row + 1), emptyRow(m.aligns.length), ...m.rows.slice(row + 1)],
      aligns: m.aligns,
      cursor: { row: row + 1, col }
    }))
  },

  deleteRow(view: EditorView): boolean {
    return applyOp(view, (m, row, col) => {
      if (m.rows.length === 1) return { t: 'delete-block' }
      const rows = m.rows.filter((_, i) => i !== row)
      return { t: 'replace', rows, aligns: m.aligns, cursor: { row: Math.min(row, rows.length - 1), col } }
    })
  },

  insertColLeft(view: EditorView): boolean {
    return applyOp(view, (m, row, col) => {
      const rows = m.rows.map((r) => [...r.slice(0, col), '', ...r.slice(col)])
      const aligns = [...m.aligns.slice(0, col), null, ...m.aligns.slice(col)]
      return { t: 'replace', rows, aligns, cursor: { row, col } }
    })
  },

  insertColRight(view: EditorView): boolean {
    return applyOp(view, (m, row, col) => {
      const at = col + 1
      const rows = m.rows.map((r) => [...r.slice(0, at), '', ...r.slice(at)])
      const aligns = [...m.aligns.slice(0, at), null, ...m.aligns.slice(at)]
      return { t: 'replace', rows, aligns, cursor: { row, col: at } }
    })
  },

  deleteCol(view: EditorView): boolean {
    return applyOp(view, (m, row, col) => {
      if (m.aligns.length === 1) return { t: 'delete-block' }
      const rows = m.rows.map((r) => r.filter((_, i) => i !== col))
      const aligns = m.aligns.filter((_, i) => i !== col)
      return { t: 'replace', rows, aligns, cursor: { row, col: Math.max(0, col - 1) } }
    })
  },

  moveRowUp(view: EditorView): boolean {
    return applyOp(view, (m, row, col) => {
      if (row === 0) return null
      const rows = [...m.rows]
      ;[rows[row - 1], rows[row]] = [rows[row], rows[row - 1]]
      return { t: 'replace', rows, aligns: m.aligns, cursor: { row: row - 1, col } }
    })
  },

  moveRowDown(view: EditorView): boolean {
    return applyOp(view, (m, row, col) => {
      if (row === m.rows.length - 1) return null
      const rows = [...m.rows]
      ;[rows[row + 1], rows[row]] = [rows[row], rows[row + 1]]
      return { t: 'replace', rows, aligns: m.aligns, cursor: { row: row + 1, col } }
    })
  },

  moveColLeft(view: EditorView): boolean {
    return applyOp(view, (m, row, col) => {
      if (col === 0) return null
      const rows = m.rows.map((r) => {
        const c = [...r]
        ;[c[col - 1], c[col]] = [c[col], c[col - 1]]
        return c
      })
      const aligns = [...m.aligns]
      ;[aligns[col - 1], aligns[col]] = [aligns[col], aligns[col - 1]]
      return { t: 'replace', rows, aligns, cursor: { row, col: col - 1 } }
    })
  },

  moveColRight(view: EditorView): boolean {
    return applyOp(view, (m, row, col) => {
      if (col === m.aligns.length - 1) return null
      const rows = m.rows.map((r) => {
        const c = [...r]
        ;[c[col + 1], c[col]] = [c[col], c[col + 1]]
        return c
      })
      const aligns = [...m.aligns]
      ;[aligns[col + 1], aligns[col]] = [aligns[col], aligns[col + 1]]
      return { t: 'replace', rows, aligns, cursor: { row, col: col + 1 } }
    })
  },

  alignColumn(view: EditorView, align: Exclude<Align, null>): boolean {
    return applyOp(view, (m, row, col) => {
      const aligns = [...m.aligns]
      aligns[col] = aligns[col] === align ? null : align
      return { t: 'replace', rows: m.rows, aligns, cursor: { row, col } }
    })
  },

  formatTable(view: EditorView): boolean {
    return applyOp(view, (m, row, col) => ({ t: 'replace', rows: m.rows, aligns: m.aligns, cursor: { row, col } }))
  }
}

// ---- Insertion + shape picker ---------------------------------------------------

/** Insert a fresh table (`rows` rows total, row 0 = header) at the cursor. */
export function insertTableAtCursor(view: EditorView, rows: number, cols: number): void {
  const body = Math.max(0, rows - 1)
  const cells: string[][] = [new Array(cols).fill(''), ...new Array(body).fill(null).map(() => new Array(cols).fill(''))]
  const lines = formatTable(cells, new Array(cols).fill(null))
  const text = lines.join('\n')

  const line = view.state.doc.lineAt(view.state.selection.main.head)
  const isEmpty = line.text.trim() === ''
  const from = isEmpty ? line.from : line.to
  const insert = isEmpty ? text + '\n' : '\n' + text + '\n'
  const base = isEmpty ? line.from : line.to + 1
  // Header cell 0 content: "| " prefix, first cell.
  const sel = base + 2
  view.dispatch({
    changes: { from, to: line.to, insert },
    selection: EditorSelection.cursor(sel),
    scrollIntoView: true,
    userEvent: 'input.table'
  })
}

const openTablePicker = StateEffect.define<null>()
const closeTablePicker = StateEffect.define<null>()

const tablePickerField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    if (tr.effects.some((e) => e.is(openTablePicker))) return true
    if (tr.effects.some((e) => e.is(closeTablePicker))) return false
    // Typing or moving closes the picker.
    if (tr.docChanged || tr.selection) return false
    return value
  },
  provide: (f) => showTooltip.computeN([f], (state) => {
    if (!state.field(f, false)) return []
    return [{
      pos: state.selection.main.head,
      above: false,
      create: buildPicker
    }]
  })
})

const GRID = 8

function buildPicker(view: EditorView): { dom: HTMLElement; destroy(): void } {
  const dom = document.createElement('div')
  dom.className = 'lp-table-picker'
  const grid = document.createElement('div')
  grid.className = 'lp-table-picker-grid'
  const label = document.createElement('div')
  label.className = 'lp-table-picker-label'
  label.textContent = 'Insert table'

  let selR = -1
  let selC = -1
  const cells: HTMLElement[][] = []
  for (let r = 0; r < GRID; r++) {
    cells[r] = []
    for (let c = 0; c < GRID; c++) {
      const cell = document.createElement('div')
      cell.className = 'lp-table-picker-cell'
      const enter = (): void => {
        selR = r
        selC = c
        label.textContent = `${r + 1} × ${c + 1}`
        paint()
      }
      cell.addEventListener('mouseenter', enter)
      cell.addEventListener('mousedown', (e) => {
        e.preventDefault()
        insertTableAtCursor(view, r + 1, c + 1)
        view.dispatch({ effects: closeTablePicker.of(null) })
        view.focus()
      })
      cells[r][c] = cell
      grid.appendChild(cell)
    }
  }
  const paint = (): void => {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        cells[r][c].classList.toggle('lp-table-picker-on', r <= selR && c <= selC)
      }
    }
  }

  const onDocDown = (e: MouseEvent): void => {
    if (!dom.contains(e.target as Node)) {
      view.dispatch({ effects: closeTablePicker.of(null) })
    }
  }
  document.addEventListener('mousedown', onDocDown, true)

  dom.appendChild(grid)
  dom.appendChild(label)
  return {
    dom,
    destroy(): void {
      document.removeEventListener('mousedown', onDocDown, true)
    }
  }
}

/** Open the shape picker at the cursor (slash menu, toolbar, palette entry). */
export function openTableShapePicker(view: EditorView): void {
  view.dispatch({ effects: openTablePicker.of(null) })
}

// ---- Extension -------------------------------------------------------------------

const tableKeymap: Extension = Prec.high(
  keymap.of([
    { key: 'Tab', run: tableCommands.nextCell },
    { key: 'Shift-Tab', run: tableCommands.prevCell },
    { key: 'Enter', run: tableCommands.nextRow },
    { key: 'Alt-Shift-ArrowUp', run: tableCommands.insertRowAbove },
    { key: 'Alt-Shift-ArrowDown', run: tableCommands.insertRowBelow },
    { key: 'Alt-Shift-ArrowLeft', run: tableCommands.insertColLeft },
    { key: 'Alt-Shift-ArrowRight', run: tableCommands.insertColRight },
    { key: 'Alt-Shift-Backspace', run: tableCommands.deleteRow },
    { key: 'Alt-Ctrl-Backspace', run: tableCommands.deleteCol },
    {
      key: 'Escape',
      run: (v) => {
        if (!v.state.field(tablePickerField, false)) return false
        v.dispatch({ effects: closeTablePicker.of(null) })
        return true
      }
    }
  ])
)

export function tableExtension(): Extension {
  return [tablePickerField, tableKeymap]
}
