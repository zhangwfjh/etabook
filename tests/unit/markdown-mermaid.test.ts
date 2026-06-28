import { describe, it, expect } from 'vitest'
import { getMarkdownManager } from '@/editor/markdown-manager'

describe('markdown mermaid round-trip', () => {
  const mgr = getMarkdownManager()

  it('parses a ```mermaid fenced block as a codeBlock with language=mermaid', () => {
    const md = '```mermaid\ngraph TD\n  A --> B\n```'
    const doc = mgr.parse(md)!
    const block = doc.content!.find((n) => n.type === 'codeBlock')
    expect(block).toBeDefined()
    expect(block!.attrs!.language).toBe('mermaid')
  })

  it('serializes a mermaid codeBlock back to a fenced ```mermaid block', () => {
    const md = '```mermaid\ngraph TD\n  A --> B\n```'
    const doc = mgr.parse(md)!
    const out = mgr.serialize(doc)
    expect(out).toContain('```mermaid')
    expect(out).toContain('A --> B')
  })
})
