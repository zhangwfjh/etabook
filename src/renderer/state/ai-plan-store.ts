import { create } from 'zustand'

type PlanStreamState = {
  abortKey: string | null
  streaming: boolean
  error: string | null
  progress: Record<string, { partial: string; running: boolean }>
  startStream(abortKey: string): void
  endStream(): void
  setError(msg: string | null): void
  setProgress(id: string, partial: string, running: boolean): void
  clearProgress(id: string): void
}

export const useAIPlanStream = create<PlanStreamState>((set) => ({
  abortKey: null,
  streaming: false,
  error: null,
  progress: {},
  startStream: (abortKey) => set({ abortKey, streaming: true, error: null }),
  endStream: () => set({ abortKey: null, streaming: false }),
  setError: (msg) => set({ error: msg }),
  setProgress: (id, partial, running) =>
    set((s) => ({
      progress: { ...s.progress, [id]: { partial, running } },
    })),
  clearProgress: (id) =>
    set((s) => {
      const { [id]: _drop, ...rest } = s.progress
      return { progress: rest }
    }),
}))
