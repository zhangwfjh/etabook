/**
 * MultiCursor — VS-Code-style multi-cursor selection for TipTap/ProseMirror.
 *
 * ProseMirror's `Selection` is single-range by design; this extension ships a
 * `MultiCursorSelection` subclass that holds N ranges, maps them through
 * transactions, and fans input out to every caret in a single undo step.
 *
 * Implementation notes (the hard-won bits):
 * - The base `Selection` getters `$from`/`$to`/`empty` and the `replace`/
 *   `replaceWith`/`content` methods all read `this.ranges[i].$from`, assuming
 *   `ranges` is `SelectionRange[]`. We keep `ranges` as plain `{from,to}[]`
 *   (so it serializes cleanly and is easy to reason about), which means we
 *   MUST override those accessors/methods or they crash.
 * - `Selection#map`'s real runtime signature is `map(doc, mapping)` — doc
 *   first (ProseMirror resolves against the post-map doc). The TypeScript
 *   declaration omits `doc`, and our test calls `sel.map(mapping)` with a
 *   single arg, so `map` detects both shapes.
 * - Input fan-out lives in `appendTransaction` (universal: catches typing,
 *   backspace, paste, …) rather than overriding `replace*` (which would miss
 *   command-level edits like deleteCharBefore). `replace*` edit only the
 *   primary range; `appendTransaction` replays the same edit at every other
 *   caret in reverse positional order, producing one undo step.
 */

