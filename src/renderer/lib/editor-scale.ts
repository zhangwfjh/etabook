import { DEFAULT_CONFIG } from '../../shared/ipc'

const STORAGE_KEY = 'etabook.editorScale'
export const EDITOR_SCALE_MIN = 0.8
export const EDITOR_SCALE_MAX = 1.6

function clamp(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_CONFIG.editorScale
  return Math.min(EDITOR_SCALE_MAX, Math.max(EDITOR_SCALE_MIN, Math.round(v * 100) / 100))
}

/** Apply the editor content scale to the document root and persist it. */
export function applyEditorScale(v: number): void {
  const clamped = clamp(v)
  document.documentElement.style.setProperty('--editor-scale', String(clamped))
  try { localStorage.setItem(STORAGE_KEY, String(clamped)) } catch {}
}

/** Current applied scale (from the document root CSS var, falling back to default). */
export function currentEditorScale(): number {
  const raw = document.documentElement.style.getPropertyValue('--editor-scale')
  const v = parseFloat(raw)
  return Number.isFinite(v) ? clamp(v) : DEFAULT_CONFIG.editorScale
}

/** Add `delta` to the current scale, clamp to the supported range, apply and persist. */
export function bumpEditorScale(delta: number): number {
  const next = clamp(currentEditorScale() + delta)
  document.documentElement.style.setProperty('--editor-scale', String(next))
  try { localStorage.setItem(STORAGE_KEY, String(next)) } catch {}
  return next
}

/** Reset to the default scale. */
export function resetEditorScale(): void {
  applyEditorScale(DEFAULT_CONFIG.editorScale)
}

/** Read the persisted scale for pre-paint application. Returns the default if unset/invalid. */
export function loadInitialEditorScale(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw !== null) {
      const v = parseFloat(raw)
      if (Number.isFinite(v) && v >= EDITOR_SCALE_MIN && v <= EDITOR_SCALE_MAX) return v
    }
  } catch {}
  return DEFAULT_CONFIG.editorScale
}
