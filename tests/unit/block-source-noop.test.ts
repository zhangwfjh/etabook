import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Window } from 'happy-dom'
import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { Link } from '@tiptap/extension-link'
import { Image } from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { common, createLowlight } from 'lowlight'
import { MarkdownManager } from '@tiptap/markdown'
import { BlockSourceEdit } from '@/editor/block-source-edit'

const lowlight = createLowlight(common)

// Full extension set matching buildExtensions() (minus block-actions/drag-handle
// which pull in @/state/store and React — not needed for this prosemirror test).
function buildExts() {
  return [
    StarterKit.configure({ codeBlock: false, heading: { levels: [1,2,3,4,5,6] }, link: false }),
    TaskList, TaskItem.configure({ nested: true }),
    CodeBlockLowlight.configure({ lowlight }),
    Link.configure({ openOnClick: false, autolink: true }),
    Image, Table.configure({ resizable: true }),
    TableRow, TableCell, TableHeader,
    BlockSourceEdit,
  ]
}

function setupDom() {
  const window = new Window()
  const doc = window.document
  const raf = (cb: FrameRequestCallback): number => { cb(Date.now()); return 0 }
  Object.assign(globalThis, {
    window, document: doc,
    DocumentFragment: window.DocumentFragment,
    Node: window.Node, Element: window.Element, HTMLElement: window.HTMLElement,
    customElements: window.customElements,
    getSelection: window.getSelection.bind(window),
    requestAnimationFrame: raf as typeof requestAnimationFrame,
    cancelAnimationFrame: () => {},
  })
  return { window, doc }
}

describe('double-click never changes document', () => {
  let editor: Editor
  let mountEl: HTMLElement
  let window: Window
  let mgr: MarkdownManager

  beforeEach(() => {
    const dom = setupDom()
    window = dom.window
    mgr = new MarkdownManager({ extensions: buildExts() })
    mountEl = dom.doc.createElement('div')
    dom.doc.body.appendChild(mountEl)
  })
  afterEach(() => editor?.destroy())

  function makeEditor(md: string): Editor {
    editor = new Editor({
      element: mountEl,
      extensions: buildExts(),
      content: mgr.parse(md),
      editable: false,
    })
    return editor
  }

  function dblClick(pos: number): void {
    const view = editor.view
    let handled = false
    view.someProp('handleDoubleClick', (f) => { handled = !!f(view, pos) })
    expect(handled, 'double-click must be handled').toBe(true)
  }

  function getTextarea(): HTMLTextAreaElement {
    const ta = mountEl.querySelector('textarea')
    expect(ta, 'textarea must exist').toBeTruthy()
    return ta as HTMLTextAreaElement
  }

  const exitWays = [
    {
      name: 'blur (click elsewhere)',
      exit: () => getTextarea().dispatchEvent(new window.Event('blur')),
    },
    {
      name: 'Escape',
      exit: () => getTextarea().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })),
    },
    {
      name: 'Cmd+Enter (unchanged content)',
      exit: () => getTextarea().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', metaKey: true })),
    },
  ]

  // Every block type + emphasis variants. Headings/blockquotes/code blocks are
  // the TrailingNode-triggering types; emphasis variants catch normalization.
  const blocks = [
    '__bold__ and _italic_',
    '**bold** and *italic*',
    'Plain paragraph text.',
    '# Heading',
    '## Subheading with __bold__',
    '> Blockquote with _italic_',
    '```js\nconst x = 1\n```',
    '- [ ] Unchecked task',
    '- [x] Checked task with __bold__',
    'Para before\n\n# Heading after\n\nFinal para',
    '1. First\n2. Second with __em__',
    '> Nested quote\n>> Deep _italic_',
  ]

  for (const md of blocks) {
    for (const { name: exitName, exit } of exitWays) {
      it(`${JSON.stringify(md).slice(0,40)} → exit via ${exitName}: doc deep-equals before`, () => {
        const ed = makeEditor(md)
        let updateFired = false
        ed.on('update', () => { updateFired = true })

        const beforeJson = JSON.stringify(ed.state.doc.toJSON())

        dblClick(1)
        exit()

        const afterJson = JSON.stringify(ed.state.doc.toJSON())

        // The document must be deeply identical — no trailing paragraph, no
        // re-serialization, no attribute changes.
        expect(afterJson, 'doc JSON must be identical').toBe(beforeJson)
        expect(updateFired, 'update event must NOT fire').toBe(false)
      })
    }
  }
})