import { Extension } from '@tiptap/core'
import {
  Plugin,
  PluginKey,
  Selection,
  SelectionRange,
  TextSelection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { ReplaceStep, type Mappable } from '@tiptap/pm/transform'
import { isHistoryTransaction } from '@tiptap/pm/history'
import { Slice, type Node as PmNode, type ResolvedPos } from '@tiptap/pm/model'

const multiCursorKey = new PluginKey<null>('multiCursor')

export type MCRange = { from: number; to: number }

type MCSelJSON = { type: 'multicursor'; ranges: MCRange[]; primaryIndex: number }


export class MultiCursorSelection extends Selection {
  /**
   * One entry per caret. Typed as `(SelectionRange & MCRange)[]` so the class
   * stays a structurally-valid `Selection` subclass (base requires
   * `readonly SelectionRange[]`), while still exposing the numeric
   * `from`/`to` the public API uses. At runtime these are plain
   * `{from, to}` objects — every base accessor that would dereference
   * `ranges[i].$from` is overridden below, so the absent `$from`/`$to` is
   * never read.
   */
  override ranges: (SelectionRange & MCRange)[]
  primaryIndex: number

  constructor(
    $anchor: ResolvedPos,
    $head: ResolvedPos,
    ranges: MCRange[],
    primaryIndex: number,
  ) {
    // Base ctor stores `$anchor`/`$head` and would synthesize a single
    // `SelectionRange`; we immediately overwrite `ranges` with our own.
    super($anchor, $head)
    this.ranges = ranges as (SelectionRange & MCRange)[]
    this.primaryIndex = Math.min(Math.max(primaryIndex, 0), ranges.length - 1)
  }

  static create(
    doc: PmNode,
    ranges: MCRange[],
    primaryIndex = 0,
  ): MultiCursorSelection {
    if (ranges.length === 0) {
      // Degenerate: fall back to a collapsed caret at doc start.
      const pos = 1
      return new MultiCursorSelection(doc.resolve(pos), doc.resolve(pos), [{ from: pos, to: pos }], 0)
    }
    const safe = Math.min(Math.max(primaryIndex, 0), ranges.length - 1)
    const p = ranges[safe]
    return new MultiCursorSelection(doc.resolve(p.from), doc.resolve(p.to), ranges, safe)
  }

  /**
   * Map every range through `mapping`. Invalid ranges (negative / from>to)
   * are dropped; if all drop, collapse to a TextSelection near the mapped
   * primary position.
   *
   * Handles BOTH call shapes: ProseMirror's real `map(doc, mapping)` and the
   * single-arg `map(mapping)` form.
   */
  override map(docOrMapping: PmNode | Mappable, mapping?: Mappable): Selection {
    const single = mapping === undefined
    const mapp: Mappable = single ? (docOrMapping as Mappable) : mapping!
    const doc: PmNode = single ? this.$anchor.doc : (docOrMapping as PmNode)

    const mapped: MCRange[] = []
    for (const r of this.ranges) {
      const from = mapp.map(r.from, 1)
      const to = mapp.map(r.to, -1)
      if (from < 0 || to < 0 || from > to) continue
      mapped.push({ from, to })
    }
    if (mapped.length === 0) {
      const primary = this.ranges[this.primaryIndex] ?? { from: 1, to: 1 }
      const pos = Math.max(1, mapp.map(primary.from, 1))
      const safe = Math.min(pos, doc.content.size)
      return TextSelection.near(doc.resolve(safe))
    }
    return MultiCursorSelection.create(
      doc,
      mapped,
      Math.min(this.primaryIndex, mapped.length - 1),
    )
  }

  override eq(other: Selection): boolean {
    if (!(other instanceof MultiCursorSelection)) return false
    return (
      this.ranges.length === other.ranges.length &&
      this.ranges.every(
        (r, i) => r.from === other.ranges[i].from && r.to === other.ranges[i].to,
      ) &&
      this.primaryIndex === other.primaryIndex
    )
  }

  override toJSON(): MCSelJSON {
    return {
      type: 'multicursor',
      ranges: this.ranges.map((r) => ({ from: r.from, to: r.to })),
      primaryIndex: this.primaryIndex,
    }
  }

  static override fromJSON(doc: PmNode, json: MCSelJSON | { ranges: MCRange[]; primaryIndex: number }): MultiCursorSelection {
    return MultiCursorSelection.create(doc, json.ranges, json.primaryIndex)
  }

  // --- Accessor overrides -------------------------------------------------
  // `ranges` is plain `{from,to}[]`, so the base getters (which dereference
  // `ranges[i].$from`) would throw. Resolve off the primary range instead.

  override get $from(): ResolvedPos {
    return this.$anchor
  }
  override get $to(): ResolvedPos {
    return this.$head
  }
  override get empty(): boolean {
    return this.ranges.every((r) => r.from === r.to)
  }

  get isMultiCursor(): boolean {
    return this.ranges.length > 1
  }

  // --- Replace machinery --------------------------------------------------
  // Edit only the primary range; `appendTransaction` fans the same edit out
  // to every other caret. Mirrors the base implementation's mapping through
  // `tr.mapping.slice(mapFrom)` so positions stay correct mid-transaction.

  override replace(tr: Transaction, content: Slice = Slice.empty): void {
    const mapFrom = tr.steps.length
    const r = this.ranges[this.primaryIndex]
    const mapping = tr.mapping.slice(mapFrom)
    tr.replaceRange(mapping.map(r.from), mapping.map(r.to), content)
  }

  override replaceWith(tr: Transaction, node: PmNode): void {
    const mapFrom = tr.steps.length
    const r = this.ranges[this.primaryIndex]
    const mapping = tr.mapping.slice(mapFrom)
    tr.replaceRangeWith(mapping.map(r.from), mapping.map(r.to), node)
  }

  override content(): Slice {
    const r = this.ranges[this.primaryIndex]
    return this.$anchor.doc.slice(r.from, r.to)
  }
}

// Register the selection class under a JSON id so ProseMirror's generic
// `Selection.fromJSON` can dispatch to us. Must run after the class is
// declared (class declarations are not hoisted).
Selection.jsonID('multicursor', MultiCursorSelection)

// ---------------------------------------------------------------------------
// Occurrence helpers
// ---------------------------------------------------------------------------

/** Every (case-sensitive) occurrence of `text` in the doc, as ranges. */
function findAllOccurrences(doc: PmNode, text: string): MCRange[] {
  const out: MCRange[] = []
  if (!text) return out
  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (!node.isText || !node.text) return
    const str = node.text
    let idx = 0
    while ((idx = str.indexOf(text, idx)) !== -1) {
      out.push({ from: pos + idx, to: pos + idx + text.length })
      idx += text.length
    }
  })
  return out
}

const rangeKey = (r: MCRange): string => `${r.from}:${r.to}`

