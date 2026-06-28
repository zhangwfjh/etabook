import { describe, it, expect } from 'vitest'
import { getMarkdownManager } from '@/editor/markdown-manager'

describe('markdown-manager', () => {
  const mgr = getMarkdownManager()

  it('round-trips plain markdown with heading, bold, task list', () => {
    const md = `# Hello World

This is **bold** text.

- [ ] First task
- [x] Completed task
- [ ] Another task
`
    const doc = mgr.parse(md)
    const result = mgr.serialize(doc)
    expect(result).toContain('# Hello World')
    expect(result).toContain('**bold**')
    expect(result).toContain('- [ ] First task')
    expect(result).toContain('- [x] Completed task')
  })

  it('round-trips fenced code blocks with language', () => {
    const md = '```typescript\nconst x = 1\nconsole.log(x)\n```'
    const doc = mgr.parse(md)
    const result = mgr.serialize(doc)
    expect(result).toContain('```typescript')
    expect(result).toContain('const x = 1')
  })

  it('round-trips heading levels 1-4', () => {
    const md = `# Heading 1

## Heading 2

### Heading 3

#### Heading 4
`
    const doc = mgr.parse(md)
    const result = mgr.serialize(doc)
    expect(result).toContain('# Heading 1')
    expect(result).toContain('## Heading 2')
    expect(result).toContain('### Heading 3')
    expect(result).toContain('#### Heading 4')
  })

  it('round-trips links and inline code', () => {
    const md = 'Here is a [link](https://example.com) and some `inline code`.'
    const doc = mgr.parse(md)
    const result = mgr.serialize(doc)
    expect(result).toContain('[link](https://example.com)')
    expect(result).toContain('`inline code`')
  })

  it('round-trips bullet and ordered lists', () => {
    const md = `- item one
- item two
- item three

1. first
2. second
3. third
`
    const doc = mgr.parse(md)
    const result = mgr.serialize(doc)
    expect(result).toContain('- item one')
    expect(result).toContain('1. first')
  })

  describe('callouts', () => {
    it('round-trips a basic note callout with title and body', () => {
      const md = '> [!note] Hello\n> World.'
      const doc = mgr.parse(md)
      const callout = doc.content?.[0]
      expect(callout?.type).toBe('callout')
      expect(callout?.attrs?.type).toBe('note')
      expect(callout?.attrs?.title).toBe('Hello')
      expect(callout?.content?.[0]?.type).toBe('paragraph')
      const out = mgr.serialize(doc)
      expect(out).toBe('> [!note] Hello\n>\n> World.')
    })

    it('leaves plain blockquotes untouched (regression)', () => {
      const md = '> just a quote\n> second line'
      const doc = mgr.parse(md)
      expect(doc.content?.[0]?.type).toBe('blockquote')
      const out = mgr.serialize(doc)
      expect(out.trim()).toBe('> just a quote\n> second line')
    })

    it('round-trips a callout with empty title and no body', () => {
      const md = '> [!warning]'
      const doc = mgr.parse(md)
      expect(doc.content?.[0]?.type).toBe('callout')
      expect(doc.content?.[0]?.attrs?.title).toBe('')
      const out = mgr.serialize(doc)
      expect(out).toBe('> [!warning]')
    })

    it('preserves alias spelling on round-trip but resolves canonical for attrs', () => {
      const md = '> [!tldr] Quick recap\n> Body text.'
      const doc = mgr.parse(md)
      const callout = doc.content?.[0]
      expect(callout?.attrs?.type).toBe('abstract')
      expect(callout?.attrs?.rawType).toBe('tldr')
      const out = mgr.serialize(doc)
      expect(out).toBe('> [!tldr] Quick recap\n>\n> Body text.')
    })

    it('preserves unknown type spelling via rawType', () => {
      const md = '> [!xyz] Unknown type\n> Body.'
      const doc = mgr.parse(md)
      const callout = doc.content?.[0]
      expect(callout?.attrs?.type).toBe('note')
      expect(callout?.attrs?.rawType).toBe('xyz')
      const out = mgr.serialize(doc)
      expect(out).toBe('> [!xyz] Unknown type\n>\n> Body.')
    })

    it('round-trips multi-paragraph bodies', () => {
      const md = '> [!info]\n> First paragraph.\n>\n> Second paragraph.'
      const doc = mgr.parse(md)
      const callout = doc.content?.[0]
      expect(callout?.content?.length).toBe(2)
      expect(callout?.content?.[0]?.type).toBe('paragraph')
      expect(callout?.content?.[1]?.type).toBe('paragraph')
      const out = mgr.serialize(doc)
      expect(out).toBe('> [!info]\n>\n> First paragraph.\n>\n> Second paragraph.')
    })

    it('preserves inline markdown (bold, code) inside body', () => {
      const md = '> [!tip] Hint\n> Use **bold** and `code`.'
      const doc = mgr.parse(md)
      const out = mgr.serialize(doc)
      expect(out).toBe('> [!tip] Hint\n>\n> Use **bold** and `code`.')
    })

    it('round-trips every Obsidian canonical type', () => {
      const types = ['note','abstract','info','todo','tip','success','question','warning','failure','danger','bug','example','quote']
      for (const t of types) {
        const md = `> [!${t}] Title ${t}\n> Body.`
        const doc = mgr.parse(md)
        expect(doc.content?.[0]?.type).toBe('callout')
        expect(doc.content?.[0]?.attrs?.type).toBe(t)
        const out = mgr.serialize(doc)
        expect(out).toBe(`> [!${t}] Title ${t}\n>\n> Body.`)
      }
    })

    it('round-trips every math canonical type', () => {
      const types = ['theorem','lemma','corollary','proposition','definition','proof','remark','algorithm']
      for (const t of types) {
        const md = `> [!${t}] 1.1 (${t})\n> Body.`
        const doc = mgr.parse(md)
        expect(doc.content?.[0]?.attrs?.type).toBe(t)
        const out = mgr.serialize(doc)
        expect(out).toBe(`> [!${t}] 1.1 (${t})\n>\n> Body.`)
      }
    })

    it('round-trips every alias back to its original spelling', () => {
      const cases: Array<[alias: string, canonical: string]> = [
        ['summary', 'abstract'],
        ['tldr', 'abstract'],
        ['hint', 'tip'],
        ['important', 'tip'],
        ['check', 'success'],
        ['done', 'success'],
        ['help', 'question'],
        ['faq', 'question'],
        ['caution', 'warning'],
        ['attention', 'warning'],
        ['fail', 'failure'],
        ['missing', 'failure'],
        ['error', 'danger'],
        ['cite', 'quote'],
      ]
      for (const [alias, canonical] of cases) {
        const md = `> [!${alias}] T\n> B.`
        const doc = mgr.parse(md)
        expect(doc.content?.[0]?.attrs?.type).toBe(canonical)
        expect(doc.content?.[0]?.attrs?.rawType).toBe(alias)
        const out = mgr.serialize(doc)
        expect(out).toBe(`> [!${alias}] T\n>\n> B.`)
      }
    })
    it('serializes a callout with no content without stack overflow (regression)', () => {
      const doc = { type: 'doc', content: [{ type: 'callout', attrs: { type: 'note', title: 'Empty' } }] }
      const out = mgr.serialize(doc as any)
      expect(out).toBe('> [!note] Empty')
    })
  })

  describe('view/raw toggle contract', () => {
    it('serialize(parse(md)) is stable across two round-trips', () => {
      const md = `# Title

A paragraph with **bold** and \`code\`.

- [ ] task one
- [x] task two

> [!note] Callout
> Body text.

\`\`\`typescript
const x: number = 1
\`\`\`
`
      const once = mgr.serialize(mgr.parse(md))
      const twice = mgr.serialize(mgr.parse(once!))
      expect(twice).toBe(once)
    })

    it('parse does not throw and always returns a truthy doc for malformed input', () => {
      const garbage = '\x00\x01\x02 \uffff'
      const result = mgr.parse(garbage)
      expect(result).toBeTruthy()
    })
  })
})
