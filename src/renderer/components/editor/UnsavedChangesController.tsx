import { useEffect } from 'react'
import { useWorkspace } from '@/state/store'
import { UnsavedChangesDialog } from '@/components/editor/UnsavedChangesDialog'
import { toast } from 'sonner'

/**
 * Renders the unsaved-changes modal and resolves it by driving the store's
 * `persistToDisk` (registered by EditorPane) for Save, discarding for Don't
 * save, and clearing the prompt for Cancel. After Save/Discard the pending
 * close action (file switch or window close) is completed.
 *
 * Mounted once at the App root so both file-switch and window-close paths
 * share a single resolution flow.
 */
export function UnsavedChangesController() {
  const prompt = useWorkspace((s) => s.unsavedPrompt)
  const setPrompt = useWorkspace((s) => s.setUnsavedPrompt)
  const setActiveFile = useWorkspace((s) => s.setActiveFile)

  // Auto-dismiss if the file is no longer dirty (e.g. saved elsewhere).
  useEffect(() => {
    if (prompt && !useWorkspace.getState().dirty) setPrompt(null)
  }, [prompt, setPrompt])

  if (!prompt) return null

  function completePending() {
    const p = useWorkspace.getState().unsavedPrompt
    setPrompt(null)
    if (!p) return
    if (p.kind === 'switch' && p.targetFile) {
      setActiveFile(p.targetFile)
    } else if (p.kind === 'window') {
      // forceClose bypasses the main-process close interceptor (which would
      // re-broadcast onCloseRequested and re-prompt). close()/Alt+F4 already
      // fed through the guard; this completes the user's decision.
      window.api.window.forceClose()
    }
  }

  async function handleSave() {
    const persist = useWorkspace.getState().persistToDisk
    if (!persist) {
      toast.error('Save is not ready yet.')
      return
    }
    try {
      await persist()
      completePending()
    } catch {
      // persist already toasts on error; keep the prompt open so the user can retry.
    }
  }

  function handleDiscard() {
    // Drop unsaved edits: clear dirty and let the switch/close proceed.
    useWorkspace.getState().setDirty(false)
    completePending()
  }

  function handleCancel() {
    setPrompt(null)
  }

  return (
    <UnsavedChangesDialog
      open={!!prompt}
      fileName={prompt.fileName}
      onOpenChange={(v) => { if (!v) handleCancel() }}
      onSave={handleSave}
      onDiscard={handleDiscard}
      onCancel={handleCancel}
    />
  )
}
