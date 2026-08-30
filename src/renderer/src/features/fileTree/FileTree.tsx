import { useEffect, useState, type ReactElement } from 'react'
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, FilePlus, RefreshCw, Folder as FolderIcon } from 'lucide-react'
import { api } from '@renderer/lib/ipc'
import type { FSNode } from '@shared/types'
import { Button, Tooltip } from '@renderer/components/ui'
import { normPath } from '@renderer/lib/fs'

type Props = {
  workspace: string | undefined
  activePath: string | undefined
  /** Open a file. persistent=true (double-click) pins the tab instead of
   * leaving it as a replaceable preview. */
  onOpen: (path: string, persistent?: boolean) => void
  onPickFolder: () => void
  onCreate: (parentDir: string) => void
  refreshKey: number
}

export function FileTree({ workspace, activePath, onOpen, onPickFolder, onCreate, refreshKey }: Props): ReactElement {
  const [tree, setTree] = useState<FSNode[]>([])

  useEffect(() => {
    let cancelled = false
    if (!workspace) {
      setTree([])
      return
    }
    api()
      .readDirTree(workspace)
      .then((nodes) => {
        if (!cancelled) setTree(nodes)
      })
      .catch(() => {
        if (!cancelled) setTree([])
      })
    return () => {
      cancelled = true
    }
  }, [workspace, refreshKey])

  if (!workspace) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center text-[var(--text-muted)] text-sm gap-3">
        <FolderIcon size={32} className="opacity-50" />
        <p>No folder open</p>
        <Button variant="outline" size="sm" onClick={onPickFolder}>
          Open Folder
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-9 border-b border-[var(--border)] shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] truncate">
          {workspace.split(/[\\/]/).pop()}
        </span>
        <div className="flex items-center">
          <Tooltip label="New File">
            <Button size="icon" variant="ghost" onClick={() => onCreate(workspace)} aria-label="New file">
              <FilePlus size={14} />
            </Button>
          </Tooltip>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1 text-[13px]">
        {tree.map((node) => (
          <TreeRow key={node.path} node={node} depth={0} activePath={activePath} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )
}

function TreeRow({
  node,
  depth,
  activePath,
  onOpen
}: {
  node: FSNode
  depth: number
  activePath: string | undefined
  onOpen: (p: string, persistent?: boolean) => void
}): ReactElement {
  const [open, setOpen] = useState(depth < 1)
  const [children, setChildren] = useState<FSNode[]>(node.children ?? [])

  useEffect(() => {
    setChildren(node.children ?? [])
  }, [node.children])

  const isActive = !!activePath && normPath(activePath) === normPath(node.path)
  const pad = 8 + depth * 14

  if (node.isDir) {
    return (
      <div>
        <button
          className="flex items-center w-full text-left cursor-pointer hover:bg-[var(--surface-2)] transition-colors duration-100 py-0.5"
          style={{ paddingLeft: pad, paddingRight: 8 }}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDown size={13} className="shrink-0 opacity-70" /> : <ChevronRight size={13} className="shrink-0 opacity-70" />}
          {open ? <FolderOpen size={14} className="shrink-0 mr-1.5 text-[var(--accent)]" /> : <Folder size={14} className="shrink-0 mr-1.5 text-[var(--accent)]" />}
          <span className="truncate">{node.name}</span>
        </button>
        {open &&
          children.map((c) => (
            <TreeRow key={c.path} node={c} depth={depth + 1} activePath={activePath} onOpen={onOpen} />
          ))}
      </div>
    )
  }

  return (
    <button
      className={`flex items-center w-full text-left cursor-pointer transition-colors duration-100 py-0.5 ${
        isActive ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'hover:bg-[var(--surface-2)]'
      }`}
      style={{ paddingLeft: pad + 16, paddingRight: 8 }}
      onClick={() => onOpen(node.path)}
      onDoubleClick={(e) => {
        e.preventDefault()
        onOpen(node.path, true)
      }}
    >
      <FileText size={13} className="shrink-0 mr-1.5 opacity-60" />
      <span className="truncate">{node.name}</span>
    </button>
  )
}

void RefreshCw
