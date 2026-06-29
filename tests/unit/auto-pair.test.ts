// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { AutoPair } from '../../src/renderer/editor/auto-pair'

function makeEditor(initial = '<p></p>') {
  return new Editor({
    extensions: [StarterKit, AutoPair],
    content: initial,
    editable: true,
  })
}

function insertText(editor: Editor, text: string) {
  const consumed = editor.view.someProp('handleTextInput', (f) =>
    f(editor.view, editor.state.selection.from, editor.state.selection.to, text),
  )
  if (!consumed) editor.commands.insertContent(text)
}

function setCursor(editor: Editor, pos: number) {
  editor.commands.setTextSelection(pos)
}

function getText(editor: Editor): string {
  return editor.state.doc.textContent
}

describe('AutoPair — auto-close', () => {
  it('inserts matching closer and places caret between', () => {
    const editor = makeEditor()
    setCursor(editor, 1)
    insertText(editor, '(')
    expect(getText(editor)).toBe('()')
    expect(editor.state.selection.from).toBe(2)
  })

  it.each(['[', '{'])('auto-closes bracket %s', (open) => {
    const editor = makeEditor()
    setCursor(editor, 1)
    insertText(editor, open)
    const closer = open === '(' ? ')' : open === '[' ? ']' : '}'
    expect(getText(editor)).toBe(open + closer)
  })

  it.each(["'", '"'])('auto-closes quote %s', (q) => {
    const editor = makeEditor()
    setCursor(editor, 1)
    insertText(editor, q)
    expect(getText(editor)).toBe(q + q)
    expect(editor.state.selection.from).toBe(2)
  })

  it('does NOT auto-close backtick (so code fences can be typed)', () => {
    const editor = makeEditor()
    setCursor(editor, 1)
    insertText(editor, '`')
    // A single literal backtick — pairing would turn ``` into four backticks
    // and break code-fence creation.
    expect(getText(editor)).toBe('`')
    expect(editor.state.selection.from).toBe(2)
  })
})

describe('AutoPair — selection wrapping', () => {
  it('wraps a selection with brackets, caret after close', () => {
    const editor = makeEditor('<p>hi</p>')
    editor.commands.setTextSelection({ from: 1, to: 3 })
    insertText(editor, '(')
    expect(getText(editor)).toBe('(hi)')
    expect(editor.state.selection.from).toBe(5)
  })
})

describe('AutoPair — skip-over', () => {
  it('skips over an existing closer instead of inserting', () => {
    const editor = makeEditor('<p>()</p>')
    setCursor(editor, 2)
    insertText(editor, ')')
    expect(getText(editor)).toBe('()')
    expect(editor.state.selection.from).toBe(3)
  })
})

describe('AutoPair — backspace deletes pair', () => {
  it('deletes an empty pair on backspace', () => {
    const editor = makeEditor('<p>()</p>')
    setCursor(editor, 2)
    // Simulate Backspace: empty selection, caret between the pair.
    const consumed = editor.view.someProp('handleKeyDown', (f) =>
      f(editor.view, {
        key: 'Backspace',
      } as KeyboardEvent),
    )
    expect(consumed).toBe(true)
    expect(getText(editor)).toBe('')
  })
})
