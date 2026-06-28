import { describe, it, expect } from 'vitest'
import { EditorState } from '@tiptap/pm/state'
import { TextSelection } from '@tiptap/pm/state'
import { Schema, Node } from '@tiptap/pm/model'
import { TrailingNode } from '@/editor/trailing-node'
import type { Editor } from '@tiptap/core'

/**
 * Build the ProseMirror plugins our TrailingNode extension would produce,
 * by calling addProseMirrorPlugins with a minimal editor context.
 */
function trailingPlugins(schema: Schema) {
  const ext = TrailingNode.configure({})
  const config = (ext as Record<string, unknown>).config as Record<string, unknown>
  const addPM = config.addProseMirrorPlugins as () => unknown[]
  return addPM.call({
    editor: { schema } as unknown as Editor,
    options: { node: undefined, notAfter: [] },
    name: 'trailingNode',
  }) as unknown[]
}

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    heading: { group: 'block', content: 'text*', attrs: { level: { default: 1 } } },
    text: { group: 'inline' },
  },
})

function docEndingInHeading(): Node {
  return schema.nodes['doc'].create(null, [
    schema.nodes['paragraph'].create(null, [schema.text('hello __bold__ world')]),
    schema.nodes['heading'].create({ level: 1 }, [schema.text('After bold heading')]),
  ])
}

describe('custom TrailingNode — docChanged guard', () => {
  it('does NOT insert trailing paragraph on selection-only transaction', () => {
    const plugins = trailingPlugins(schema)
    const doc = docEndingInHeading()
    const state = EditorState.create({ doc, plugins })

    // Simulate a click / cursor move — selection-only, no doc change.
    const sel = TextSelection.near(doc.resolve(1))
    const tr = state.tr.setSelection(sel)
    expect(tr.docChanged).toBe(false)

    const result = state.applyTransaction(tr)
    const appended = result.transactions.filter((t) => t.docChanged)
    expect(appended).toHaveLength(0)
    // Doc unchanged.
    expect(result.state.doc.eq(doc)).toBe(true)
  })

  it('does NOT insert on a meta-only transaction', () => {
    const plugins = trailingPlugins(schema)
    const doc = docEndingInHeading()
    const state = EditorState.create({ doc, plugins })

    const tr = state.tr.setMeta('someMeta', { foo: true })
    expect(tr.docChanged).toBe(false)

    const result = state.applyTransaction(tr)
    const appended = result.transactions.filter((t) => t.docChanged)
    expect(appended).toHaveLength(0)
  })

  it('DOES insert trailing paragraph after a doc-changing edit', () => {
    const plugins = trailingPlugins(schema)
    const doc = docEndingInHeading()
    const state = EditorState.create({ doc, plugins })

    // Simulate deleting the trailing paragraph — now doc ends in a heading.
    // Actually our doc already ends in a heading, so any text edit should
    // trigger TrailingNode to append a paragraph.
    const tr = state.tr.insertText('!', 5)
    expect(tr.docChanged).toBe(true)

    const result = state.applyTransaction(tr)
    const appended = result.transactions.filter((t) => t.docChanged)
    expect(appended.length).toBeGreaterThanOrEqual(1)
    // Final doc should end in a paragraph (the appended trailing node).
    expect(result.state.doc.lastChild?.type.name).toBe('paragraph')
  })

  it('respects the skipTrailingNode escape hatch on doc-changing transactions', () => {
    const plugins = trailingPlugins(schema)
    const doc = docEndingInHeading()
    const state = EditorState.create({ doc, plugins })

    const tr = state.tr.insertText('!', 5).setMeta('skipTrailingNode', true)
    const result = state.applyTransaction(tr)
    // Only the original text insert — no appended trailing paragraph.
    expect(result.transactions).toHaveLength(1)
    expect(result.state.doc.lastChild?.type.name).toBe('heading')
  })
})
