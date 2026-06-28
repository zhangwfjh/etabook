import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, statSync, readdirSync, cpSync, type Dirent } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, join, relative, sep } from 'node:path'
import { shell } from 'electron'
import type { FileReadResult, TreeNode } from '../shared/ipc'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const DEFAULT_EXCLUSIONS = ['.git', 'node_modules', '.etabook']

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16)
}

export function listTree(root: string, exclusions: string[] = DEFAULT_EXCLUSIONS): TreeNode {
  return walk(root, root, new Set(exclusions))
}

function walk(root: string, dir: string, excl: Set<string>): TreeNode {
  const name = root === dir ? dir.split(sep).pop() ?? dir : dir.slice(root.length + 1).split(sep).pop() ?? dir
  const entries: Dirent[] = readdirSync(dir, { withFileTypes: true })
  const children = entries
    .filter(d => !excl.has(d.name))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    .map(d => {
      if (d.isDirectory()) {
        return walk(root, join(dir, d.name), excl)
      }
      return { name: d.name, path: join(dir, d.name), relPath: relative(root, join(dir, d.name)) || '.', isDirectory: false }
    })
  return { name, path: dir, relPath: relative(root, dir) || '.', isDirectory: true, children }
}

export function readFile(filePath: string): FileReadResult {
  const buf = readFileSync(filePath)
  if (buf.byteLength > MAX_FILE_BYTES) throw new Error(`File too large: ${filePath}`)
  const content = buf.toString('utf8')
  const st = statSync(filePath)
  return { content, hash: hashContent(content), mtime: st.mtimeMs, size: st.size }
}

export function writeFile(filePath: string, content: string, baseHash?: string): FileReadResult {
  if (baseHash !== undefined) {
    const current = hashContent(readFileSync(filePath, 'utf8'))
    if (current !== baseHash) {
      throw new Error(`hash mismatch: file changed externally (expected ${baseHash}, got ${current})`)
    }
  }
  const tmp = filePath + '.etabook-tmp'
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, filePath)
  return readFile(filePath)
}

export function createEntry(workspacePath: string, relPath: string, content: string, isDirectory: boolean): { filePath: string } {
  const filePath = join(workspacePath, relPath)
  if (existsSync(filePath)) throw new Error(`Already exists: ${relPath}`)
  if (isDirectory) {
    mkdirSync(filePath, { recursive: true })
  } else {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, content, 'utf8')
  }
  return { filePath }
}

export function renameEntry(filePath: string, newName: string): { filePath: string } {
  const dir = dirname(filePath)
  const dest = join(dir, newName)
  if (existsSync(dest)) throw new Error(`Target exists: ${newName}`)
  renameSync(filePath, dest)
  return { filePath: dest }
}

export function deleteEntry(filePath: string): { ok: true } {
  rmSync(filePath, { recursive: true, force: true })
  return { ok: true }
}
export function copyEntry(filePath: string): { filePath: string } {
  if (!existsSync(filePath)) throw new Error(`Not found: ${filePath}`)
  const dir = dirname(filePath)
  const base = basename(filePath)
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot) : ''
  const candidate = (n: number) =>
    n === 0 ? `${stem}${ext}` : `${stem} copy${n > 1 ? ` ${n}` : ''}${ext}`
  let n = 0
  let dest = join(dir, candidate(n))
  while (existsSync(dest)) {
    n += 1
    dest = join(dir, candidate(n))
  }
  cpSync(filePath, dest, { recursive: true })
  return { filePath: dest }
}

export function reveal(filePath: string): void {
  shell.showItemInFolder(filePath)
}
