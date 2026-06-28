// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { MultiCursor, MultiCursorSelection } from '../../src/renderer/editor/multi-cursor'

function makeEditor(initial = '<p>foo foo foo</p>') {
  return new Editor({ extensions: [StarterKit, MultiCursor], content: initial, editable: true })
}

describe('MultiCursorSelection — map', () => {
  it('keeps ranges valid through an insert before them', () => {
    const editor = makeEditor()
    const doc = editor.state.doc
    const sel = MultiCursorSelection.create(doc, [
      { from: 1, to: 4 },
      { from: 5, to: 8 },
    ])
    // Insert one char at the start of the paragraph text (pos 1), before the
    // first range. NB: pos 0 would be before the <p> node and ProseMirror
    // block-wraps the insert (a +3 shift); pos 1 is the in-text position the
    // "+1 shift" assertion below actually describes.
    const tr = editor.state.tr.insertText('X', 1)
    const mapped = sel.map(tr.mapping) as MultiCursorSelection
    expect(mapped).toBeInstanceOf(MultiCursorSelection)
    expect(mapped.ranges.length).toBe(2)
    // Both ranges shifted by 1.
    expect(mapped.ranges[0].from).toBe(2)
    expect(mapped.ranges[1].from).toBe(6)
  })
})

describe('MultiCursorSelection — JSON round-trip', () => {
  it('serializes and restores ranges + primaryIndex', () => {
    const editor = makeEditor()
    const doc = editor.state.doc
    const sel = MultiCursorSelection.create(doc, [
      { from: 1, to: 4 },
      { from: 5, to: 8 },
    ], 1)
    const json = sel.toJSON()
    const restored = MultiCursorSelection.fromJSON(doc, json)
    expect(restored.ranges).toEqual(sel.ranges)
    expect(restored.primaryIndex).toBe(1)
  })
})

describe('MultiCursor — selectNextOccurrence', () => {
  it('adds a cursor at the next occurrence of the selected text', () => {
    const editor = makeEditor()
    editor.commands.setTextSelection({ from: 1, to: 4 }) // "foo"
    editor.commands.selectNextOccurrence()
    const sel = editor.state.selection
    expect(sel).toBeInstanceOf(MultiCursorSelection)
    expect((sel as MultiCursorSelection).ranges.length).toBe(2)
  })
})

describe('MultiCursor — selectAllOccurrences', () => {
  it('puts a cursor at every occurrence', () => {
    const editor = makeEditor()
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.commands.selectAllOccurrences()
    const sel = editor.state.selection as MultiCursorSelection
    expect(sel).toBeInstanceOf(MultiCursorSelection)
    expect(sel.ranges.length).toBe(3)
  })
})

describe('MultiCursor — exit conditions', () => {
  it('collapses to TextSelection on exit', () => {
    const editor = makeEditor()
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.commands.selectNextOccurrence()
    expect(editor.state.selection).toBeInstanceOf(MultiCursorSelection)
    editor.commands.exitMultiCursor()
    expect(editor.state.selection).not.toBeInstanceOf(MultiCursorSelection)
  })
})
