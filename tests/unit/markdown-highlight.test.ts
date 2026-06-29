import { describe, it, expect } from 'vitest'
import { getMarkdownManager } from '@/editor/markdown-manager'

describe('markdown highlight round-trip', () => {
  const mgr = getMarkdownManager()

  it('parses ==text== into a highlight mark', () => {
    const doc = mgr.parse('This is ==highlighted== text.')!
    const json = JSON.stringify(doc)
    expect(json).toContain('"highlight"')
    expect(json).toContain('highlighted')
  })

  it('serializes a highlight mark back to ==text==', () => {
    const md = 'This is ==highlighted== text.'
    const out = mgr.serialize(mgr.parse(md)!)
    expect(out).toContain('==highlighted==')
  })

  it('does NOT parse == with inner whitespace', () => {
    const doc = mgr.parse('This == not highlighted == here.')!
    expect(JSON.stringify(doc)).not.toContain('"highlight"')
  })

  it('does NOT treat a single = as highlight', () => {
    const doc = mgr.parse('a = b is an equation.')!
    expect(JSON.stringify(doc)).not.toContain('"highlight"')
  })

  it('composes with bold inside the highlight', () => {
    const md = '==**bold and highlighted**=='
    const doc = mgr.parse(md)!
    const json = JSON.stringify(doc)
    expect(json).toContain('"highlight"')
    expect(json).toContain('"bold"')
  })
})
