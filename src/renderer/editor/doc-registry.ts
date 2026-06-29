import type { Editor as TiptapEditor } from '@tiptap/react'

/**
 * Non-reactive registries keyed by absolute file path. Each open DocSession
 * registers its TipTap editor and persist closure on mount and clears them on
 * unmount. The active EditorGroupPane reads these to route store-level
 * imperatives (persistToDisk, toggleEditorMode, CommandBar's editor) to the
 * active doc without forcing a re-render on every editor transaction.
 */
export const editorRegistry = new Map<string, TiptapEditor>()
export const persistRegistry = new Map<string, () => Promise<void>>()

// Subscribers notified whenever an editor is registered or unregistered.
// Shell components (TitleBar, StatusBar) need this because their effects run
// on `active` change — which fires BEFORE the new DocSession has registered
// its editor (registration happens after handleReady). Without this, they'd
 // bind a transaction listener to null once and never rebind.
const editorListeners = new Set<() => void>()

function notifyEditorListeners(): void {
  for (const fn of editorListeners) fn()
}

/**
 * Subscribe to editor registration changes. Returns an unsubscribe fn.
 * Use alongside getEditor() to bind/unbind editor-scoped listeners when the
 * active editor appears or disappears asynchronously.
 */
export function subscribeEditors(fn: () => void): () => void {
  editorListeners.add(fn)
  return () => { editorListeners.delete(fn) }
}

/** Register an editor for `path` and notify subscribers. */
export function registerEditor(path: string, editor: TiptapEditor): void {
  editorRegistry.set(path, editor)
  notifyEditorListeners()
}

/** Unregister the editor for `path` (if present) and notify subscribers. */
export function unregisterEditor(path: string): void {
  if (editorRegistry.delete(path)) notifyEditorListeners()
}

export function getEditor(path: string | null): TiptapEditor | null {
  return path ? (editorRegistry.get(path) ?? null) : null
}

export function getPersist(path: string | null): (() => Promise<void>) | null {
  return path ? (persistRegistry.get(path) ?? null) : null
}
