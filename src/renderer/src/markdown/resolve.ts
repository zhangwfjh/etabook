/**
 * Workspace resolution for WikiLinks and Embeds (ADR-0002).
 *
 * A target resolves in two steps: first as a path relative to the workspace
 * root (`.md` auto-appended), then — if no file matches — by unique filename
 * match anywhere in the workspace. Missing or ambiguous targets are
 * Unresolved (null). Shared by the editor widgets and the export serializer
 * so all surfaces agree on Resolved vs Unresolved.
 */

import { api } from '../lib/ipc'
import type { FSNode } from '@shared/types'

export interface WorkspaceCtx {
  /** Absolute workspace root path. */
  workspace?: string
  /** Directory of the current document (absolute), for relative image paths. */
  docDir?: string
}

export interface LinkDef {
  label: string
  url: string
  title?: string
  from: number
  to: number
  line: number
}

export interface LinkDefs {
  byLabel: Map<string, LinkDef>
  defs: LinkDef[]
}

/** Collect `[label]: url "title"` link definitions with their doc positions.
 * Footnote definitions (`[^id]:`) are excluded — they are not link defs. */
export function collectLinkDefs(src: string): LinkDefs {
  const defs: LinkDef[] = []
  const byLabel = new Map<string, LinkDef>()
  let pos = 0
  let line = 1
  const lines = src.split('\n')
  for (const text of lines) {
    const m = text.match(/^ {0,3}\[([^\]\s][^\]]*)\]:\s*(\S+)\s*(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))?\s*$/)
    if (m && !m[1].startsWith('^')) {
      const def: LinkDef = {
        label: m[1],
        url: m[2],
        title: m[3] ?? m[4] ?? m[5],
        from: pos,
        to: pos + text.length,
        line
      }
      defs.push(def)
      const key = m[1].toLowerCase()
      if (!byLabel.has(key)) byLabel.set(key, def)
    }
    pos += text.length + 1
    line++
  }
  return { byLabel, defs }
}

// ---- Workspace index --------------------------------------------------------

interface WorkspaceIndex {
  /** All file paths (absolute, forward slashes). */
  files: string[]
  /** Lowercase basename (with extension) → paths. */
  byBase: Map<string, string[]>
  at: number
}

const INDEX_TTL = 5000
let indexCache = new Map<string, WorkspaceIndex>()

function flatten(nodes: FSNode[], out: string[]): void {
  for (const n of nodes) {
    if (n.isDir) {
      if (n.children) flatten(n.children, out)
    } else {
      out.push(n.path.replace(/\\/g, '/'))
    }
  }
}

/** In-memory cache of a note file's content (short TTL — embeds re-read on
 * doc switch; disk is the source of truth). */
const noteCache = new Map<string, { content: string; at: number }>()

async function workspaceIndex(workspace: string): Promise<WorkspaceIndex> {
  const hit = indexCache.get(workspace)
  if (hit && Date.now() - hit.at < INDEX_TTL) return hit
  const files: string[] = []
  try {
    const tree = await api().readDirTree(workspace)
    flatten(tree, files)
  } catch {
    // Workspace unreadable — treat as empty.
  }
  const byBase = new Map<string, string[]>()
  for (const f of files) {
    const base = f.slice(f.lastIndexOf('/') + 1).toLowerCase()
    const list = byBase.get(base)
    if (list) list.push(f)
    else byBase.set(base, [f])
  }
  const idx: WorkspaceIndex = { files, byBase, at: Date.now() }
  indexCache.set(workspace, idx)
  return idx
}

/** Drop cached indexes (e.g. after files change on disk). */
export function bustResolverCache(): void {
  indexCache = new Map()
  noteCache.clear()
}

const hasExtension = (file: string): boolean => /\.[a-z0-9]+$/i.test(file)

/**
 * Resolve a WikiLink/Embed target to an absolute workspace file path.
 * Returns null when the target is missing or ambiguous (Unresolved).
 * Targets with a `#subpath` have it stripped before file resolution.
 */