/**
 * Next occurrence of `text` at/after `afterPos`, skipping ranges already in
 * `taken`, with wraparound. Returns null if none.
 */
function findNextOccurrence(
  doc: PmNode,
  text: string,
  afterPos: number,
  taken: MCRange[],
): MCRange | null {
  const all = findAllOccurrences(doc, text)
  const takenSet = new Set(taken.map(rangeKey))
  const forward = all.find((o) => o.from >= afterPos && !takenSet.has(rangeKey(o)))
  if (forward) return forward
  // Wraparound: first untaken occurrence from the top.
  return all.find((o) => !takenSet.has(rangeKey(o))) ?? null
}


/** Word (a maximal run of `\w`) range covering `pos`, or null when `pos`
 *  isn't inside a word. If the char at `pos` isn't a word char, backs up one
 *  position so a click landing just past a word still selects it. */
function wordRangeAtPos(doc: PmNode, pos: number): MCRange | null {
  const isWord = (c: string): boolean => c.length === 1 && /\w/.test(c)
  const at = (p: number): string =>
    p >= 0 && p <= doc.content.size ? doc.textBetween(p, p + 1, '') : ''
  let p = pos
  if (!isWord(at(p))) {
    if (isWord(at(p - 1))) p -= 1
    else return null
  }
  const size = doc.content.size
  let start = p
  while (start > 0 && isWord(at(start - 1))) start -= 1
  let end = p
  while (end < size && isWord(at(end))) end += 1
  if (start === end) return null
  return { from: start, to: end }
}

/** Drop ranges that share both `from` and `to` with an earlier range,
 *  preserving first-seen order. */
