import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { FileText, CornerDownLeft } from 'lucide-react'
import { Modal } from '@renderer/components/ui'
import { api } from '@renderer/lib/ipc'
import type { FSNode } from '@shared/types'

/**
 * Quick Open — VS Code-style fuzzy file finder over the workspace (Ctrl+P).
 * Subsequence matching with a small score (consecutive + word-start bonuses),
 * ranked, capped at 60 results.
 */

type QuickFile = { name: string; path: string; rel: string }

function flattenMd(nodes: FSNode[], root: string, out: QuickFile[]): void {
  for (const n of nodes) {
    if (n.isDir) {
      flattenMd(n.children ?? [], root, out)
    } else if (/\.(md|markdown)$/i.test(n.name)) {
      out.push({ name: n.name, path: n.path, rel: n.path.slice(root.length).replace(/^[\\/]/, '') })
    }
  }
}

function fuzzyScore(query: string, target: string): number {
  let score = 0
  let ti = 0
  let streak = 0
  for (let qi = 0; qi < query.length; qi++) {
    const ch = query[qi]
    let found = -1
    for (let i = ti; i < target.length; i++) {
      if (target[i] === ch) {
        found = i
        break
      }
    }
    if (found < 0) return -1
    streak = found === ti ? streak + 1 : 0
    score += 1 + streak * 2
    if (found === 0 || /[\s/\\._-]/.test(target[found - 1] ?? '')) score += 3
    ti = found + 1
  }
  return score - target.length * 0.01
}

export function QuickOpen({
  open,
  onClose,
  workspace,
  activePath,
  onOpen
}: {
  open: boolean
  onClose: () => void
  workspace?: string
  activePath?: string
  onOpen: (path: string) => void
}): ReactElement | null {
  const [files, setFiles] = useState<QuickFile[]>([])
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    requestAnimationFrame(() => inputRef.current?.focus())
    if (!workspace) {
      setFiles([])
      return
    }
    let cancelled = false
    setLoading(true)
    api()
      .readDirTree(workspace)
      .then((tree) => {
        if (cancelled) return
        const out: QuickFile[] = []
        flattenMd(tree, workspace, out)
        out.sort((a, b) => a.rel.localeCompare(b.rel))
        setFiles(out)
      })
      .catch(() => {
        if (!cancelled) setFiles([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, workspace])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return files.slice(0, 60)
    return files
      .map((f) => ({ f, s: Math.max(fuzzyScore(q, f.name.toLowerCase()), fuzzyScore(q, f.rel.toLowerCase())) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 60)
      .map((r) => r.f)
  }, [query, files])

  useEffect(() => {
    setActive(0)
  }, [query])

  const openFile = (f: QuickFile | undefined): void => {
    if (!f) return
    onOpen(f.path)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} width="max-w-xl">
      <div className="flex items-center gap-2 px-3 h-11 border-b border-[var(--border)] -mx-4 -mt-4 mb-3">
        <FileText size={16} className="opacity-60" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              openFile(results[active])
            }
          }}
          placeholder={workspace ? 'Go to file…' : 'Open a folder first (no workspace)'}
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--text-muted)]"
        />
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        {loading && <div className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">Scanning workspace…</div>}
        {!loading && !workspace && (
          <div className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
            No folder open — use Open Folder to pick a workspace first.
          </div>
        )}
        {!loading && workspace && results.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">No matching files</div>
        )}
        {results.map((f, i) => (
          <button
            key={f.path}
            className={`flex items-center justify-between w-full text-left cursor-pointer px-3 py-2 rounded-[6px] text-sm transition-colors duration-100 ${
              i === active ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'hover:bg-[var(--surface-2)]'
            }`}
            onMouseEnter={() => setActive(i)}
            onClick={() => openFile(f)}
          >
            <span className="flex items-center gap-2 min-w-0">
              <FileText size={14} className="shrink-0 opacity-70" />
              <span className="truncate">
                {f.name}
                <span className="text-[var(--text-muted)] text-[12px] ml-2">{f.rel}</span>
              </span>
            </span>
            {i === active && <CornerDownLeft size={14} className="opacity-60 shrink-0" />}
          </button>
        ))}
      </div>
      {activePath && results.length > 0 && !query && (
        <div className="px-3 pt-2 text-[11px] text-[var(--text-muted)]">{files.length} markdown files in workspace</div>
      )}
    </Modal>
  )
}
