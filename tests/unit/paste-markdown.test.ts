// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import { buildExtensions } from '@/editor/extensions'
import { deserializeBlockFromClipboard } from '@/editor/block-actions'

/**
 * Regression: pasting markdown source via the insert-bar paste button must
 * parse the text as markdown (so highlights/code fences/inline marks
 * render), not wrap it as a single literal text node.
 */
describe('deserializeBlockFromClipboard — markdown parsing of plain text', () => {
  const schema = new Editor({ extensions: buildExtensions() }).state.schema

  it('parses a pasted code fence into a real codeBlock node', () => {
    const md = '```js\nconsole.log(1)\n```'
    const node = deserializeBlockFromClipboard({ 'text/plain': md }, schema)
    expect(node).not.toBeNull()
    expect(node!.type.name).toBe('codeBlock')
  })

  it('parses a highlight in pasted prose', () => {
    const md = '==highlighted=='
    const node = deserializeBlockFromClipboard({ 'text/plain': md }, schema)
    expect(node).not.toBeNull()
    expect(JSON.stringify(node!.toJSON())).toContain('"highlight"')
  })

  it('falls back to a literal paragraph when text is not markdown (no syntax)', () => {
    const plain = 'just plain prose with no markdown syntax at all'
    const node = deserializeBlockFromClipboard({ 'text/plain': plain }, schema)
    expect(node).not.toBeNull()
    expect(node!.type.name).toBe('paragraph')
    expect(node!.textContent).toBe(plain)
  })

  it('still prefers application/x-etabook-block JSON when present', () => {
    const json = JSON.stringify({ type: 'paragraph', content: [{ type: 'text', text: 'from json' }] })
    const node = deserializeBlockFromClipboard(
      { 'application/x-etabook-block': json, 'text/plain': '==ignored==' },
      schema,
    )
    expect(node).not.toBeNull()
    expect(node!.textContent).toBe('from json')
  })

  it('prefers markdown-parsed text/plain over literal text/html (external copy scenario)', () => {
    // Copying ==highlight== from an external rendered page carries both
    // MIME types: text/html with literal characters, text/plain with the
    // syntax. Markdown parsing must win so the mark renders.
    const node = deserializeBlockFromClipboard(
      {
        'text/html': '<p>==highlighted==</p>',
        'text/plain': '==highlighted==',
      },
      schema,
    )
    expect(node).not.toBeNull()
    expect(JSON.stringify(node!.toJSON())).toContain('"highlight"')
  })

  it('falls back to text/html when text/plain is absent', () => {
    const node = deserializeBlockFromClipboard(
      { 'text/html': '<p>html only</p>' },
      schema,
    )
    expect(node).not.toBeNull()
    expect(node!.textContent).toBe('html only')
  })
})
