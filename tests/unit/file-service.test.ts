import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listTree, readFile, writeFile, copyEntry } from '../../src/main/file-service'

describe('file-service', () => {
  let ws: string
  beforeEach(() => { ws = mkdtempSync(join(tmpdir(), 'etabook-fs-')) })

  it('lists directory tree ignoring excluded dirs', () => {
    mkdirSync(join(ws, 'node_modules', 'pkg'), { recursive: true })
    mkdirSync(join(ws, 'docs'))
    writeFileSync(join(ws, 'docs', 'a.md'), '# a')
    writeFileSync(join(ws, 'README.md'), '# r')

    const tree = listTree(ws, ['.git', 'node_modules', '.etabook'])
    const names = (function walk(n: any): string[] {
      return [n.name, ...(n.children ?? []).flatMap(walk)]
    })(tree)
    expect(names).toContain('docs')
    expect(names).toContain('README.md')
    expect(names).toContain('a.md')
    expect(names).not.toContain('node_modules')
    rmSync(ws, { recursive: true, force: true })
  })

  it('reads file and returns truncated sha256 hash', () => {
    const p = join(ws, 'a.md')
    writeFileSync(p, 'hello')
    const res = readFile(p)
    expect(res.content).toBe('hello')
    expect(res.hash).toMatch(/^[0-9a-f]{16}$/)
    rmSync(ws, { recursive: true, force: true })
  })

  it('writes file with optimistic concurrency check', () => {
    const p = join(ws, 'a.md')
    writeFileSync(p, 'one')
    const first = readFile(p)
    writeFile(p, 'two', first.hash)
    const second = readFile(p)
    expect(second.content).toBe('two')

    expect(() => writeFile(p, 'three', 'stale-hash')).toThrowError(/hash mismatch/i)
    rmSync(ws, { recursive: true, force: true })
  })
  it('copies a file to "name copy.ext" and increments on repeats', () => {
    const p = join(ws, 'note.md')
    writeFileSync(p, 'hello')

    const c1 = copyEntry(p)
    expect(c1.filePath).toBe(join(ws, 'note copy.md'))
    expect(readFileSync(c1.filePath, 'utf8')).toBe('hello')

    const c2 = copyEntry(p)
    expect(c2.filePath).toBe(join(ws, 'note copy 2.md'))

    // Copying the first copy produces "note copy copy.md" in the same dir
    const c3 = copyEntry(c1.filePath)
    expect(c3.filePath).toBe(join(ws, 'note copy copy.md'))
    rmSync(ws, { recursive: true, force: true })
  })

  it('copies a folder recursively', () => {
    const dir = join(ws, 'fold', 'nested')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'inner.md'), 'nested-content')
    writeFileSync(join(ws, 'fold', 'top.md'), 'top-content')

    const c = copyEntry(join(ws, 'fold'))
    expect(c.filePath).toBe(join(ws, 'fold copy'))
    expect(readFileSync(join(c.filePath, 'nested', 'inner.md'), 'utf8')).toBe('nested-content')
    expect(readFileSync(join(c.filePath, 'top.md'), 'utf8')).toBe('top-content')
    rmSync(ws, { recursive: true, force: true })
  })

  it('handles files with no extension', () => {
    const p = join(ws, 'Makefile')
    writeFileSync(p, 'all:')
    const c1 = copyEntry(p)
    expect(c1.filePath).toBe(join(ws, 'Makefile copy'))
    const c2 = copyEntry(p)
    expect(c2.filePath).toBe(join(ws, 'Makefile copy 2'))
    rmSync(ws, { recursive: true, force: true })
  })
})
