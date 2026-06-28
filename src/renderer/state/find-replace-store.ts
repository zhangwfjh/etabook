import { create } from 'zustand'

type FindReplaceUiState = {
  open: boolean
  query: string
  replacement: string
  caseSensitive: boolean
  wholeWord: boolean
  openPanel: () => void
  closePanel: () => void
  setQuery: (query: string) => void
  setReplacement: (replacement: string) => void
  setCaseSensitive: (caseSensitive: boolean) => void
  setWholeWord: (wholeWord: boolean) => void
}

/**
 * Session-only UI state for the find/replace panel. Persists the query,
 * replacement, and match options across open/close so the user doesn't lose
 * their search when the panel unmounts. NOT persisted to disk.
 */
export const useFindReplace = create<FindReplaceUiState>((set) => ({
  open: false,
  query: '',
  replacement: '',
  caseSensitive: false,
  wholeWord: false,
  openPanel: () => set({ open: true }),
  closePanel: () => set({ open: false }),
  setQuery: (query) => set({ query }),
  setReplacement: (replacement) => set({ replacement }),
  setCaseSensitive: (caseSensitive) => set({ caseSensitive }),
  setWholeWord: (wholeWord) => set({ wholeWord }),
}))
