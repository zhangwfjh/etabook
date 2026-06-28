import { describe, it, expect } from 'vitest'
import { CALLOUT_TYPES, resolveCalloutType } from '@/editor/callout-types'

describe('callout-types', () => {
  it('exposes 21 canonical types (13 Obsidian + 8 math)', () => {
    expect(CALLOUT_TYPES).toHaveLength(21)
  })

  it('marks the 8 math types with math: true', () => {
    const math = CALLOUT_TYPES.filter((t) => t.math).map((t) => t.canonical)
    expect(math.sort()).toEqual(
      ['algorithm', 'corollary', 'definition', 'lemma', 'proof', 'proposition', 'remark', 'theorem'],
    )
  })

  it('resolves a canonical type to itself', () => {
    const r = resolveCalloutType('note')
    expect(r.canonical).toBe('note')
    expect(r.rawType).toBe('note')
    expect(r.kind?.label).toBe('Note')
  })

  it('resolves aliases to their canonical type (case-insensitive) and preserves original spelling in rawType', () => {
    const r = resolveCalloutType('TLDR')
    expect(r.canonical).toBe('abstract')
    expect(r.rawType).toBe('TLDR')
    expect(r.kind?.canonical).toBe('abstract')
  })

  it('falls back to "note" for unknown types but preserves the raw spelling (case-sensitive)', () => {
    const r = resolveCalloutType('XYZ')
    expect(r.canonical).toBe('note')
    expect(r.rawType).toBe('XYZ')
    expect(r.kind).toBeNull()
  })

  it('trims whitespace before resolving', () => {
    const r = resolveCalloutType('  warning  ')
    expect(r.canonical).toBe('warning')
    expect(r.rawType).toBe('warning')
  })

  it('every canonical type has a unique colorVar', () => {
    const colorVars = CALLOUT_TYPES.map((t) => t.colorVar)
    expect(new Set(colorVars).size).toBe(colorVars.length)
  })
})
