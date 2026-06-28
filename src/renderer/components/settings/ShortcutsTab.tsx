import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import {
  DEFAULT_CONFIG,
  DEFAULT_SHORTCUTS,
  SHORTCUT_ACTIONS,
  SHORTCUT_LABELS,
  normalizeAccelerator,
  type AppConfig,
  type ShortcutAction,
} from '../../../shared/ipc'
import { useSettings, useUpdateSettings } from '@/queries/settings'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
/**
 * Settings tab for viewing and rebinding keyboard shortcuts.
 *
 * Rebinding is done by clicking a row's "Record" control and pressing a new
 * key combination; the first well-formed accelerator captured wins. Esc
 * cancels recording. Malformed combinations (e.g. a bare key with no
 * modifier) are rejected inline. Conflicts with other actions are rejected
 * with a visible error.
 */
export function ShortcutsTab() {
  const { data: settings } = useSettings()
  const update = useUpdateSettings()
  const [recording, setRecording] = useState<ShortcutAction | null>(null)
  const [error, setError] = useState<string | null>(null)

  const shortcuts = settings?.shortcuts ?? DEFAULT_CONFIG.shortcuts

  /** Accelerator → action lookup for conflict detection. */
  const usedBy: Record<string, ShortcutAction> = {}
  for (const a of SHORTCUT_ACTIONS) {
    const acc = shortcuts[a]
    if (acc) usedBy[acc] = a
  }

  function commit(next: AppConfig['shortcuts']) {
    update.mutate({ shortcuts: next })
  }

  function rebind(action: ShortcutAction, acc: string | null) {
    const norm = acc ? normalizeAccelerator(acc) : null
    if (acc && !norm) {
      setError(`“${acc}” isn't a valid shortcut — use a modifier plus a key.`)
      return
    }
    if (norm && usedBy[norm] && usedBy[norm] !== action) {
      setError(`Already used by “${SHORTCUT_LABELS[usedBy[norm]]}”.`)
      return
    }
    setError(null)
    const next = { ...shortcuts }
    if (norm) next[action] = norm
    else delete next[action]
    commit(next)
  }

  // Capture keys while recording.
  useEffect(() => {
    if (!recording) return
    const action = recording
    function onKey(e: KeyboardEvent) {
      e.preventDefault()
      e.stopPropagation()
      // Escape cancels recording.
      if (e.key === 'Escape') {
        setRecording(null)
        return
      }
      // Ignore bare modifier presses — wait for a terminal key.
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
      const candidate = acceleratorFromEvent(e)
      if (!candidate) {
        setError('Use a modifier (Ctrl/Cmd/Alt/Shift) plus a key.')
        return
      }
      rebind(action, candidate)
      setRecording(null)
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, shortcuts])

  function resetOne(action: ShortcutAction) {
    setError(null)
    const next = { ...shortcuts }
    const def = DEFAULT_SHORTCUTS[action]
    if (def) next[action] = def
    else delete next[action]
    commit(next)
  }

  function resetAll() {
    setError(null)
    commit({ ...DEFAULT_SHORTCUTS })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Keyboard shortcuts</Label>
        <Button variant="ghost" size="xs" onClick={resetAll}>
          <RotateCcw className="size-3" />
          Reset all
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="space-y-1">
        {SHORTCUT_ACTIONS.map((action) => {
          const acc = shortcuts[action]
          const isRecording = recording === action
          return (
            <div
              key={action}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent/30"
            >
              <span className="text-sm text-fg-primary">
                {SHORTCUT_LABELS[action]}
              </span>
              <div className="flex items-center gap-2">
                {acc ? (
                  <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                    {acc}
                  </kbd>
                ) : (
                  <span className="text-xs text-muted-foreground">Disabled</span>
                )}
                <Button
                  variant={isRecording ? 'default' : 'outline'}
                  size="xs"
                  onClick={() => {
                    setError(null)
                    setRecording(isRecording ? null : action)
                  }}
                >
                  {isRecording ? 'Press keys…' : 'Rebind'}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Reset to default"
                  onClick={() => resetOne(action)}
                >
                  <RotateCcw className="size-3" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Click <em>Rebind</em>, then press a modifier plus a key. Press <kbd className="font-mono">Esc</kbd> to cancel.
        A shortcut without a modifier is rejected.
      </p>
    </div>
  )
}

/** Build an accelerator string from the modifier state + key of a `KeyboardEvent`. */
function acceleratorFromEvent(e: KeyboardEvent): string | null {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.metaKey) parts.push('Cmd')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  // Normalize the terminal token via the same grammar the matcher uses.
  const token = keyToToken(e.key)
  if (!token) return null
  parts.push(token)
  // Require at least one modifier for a valid shortcut.
  if (parts.length < 2) return null
  // Coalesce Ctrl+Cmd to CmdOrCtrl when both are present (cross-platform form).
  const hasCtrl = parts.includes('Ctrl')
  const hasCmd = parts.includes('Cmd')
  let mods = parts.slice(0, -1)
  if (hasCtrl && hasCmd) mods = ['CmdOrCtrl', ...mods.filter((m) => m !== 'Ctrl' && m !== 'Cmd')]
  else if (hasCtrl && !hasCmd) mods = ['CmdOrCtrl'] // Ctrl alone → CmdOrCtrl (platform primary).
  return normalizeAccelerator([...mods, token].join('+'))
}

function keyToToken(k: string): string | null {
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
