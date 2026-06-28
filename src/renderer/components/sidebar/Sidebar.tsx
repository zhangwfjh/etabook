import { useEffect, useState } from 'react'
import { useTree, useCreateEntry } from '@/queries/files'
import { useWorkspace as useWs } from '@/state/store'
import { FileTree } from './FileTree'
import { PromptDialog } from './PromptDialog'
import { EmptyAreaContextMenu } from './FileTreeContextMenu'
import { useQueryClient } from '@tanstack/react-query'
import { Settings, FilePlus, FolderPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useOpenFileChecked } from '@/hooks/use-unsaved-guard'

type Props = { onOpenSettings: () => void }

export function Sidebar({ onOpenSettings }: Props) {
  const ws = useWs(s => s.workspacePath)
  const openFileChecked = useOpenFileChecked()
  const sidebarOpen = useWs(s => s.sidebarOpen)
  const active = useWs(s => s.activeFilePath)
  const { data: tree } = useTree(ws)
  const qc = useQueryClient()
  const create = useCreateEntry()
  const [promptType, setPromptType] = useState<'file' | 'folder' | null>(null)

  useEffect(() => {
    return window.api.files.onTreeChanged(({ workspacePath, tree }) => {
      qc.setQueryData(['tree', workspacePath], tree)
    })
  }, [qc])

  if (!ws) return null

  function handleCreate(value: string) {
    if (!ws) return

    const isDir = promptType === 'folder'
    setPromptType(null)
    create.mutate(
      { workspacePath: ws, relPath: value, content: '', isDirectory: isDir },
      { onError: (e: any) => toast.error(`Failed to create: ${e.message}`) },
    )
  }

  return (
    <div
      className="h-full overflow-hidden transition-[width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ width: sidebarOpen ? 'var(--width-sidebar)' : '0px' }}
      aria-hidden={!sidebarOpen}
    >
    <aside className="h-full w-[var(--width-sidebar)] border-r border-border bg-bg-canvas flex flex-col">
      <div className="px-3 py-2 text-xs uppercase tracking-wide text-fg-subtle border-b border-border">
        {ws.split(/[\\/]/).pop()}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <EmptyAreaContextMenu workspacePath={ws}>
          {tree ? <FileTree root={tree} activePath={active} onSelect={openFileChecked} /> : null}
        </EmptyAreaContextMenu>
      </div>
      <div className="border-t border-border p-2 flex items-center gap-1">
        {promptType ? (
          <>
            <PromptDialog
              open
              label={promptType === 'file' ? 'Name:' : 'Folder:'}
              placeholder={promptType === 'file' ? 'untitled.md' : 'new-folder'}
              onSubmit={handleCreate}
              onCancel={() => setPromptType(null)}
            />
            <button
              onClick={() => setPromptType(null)}
              className="px-1 py-1 rounded text-fg-subtle hover:bg-bg-subtle"
            >
              <X className="size-3" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setPromptType('file')}
              title="New File"
              className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-fg-subtle hover:bg-bg-subtle hover:text-fg-muted"
            >
              <FilePlus className="size-3.5" />
            </button>
            <button
              onClick={() => setPromptType('folder')}
              title="New Folder"
              className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-fg-subtle hover:bg-bg-subtle hover:text-fg-muted"
            >
              <FolderPlus className="size-3.5" />
            </button>
            <div className="flex-1" />
            <button
              onClick={onOpenSettings}
              title="Settings (Ctrl+,)"
              className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-fg-subtle hover:bg-bg-subtle hover:text-fg-muted"
            >
              <Settings className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </aside>
    </div>
  )
}
