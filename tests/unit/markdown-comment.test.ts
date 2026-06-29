import { describe, it, expect } from 'vitest'
import { getMarkdownManager } from '@/editor/markdown-manager'

describe('markdown comment round-trip', () => {
  const mgr = getMarkdownManager()

  it('parses %%text%% into a comment mark', () => {
    const doc = mgr.parse('Visible %%hidden note%% text.')!
    const json = JSON.stringify(doc)
    expect(json).toContain('"comment"')
    expect(json).toContain('hidden note')
  })

  it('serializes a comment mark back to %%text%%', () => {
    const md = 'Visible %%hidden note%% text.'
    const out = mgr.serialize(mgr.parse(md)!)
    expect(out).toContain('%%hidden note%%')
  })

  it('does NOT parse %% with inner whitespace', () => {
    const doc = mgr.parse('Not %% a comment %% here.')!
    expect(JSON.stringify(doc)).not.toContain('"comment"')
  })

  it('does NOT treat a single % as comment', () => {
    const doc = mgr.parse('50% done.')!
    expect(JSON.stringify(doc)).not.toContain('"comment"')
  })
})
