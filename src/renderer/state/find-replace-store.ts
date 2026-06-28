import { create } from 'zustand'

type FindReplaceUiState = {
  open: boolean
  openPanel: () => void
  closePanel: () => void
}

export const useFindReplace = create<FindReplaceUiState>((set) => ({
  open: false,
  openPanel: () => set({ open: true }),
  closePanel: () => set({ open: false }),
}))
