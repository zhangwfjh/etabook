import type { EditorAPI } from '@shared/types'

// The preload exposes `window.api` via contextBridge. Augment the global here
// so renderer code gets the typed surface without importing electron.
declare global {
  interface Window {
    api: EditorAPI
  }
}

export function api(): EditorAPI {
  return window.api
}
