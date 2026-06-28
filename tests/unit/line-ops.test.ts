// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { LineOps } from '../../src/renderer/editor/line-ops'

function makeEditor(initial = '<p>First</p><p>Second</p><p>Third</p>') {
  return new Editor({ extensions: [StarterKit, LineOps], content: initial, editable: true })
}

describe('LineOps — duplicateLine', () => {
  it('duplicates the current block', () => {
    const editor = makeEditor()
    editor.commands.setTextSelection(1) // in "First"
    editor.commands.duplicateLine()
    expect(editor.state.doc.childCount).toBe(4)
    expect(editor.state.doc.child(0).textContent).toBe('First')
    expect(editor.state.doc.child(1).textContent).toBe('First')
  })

  it('handles the trailing empty paragraph', () => {
    const editor = makeEditor('<p>Text</p><p></p>')
    editor.commands.setTextSelection(7) // in the empty paragraph
    editor.commands.duplicateLine()
    expect(editor.state.doc.childCount).toBe(3)
    expect(editor.state.doc.child(2).textContent).toBe('')
  })
})

describe('LineOps — moveLineUp', () => {
  it('swaps the current block with the one above', () => {
    const editor = makeEditor()
    editor.commands.setTextSelection(7) // in "Second"
    editor.commands.moveLineUp()
    expect(editor.state.doc.child(0).textContent).toBe('Second')
    expect(editor.state.doc.child(1).textContent).toBe('First')
  })

  it('is a no-op on the first block', () => {
    const editor = makeEditor()
    editor.commands.setTextSelection(1)
    editor.commands.moveLineUp()
    expect(editor.state.doc.child(0).textContent).toBe('First')
  })
})

describe('LineOps — moveLineDown', () => {
  it('swaps the current block with the one below', () => {
    const editor = makeEditor()
    editor.commands.setTextSelection(1) // "First"
    editor.commands.moveLineDown()
    expect(editor.state.doc.child(0).textContent).toBe('Second')
    expect(editor.state.doc.child(1).textContent).toBe('First')
  })

  it('is a no-op on the last block', () => {
    const editor = makeEditor()
    editor.commands.setTextSelection(15) // "Third"
    editor.commands.moveLineDown()
    expect(editor.state.doc.child(2).textContent).toBe('Third')
  })
})
