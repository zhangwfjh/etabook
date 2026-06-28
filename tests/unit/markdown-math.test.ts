import { describe, it, expect } from 'vitest'
import { getMarkdownManager } from '@/editor/markdown-manager'

describe('markdown math round-trip', () => {
  const mgr = getMarkdownManager()

  it('parses inline math $...$ into a mathInline node', () => {
    const doc = mgr.parse('Inline $E=mc^2$ formula.')!
    const inlineMath = doc.content!.flatMap((p) => p.content ?? []).find((n) => n.type === 'mathInline')
    expect(inlineMath).toBeDefined()
    expect(inlineMath!.attrs!.latex).toBe('E=mc^2')
  })

  it('serializes a mathInline node back to $...$', () => {
    const md = 'Inline $E=mc^2$ formula.'
    const doc = mgr.parse(md)!
    const out = mgr.serialize(doc)
    expect(out).toContain('$E=mc^2$')
  })

  it('parses block math $$...$$ into a mathBlock node', () => {
    const md = '$$\n\\int_0^1 x\\,dx\n$$'
    const doc = mgr.parse(md)!
    const block = doc.content!.find((n) => n.type === 'mathBlock')
    expect(block).toBeDefined()
    expect(block!.attrs!.latex).toBe('\\int_0^1 x\\,dx')
  })

  it('serializes a mathBlock node back to $$...$$', () => {
    const md = '$$\n\\int_0^1 x\\,dx\n$$'
    const doc = mgr.parse(md)!
    const out = mgr.serialize(doc)
    expect(out).toContain('$$')
    expect(out).toContain('\\int_0^1 x\\,dx')
  })

  it('does NOT treat a lone dollar sign as math', () => {
    const doc = mgr.parse('The price is $5 and rising.')!
    const hasMath = JSON.stringify(doc).includes('"mathInline"') || JSON.stringify(doc).includes('"mathBlock"')
    expect(hasMath).toBe(false)
  })

  it('does NOT treat $ content $ (whitespace inside) as inline math', () => {
    const doc = mgr.parse('Won\'t parse $ a b $ here.')!
    const hasMathInline = JSON.stringify(doc).includes('"mathInline"')
    expect(hasMathInline).toBe(false)
  })
})
