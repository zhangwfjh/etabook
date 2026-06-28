/**
 * Keyboard shortcut configuration — shared across main / renderer / tests.
 *
 * Accelerators are strings in the same shape as Electron's `accelerator`
 * format: optional modifier prefixes (`CmdOrCtrl`, `Ctrl`, `Alt`, `Shift`)
 * joined with `+` to a terminal key. `CmdOrCtrl` matches either platform's
 * primary modifier and is the canonical form for cross-platform shortcuts.
 *
 * Examples: `CmdOrCtrl+B`, `CmdOrCtrl+Alt+H`, `CmdOrCtrl+Comma`
 */

/**
 * Canonical, stable action identifiers. These are persisted in `config.json`
 * under `AppConfig.shortcuts` and MUST NOT be renamed — new names break
 * existing user configs. Add new actions only by appending.
 */
export const SHORTCUT_ACTIONS = [
  'toggleSidebar',
  'openSettings',
  'toggleTimeline',
] as const

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number]

/**
 * Accelerator string per action. `undefined` → action is disabled.
 * Unknown / malformed entries are dropped on load (see `normalizeShortcuts`).
 */
export type ShortcutMap = Partial<Record<ShortcutAction, string>>

/** UI-facing labels, keyed by action id. */
export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  toggleSidebar: 'Toggle sidebar',
  openSettings: 'Open settings',
  toggleTimeline: 'Toggle timeline',
}
export const DEFAULT_SHORTCUTS: ShortcutMap = {
  toggleSidebar: 'CmdOrCtrl+B',
  openSettings: 'CmdOrCtrl+Comma',
  toggleTimeline: 'CmdOrCtrl+Alt+H',
}

// --- accelerator parsing -----------------------------------------------------

/** Canonical modifier names (post-normalization). `Option`/`Control`/etc. aliases normalize into these. */
const MODIFIER_SET = new Set(['CmdOrCtrl', 'Ctrl', 'Cmd', 'Alt', 'Shift'])

/**
 * Normalize a key token to its canonical accelerator spelling.
 * `CmdOrCtrl`, `Ctrl`, `Cmd`, `Alt`, `Shift` map to themselves; `Option`
 * aliases `Alt`. Bare letter/number keys are uppercased; punctuation names
 * like `Comma` are kept as-is. Returns `null` if the token is not recognized
 * and is not a single printing character.
 */
export function normalizeKey(token: string): string | null {
  const t = token.trim()
  if (t.length === 0) return null
  const lower = t.toLowerCase()
  switch (lower) {
    case 'cmdorctrl': return 'CmdOrCtrl'
    case 'ctrl':
    case 'control': return 'Ctrl'
    case 'cmd':
    case 'meta':
    case 'super':
    case 'command': return 'Cmd'
    case 'alt':
    case 'option':
    case 'opt': return 'Alt'
    case 'shift': return 'Shift'
    case 'comma': return 'Comma'
    case 'period': return 'Period'
    case 'slash': return 'Slash'
    case 'backslash': return 'Backslash'
    case 'minus': return 'Minus'
    case 'equal':
    case 'equals': return 'Equal'
    case 'up': return 'Up'
    case 'down': return 'Down'
    case 'left': return 'Left'
    case 'right': return 'Right'
    case 'enter':
    case 'return': return 'Enter'
    case 'escape':
    case 'esc': return 'Escape'
    case 'space': return 'Space'
    case 'tab': return 'Tab'
    case 'backspace': return 'Backspace'
    case 'delete':
    case 'del': return 'Delete'
  }
  // F-keys
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(t)) return t.toUpperCase()
  // Single character (letter, digit, or symbol) — uppercase letters.
  if (t.length === 1) return t.toUpperCase()
  return null
}

function parseModifiers(acc: string): { mods: Set<string>; terminal: string | null } {
  const parts = acc.split('+').map((s) => s.trim()).filter(Boolean)
  const mods = new Set<string>()
  let terminal: string | null = null
  for (const part of parts) {
    const norm = normalizeKey(part)
    if (norm && MODIFIER_SET.has(norm)) {
      mods.add(norm)
    } else if (norm !== null && terminal === null) {
      terminal = norm
    } else if (terminal !== null) {
      // More than one non-modifier token → malformed.
      return { mods: new Set(), terminal: null }
    } else {
      // Unknown token → malformed.
      return { mods: new Set(), terminal: null }
    }
  }
  return { mods, terminal }
}

/**
 * Canonicalize an accelerator string. Returns a normalized form or `null`
 * when the string is malformed (zero tokens, >1 terminal key, unknown token,
 * or no modifiers at all — bare keys are not accepted as shortcuts).
 *
 * `CmdOrCtrl` is preserved in the output; `Cmd`/`Control`/`Option` aliases
 * collapse to `CmdOrCtrl`/`Ctrl`/`Alt`.
 */
export function normalizeAccelerator(acc: string): string | null {
  if (typeof acc !== 'string') return null
  const { mods, terminal } = parseModifiers(acc)
  if (terminal === null || mods.size === 0) return null
  const order = ['CmdOrCtrl', 'Ctrl', 'Cmd', 'Alt', 'Shift']
  const sorted = order.filter((m) => mods.has(m))
  // CmdOrCtrl supersedes Ctrl/Cmd if both somehow present.
  const unique = sorted.includes('CmdOrCtrl')
    ? sorted.filter((m) => m !== 'Ctrl' && m !== 'Cmd')
    : sorted
  return [...unique, terminal].join('+')
}

/**
 * Validate and normalize a full shortcut map, dropping any action whose
 * accelerator is missing or malformed. Only known actions are retained.
 */
export function normalizeShortcuts(map: unknown): ShortcutMap {
  const out: ShortcutMap = {}
  if (!map || typeof map !== 'object') return out
  for (const action of SHORTCUT_ACTIONS) {
    const raw = (map as Record<string, unknown>)[action]
    if (typeof raw !== 'string') continue
    const norm = normalizeAccelerator(raw)
    if (norm) out[action] = norm
  }
  return out
}

/**
 * Merge a persisted shortcut map over the defaults: defaults provide the
 * baseline, persisted values override (and `undefined`/malformed entries are
 * dropped). Guarantees every default action is present unless explicitly
 * cleared.
 */
export function resolveShortcuts(persisted: unknown): ShortcutMap {
  const norm = normalizeShortcuts(persisted)
  return { ...DEFAULT_SHORTCUTS, ...norm }
}
