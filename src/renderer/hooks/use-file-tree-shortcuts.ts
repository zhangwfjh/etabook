import { useEffect, type RefObject } from 'react'
import { useWorkspace } from '@/state/store'
import { usePasteEntry, useTrashEntry } from '@/queries/files'
import { toast } from 'sonner'
import type { TreeNode } from '../../shared/ipc'

/** Browser-safe dirname: strips the last segment for both `/` and `\` separators. */
function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  if (i <= 0) return p
  return p.slice(0, i)
}

type Props = {
  /** Ref to the sidebar <aside> element; shortcuts only fire when focus is inside it. */
  sidebarRef: RefObject<HTMLElement | null>
  /** Current tree root, used to resolve whether the selected node is a directory. */
  tree: TreeNode | null
  /** Request a delete-confirmation dialog for the given node (delegated to Sidebar UI). */
  onRequestDelete: (node: { path: string; name: string; isDirectory: boolean }) => void
}

function isEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}

/** Find a node by absolute path anywhere in the tree. */
function findNode(node: TreeNode, path: string): TreeNode | null {
  if (node.path === path) return node
  if (!node.children) return null
  for (const c of node.children) {
    const hit = findNode(c, path)
    if (hit) return hit
  }
  return null
}

/**
 * Sidebar-scoped file clipboard shortcuts: Copy (Ctrl/Cmd+C), Cut (Ctrl/Cmd+X),
 * Paste (Ctrl/Cmd+V), Delete (→ Recycle Bin, reversible), Shift+Delete (permanent,
 * with confirm). Bound ONLY while a tree row in the sidebar is focused, so editor
 * text operations are never hijacked.
 *
 * Copy keeps the clipboard (paste many times); Cut clears after a successful paste.
 */
export function useFileTreeShortcuts({ sidebarRef, tree, onRequestDelete }: Props) {
  const selectedPath = useWorkspace(s => s.selectedTreePath)
  const clipboard = useWorkspace(s => s.fileClipboard)
  const setFileClipboard = useWorkspace(s => s.setFileClipboard)
  const setSelectedTreePath = useWorkspace(s => s.setSelectedTreePath)
  const workspacePath = useWorkspace(s => s.workspacePath)
  const paste = usePasteEntry()
  const trash = useTrashEntry()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const root = sidebarRef.current
      // Only act when the sidebar itself holds focus (a tree row was clicked).
      if (!root || !root.contains(document.activeElement)) return
      // Never intercept text entry.
      if (isEditableTarget(e)) return

      const mod = e.ctrlKey || e.metaKey
      // Copy/Cut/Delete operate on the explicitly selected node only — never the
      // workspace-root fallback (which would target the entire workspace).
      const sel = selectedPath ?? workspacePath
      if (!sel) return

      // Copy / Cut — mark the selected node (must be an explicit selection).
      if (mod && !e.shiftKey && !e.altKey && (e.key === 'c' || e.key === 'C')) {
        if (!selectedPath || selectedPath === workspacePath) return
        e.preventDefault()
        setFileClipboard({ path: selectedPath, mode: 'copy' })
        return
      }
      if (mod && !e.shiftKey && !e.altKey && (e.key === 'x' || e.key === 'X')) {
        if (!selectedPath || selectedPath === workspacePath) return
        e.preventDefault()
        setFileClipboard({ path: selectedPath, mode: 'cut' })
        return
      }

      // Paste — needs a clipboard entry.
      if (mod && !e.shiftKey && !e.altKey && (e.key === 'v' || e.key === 'V')) {
        if (!clipboard) return
        e.preventDefault()
        // Resolve destination directory: selected dir, or parent of selected file,
        // or workspace root.
        const node = tree ? findNode(tree, sel) : null
        const destDir = node?.isDirectory ? sel : (sel === workspacePath ? sel : dirname(sel))
        paste.mutate(
          { srcPath: clipboard.path, destDir, mode: clipboard.mode },
          {
          onSuccess: (res) => {
            if (!res) return
            // Cut clears the clipboard and re-points selection to the new path.
            if (clipboard.mode === 'cut') setFileClipboard(null)
            setSelectedTreePath(res.filePath)
            toast.success('Pasted')
          },
            onError: (err: unknown) => toast.error(`Paste failed: ${err instanceof Error ? err.message : String(err)}`),
          },
        )
        return
      }

      // Delete → Recycle Bin (reversible, no confirm). Shift+Delete → permanent.
      if (!mod && e.key === 'Delete') {
        // Only the explicitly selected node (not the workspace root fallback).
        if (!selectedPath || selectedPath === workspacePath) return
        e.preventDefault()
        if (e.shiftKey) {
          // Permanent — route through a confirm dialog (delegated to Sidebar).
          const node = tree ? findNode(tree, selectedPath) : null
          const name = node?.name ?? selectedPath.split(/[\\/]/).pop() ?? selectedPath
          onRequestDelete({ path: selectedPath, name, isDirectory: !!node?.isDirectory })
        } else {
          // Recycle Bin — reversible, do it immediately and toast.
          trash.mutate(
            { filePath: selectedPath },
            {
              onSuccess: () => {
                const ws = useWorkspace.getState()
                if (ws.selectedTreePath === selectedPath) ws.setSelectedTreePath(null)
                if (ws.fileClipboard?.path === selectedPath) ws.setFileClipboard(null)
                toast.success('Moved to Recycle Bin')
              },
              onError: (err: unknown) => toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`),
            },
          )
        }
        return
      }
    }

    window.addEventListener('keydown', onKey)
  }, [sidebarRef, selectedPath, clipboard, workspacePath, tree, setFileClipboard, setSelectedTreePath, paste, trash, onRequestDelete])
}
