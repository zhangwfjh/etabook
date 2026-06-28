import { useEffect } from 'react'
import { useWorkspace } from '@/state/store'

/**
 * Returns a callback to open a file, gating on unsaved edits. If the current
 * file is dirty, it raises the unsaved-changes prompt instead of switching
 * immediately; the actual switch happens once the user resolves the prompt
 * (see UnsavedChangesController).
 *
 * When not dirty (or no file active), it switches immediately.
 */
export function useOpenFileChecked() {
  return (targetFile: string) => {
    const s = useWorkspace.getState()
    if (s.activeFilePath === targetFile) return
    if (s.dirty && s.activeFilePath) {
      const name = s.activeFilePath.split(/[\\/]/).pop() ?? s.activeFilePath
      s.setUnsavedPrompt({ kind: 'switch', fileName: name, targetFile })
    } else {
      s.setActiveFile(targetFile)
    }
  }
}

/**
 * Subscribes to OS-level close requests (titlebar button, Alt+F4, taskbar)
 * and routes them through the unsaved-changes guard. The main process
 * intercepts the native close and broadcasts window:onCloseRequested instead
 * of destroying the window; this hook translates that event into either a
 * prompt (if dirty) or an immediate forceClose.
 *
 * Must be mounted once for the lifetime of the app (App root).
 */
export function useCloseRequestGuard() {
  useEffect(() => {
    return window.api.window.onCloseRequested(() => {
      const s = useWorkspace.getState()
      if (s.dirty && s.activeFilePath) {
        const name = s.activeFilePath.split(/[\\/]/).pop() ?? s.activeFilePath
        s.setUnsavedPrompt({ kind: 'window', fileName: name, targetFile: null })
      } else {
        window.api.window.forceClose()
      }
    })
  }, [])
}
