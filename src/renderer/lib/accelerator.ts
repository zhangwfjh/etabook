import { normalizeAccelerator } from '../../shared/ipc'

/**
 * Renderer-side accelerator matching against DOM `KeyboardEvent`s.
 *
 * An accelerator matches when its modifier set exactly equals the event's
 * pressed modifiers and its terminal key matches. `CmdOrCtrl` matches either
 * `Ctrl` or `Meta` (exclusive: exactly one of them must be pressed).
 *
 * Accelerators come from user config; `normalizeAccelerator` rejects
 * malformed ones so a bad persisted value simply never matches.
 */

/** Canonicalize a `KeyboardEvent.key` for comparison with an accelerator token. */
function eventKeyToken(e: KeyboardEvent): string | null {
  const k = e.key
  if (k.length === 1) return k.toUpperCase()
  switch (k) {
    case ',': return 'Comma'
    case '.': return 'Period'
    case '/': return 'Slash'
    case '\\': return 'Backslash'
    case '-': return 'Minus'
    case '=': return 'Equal'
    case 'ArrowUp': return 'Up'
    case 'ArrowDown': return 'Down'
    case 'ArrowLeft': return 'Left'
    case 'ArrowRight': return 'Right'
    case 'Enter': return 'Enter'
    case 'Escape': return 'Escape'
    case ' ': return 'Space'
    case 'Tab': return 'Tab'
    case 'Backspace': return 'Backspace'
    case 'Delete': return 'Delete'
  }
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(k)) return k.toUpperCase()
  return null
}

/**
 * Does the accelerator string match the given `KeyboardEvent`?
 * Returns `false` for malformed accelerators.
 */
export function matchesAccelerator(acc: string, e: KeyboardEvent): boolean {
  const norm = normalizeAccelerator(acc)
  if (!norm) return false
  const parts = norm.split('+')
  const terminal = parts[parts.length - 1]!

  const hasCmdOrCtrl = parts.includes('CmdOrCtrl')
  // Required precise modifiers (excluding CmdOrCtrl, handled separately).
  const wantCtrl = parts.includes('Ctrl')
  const wantCmd = parts.includes('Cmd')
  const wantAlt = parts.includes('Alt')
  const wantShift = parts.includes('Shift')

  const ctrl = e.ctrlKey
  const cmd = e.metaKey

  // Resolve CmdOrCtrl: exactly one of Ctrl/Meta must satisfy it.
  if (hasCmdOrCtrl) {
    if (!(ctrl || cmd)) return false
    // If both Ctrl and Cmd are down but CmdOrCtrl only consumes one, the
    // leftover still counts as a stray modifier → no match.
  } else {
    if (ctrl !== wantCtrl) return false
    if (cmd !== wantCmd) return false
  }

  if (e.altKey !== wantAlt) return false
  if (e.shiftKey !== wantShift) return false

  const token = eventKeyToken(e)
  return token !== null && token === terminal
}
