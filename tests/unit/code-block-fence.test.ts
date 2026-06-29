// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { common, createLowlight } from 'lowlight'
import { CodeBlock } from '../../src/renderer/editor/code-marks'

const lowlight = createLowlight(common)

function makeEditor(initial = '<p></p>') {
  return new Editor({
    extensions: [StarterKit.configure({ codeBlock: false }), CodeBlock.configure({ lowlight })],
    content: initial,
    editable: true,
  })
}

/** Dispatch an Enter keydown through the editor's keymap, like a real press. */
function pressEnter(editor: Editor): boolean {
  return (
    editor.view.someProp('handleKeyDown', (f) =>
      f(editor.view, { key: 'Enter' } as KeyboardEvent),
    ) ?? false
  )
}

describe('CodeBlock — fence creation on Enter', () => {
  it('converts a ``` paragraph into an empty code block on Enter', () => {
    const editor = makeEditor('<p>```</p>')
    editor.commands.setTextSelection(4) // end of ```
    expect(pressEnter(editor)).toBe(true)
    const block = editor.state.doc.child(0)
    expect(block.type.name).toBe('codeBlock')
    expect(block.textContent).toBe('')
    expect(block.attrs.language).toBe(null)
    expect(block.attrs.fenceChar).toBe('`')
    expect(block.attrs.fenceLength).toBe(3)
  })

  it('converts a ```js paragraph into a code block carrying the language', () => {
    const editor = makeEditor('<p>```js</p>')
    editor.commands.setTextSelection(6)
    expect(pressEnter(editor)).toBe(true)
    const block = editor.state.doc.child(0)
    expect(block.type.name).toBe('codeBlock')
    expect(block.attrs.language).toBe('js')
    expect(block.attrs.fenceChar).toBe('`')
  })

  it('handles ~~~ tilde fences with a language', () => {
    const editor = makeEditor('<p>~~~py</p>')
    editor.commands.setTextSelection(6)
    expect(pressEnter(editor)).toBe(true)
    const block = editor.state.doc.child(0)
    expect(block.type.name).toBe('codeBlock')
    expect(block.attrs.fenceChar).toBe('~')
  })

  it('leaves a normal paragraph alone (no code block created) on Enter', () => {
    const editor = makeEditor('<p>hello</p>')
    editor.commands.setTextSelection(6)
    pressEnter(editor)
    // Default Enter (split) may run, but no code block must appear.
    editor.state.doc.forEach((child) => {
      expect(child.type.name).not.toBe('codeBlock')
    })
    expect(editor.state.doc.child(0).type.name).toBe('paragraph')
  })
})