export async function resolveTargetPath(target: string, ctx: WorkspaceCtx): Promise<string | null> {
  const hash = target.indexOf('#')
  const file = (hash >= 0 ? target.slice(0, hash) : target).trim()
  if (!file || !ctx.workspace) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(file)) return null // external URL — not a note
  const name = file.replace(/\\/g, '/').replace(/^\.\//, '')
  const idx = await workspaceIndex(ctx.workspace)
  const ws = ctx.workspace.replace(/\\/g, '/').replace(/\/$/, '')

  // 1. Path relative to the workspace root (with and without `.md`).
  const candidates = hasExtension(name) ? [`${ws}/${name}`] : [`${ws}/${name}.md`, `${ws}/${name}`]
  for (const c of candidates) {
    if (idx.files.includes(c)) return c
  }

  // 2. Unique filename match anywhere in the workspace.
  const base = name.slice(name.lastIndexOf('/') + 1).toLowerCase()
  const withExt = hasExtension(base)
  let matches: string[]
  if (withExt) {
    matches = idx.byBase.get(base) ?? []
  } else {
    // Match either `name.md` or an extension-less file named `name`.
    matches = idx.files.filter((f) => {
      const b = f.slice(f.lastIndexOf('/') + 1).toLowerCase()
      return b === base || b === `${base}.md`
    })
  }
  if (matches.length === 1) return matches[0]
  return null // missing or ambiguous
}

/** `etabook-file://` URL for a resolved absolute path. The custom protocol in
 *  the main process streams local files to the renderer (a plain `file:///`
 *  URL is blocked for the http-origin renderer in dev). */
export function fileUrl(path: string): string {
  return 'etabook-file:///' + encodeURI(path.replace(/\\/g, '/').replace(/^\/+/, ''))
}

/** Read a note's content via IPC, with a short-lived cache. */
export async function readNote(path: string): Promise<string> {
  const hit = noteCache.get(path)
  if (hit && Date.now() - hit.at < INDEX_TTL) return hit.content
  const { content } = await api().readFile(path)
  noteCache.set(path, { content, at: Date.now() })
  return content
}

// ---- Embed extraction -------------------------------------------------------

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Extract the embedded slice of a note's source for a `#subpath`:
 *  - `#^block-id` → exactly the block carrying the ID (marker excluded)
 *  - `#Heading` / `#Parent#Sub` → the heading plus content up to the next
 *    same-or-higher heading (matched on the last segment)
 * No subpath → the whole source. Returns null when the subpath is absent.
 */
export function extractEmbedContent(src: string, subpath: string | undefined): string | null {
  if (!subpath) return src
  const lines = src.split('\n')

  if (subpath.startsWith('^')) {
    const id = subpath.slice(1)
    let idx = -1
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(new RegExp(`(?:^|\\s)\\^${escapeRe(id)}\\s*$`))
      if (m) { idx = i; break }
    }
    if (idx < 0) return null
    let start = idx
    while (start > 0 && lines[start - 1].trim() !== '') start--
    let end = idx + 1
    while (end < lines.length && lines[end].trim() !== '') end++
    // Drop the block-ID marker itself from the rendered slice.
    const block = lines.slice(start, end)
    const last = block.length - 1
    block[last] = block[last].replace(new RegExp(`\\s*\\^${escapeRe(id)}\\s*$`), '')
    return block.join('\n')
  }

  const segments = subpath.split('#').filter(Boolean)
  const wanted = segments[segments.length - 1].trim().toLowerCase()
  let idx = -1
  let level = 0
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADING_RE)
    if (m && m[2].trim().toLowerCase() === wanted) {
      idx = i
      level = m[1].length
      break
    }
  }
  if (idx < 0) return null
  let end = lines.length
  for (let i = idx + 1; i < lines.length; i++) {
    const m = lines[i].match(HEADING_RE)
    if (m && m[1].length <= level) {
      end = i
      break
    }
  }
  return lines.slice(idx, end).join('\n').trimEnd()
}

/** Find the doc offset of a heading (`#Heading` / `#Parent#Sub`) or block
 * (`#^block-id`), for scroll-to-target navigation. -1 when absent. */
export function headingOffset(src: string, subpath: string): number {
  const lines = src.split('\n')
  let pos = 0
  if (subpath.startsWith('^')) {
    // Block reference: jump to the start of the blank-delimited block that
    // carries the `^id` marker (same block notion as extractEmbedContent).
    const re = new RegExp(`(?:^|\\s)${escapeRe(subpath)}\\s*$`)
    let hit = -1
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) { hit = i; break }
    }
    if (hit < 0) return -1
    let start = hit
    while (start > 0 && lines[start - 1].trim() !== '') start--
    for (let i = 0; i < start; i++) pos += lines[i].length + 1
    return pos
  }
  const segments = subpath.split('#').filter(Boolean)
  const wanted = segments[segments.length - 1].trim().toLowerCase()
  for (const line of lines) {
    const m = line.match(HEADING_RE)
    if (m && m[2].trim().toLowerCase() === wanted) return pos
    pos += line.length + 1
  }
  return -1
}
