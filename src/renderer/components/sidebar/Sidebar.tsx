import { useEffect, useRef, useState } from 'react'
import { useTree, useDeleteEntry } from '@/queries/files'
import { useWorkspace as useWs } from '@/state/store'
import { FileTree } from './FileTree'
import { EmptyAreaContextMenu } from './FileTreeContextMenu'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useOpenFileChecked } from '@/hooks/use-unsaved-guard'
import { useFileTreeShortcuts } from '@/hooks/use-file-tree-shortcuts'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function Sidebar() {
  const ws = useWs(s => s.workspacePath)
  const openFileChecked = useOpenFileChecked()
  const sidebarOpen = useWs(s => s.sidebarOpen)
  const active = useWs(s => s.activeFilePath)
  const { data: tree } = useTree(ws)
  const qc = useQueryClient()
  const deleteEntry = useDeleteEntry()
  const sidebarRef = useRef<HTMLElement>(null)
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
