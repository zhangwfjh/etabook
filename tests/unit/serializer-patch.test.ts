/**
 * Regression tests for the serializer escape patch.
 *
 * These verify that `@tiptap/markdown`'s default text normalization (entity
 * encoding + bracket escaping) is neutralised by the prototype patch in
 * `markdown-serializer-patch.ts`, and that raw markdown text survives the
 * parse→serialize round-trip unchanged.
 */
import { describe, it, expect } from 'vitest'
import { getMarkdownManager } from '@/editor/markdown-manager'

describe('serializer patch: raw text preservation', () => {
  const mgr = getMarkdownManager()

  function rt(md: string): string {
    return (mgr.serialize(mgr.parse(md)) ?? '').trim()
  }

  // ── Entity encoding neutralised ────────────────────────────────────────

  it('preserves & in headings', () => {
    expect(rt('# A & B')).toBe('# A & B')
  })

  it('preserves & in paragraphs', () => {
    expect(rt('Tom & Jerry')).toBe('Tom & Jerry')
  })

  it('preserves & in bold', () => {
    expect(rt('**A & B**')).toBe('**A & B**')
  })

  it('preserves < and > as literal characters', () => {
    expect(rt('a < b and c > d')).toBe('a < b and c > d')
  })

  // ── Bracket escaping is context-aware ─────────────────────────────────

  it('preserves wikilinks [[Note]]', () => {
    expect(rt('See [[Note Name]] here')).toBe('See [[Note Name]] here')
  })

  it('preserves wikilinks with display text [[Note|Display]]', () => {
    expect(rt('[[Note|Display]]')).toBe('[[Note|Display]]')
  })

  it('preserves footnote references [^1] without backslash-escaping', () => {
    const result = rt('Ref[^1].')
    expect(result).not.toContain('\\[')
    expect(result).not.toContain('\\]')
  })

  it('preserves custom task status [?] without backslash-escaping', () => {
    const result = rt('- [?] Custom status')
    expect(result).not.toContain('\\[')
    expect(result).not.toContain('\\]')
  })

  it('preserves [ENTER] in mid-prose', () => {
    expect(rt('Press [ENTER] to continue')).toBe('Press [ENTER] to continue')
  })

  // ── Emphasis markup is normalized (not the patch's job) ──────────────

  it('normalizes underscore bold to asterisk form', () => {
    expect(rt('Hello __bold__ world')).toBe('Hello **bold** world')
  })

  it('preserves asterisk bold **bold**', () => {
    expect(rt('Hello **bold** world')).toBe('Hello **bold** world')
  })

  // ── Real links still work ─────────────────────────────────────────────

  it('round-trips real links [text](url)', () => {
    const result = rt('[link](https://example.com)')
    expect(result).toBe('[link](https://example.com)')
  })

  // ── Idempotency: RT1 === RT2 ──────────────────────────────────────────

  it('is idempotent for & entities', () => {
    const o1 = rt('# A & B')
    expect(rt(o1)).toBe(o1)
  })

  it('is idempotent for wikilinks', () => {
    const o1 = rt('See [[Note]] here')
    expect(rt(o1)).toBe(o1)
  })
})

describe('callout round-trip preservation', () => {
  const mgr = getMarkdownManager()

  function rt(md: string): string {
    return (mgr.serialize(mgr.parse(md)) ?? '').trim()
  }

  it('preserves foldable collapsed [!faq]-', () => {
    expect(rt('> [!faq]- Collapsed\n> Content.')).toBe('> [!faq]- Collapsed\n>\n> Content.')
  })

  it('preserves foldable expanded [!tip]+', () => {
    expect(rt('> [!tip]+ Expanded\n> Content.')).toBe('> [!tip]+ Expanded\n>\n> Content.')
  })

  it('preserves nested callouts 2 levels', () => {
    const md = '> [!question] Outer\n>\n> > [!todo] Inner'
    expect(rt(md)).toBe(md)
  })

  it('preserves nested callouts 3 levels', () => {
    const md = '> [!question] Q\n>\n> > [!todo] A\n>\n> > > [!example] Deep'
    expect(rt(md)).toBe(md)
  })

  it('does not double blank lines between callout and next block', () => {
    const md = '> [!note] Title\n> Body.\n\n## Next'
    const result = rt(md)
    // Must not have 3+ consecutive newlines
    expect(result).not.toMatch(/\n{3,}/)
  })

  it('empty-body callout produces just the header', () => {
    expect(rt('> [!note] Title only')).toBe('> [!note] Title only')
  })
})
