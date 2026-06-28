import { useState } from 'react'
import { NewEntryInput } from './NewEntryInput'
import { useCreateEntry } from '@/queries/files'
import { toast } from 'sonner'
import { ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FileTreeContextMenu } from './FileTreeContextMenu'
import { useRenameEntry } from '@/queries/files'
import { useWorkspace } from '@/state/store'
import type { TreeNode } from '../../../shared/ipc'

type Props = {
  root: TreeNode
  activePath?: string | null
  onSelect: (filePath: string) => void
  className?: string
}

export function FileTree({ root, activePath, onSelect, className }: Props) {
  const selectedPath = useWorkspace(s => s.selectedTreePath)
  const clipboard = useWorkspace(s => s.fileClipboard)
  const cutPath = clipboard?.mode === 'cut' ? clipboard.path : null
  return (
    <ul className={cn('text-sm select-none', className)}>
      <TreeRow node={root} depth={0} activePath={activePath} selectedPath={selectedPath} cutPath={cutPath} onSelect={onSelect} />
    </ul>
  )
}

function TreeRow({ node, depth, activePath, selectedPath, cutPath, onSelect }: {
  node: TreeNode
  depth: number
  activePath?: string | null
  selectedPath?: string | null
  cutPath?: string | null
  onSelect: (p: string) => void
}) {
  const [open, setOpen] = useState(depth === 0)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(node.name)
  const [creating, setCreating] = useState<'file' | 'folder' | null>(null)
  const rename = useRenameEntry()
  const create = useCreateEntry()
  const ws = useWorkspace(s => s.workspacePath)
  const setSelectedTreePath = useWorkspace(s => s.setSelectedTreePath)
  const isSelected = selectedPath === node.path
  const isCut = cutPath === node.path

  function handleRenameSubmit() {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === node.name) {
      setRenaming(false)
      return
    }
    rename.mutate(
      { filePath: node.path, newName: trimmed },
      {
        onSuccess: () => setRenaming(false),
        onError: () => {
          setRenameValue(node.name)
          setRenaming(false)
        },
      },
    )
  }

  function startCreate(type: 'file' | 'folder') {
    if (node.isDirectory) setOpen(true)
    setCreating(type)
  }

  function submitCreate(name: string) {
    const parentRelPath = node.path.slice(ws!.length).replace(/^[/\\]/, '')
    const relPath = parentRelPath ? `${parentRelPath}/${name}` : name
    create.mutate(
      { workspacePath: ws!, relPath, content: '', isDirectory: creating === 'folder' },
      { onError: (e: unknown) => toast.error(`Failed to create: ${e instanceof Error ? e.message : String(e)}`) },
    )
    setCreating(null)
  }

  const content = node.isDirectory ? (
    <button
      className={cn(
        'w-full flex items-center gap-1 px-1 py-0.5 rounded',
        isSelected ? 'bg-bg-subtle text-fg-primary ring-1 ring-border' : 'hover:bg-bg-subtle text-fg-muted',
        isCut && 'opacity-50',
      )}
      style={{ paddingLeft: 4 + depth * 12 }}
      onClick={() => { setSelectedTreePath(node.path); setOpen(o => !o) }}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
      {open ? <FolderOpen className="size-3.5" /> : <Folder className="size-3.5" />}
      {renaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRenameSubmit()
            if (e.key === 'Escape') { setRenameValue(node.name); setRenaming(false) }
          }}
          onClick={(e) => e.stopPropagation()}
          className="bg-bg-subtle border border-border rounded px-1 text-sm text-fg-primary w-full"
        />
      ) : (
        <span className="truncate">{node.name}</span>
      )}
    </button>
  ) : (
    <button
      className={cn(
        'w-full flex items-center gap-1 px-1 py-0.5 rounded text-left',
        'hover:bg-bg-subtle',
        isSelected ? 'bg-bg-subtle text-fg-primary ring-1 ring-border'
          : activePath === node.path ? 'bg-bg-subtle text-fg-primary'
          : 'text-fg-muted',
        isCut && 'opacity-50',
      )}
      style={{ paddingLeft: 4 + depth * 12 + 12 }}
      onClick={() => { setSelectedTreePath(node.path); onSelect(node.path) }}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <FileText className="size-3.5" />
      {renaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRenameSubmit()
            if (e.key === 'Escape') { setRenameValue(node.name); setRenaming(false) }
          }}
          onClick={(e) => e.stopPropagation()}
          className="bg-bg-subtle border border-border rounded px-1 text-sm text-fg-primary w-full"
        />
      ) : (
        <span className="truncate">{node.name}</span>
      )}
    </button>
  )

  if (!ws) return null

  return (
    <li>
      <FileTreeContextMenu
        node={node}
        onRename={() => { setRenaming(true); setRenameValue(node.name) }}
        onNewFile={() => startCreate('file')}
        onNewFolder={() => startCreate('folder')}
      >
        {content}
      </FileTreeContextMenu>
      {node.isDirectory && open ? (
        <ul>
          {node.children?.map(c => (
            <TreeRow key={c.path} node={c} depth={depth + 1} activePath={activePath} selectedPath={selectedPath} cutPath={cutPath} onSelect={onSelect} />
          )) ?? null}
          {creating ? (
            <li>
              <NewEntryInput
                type={creating}
                depth={depth + 1}
                onSubmit={submitCreate}
                onCancel={() => setCreating(null)}
              />
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  )
}
