import { useEffect } from 'react'
import { useWorkspace, type UnsavedPrompt } from '@/state/store'
import { UnsavedChangesDialog } from '@/components/editor/UnsavedChangesDialog'
import { getPersist } from '@/editor/doc-registry'

/** Extract the doc paths in scope for a given prompt (via kind discrimination). */
function docPathsOf(p: UnsavedPrompt): string[] {
  switch (p.kind) {
    case 'switch':
    case 'closeTab':
      return [p.docPath]
    case 'closeGroup':
    case 'window':
      return p.docPaths
  }
}

export function UnsavedChangesController() {
  const prompt = useWorkspace((s) => s.unsavedPrompt)
  const setPrompt = useWorkspace((s) => s.setUnsavedPrompt)
  const openFile = useWorkspace((s) => s.openFile)
  const closeTab = useWorkspace((s) => s.closeTab)
  const setDocDirty = useWorkspace((s) => s.setDocDirty)

  const docPaths: string[] = prompt ? docPathsOf(prompt) : []
  const fileNames = docPaths

  // Auto-dismiss + complete if none of the relevant docs are still dirty
  // (e.g. saved via Ctrl+S in the editor while the prompt was open).
  useEffect(() => {
    if (!prompt) return
    const stillDirty = docPaths.some((p) => useWorkspace.getState().docStates[p]?.dirty)
    if (!stillDirty) {
      completePending()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- docPaths derives from prompt
  }, [prompt])

  if (!prompt) return null

  function completePending() {
    const p = useWorkspace.getState().unsavedPrompt
    setPrompt(null)
    if (!p) return
    switch (p.kind) {
      case 'switch':
        openFile(p.docPath)
        return
      case 'closeTab': {
        // Find the doc's current group (it may have moved) and close it there.
        const s = useWorkspace.getState()
        const g = s.groups.find((x) => x.docs.includes(p.docPath))
        if (g) closeTab(g.id, p.docPath)
        return
      }
      case 'closeGroup': {
        // Close each still-open dirty doc wherever it currently lives.
        for (const d of p.docPaths) {
          const s = useWorkspace.getState()
          const g = s.groups.find((x) => x.docs.includes(d))
          if (g) closeTab(g.id, d)
        }
        return
      }
      case 'window':
        window.api.window.forceClose()
        return
    }
  }

  async function handleSave() {
    try {
      // Persist each dirty doc in scope sequentially.
      for (const d of docPaths) {
        const persist = getPersist(d)
        if (persist) await persist()
      }
      completePending()
    } catch {
      // persist already toasts on error; keep the prompt open for retry.
    }
  }

  function handleDiscard() {
    for (const d of docPaths) setDocDirty(d, false)
    completePending()
  }

  function handleCancel() {
    setPrompt(null)
  }

  return (
    <UnsavedChangesDialog
      open={!!prompt}
      fileNames={fileNames}
      onOpenChange={(v) => { if (!v) handleCancel() }}
      onSave={handleSave}
      onDiscard={handleDiscard}
      onCancel={handleCancel}
    />
  )
}
