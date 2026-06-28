import { useState } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCreateEntry, useDeleteEntry, useCopyEntry } from '@/queries/files'
import { NewEntryInput } from './NewEntryInput'
import { toast } from 'sonner'

type NodeLike = { path: string; name: string; isDirectory: boolean }

type NodeMenuProps = {
  node: NodeLike
  children: React.ReactNode
  onRename: () => void
  onNewFile: () => void
  onNewFolder: () => void
}

type EmptyMenuProps = {
  workspacePath: string
  children: React.ReactNode
}

/**
 * Context menu for a file-tree node (file or folder).
 * - File:   Copy File, Rename, Delete, Reveal
 * - Folder: New File, New Folder, Rename, Delete, Reveal
 *
 * New File / New Folder do NOT render an input here — they call
 * `onNewFile` / `onNewFolder` so the caller can place the inline input
 * at the correct position in the tree (as a child of the folder).
 */
export function FileTreeContextMenu({ node, children, onRename, onNewFile, onNewFolder }: NodeMenuProps) {
  const deleteEntry = useDeleteEntry()
  const copy = useCopyEntry()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function handleDelete() {
    setConfirmingDelete(true)
  }

  function confirmDelete() {
    setConfirmingDelete(false)
    deleteEntry.mutate(
      { filePath: node.path },
      { onError: (e: unknown) => toast.error(`Failed to delete: ${formatError(e)}`) },
    )
  }

  function handleCopy() {
    copy.mutate(
      { filePath: node.path },
      { onError: (e: unknown) => toast.error(`Failed to copy: ${formatError(e)}`) },
    )
  }

  function handleReveal() {
    window.api.files.reveal({ filePath: node.path })
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {node.isDirectory ? (
            <>
              <ContextMenuItem onClick={onNewFile}>New File</ContextMenuItem>
              <ContextMenuItem onClick={onNewFolder}>New Folder</ContextMenuItem>
              <ContextMenuSeparator />
            </>
          ) : (
            <ContextMenuItem onClick={handleCopy}>Copy File</ContextMenuItem>
          )}
          <ContextMenuItem onClick={onRename}>Rename</ContextMenuItem>
          <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
            Delete
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleReveal}>Reveal in Explorer</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {node.isDirectory ? 'folder' : 'file'}?</DialogTitle>
            <DialogDescription>
              {node.isDirectory
                ? `"${node.name}" and all of its contents will be permanently deleted. This cannot be undone.`
                : `"${node.name}" will be permanently deleted. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Context menu for empty areas of the sidebar (no node under the cursor).
 * Creates at the workspace root.
 *
 * When prompting, the input is rendered ABOVE the children (at root depth 0)
 * so the existing tree stays visible.
 */
export function EmptyAreaContextMenu({ workspacePath, children }: EmptyMenuProps) {
  const create = useCreateEntry()
  const [prompting, setPrompting] = useState<{ type: 'file' | 'folder' } | null>(null)

  function handleSubmit(value: string) {
    create.mutate(
      { workspacePath, relPath: value, content: '', isDirectory: prompting?.type === 'folder' },
      { onError: (e: unknown) => toast.error(`Failed to create: ${formatError(e)}`) },
    )
    setPrompting(null)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="min-h-full">
          {prompting ? (
            <NewEntryInput
              type={prompting.type}
              depth={0}
              onSubmit={handleSubmit}
              onCancel={() => setPrompting(null)}
            />
          ) : null}
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => setPrompting({ type: 'file' })}>New File</ContextMenuItem>
        <ContextMenuItem onClick={() => setPrompting({ type: 'folder' })}>New Folder</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function formatError(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
