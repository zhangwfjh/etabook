// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import {
  moveBlockUp,
  moveBlockDown,
  deleteBlock,
  insertBlockBelow,
  slugify,
  findNearestHeadingSlug,
  serializeBlockForClipboard,
  deserializeBlockFromClipboard,
  turnInto,
  isTurnableTarget,
  TURN_INTO_TARGETS,
  type ClipboardData,
} from '@/editor/block-actions'
import { Callout } from '@/editor/callout'
import { MathBlock } from '@/editor/math'
import type { Node as PmNode } from '@tiptap/pm/model'

function makeEditor(initial = '<p>First</p><p>Second</p><p>Third</p>') {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: initial,
    editable: true,
  })
}

describe('block-actions commands', () => {
  let editor: Editor
  beforeEach(() => {
    editor = makeEditor()
  })

  it('moveBlockUp swaps a block with its previous sibling', () => {
    moveBlockUp(editor, 7)
    expect(editor.getHTML()).toBe('<p>Second</p><p>First</p><p>Third</p>')
  })

  it('moveBlockDown swaps a block with its next sibling', () => {
    moveBlockDown(editor, 7)
    expect(editor.getHTML()).toBe('<p>First</p><p>Third</p><p>Second</p>')
  })

  it('moveBlockUp on first block is a no-op', () => {
    moveBlockUp(editor, 0)
    expect(editor.getHTML()).toBe('<p>First</p><p>Second</p><p>Third</p>')
  })

  it('moveBlockDown on last block is a no-op', () => {
    moveBlockDown(editor, 15)
    expect(editor.getHTML()).toBe('<p>First</p><p>Second</p><p>Third</p>')
  })

  it('deleteBlock removes a block', () => {
    deleteBlock(editor, 7)
    expect(editor.getHTML()).toBe('<p>First</p><p>Third</p>')
  })

  it('deleteBlock on the last remaining block leaves an empty paragraph', () => {
    const single = new Editor({
      extensions: [StarterKit],
      content: '<p>Only</p>',
    })
    deleteBlock(single, 0)
    expect(single.getHTML()).toBe('<p></p>')
    single.destroy()
  })

  it('insertBlockBelow inserts an empty paragraph after the block', () => {
    insertBlockBelow(editor, 0)
    expect(editor.getHTML()).toBe('<p>First</p><p></p><p>Second</p><p>Third</p>')
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Introduction to Math')).toBe('introduction-to-math')
  })
  it('strips non-alphanumeric (keeping hyphens)', () => {
    expect(slugify('Hello, World!')).toBe('hello-world')
  })
  it('collapses repeated hyphens', () => {
    expect(slugify('A   B')).toBe('a-b')
  })
  it('trims leading/trailing hyphens', () => {
    expect(slugify('  Spaced  ')).toBe('spaced')
  })
  it('handles empty string', () => {
    expect(slugify('')).toBe('')
  })
})

describe('findNearestHeadingSlug', () => {
  it('returns the slug of a heading block', () => {
    const editor = new Editor({
      extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } })],
      content: '<h2>My Heading</h2><p>Body</p>',
    })

    expect(findNearestHeadingSlug(editor, 0)).toBe('my-heading')
    editor.destroy()
  })

  it('returns the nearest preceding heading slug for a non-heading block', () => {
    const editor = new Editor({
      extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } })],
      content: '<h2>Section One</h2><p>Body text</p>',
    })

    const paraPos = editor.state.doc.content.size - 3
    expect(findNearestHeadingSlug(editor, paraPos)).toBe('section-one')
    editor.destroy()
  })

  it('returns null when no preceding heading exists', () => {
    const editor = new Editor({
      extensions: [StarterKit],
      content: '<p>No heading here</p>',
    })

    expect(findNearestHeadingSlug(editor, 0)).toBe(null)
    editor.destroy()
  })
})
describe('clipboard helpers', () => {
  it('serializeBlockForClipboard produces JSON, HTML, and plain text', () => {
    const editor = new Editor({
      extensions: [StarterKit],
      content: '<p>Hello world</p>',
    })
    const node = editor.state.doc.firstChild as PmNode
    const result = serializeBlockForClipboard(node)
    expect(result['application/x-etabook-block']).toContain('"type":"paragraph"')
    expect(result['text/plain']).toBe('Hello world')
    expect(result['text/html']).toContain('<p')
    editor.destroy()
  })

  it('deserializeBlockFromClipboard round-trips the JSON MIME', () => {
    const editor = new Editor({
      extensions: [StarterKit],
      content: '<p>Original</p>',
    })
    const node = editor.state.doc.firstChild as PmNode
    const serialized = serializeBlockForClipboard(node)
    const back = deserializeBlockFromClipboard(serialized, editor.state.schema)
    expect(back?.type.name).toBe('paragraph')
    expect(back?.textContent).toBe('Original')
    editor.destroy()
  })

  it('deserializeBlockFromClipboard returns null on empty input', () => {
    const editor = new Editor({ extensions: [StarterKit] })
    expect(deserializeBlockFromClipboard({}, editor.state.schema)).toBe(null)
    editor.destroy()
  })
})

describe('turnInto', () => {
  function makeEditor(initial: string) {
    return new Editor({
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Callout,
      ],
      content: initial,
      editable: true,
    })
  }

  it('converts paragraph to heading 2', () => {
    const editor = makeEditor('<p>Hello</p>')
    turnInto(editor, 0, 'heading', { level: 2 })
    const html = editor.getHTML()
    expect(html).toContain('<h2>Hello</h2>')
    editor.destroy()
  })

  it('converts heading to paragraph', () => {
    const editor = makeEditor('<h3>Title</h3>')
    turnInto(editor, 0, 'paragraph')
    const html = editor.getHTML()
    expect(html).toContain('<p>Title</p>')
    editor.destroy()
  })

  it('converts paragraph to bullet list', () => {
    const editor = makeEditor('<p>Item</p>')
    turnInto(editor, 0, 'bulletList')
    // The exact HTML may vary — verify it's a ul containing the text.
    const html = editor.getHTML()
    expect(html).toContain('<ul>')
    expect(html).toContain('Item')
    editor.destroy()
  })

  it('converts paragraph to callout (note)', () => {
    const editor = makeEditor('<p>Note text</p>')
    turnInto(editor, 0, 'callout')
    const html = editor.getHTML()
    expect(html).toContain('data-callout')
    expect(html).toContain('Note text')
    editor.destroy()
  })

  it('isTurnableTarget returns false for non-text atoms', () => {
    const editor = new Editor({
      extensions: [StarterKit, MathBlock],
      content: '<div data-math-block></div>',
    })
    expect(isTurnableTarget(editor, 0)).toBe(false)
    editor.destroy()
  })
})
