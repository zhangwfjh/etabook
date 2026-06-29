import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Window } from 'happy-dom'
import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { MarkdownManager } from '@tiptap/markdown'
import { TextSelection } from '@tiptap/pm/state'
import { Highlight } from '@/editor/highlight'
import { BlockRawFocus, rawFocusSerialize, hasRawFocus } from '@/editor/block-raw-focus'

function setupDom() {
  const window = new Window()
  const doc = window.document
  const raf = (cb: FrameRequestCallback): number => { cb(Date.now()); return 0 }
  Object.assign(globalThis, {
    window,
    document: doc,
    DocumentFragment: window.DocumentFragment,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    customElements: window.customElements,
    getSelection: window.getSelection.bind(window),
    requestAnimationFrame: raf as typeof requestAnimationFrame,
    cancelAnimationFrame: () => {},
  })
  return { window, doc }
}

describe('BlockRawFocus', () => {
  let editor: Editor
  let mountEl: HTMLElement

  beforeEach(() => {
    const dom = setupDom()
    mountEl = dom.doc.createElement('div')
    dom.doc.body.appendChild(mountEl)
  })

  afterEach(() => {
    editor?.destroy()
  })

  function makeEditor(md: string, editable = true): void {
    const mgr = new MarkdownManager({ extensions: [StarterKit, Highlight, BlockRawFocus] })
    const content = mgr.parse(md)
    editor = new Editor({
      element: mountEl,
      extensions: [StarterKit, Highlight, BlockRawFocus],
      content,
      editable,
    })
  }

  /** Place the caret at `pos` (collapsed) and dispatch so view.update fires. */
  function placeCaret(pos: number): void {
    const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos))
    editor.view.dispatch(tr)
  }

  it('swaps the focused block to literal markdown source', () => {
    makeEditor('a **bold** line\n\nplain paragraph')
    // Caret into block 0 (the bold paragraph). Position 1 = first text offset.
    placeCaret(1)
    const block0 = editor.state.doc.child(0)
    expect(block0.textContent).toBe('a **bold** line')
    expect(hasRawFocus(editor)).toBe(true)
  })

  it('leaves plain paragraphs un-swapped (source === text)', () => {
    makeEditor('plain paragraph\n\n**bold**')
    // Caret into the plain block (no marks): no swap happens.
    placeCaret(1)
    expect(hasRawFocus(editor)).toBe(false)
  })

  it('does not swap a plain paragraph that only contains a literal backtick', () => {
    // A lone backtick is literal text (no code mark). The serializer escapes
    // it to `\``, which used to make md !== textContent and trigger a spurious
    // swap that showed the escaped form. Marks-based detection must skip it.
    makeEditor('`\n\nplain paragraph')
    placeCaret(1)
    expect(editor.state.doc.child(0).textContent).toBe('`')
    expect(hasRawFocus(editor)).toBe(false)
  })

  it('restores the rendered form when the caret moves to another block', () => {
    makeEditor('**bold**\n\nplain')
    // Enter the bold block -> raw.
    placeCaret(1)
    expect(editor.state.doc.child(0).textContent).toBe('**bold**')
    // Move into the plain block (pos = 1 + "**bold**".length + 2 = 10).
    placeCaret(10)
    // First block restored: it now contains a single bold text node again.
    const b0 = editor.state.doc.child(0)
    expect(b0.textContent).toBe('bold')
    const child = b0.firstChild
    expect(child?.marks.some((m) => m.type.name === 'bold')).toBe(true)
    // No block is raw-focused now (plain block has no marks).
    expect(hasRawFocus(editor)).toBe(false)
  })

  it('rawFocusSerialize normalizes the raw block on the way out', () => {
    makeEditor('**hello**\n\nother')
    placeCaret(1)
    // Even though doc.child(0) currently holds literal '**hello**', the
    // serializer must emit the rendered markdown.
    const md = rawFocusSerialize(editor)
    expect(md).toContain('**hello**')
    // And the raw block's literal text must NOT be double-wrapped.
    expect(md).not.toContain('****hello****')
  })

  it('edits to the raw source are re-rendered on caret-leave', () => {
    makeEditor('**bold**\n\nsecond')
    placeCaret(1) // raw
    // Simulate the user typing in the raw block: replace '**bold**' with '==hi=='.
    const doc = editor.state.doc
    const from = 1
    const to = 1 + doc.child(0).nodeSize - 1 // text content of block 0
    editor.view.dispatch(editor.state.tr.insertText('==hi==', from, to))
    expect(editor.state.doc.child(0).textContent).toBe('==hi==')
    // Move to block 1 (pos = after block 0 + open of block1).
    const block1Start = editor.state.doc.child(0).nodeSize + 1
    placeCaret(block1Start + 1)
    // Block 0 should now render a highlight mark.
    const b0 = editor.state.doc.child(0)
    expect(b0.textContent).toBe('hi')
    expect(b0.firstChild?.marks.some((m) => m.type.name === 'highlight')).toBe(true)
  })
})
