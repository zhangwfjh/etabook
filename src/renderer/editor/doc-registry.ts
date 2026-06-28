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

export function getEditor(path: string | null): TiptapEditor | null {
  return path ? (editorRegistry.get(path) ?? null) : null
}

export function getPersist(path: string | null): (() => Promise<void>) | null {
  return path ? (persistRegistry.get(path) ?? null) : null
}
