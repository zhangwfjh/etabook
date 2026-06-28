import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { keys } from '@/queries/keys'
import {
  bumpEditorScale,
  resetEditorScale,
  currentEditorScale,
} from '@/lib/editor-scale'

const STEP = 0.1
const WHEEL_STEP = 0.05

/**
 * Global editor-scale inputs:
 *  - Ctrl + scroll up/down  → zoom in/out (5% per notch)
 *  - Ctrl + '+' / '='       → zoom in (10%)
 *  - Ctrl + '-'             → zoom out (10%)
 *  - Ctrl + 0               → reset to 100%
 *
 * Bound to window so they work anywhere in the app; scales only the editor
 * content surface, not chrome. Honors the 0.8–1.6 range from editor-scale lib.
 */
export function useEditorScaleInput() {
  const qc = useQueryClient()

  useEffect(() => {
    function persist(next: number, prev: number) {
      if (next === prev) return
      window.api.settings.set({ editorScale: next })
      qc.setQueryData(keys.settings, (old: unknown) =>
        old ? { ...(old as object), editorScale: next } : old,
      )
    }

    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const prev = currentEditorScale()
      const next = bumpEditorScale(e.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP)
      persist(next, prev)
    }

    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (!mod || e.altKey || e.shiftKey) return
      const key = e.key
      if (key === '+' || key === '=') {
        e.preventDefault()
        const prev = currentEditorScale()
        persist(bumpEditorScale(STEP), prev)
      } else if (key === '-' || key === '_') {
        e.preventDefault()
        const prev = currentEditorScale()
        persist(bumpEditorScale(-STEP), prev)
      } else if (key === '0') {
        e.preventDefault()
        const prev = currentEditorScale()
        resetEditorScale()
        persist(currentEditorScale(), prev)
      }
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
    }
  }, [qc])
}
