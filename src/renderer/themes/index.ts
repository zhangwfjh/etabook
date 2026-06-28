export type ThemeName = 'paper-light' | 'paper-dark'

export const THEME_ORDER: readonly ThemeName[] = ['paper-light', 'paper-dark'] as const

export const THEME_LABELS: Record<ThemeName, string> = {
  'paper-light': 'Warm Paper',
  'paper-dark': 'Warm Manuscript',
}

const STORAGE_KEY = 'etabook.theme'

export function applyTheme(name: ThemeName): void {
  document.documentElement.dataset.theme = name
  try { localStorage.setItem(STORAGE_KEY, name) } catch {}
}

export function loadInitialTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeName | null
    if (stored === 'paper-light' || stored === 'paper-dark') {
      return stored
    }
  } catch {}
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'paper-light' : 'paper-dark'
}
