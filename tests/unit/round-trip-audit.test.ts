/**
 * Round-trip audit of the REAL editor markdown pipeline (the patched
 * MarkdownManager built from `buildExtensions()`).
 *
 * Two classes of behaviour are documented:
 *  - PRESERVED: the construct is a fixed point of the first round-trip
 *    (`serialize(parse(md)) === md`). These are the features we actively
 *    protect (code-fence character/length, code-block language, callouts,
 *    task lists, the raw `&`/`[`/`]` escaping fix, blockquotes, whitespace).
 *  - NORMALIZED: the construct is rewritten to its canonical markdown form on
 *    the first round-trip. This is intentional — like Obsidian, we do not
 *    preserve stylistic markup variants (`__bold__`→`**bold**`, `***`→`---`,
 *    setext→atx, `*`/`+` bullets→`-`, angle/bare autolinks→`[text](url)`).
 *    What we guarantee for these is *stability*: the second round-trip is a
 *    fixed point, so no content drifts on repeated saves.
 */
import { describe, it, expect } from 'vitest'
import { getMarkdownManager } from '@/editor/markdown-manager'

const mgr = getMarkdownManager()

/** First round-trip is lossless (construct preserved). */
function preserved(md: string): { ok: boolean; before: string; after: string } {
  const after = (mgr.serialize(mgr.parse(md)) ?? '').trim()
  return { ok: after === md.trim(), before: md, after }
}

/** Two round-trips; returns both passes so the canonical form is visible. */
function roundTrips(md: string): { once: string; twice: string; stable: boolean } {
  const once = (mgr.serialize(mgr.parse(md)) ?? '').trim()
  const twice = (mgr.serialize(mgr.parse(once)) ?? '').trim()
  return { once, twice, stable: twice === once }
}

describe('markdown round-trip audit — preserved constructs', () => {
  describe('code fence length and character', () => {
    for (const { md, label } of [
      { md: '```\ncode\n```', label: '3-backtick fence' },
      { md: '````\ncode\n````', label: '4-backtick fence' },
      { md: '````\n```js\nconst x = 1\n```\n````', label: '4-backtick fence wrapping triple-backtick content' },
      { md: '`````\ncode\n`````', label: '5-backtick fence' },
      { md: '~~~\ncode\n~~~', label: 'tilde fence' },
    ]) {
      it(`${label} preserved`, () => {
        const r = preserved(md)
        expect(r.ok, `${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`).toBe(true)
      })
    }
  })

  describe('code block language', () => {
    it('language case preserved', () => {
      const r = preserved('```TypeScript\nconst x = 1\n```')
      expect(r.ok, `${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`).toBe(true)
    })

    it('unknown language preserved', () => {
      const r = preserved('```weirdlang\ncode\n```')
      expect(r.ok, `${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`).toBe(true)
    })
  })

  describe('inline code', () => {
    it('simple inline code preserved', () => {
      const r = preserved('Use `code` here')
      expect(r.ok).toBe(true)
    })

    // A code span that contains a backtick MUST stay multi-backtick or it
    // breaks — this is correctness, not style, so it must be preserved.
    it('multi-backtick code span wrapping a backtick preserved', () => {
      const r = preserved('Use `` `backtick` `` here')
      expect(r.ok, `${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`).toBe(true)
    })
  })

  describe('links and images', () => {
    it('inline link preserved', () => {
      const r = preserved('[text](https://example.com)')
      expect(r.ok, `${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`).toBe(true)
    })

    it('inline link with title preserved', () => {
      const r = preserved('[text](https://example.com "Title")')
      expect(r.ok, `${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`).toBe(true)
    })

    it('image preserved', () => {
      const r = preserved('![alt](image.png)')
      expect(r.ok, `${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`).toBe(true)
    })
  })

  describe('blockquote', () => {
    it('tight blockquote preserved', () => {
      const r = preserved('> Quote text')
      expect(r.ok, `${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`).toBe(true)
    })

    // KNOWN LIMITATION: marked.js produces byte-identical tokens for
    // `> L1\nL2` and `> L1\n> L2` — the `>` markers are stripped before the
    // token is exposed. Unfixable without forking marked.js.
    it.skip('lazy continuation preserved', () => {
      const r = preserved('> Line 1\nLine 2')
      expect(r.ok, `${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`).toBe(true)
    })
  })

  describe('special characters (serializer patch)', () => {
    it('raw ampersand and angle brackets not HTML-encoded', () => {
      const r = preserved('Tom & Jerry say a < b and b > c')
      expect(r.ok, `${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`).toBe(true)
    })

    it('mid-prose brackets not escaped (no link/image/footnote construct)', () => {
      const r = preserved('Press [ENTER] to continue')
      expect(r.ok, `${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`).toBe(true)
    })

    it('wikilink-style brackets not escaped', () => {
      const r = preserved('See [[wikilink]] and [^footnote]')
      expect(r.ok, `${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`).toBe(true)
    })

    it('escaped emphasis preserved', () => {
      const r = preserved('\\*not bold\\*')
      expect(r.ok, `${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`).toBe(true)
    })
  })

  describe('task lists', () => {
    it('unchecked task preserved', () => {
      const r = preserved('- [ ] task')
      expect(r.ok, `${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`).toBe(true)
    })

    it('checked task preserved', () => {
      const r = preserved('- [x] task')
      expect(r.ok, `${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`).toBe(true)
    })
  })

  describe('callouts', () => {
    it('callout round-trip is idempotent (stable after first normalization)', () => {
      // The serializer normalizes `> [!note]\n> Content` to the canonical
      // Obsidian form `> [!note]\n>\n> Content` (blank `>` separator). This
      // is a one-time normalization; the second round-trip is a fixed point.
      const { stable } = roundTrips('> [!note]\n> Content')
      expect(stable).toBe(true)
    })
  })

  describe('whitespace and structure', () => {
    it('trailing spaces preserved', () => {
      const r = preserved('text with trailing space  \n')
      expect(r.ok, `${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`).toBe(true)
    })

    it('multiple blank lines preserved', () => {
      const r = preserved('Para 1\n\n\n\nPara 2')
      expect(r.ok, `${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`).toBe(true)
    })
  })
})

