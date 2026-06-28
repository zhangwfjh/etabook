import { create } from 'zustand'

type GoToLineState = {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useGoToLine = create<GoToLineState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
