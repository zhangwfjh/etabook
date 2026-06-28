import { useWorkspace } from '@/state/store'
import { useSettings, useUpdateSettings } from '@/queries/settings'
import { DEFAULT_CONFIG } from '../../../shared/ipc'
import { EDITOR_SCALE_MAX, EDITOR_SCALE_MIN } from '@/lib/editor-scale'
import { applyTheme, THEME_LABELS, THEME_ORDER, type ThemeName } from '@/themes'

const SCALE_STEP = 0.1
function roundScale(v: number): number {
  return Math.min(EDITOR_SCALE_MAX, Math.max(EDITOR_SCALE_MIN, Math.round(v * 100) / 100))
}

export function StatusBar() {
  const ws = useWorkspace(s => s.workspacePath)
  const dirty = useWorkspace(s => s.dirty)
  const { data: cfg } = useSettings()
  const update = useUpdateSettings()
  const scale = cfg?.editorScale ?? DEFAULT_CONFIG.editorScale
  const canZoomOut = scale > EDITOR_SCALE_MIN
  const canZoomIn = scale < EDITOR_SCALE_MAX
  const currentTheme = (cfg?.theme ?? DEFAULT_CONFIG.theme) as ThemeName
  const cycleTheme = () => {
    const idx = THEME_ORDER.indexOf(currentTheme)
    const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length]
    applyTheme(next)
    update.mutate({ theme: next })
  }

  return (
    <footer className="h-6 flex items-center gap-3 px-2 text-[11px] text-fg-subtle border-t border-border bg-bg-elevated">
      <span>{ws ?? 'No workspace'}</span>
      <span className="ml-auto">{dirty ? '● unsaved' : '✓ saved'}</span>
      {cfg ? (
        <span
          role="button"
          tabIndex={0}
          onClick={cycleTheme}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycleTheme() } }}
          title={`Switch theme (current: ${THEME_LABELS[currentTheme]})`}
          className="cursor-pointer hover:text-fg-primary"
        >
          theme: {THEME_LABELS[currentTheme]}
        </span>
      ) : null}
      <div className="flex items-center gap-1" title="Editor text scale (Ctrl+scroll / Ctrl+/-)">
        <button
          type="button"
          disabled={!canZoomOut}
          onClick={() => update.mutate({ editorScale: roundScale(scale - SCALE_STEP) })}
          className="px-1 leading-none rounded hover:bg-bg-subtle disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="tabular-nums w-9 text-center">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          disabled={!canZoomIn}
          onClick={() => update.mutate({ editorScale: roundScale(scale + SCALE_STEP) })}
          className="px-1 leading-none rounded hover:bg-bg-subtle disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
    </footer>
  )
}
