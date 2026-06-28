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

/** Move an entry to the OS trash (Recycle Bin / Trash). Reversible by the user. */
export async function trashEntry(filePath: string): Promise<{ ok: true }> {
  if (!existsSync(filePath)) throw new Error(`Not found: ${filePath}`)
  await shell.trashItem(filePath)
  return { ok: true }
}
/** Resolve a collision-free destination path for `name` inside `destDir`. */
function uniqueDest(destDir: string, name: string): string {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  const candidate = (n: number) =>
    n === 0 ? `${stem}${ext}` : `${stem} copy${n > 1 ? ` ${n}` : ''}${ext}`
  let n = 0
  let dest = join(destDir, candidate(n))
  while (existsSync(dest)) {
    n += 1
    dest = join(destDir, candidate(n))
  }
  return dest
}

export function copyEntry(filePath: string): { filePath: string } {
  if (!existsSync(filePath)) throw new Error(`Not found: ${filePath}`)
  const dest = uniqueDest(dirname(filePath), basename(filePath))
  cpSync(filePath, dest, { recursive: true })
  return { filePath: dest }
}

/**
 * Paste (copy or move) `srcPath` into `destDir` with collision-safe naming.
 * - mode 'copy': duplicate into destDir (source untouched); clipboard retained.
 * - mode 'cut':  move into destDir; source removed on success.
 * Guards against pasting a folder into itself or one of its descendants.
 * Returns the resulting destination path.
 */
export function pasteEntry(srcPath: string, destDir: string, mode: 'copy' | 'cut'): { filePath: string } {
  if (!existsSync(srcPath)) throw new Error(`Not found: ${srcPath}`)
  mkdirSync(destDir, { recursive: true })

  // Refuse to paste a directory into itself or a descendant (would recurse).
  const srcNorm = srcPath + sep
  if ((destDir + sep) === srcNorm || (destDir + sep).startsWith(srcNorm)) {
    throw new Error('Cannot paste a folder into itself')
  }

  const dest = uniqueDest(destDir, basename(srcPath))
  // No-op: source already lives at the resolved destination.
  if (dest === srcPath) return { filePath: dest }

  if (mode === 'copy') {
    cpSync(srcPath, dest, { recursive: true })
  } else {
    renameSync(srcPath, dest)
  }
  return { filePath: dest }
}

export function reveal(filePath: string): void {
  shell.showItemInFolder(filePath)
}
