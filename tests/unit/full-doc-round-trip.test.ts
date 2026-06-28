/**
 * Full-document round-trip contract: the entire markdown-features.md reference
 * doc must be a fixed point after the first parse→serialize cycle (RT2 === RT1).
 *
 * The first round-trip may apply one-time canonical normalizations (e.g. adding
 * the blank `>` separator in callouts). What matters is that no content is lost
 * or structurally damaged, and the document stabilises immediately.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { getMarkdownManager } from '@/editor/markdown-manager'

describe('markdown-features.md full-doc round-trip', () => {
  const mgr = getMarkdownManager()
  const mdPath = path.resolve(__dirname, '../../docs/markdown-features.md')
  const original = fs.readFileSync(mdPath, 'utf8')

  it('RT2 === RT1 (stable after first round-trip)', () => {
    const once = mgr.serialize(mgr.parse(original)) ?? ''
    const twice = mgr.serialize(mgr.parse(once)) ?? ''
    expect(twice).toBe(once)
  })

  it('RT3 === RT2 (long-term stability)', () => {
    const once = mgr.serialize(mgr.parse(original)) ?? ''
    const twice = mgr.serialize(mgr.parse(once)) ?? ''
    const thrice = mgr.serialize(mgr.parse(twice)) ?? ''
    expect(thrice).toBe(twice)
  })

  it('first round-trip does not corrupt any Tier-1/Tier-2 feature', () => {
    const once = mgr.serialize(mgr.parse(original)) ?? ''

    // Core markdown features must survive intact.
    // Emphasis normalizes to asterisk form (underscore → asterisk), so both
    // the underscore and asterisk source forms collapse to `**`/`*`.
    expect(once).toContain('**Bold text**')           // bold (both forms → **)
    expect(once).toContain('*Italic text*')            // italic (both forms → *)
    expect(once).toContain('***Bold and italic***')   // bold+italic (triple → ***)
    expect(once).toContain('~~This text is strikethrough~~')
    expect(once).toContain('```js')                   // code fence with lang
    expect(once).toContain('[Link text](https://example.com)')
    expect(once).toContain('![Alt text](https://example.com/image.png)')
    expect(once).toContain('- [ ] Incomplete task')
    expect(once).toContain('- [x] Completed task')
    expect(once).toContain('- [?] Custom status task') // brackets NOT escaped

    // No entity encoding leaks.
    expect(once).not.toContain('&amp;')
    expect(once).not.toContain('&lt;')
    expect(once).not.toContain('&gt;')

    // No wikilink/footnote bracket escaping.
    expect(once).toContain('[[wikilinks]]')
    expect(once).not.toContain('\\[\\[')

    // Callout foldable markers preserved.
    expect(once).toContain('[!faq]- Collapsed')
    expect(once).toContain('[!tip]+ Expanded')
  })
})
