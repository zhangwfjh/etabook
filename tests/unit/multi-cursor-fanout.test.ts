// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { MultiCursor, MultiCursorSelection } from '../../src/renderer/editor/multi-cursor'

function makeEditor(initial = '<p>foo foo foo</p>') {
  return new Editor({ extensions: [StarterKit, MultiCursor], content: initial, editable: true })
}

// These cover the headline behavior the spec tests omit: typing with N carets
// fans the edit out to every caret in a SINGLE undo step (one transaction).
describe('MultiCursor — input fan-out', () => {
  it('inserts text at every caret in one undo step', () => {
    const editor = makeEditor()
    // Two carets over the first two "foo".
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.commands.selectNextOccurrence()
    const sel = editor.state.selection as MultiCursorSelection
    expect(sel.ranges.length).toBe(2)

    // Simulate typing a char at the primary caret. The primary range is
    // replaced; appendTransaction must replay it at the other caret.
    editor.commands.insertContent('X')

    const text = editor.state.doc.textContent
    // Each "foo" became "X" (the selection was replaced), at both carets.
    expect(text).toBe('X X foo')

    // One undo restores everything — proof of a single undo step.
    editor.commands.undo()
    expect(editor.state.doc.textContent).toBe('foo foo foo')
  })

  it('skips ranges that cannot accept the edit (graceful degradation)', () => {
    // Build a multi-cursor across two paragraphs; the fan-out must not throw
    // even when a secondary range sits at an awkward boundary.
    const editor = makeEditor('<p>abc</p><p>abc</p>')
    const doc = editor.state.doc
    // "abc" in para 1 = pos 1..4, "abc" in para 2 = pos 6..9.
    const multi = MultiCursorSelection.create(doc, [
      { from: 1, to: 4 },
      { from: 6, to: 9 },
    ], 0)
    editor.view.dispatch(editor.state.tr.setSelection(multi))
    expect(editor.commands.insertContent('Z')).toBe(true)
    // Both carets replaced their "abc" with "Z" — one per paragraph.
    expect(editor.state.doc.textContent).toBe('ZZ')
    editor.destroy()
  })
})
