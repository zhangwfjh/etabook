import { useEffect } from 'react'
import { useWorkspace } from '@/state/store'

/**
 * Returns a callback to open a file, gating on the CURRENT active doc's dirty
 * state. If the active doc is dirty, raises the unsaved prompt instead; the
 * actual open happens once the user resolves the prompt (UnsavedChangesController).
 */
export function useOpenFileChecked() {
  return (targetFile: string) => {
    const s = useWorkspace.getState()
    if (s.activeFilePath === targetFile) return
    const activeDoc = s.activeFilePath
    if (activeDoc && (s.docStates[activeDoc]?.dirty ?? false)) {
      s.setUnsavedPrompt({ kind: 'switch', docPath: targetFile })
    } else {
      s.openFile(targetFile)
    }
  }
}

/** Close a tab, prompting if that specific doc is dirty. */
export function useCloseTabChecked() {
  return (groupId: string, path: string) => {
    const s = useWorkspace.getState()
    if (s.docStates[path]?.dirty) {
      s.setUnsavedPrompt({ kind: 'closeTab', docPath: path })
    } else {
      s.closeTab(groupId, path)
    }
  }
}

/** Close a whole group, prompting if any of its docs are dirty. */
export function useCloseGroupChecked() {
  return (groupId: string) => {
    const s = useWorkspace.getState()
    const g = s.groups.find((x) => x.id === groupId)
    if (!g) return
    const dirtyDocs = g.docs.filter((p) => s.docStates[p]?.dirty)
    if (dirtyDocs.length > 0) {
      s.setUnsavedPrompt({ kind: 'closeGroup', docPaths: dirtyDocs })
    } else {
      s.closeGroup(groupId)
    }
  }
}

/**
 * OS close request → gather every dirty doc across all groups. Prompt if any,
 * else forceClose. Fixes a latent bug in the old single-doc design where a
 * dirty background doc would be silently lost on close.
 */
export function useCloseRequestGuard() {
  useEffect(() => {
    return window.api.window.onCloseRequested(() => {
      const s = useWorkspace.getState()
      const dirtyDocs = s.groups.flatMap((g) => g.docs).filter((p) => s.docStates[p]?.dirty)
      if (dirtyDocs.length > 0) {
        s.setUnsavedPrompt({ kind: 'window', docPaths: dirtyDocs })
      } else {
        window.api.window.forceClose()
      }
    })
  }, [])
}
