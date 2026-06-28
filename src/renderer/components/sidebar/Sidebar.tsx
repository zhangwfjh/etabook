import { useEffect, useRef, useState } from 'react'
import { useTree, useCreateEntry, useDeleteEntry } from '@/queries/files'
import { useWorkspace as useWs } from '@/state/store'
import { FileTree } from './FileTree'
import { PromptDialog } from './PromptDialog'
import { EmptyAreaContextMenu } from './FileTreeContextMenu'
import { useQueryClient } from '@tanstack/react-query'
import { Settings, FilePlus, FolderPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useOpenFileChecked } from '@/hooks/use-unsaved-guard'
import { useFileTreeShortcuts } from '@/hooks/use-file-tree-shortcuts'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Props = { onOpenSettings: () => void }

export function Sidebar({ onOpenSettings }: Props) {
  const ws = useWs(s => s.workspacePath)
  const openFileChecked = useOpenFileChecked()
  const sidebarOpen = useWs(s => s.sidebarOpen)
  const active = useWs(s => s.activeFilePath)
  const { data: tree } = useTree(ws)
  const qc = useQueryClient()
  const create = useCreateEntry()
  const deleteEntry = useDeleteEntry()
  const sidebarRef = useRef<HTMLElement>(null)
  const [promptType, setPromptType] = useState<'file' | 'folder' | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ path: string; name: string; isDirectory: boolean } | null>(null)

  useEffect(() => {
    return window.api.files.onTreeChanged(({ workspacePath, tree }) => {
      qc.setQueryData(['tree', workspacePath], tree)
    })
  }, [qc])

  useFileTreeShortcuts({
    sidebarRef,
    tree: tree ?? null,
    onRequestDelete: setPendingDelete,
  })

  if (!ws) return null

  function handleCreate(value: string) {
    if (!ws) return

    const isDir = promptType === 'folder'
    setPromptType(null)
    create.mutate(
      { workspacePath: ws, relPath: value, content: '', isDirectory: isDir },
      { onError: (e: unknown) => toast.error(`Failed to create: ${e instanceof Error ? e.message : String(e)}`) },
    )
  }

  function confirmDelete() {
    const target = pendingDelete
    setPendingDelete(null)
    if (!target) return
    deleteEntry.mutate(
      { filePath: target.path },
      {
        onSuccess: () => {
          const wsState = useWs.getState()
          if (wsState.selectedTreePath === target.path) wsState.setSelectedTreePath(null)
          if (wsState.fileClipboard?.path === target.path) wsState.setFileClipboard(null)
        },
        onError: (e: unknown) => toast.error(`Failed to delete: ${e instanceof Error ? e.message : String(e)}`),
      },
    )
  }

  return (
    <div
      className="h-full overflow-hidden transition-[width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ width: sidebarOpen ? 'var(--width-sidebar)' : '0px' }}
      aria-hidden={!sidebarOpen}
    >
    <aside ref={sidebarRef} className="h-full w-[var(--width-sidebar)] border-r border-border bg-bg-canvas flex flex-col">
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
      <Dialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {pendingDelete?.isDirectory ? 'folder' : 'file'}?</DialogTitle>
            <DialogDescription>
              {pendingDelete?.isDirectory
                ? `"${pendingDelete?.name}" and all of its contents will be permanently deleted, bypassing the Recycle Bin. This cannot be undone.`
                : `"${pendingDelete?.name}" will be permanently deleted, bypassing the Recycle Bin. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
