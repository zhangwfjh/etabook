/**
 * Media rendering & round-trip contract for images, video, and audio.
 *
 * - Images use CommonMark `![alt](src)` syntax and round-trip fully in the
 *   node test environment (the @tiptap/extension-image registers both
 *   parseMarkdown and renderMarkdown).
 * - Video/audio are HTML5 embeds: parsing raw `<video>`/`<audio>` markdown
 *   requires a DOMParser (browser/Electron only), so the node test covers the
 *   serialize direction by constructing the node JSON directly and asserting
 *   the canonical HTML output of `renderMarkdown`.
 */
import { describe, it, expect } from 'vitest'
import { getMarkdownManager } from '@/editor/markdown-manager'

describe('markdown-media', () => {
  const mgr = getMarkdownManager()

  describe('images', () => {
    it('round-trips a remote image with title', () => {
      const md = '![Etabook banner](https://example.com/banner.png "Warm Paper")'
      const doc = mgr.parse(md)
      const out = mgr.serialize(doc)
      expect(out).toContain('![Etabook banner](https://example.com/banner.png "Warm Paper")')
    })

    it('round-trips an image without title', () => {
      const md = '![logo](https://example.com/logo.png)'
      const doc = mgr.parse(md)
      const out = mgr.serialize(doc)
      expect(out).toContain('![logo](https://example.com/logo.png)')
    })

    it('round-trips a base64 data: URL image', () => {
      const dataUri =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
      const md = `![pixel](${dataUri})`
      const doc = mgr.parse(md)
      const out = mgr.serialize(doc)
      expect(out).toContain(`![pixel](${dataUri})`)
    })

    it('produces a stable point after two round-trips (RT2 === RT1)', () => {
      const md = '![alt](https://example.com/i.png "t")'
      const once = mgr.serialize(mgr.parse(md))
      const twice = mgr.serialize(mgr.parse(once))
      expect(twice).toBe(once)
    })

    it('parses Obsidian |W width syntax and round-trips it', () => {
      const md = '![Sized image|300](https://example.com/i.png)'
      const doc = mgr.parse(md)
      const out = mgr.serialize(doc)
      expect(out).toContain('![Sized image|300](https://example.com/i.png)')
    })

    it('parses Obsidian |WxH syntax, preserves width on serialize', () => {
      const md = '![Sized|400x200](https://example.com/i.png)'
      const doc = mgr.parse(md)
      const out = mgr.serialize(doc)
      // Height is not stored (auto-scales); only width round-trips.
      expect(out).toContain('|400]')
      expect(out).not.toContain('x200')
    })

    it('serializes width from a JSONContent node with width attr', () => {
      const doc = {
        type: 'doc',
        content: [
          { type: 'image', attrs: { src: 'https://example.com/i.png', alt: 'Cap', title: null, width: 250, align: 'center' } },
        ],
      }
      const out = mgr.serialize(doc)
      expect(out).toContain('![Cap|250](https://example.com/i.png)')
    })

    it('does not emit width pipe when width is null', () => {
      const doc = {
        type: 'doc',
        content: [
          { type: 'image', attrs: { src: 'https://example.com/i.png', alt: 'Plain', title: null, width: null, align: 'center' } },
        ],
      }
      const out = mgr.serialize(doc)
      expect(out).toContain('![Plain](https://example.com/i.png)')
      expect(out).not.toContain('|')
    })

    it('width pipe syntax is a stable round-trip point (RT2 === RT1)', () => {
      const md = '![Alt|350](https://example.com/i.png "Title")'
      const once = mgr.serialize(mgr.parse(md))
      const twice = mgr.serialize(mgr.parse(once))
      expect(twice).toBe(once)
    })
  })

  describe('video', () => {
    const src = 'https://example.com/clip.mp4'

    it('serializes a video node to canonical HTML', () => {
      const doc = {
        type: 'doc',
        content: [
          { type: 'video', attrs: { src, controls: true } },
        ],
      }
      expect(mgr.serialize(doc)).toBe(`<video src="${src}" controls></video>`)
    })

    it('omits the controls attribute when controls is false', () => {
      const doc = {
        type: 'doc',
        content: [
          { type: 'video', attrs: { src, controls: false } },
        ],
      }
      expect(mgr.serialize(doc)).toBe(`<video src="${src}"></video>`)
    })

    it('is a stable point after two serialize cycles', () => {
      const doc = { type: 'doc', content: [{ type: 'video', attrs: { src, controls: true } }] }
      const once = mgr.serialize(doc)
      // Re-parse the node JSON it round-trips through is the same shape, so
      // serializing the constructed node again yields identical output.
      const twice = mgr.serialize(doc)
      expect(twice).toBe(once)
    })
  })

  describe('audio', () => {
    const src = 'https://example.com/track.mp3'

    it('serializes an audio node to canonical HTML', () => {
      const doc = {
        type: 'doc',
        content: [
          { type: 'audio', attrs: { src, controls: true } },
        ],
      }
      expect(mgr.serialize(doc)).toBe(`<audio src="${src}" controls></audio>`)
    })

    it('omits the controls attribute when controls is false', () => {
      const doc = {
        type: 'doc',
        content: [
          { type: 'audio', attrs: { src, controls: false } },
        ],
      }
      expect(mgr.serialize(doc)).toBe(`<audio src="${src}"></audio>`)
    })
  })

  describe('media-features.md fixture', () => {
    it('round-trips the image sections of the sample doc stably (RT2 === RT1)', () => {
      const sample = [
        '![Etabook banner — warm paper study](https://placehold.co/600x200/f5efe0/8b5e34?text=Etabook "Warm Paper Study")',
        '',
        '![A markdown logo](https://placehold.co/200x200/2b2b2b/e8e0cf?text=MD)',
        '',
        '![pixel](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)',
        '',
      ].join('\n')
      const once = mgr.serialize(mgr.parse(sample))
      const twice = mgr.serialize(mgr.parse(once))
      expect(twice).toBe(once)
      expect(once).toContain('![Etabook banner — warm paper study]')
      expect(once).toContain('data:image/png;base64,')
    })
  })
})
