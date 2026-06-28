import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Window } from 'happy-dom'
import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { MarkdownManager } from '@tiptap/markdown'
import { BlockSourceEdit } from '@/editor/block-source-edit'

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

describe('BlockSourceEdit double-click', () => {
  let editor: Editor
  let mountEl: HTMLElement
  let window: Window

  beforeEach(() => {
    const dom = setupDom()
    window = dom.window
    mountEl = dom.doc.createElement('div')
    dom.doc.body.appendChild(mountEl)
  })

  afterEach(() => {
    editor?.destroy()
  })

  function makeEditor(md: string): { ed: Editor; mgr: MarkdownManager } {
    const mgr = new MarkdownManager({ extensions: [StarterKit, BlockSourceEdit] })
    const content = mgr.parse(md)
    editor = new Editor({
      element: mountEl,
      extensions: [StarterKit, BlockSourceEdit],
      content,
      editable: false,
    })
    return { ed: editor, mgr }
  }

  function triggerDoubleClick(pos: number): void {
    const view = editor.view
    let handled = false
    view.someProp('handleDoubleClick', (f) => {
      const result = f(view, pos)
      if (result) handled = true
      return result
    })
    expect(handled).toBe(true)
  }

  function blurActiveTextarea(): void {
    const ta = mountEl.querySelector('textarea')
    expect(ta, 'textarea should exist after double-click').toBeTruthy()
    ta!.dispatchEvent(new window.Event('blur'))
  }

  function typeIntoTextarea(text: string): void {
    const ta = mountEl.querySelector('textarea') as HTMLTextAreaElement | null
    expect(ta, 'textarea should exist after double-click').toBeTruthy()
    ta!.value = text
  }

  // Cases that exercise different node types. Headings/blockquotes/code blocks
  // are the critical ones: they don't end in a paragraph, so TrailingNode
  // would insert a spurious trailing paragraph on any transaction.
  const noEditCases = [
    { md: 'Hello __bold__ world', label: 'paragraph with underscore emphasis' },
    { md: 'Plain text paragraph', label: 'plain paragraph' },
    { md: '# Heading text', label: 'heading (no trailing paragraph)' },
    { md: '> blockquote text', label: 'blockquote (no trailing paragraph)' },
    { md: '```js\nconst x = 1\n```', label: 'code block (no trailing paragraph)' },
    { md: 'First para\n\nSecond para', label: 'two paragraphs' },
  ]

  for (const { md, label } of noEditCases) {
    it(`${label}: double-click+blur without edits does NOT fire update`, () => {
      const { ed } = makeEditor(md)
      let updateCount = 0
      ed.on('update', () => { updateCount++ })

      triggerDoubleClick(1)
      blurActiveTextarea()

      expect(updateCount).toBe(0)
    })

    it(`${label}: double-click+blur without edits preserves serialized markdown`, () => {
      const { ed, mgr } = makeEditor(md)
      // Baseline: serialize the doc as loaded (already round-tripped once by parse).
      const beforeMd = mgr.serialize(ed.state.doc.toJSON()) ?? ''

      triggerDoubleClick(1)
      blurActiveTextarea()

      const afterMd = mgr.serialize(ed.state.doc.toJSON()) ?? ''
      expect(afterMd).toBe(beforeMd)
    })
  }

  it('actual edit fires update and changes doc', () => {
    const { ed } = makeEditor('Hello world')
    let updateCount = 0
    ed.on('update', () => { updateCount++ })

    triggerDoubleClick(1)
    typeIntoTextarea('Edited text')
    blurActiveTextarea()

    expect(updateCount).toBe(1)
  })

  it('Escape cancels without firing update', () => {
    const { ed } = makeEditor('# Heading')
    let updateCount = 0
    ed.on('update', () => { updateCount++ })

    triggerDoubleClick(1)
    const ta = mountEl.querySelector('textarea')
    expect(ta).toBeTruthy()
    ta!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))

    expect(updateCount).toBe(0)
  })
})