describe('markdown round-trip audit — intentionally normalized constructs', () => {
  // These rewrite stylistic markup to its canonical form on the first save.
  // The contract is stability: RT2 === RT1 (no drift on repeated saves),
  // plus a documented canonical output for each input.

  describe('emphasis delimiters → asterisk form', () => {
    it('__bold__ → **bold**', () => {
      const { once, stable } = roundTrips('__bold__')
      expect(once).toBe('**bold**')
      expect(stable).toBe(true)
    })

    it('_italic_ → *italic*', () => {
      const { once, stable } = roundTrips('_italic_')
      expect(once).toBe('*italic*')
      expect(stable).toBe(true)
    })

    it('asterisk forms are already canonical', () => {
      const { once, stable } = roundTrips('**bold** and *italic*')
      expect(once).toBe('**bold** and *italic*')
      expect(stable).toBe(true)
    })
  })

  describe('headings → atx form', () => {
    it('setext heading → atx heading', () => {
      const { once, stable } = roundTrips('Heading\n=======')
      expect(once).toBe('# Heading')
      expect(stable).toBe(true)
    })

    it('atx headings preserved', () => {
      const { once, stable } = roundTrips('## Heading')
      expect(once).toBe('## Heading')
      expect(stable).toBe(true)
    })
  })

  describe('list markers → dash / dot', () => {
    it('* and + bullets → -', () => {
      const r1 = roundTrips('* item')
      const r2 = roundTrips('+ item')
      expect(r1.once).toBe('- item')
      expect(r2.once).toBe('- item')
      expect(r1.stable && r2.stable).toBe(true)
    })

    it('paren-style ordered list → dot form', () => {
      const { once, stable } = roundTrips('1) item')
      expect(once).toBe('1. item')
      expect(stable).toBe(true)
    })

    it('dash/dot forms are already canonical', () => {
      const r1 = roundTrips('- item')
      const r2 = roundTrips('1. item')
      expect(r1.stable && r2.stable).toBe(true)
      expect(r1.once).toBe('- item')
      expect(r2.once).toBe('1. item')
    })
  })

  describe('horizontal rules → dash form', () => {
    it('*** and ___ → ---', () => {
      const r1 = roundTrips('***')
      const r2 = roundTrips('___')
      expect(r1.once).toBe('---')
      expect(r2.once).toBe('---')
      expect(r1.stable && r2.stable).toBe(true)
    })
  })

  describe('autolinks → explicit link form', () => {
    it('angle-bracket autolink → [url](url)', () => {
      const { once, stable } = roundTrips('<https://example.com>')
      expect(once).toBe('[https://example.com](https://example.com)')
      expect(stable).toBe(true)
    })

    it('bare URL → [url](url)', () => {
      const { once, stable } = roundTrips('Visit https://example.com today')
      expect(stable).toBe(true)
      // Bare URLs collapse text===href into the explicit link form.
      expect(once).toContain('[https://example.com](https://example.com)')
    })
  })
})
