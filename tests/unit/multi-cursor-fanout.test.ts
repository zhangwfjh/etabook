// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { MultiCursor, MultiCursorSelection } from '../../src/renderer/editor/multi-cursor'

function makeEditor(initial = '<p>foo foo foo</p>') {
  return new Editor({ extensions: [StarterKit, MultiCursor], content: initial, editable: true })
}

/** Simulate real text input by calling the handleTextInput plugin prop. */
function typeText(editor: Editor, text: string) {
  const sel = editor.state.selection
  const consumed = editor.view.someProp('handleTextInput', (f) =>
    f(editor.view, sel.from, sel.to, text),
  )
  if (!consumed) editor.commands.insertContent(text)
}

describe('MultiCursor — input fan-out', () => {
  it('inserts text at every caret in one undo step', () => {
    const editor = makeEditor()
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.commands.selectNextOccurrence()
    const sel = editor.state.selection as MultiCursorSelection
    expect(sel.ranges.length).toBe(2)

    // Simulate typing 'X' — handleTextInput applies it at ALL carets.
    typeText(editor, 'X')

    const text = editor.state.doc.textContent
    expect(text).toBe('X X foo')

    // One undo restores everything — proof of a single undo step.
    editor.commands.undo()
    expect(editor.state.doc.textContent).toBe('foo foo foo')
  })

  it('skips ranges that cannot accept the edit (graceful degradation)', () => {
    const editor = makeEditor('<p>abc</p><p>abc</p>')
    const doc = editor.state.doc
    const multi = MultiCursorSelection.create(doc, [
      { from: 1, to: 4 },
      { from: 6, to: 9 },
    ], 0)
    editor.view.dispatch(editor.state.tr.setSelection(multi))
    typeText(editor, 'Z')
    expect(editor.state.doc.textContent).toBe('ZZ')
    editor.destroy()
  })
})