function dedupeRanges(ranges: MCRange[]): MCRange[] {
  const seen = new Set<string>()
  const out: MCRange[] = []
  for (const r of ranges) {
    const k = `${r.from}:${r.to}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

// ---------------------------------------------------------------------------
// Fan-out
// ---------------------------------------------------------------------------

/**
 * When a `MultiCursorSelection` is active and a doc-changing transaction
 * arrives, replay the primary edit at every other caret (reverse positional
 * order) in a single appended transaction — one undo step. Falls back to null
 * (no-op) when there's nothing to fan out or the edit isn't a recognizable
 * replace.
 */
function fanOutEdit(
  transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState,
): Transaction | null {
  // Editing commands (insertContent, deleteSelection, …) typically replace the
  // PRIMARY range and then RESET the selection to a TextSelection — so by the
  // time we see `newState`, the MultiCursorSelection is gone. Detect multi-
  // cursor from `oldState.selection` instead, replay the same edit at every
  // other caret, then restore a MultiCursorSelection over all the new carets.
  const oldSel = oldState.selection
  if (!(oldSel instanceof MultiCursorSelection) || oldSel.ranges.length < 2) {
    return null
  }

  const last = transactions[transactions.length - 1]
  if (!last || !last.docChanged || last.getMeta('mcFanout')) return null
  // Never fan out undo/redo — those already invert the whole multi-cursor
  // edit as one history event; replaying them at the secondary carets would
  // corrupt the document.
  if (isHistoryTransaction(last)) return null

  // Collect the replace steps that constitute the primary edit.
  const replaceSteps: ReplaceStep[] = []
  for (const step of last.steps) {
    if (step instanceof ReplaceStep) replaceSteps.push(step)
  }
  if (replaceSteps.length === 0) return null
  const sliceSize = replaceSteps.reduce((n, s) => n + s.slice.size, 0)

  const tr = newState.tr
  // Non-primary OLD ranges, mapped through the primary edit so they point at
  // the corresponding text in the new doc. Highest position first: appending a
  // step at a higher offset doesn't invalidate lower offsets.
  const others = oldSel.ranges
    .map((r, i) => ({ r, i }))
    .filter((o) => o.i !== oldSel.primaryIndex)
    .sort((a, b) => last.mapping.map(b.r.from) - last.mapping.map(a.r.from))

  let didAny = false
  const replayed: { index: number; midFrom: number }[] = []
  for (const o of others) {
    const midFrom = last.mapping.map(o.r.from, 1)
    const midTo = last.mapping.map(o.r.to, -1)
    for (const step of replaceSteps) {
      try {
        const replay = new ReplaceStep(midFrom, midTo, step.slice)
        const result = replay.apply(tr.doc)
        if (result.failed) continue
        tr.step(replay)
        replayed.push({ index: o.i, midFrom })
        didAny = true
        break
      } catch {
        // Graceful degradation: skip a range we can't replay into.
      }
    }
  }
  if (!didAny) return null

  // Restore a MultiCursorSelection spanning every caret. Primary caret = where
  // the editing command left the (Text)Selection; each secondary caret = end
  // of its replayed insertion, mapped through the fan-out transaction.
  const newRanges: MCRange[] = oldSel.ranges.map((r, i) => {
    if (i === oldSel.primaryIndex) {
      return { from: newState.selection.from, to: newState.selection.to }
    }
    const rec = replayed.find((p) => p.index === i)
    const midFrom = rec ? rec.midFrom : last.mapping.map(r.from, 1)
    const pos = tr.mapping.map(midFrom, 1) + sliceSize
    return { from: pos, to: pos }
  })
  const restored = MultiCursorSelection.create(tr.doc, newRanges, oldSel.primaryIndex)
  tr.setSelection(restored)

  tr.setMeta(multiCursorKey, { fanout: true })
  tr.setMeta('mcFanout', true)
  return tr
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export const MultiCursor = Extension.create({
  name: 'multiCursor',

  addCommands() {
    return {
      selectNextOccurrence:
        () =>
        ({ editor, state, dispatch }) => {
          if (!editor.isEditable) return false
          const { selection, doc } = state
          // Empty caret (not multi-cursor): the FIRST Ctrl+D selects the word
          // under the cursor (no multi-cursor yet). The next Ctrl+D, now over
          // a non-empty selection, finds and appends the next occurrence as a
          // new cursor. Mirrors VS Code.
          if (
            !(selection instanceof MultiCursorSelection) &&
            selection.from === selection.to
          ) {
            const word = wordRangeAtPos(doc, selection.from)
            if (!word) return false
            const ts = TextSelection.create(doc, word.from, word.to)
            if (dispatch) dispatch(state.tr.setSelection(ts))
            return true
          }

          const text = doc.textBetween(selection.from, selection.to, ' ')
          if (!text) return false

          let taken: MCRange[]
          let searchFrom: number
          if (selection instanceof MultiCursorSelection) {
            taken = selection.ranges
            searchFrom = selection.ranges[selection.primaryIndex].to
          } else {
            taken = [{ from: selection.from, to: selection.to }]
            searchFrom = selection.to
          }

          const match = findNextOccurrence(doc, text, searchFrom, taken)
          if (!match) return false

          const ranges = [...taken, match]
          const sel = MultiCursorSelection.create(doc, ranges, ranges.length - 1)
          if (dispatch) dispatch(state.tr.setSelection(sel))
          return true
        },

      skipOccurrence:
        () =>
        ({ editor, state, dispatch }) => {
          if (!editor.isEditable) return false
          const { selection, doc } = state
          if (!(selection instanceof MultiCursorSelection)) return false

          const primaryRange = selection.ranges[selection.primaryIndex]
          const text = doc.textBetween(primaryRange.from, primaryRange.to, ' ')

          // Drop the primary range, then advance to the next occurrence of the
          // same text (if any) as the new primary. Skipping unselects the
          // current word and jumps to the next match.
          const remaining = selection.ranges.filter(
            (_, i) => i !== selection.primaryIndex,
          )
          const match = text
            ? findNextOccurrence(doc, text, primaryRange.to, remaining)
            : null

          if (match) {
            const ranges = [...remaining, match]
            const sel = MultiCursorSelection.create(doc, ranges, ranges.length - 1)
            if (dispatch) dispatch(state.tr.setSelection(sel))
            return true
          }

          // No more occurrences: collapse out of multi-cursor.
          if (remaining.length <= 1) {
            const r = remaining[0] ?? primaryRange
            const ts = TextSelection.create(doc, r.from, r.to)
            if (dispatch) dispatch(state.tr.setSelection(ts))
          } else {
            const sel = MultiCursorSelection.create(doc, remaining, 0)
            if (dispatch) dispatch(state.tr.setSelection(sel))
          }
          return true
        },

      selectAllOccurrences:
        () =>
        ({ editor, state, dispatch }) => {
          if (!editor.isEditable) return false
          const { selection, doc } = state
          const text = doc.textBetween(selection.from, selection.to, ' ')
          if (!text) return false
          const all = findAllOccurrences(doc, text)
          if (all.length === 0) return false
          // Prefer keeping the current selection primary.
          const cur = { from: selection.from, to: selection.to }
          let primary = all.findIndex(
            (r) => r.from === cur.from && r.to === cur.to,
          )
          if (primary < 0) primary = 0
          const sel = MultiCursorSelection.create(doc, all, primary)
          if (dispatch) dispatch(state.tr.setSelection(sel))
          return true
        },

      addCursorAbove:
        () =>
        ({ editor, state, dispatch }) => {
          if (!editor.isEditable) return false
          return addCursorVertical(editor, state, dispatch, -1)
        },

      addCursorBelow:
        () =>
        ({ editor, state, dispatch }) => {
          if (!editor.isEditable) return false
          return addCursorVertical(editor, state, dispatch, 1)
        },

      exitMultiCursor:
        () =>
        ({ editor, state, dispatch }) => {
          if (!editor.isEditable) return false
          const { selection } = state
          if (!(selection instanceof MultiCursorSelection)) return false
          const r = selection.ranges[selection.primaryIndex]
          const ts = TextSelection.create(state.doc, r.from, r.to)
          if (dispatch) dispatch(state.tr.setSelection(ts))
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<null>({
        key: multiCursorKey,
        props: {
          decorations(state) {
            const sel = state.selection
            if (!(sel instanceof MultiCursorSelection)) return DecorationSet.empty
            const decos: Decoration[] = []
            for (let i = 0; i < sel.ranges.length; i++) {
              const r = sel.ranges[i]
              // Highlight the selected span for each non-empty range, in
              // addition to the caret widget below.
              if (r.from !== r.to) {
                decos.push(Decoration.inline(r.from, r.to, { class: 'mc-selection' }))
              }
              decos.push(
                Decoration.widget(
                  r.from,
                  () => {
                    const span = document.createElement('span')
                    span.className =
                      i === sel.primaryIndex
                        ? 'mc-caret mc-caret-primary'
                        : 'mc-caret mc-caret-secondary'
                    return span
                  },
                  { side: -1 },
                ),
              )
            }
            return DecorationSet.create(state.doc, decos)
          },

          // Alt+Click adds a cursor at the click point, keeping every existing
          // caret. Handled on `mousedown` (before ProseMirror's own selection
          // update) so the click never collapses to a single caret first.
          handleDOMEvents: {
            mousedown(view, event) {
              if (!view.editable) return false
              const me = event as MouseEvent
              if (!me.altKey) return false
              const hit = view.posAtCoords({ left: me.clientX, top: me.clientY })
              if (!hit) return false
              const sel = view.state.selection
              let ranges: MCRange[]
              let primary: number
              if (sel instanceof MultiCursorSelection) {
                ranges = [...sel.ranges, { from: hit.pos, to: hit.pos }]
                primary = ranges.length - 1
              } else {
                ranges = [
                  { from: sel.from, to: sel.to },
                  { from: hit.pos, to: hit.pos },
                ]
                primary = 1
              }
              const newSel = MultiCursorSelection.create(view.state.doc, ranges, primary)
              view.dispatch(view.state.tr.setSelection(newSel))
              me.preventDefault()
              return true
            },
          },

          // Double-click selects the word under the click with NO surrounding
          // whitespace (the default word selection can include it).
          handleDoubleClick(view, pos) {
            if (!view.editable) return false
            const range = wordRangeAtPos(view.state.doc, pos)
            if (!range) return false
            const ts = TextSelection.create(view.state.doc, range.from, range.to)
            view.dispatch(view.state.tr.setSelection(ts))
            return true
          },

          handleKeyDown(view, event) {
            if (event.key === 'Escape') {
              const sel = view.state.selection
              if (sel instanceof MultiCursorSelection) {
                const r = sel.ranges[sel.primaryIndex]
                const ts = TextSelection.create(view.state.doc, r.from, r.to)
                view.dispatch(view.state.tr.setSelection(ts))
                return true
              }
              return false
            }

            // Arrow keys move EVERY caret together while in multi-cursor mode.
            // Collisions (two carets landing on the same spot) are merged, and
            // if only one caret remains we drop back to a TextSelection.
            const sel = view.state.selection
            if (!(sel instanceof MultiCursorSelection)) return false
            const k = event.key
            if (
              event.shiftKey ||
              event.altKey ||
              event.metaKey ||
              event.ctrlKey
            ) {
              return false
            }
            if (
              k !== 'ArrowLeft' &&
              k !== 'ArrowRight' &&
              k !== 'ArrowUp' &&
              k !== 'ArrowDown'
            ) {
              return false
            }

            const doc = view.state.doc
            const size = doc.content.size
            let moved: MCRange[]
            if (k === 'ArrowLeft' || k === 'ArrowRight') {
              const dir = k === 'ArrowRight' ? 1 : -1
              moved = sel.ranges.map((r) => ({
                from: Math.max(0, Math.min(size, r.from + dir)),
                to: Math.max(0, Math.min(size, r.to + dir)),
              }))
            } else {
              const dir = k === 'ArrowDown' ? 1 : -1
              moved = sel.ranges.map((r) => {
                try {
                  const coords = view.coordsAtPos(r.from)
                  const target = dir === 1 ? coords.bottom + 4 : coords.top - 4
                  const hit = view.posAtCoords({ left: coords.left, top: target })
                  if (hit) return { from: hit.pos, to: hit.pos }
                } catch {
                  // coords resolution failed — leave this caret where it is.
                }
                return { from: r.from, to: r.to }
              })
            }

            const merged = dedupeRanges(moved)
            event.preventDefault()
            if (merged.length <= 1) {
              const r = merged[0] ?? sel.ranges[sel.primaryIndex]
              view.dispatch(
                view.state.tr.setSelection(TextSelection.create(doc, r.from, r.to)),
              )
            } else {
              const newSel = MultiCursorSelection.create(
                doc,
                merged,
                Math.min(sel.primaryIndex, merged.length - 1),
              )
              view.dispatch(view.state.tr.setSelection(newSel))
            }
            return true
          },
        },
        appendTransaction(transactions, oldState, newState) {
          return fanOutEdit(transactions, oldState, newState)
        },
      }),
    ]
  },
})

/**
 * Add a caret on the line above/below the primary caret using screen
 * coordinates. Best-effort (not unit-tested); degrades gracefully when the
 * view can't resolve a target position.
 */
function addCursorVertical(
  editor: { isEditable: boolean; view: { coordsAtPos: (p: number) => { left: number; top: number; bottom: number }; posAtCoords: (c: { left: number; top: number }) => { pos: number; inside: number } | null } },
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  dir: 1 | -1,
): boolean {
  const sel = state.selection
  const primaryPos =
    sel instanceof MultiCursorSelection
      ? sel.ranges[sel.primaryIndex].from
      : sel.from
  const view = editor.view
  try {
    const coords = view.coordsAtPos(primaryPos)
    const target = dir === 1 ? coords.bottom + 4 : coords.top - 4
    const hit = view.posAtCoords({ left: coords.left, top: target })
    if (!hit) return false
    const newPos = hit.pos
    let ranges: MCRange[]
    let primary: number
    if (sel instanceof MultiCursorSelection) {
      ranges = [...sel.ranges, { from: newPos, to: newPos }]
      primary = ranges.length - 1
    } else {
      ranges = [
        { from: sel.from, to: sel.to },
        { from: newPos, to: newPos },
      ]
      primary = 1
    }
    const newSel = MultiCursorSelection.create(state.doc, ranges, primary)
    if (dispatch) dispatch(state.tr.setSelection(newSel))
    return true
  } catch {
    return false
  }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    multiCursor: {
      selectNextOccurrence: () => ReturnType
      skipOccurrence: () => ReturnType
      selectAllOccurrences: () => ReturnType
      addCursorAbove: () => ReturnType
      addCursorBelow: () => ReturnType
      exitMultiCursor: () => ReturnType
    }
  }
}
