import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SHORTCUTS,
  normalizeAccelerator,
  normalizeShortcuts,
  resolveShortcuts,
  SHORTCUT_ACTIONS,
  SHORTCUT_LABELS,
} from '../../src/shared/shortcuts'

describe('shortcuts', () => {
  describe('normalizeAccelerator', () => {
    it('canonicalizes modifier order and aliases', () => {
      expect(normalizeAccelerator('ctrl+b')).toBe('Ctrl+B')
      expect(normalizeAccelerator('cmdorctrl+b')).toBe('CmdOrCtrl+B')
      expect(normalizeAccelerator('Control+Comma')).toBe('Ctrl+Comma')
      expect(normalizeAccelerator('alt+shift+up')).toBe('Alt+Shift+Up')
      expect(normalizeAccelerator('Option+F5')).toBe('Alt+F5')
      expect(normalizeAccelerator('meta+k')).toBe('Cmd+K')
    })

    it('orders modifiers deterministically', () => {
      expect(normalizeAccelerator('shift+ctrl+alt+b')).toBe('Ctrl+Alt+Shift+B')
    })

    it('rejects accelerators without a modifier', () => {
      expect(normalizeAccelerator('B')).toBeNull()
      expect(normalizeAccelerator('Comma')).toBeNull()
    })

    it('rejects accelerators with more than one terminal key', () => {
      expect(normalizeAccelerator('Ctrl+B+C')).toBeNull()
    })

    it('rejects unknown tokens', () => {
      expect(normalizeAccelerator('Ctrl+Nope')).toBeNull()
      expect(normalizeAccelerator('')).toBeNull()
    })

    it('rejects non-string input', () => {
      expect(normalizeAccelerator(undefined as unknown as string)).toBeNull()
    })

    it('treats CmdOrCtrl as superseding explicit Ctrl/Cmd', () => {
      // CmdOrCtrl+Ctrl collapses to just CmdOrCtrl
      expect(normalizeAccelerator('CmdOrCtrl+Ctrl+B')).toBe('CmdOrCtrl+B')
    })
  })

  describe('normalizeShortcuts', () => {
    it('drops unknown actions and malformed accelerators', () => {
      const out = normalizeShortcuts({
        toggleSidebar: 'CmdOrCtrl+B',
        bogusAction: 'Ctrl+Z',
        openSettings: 'not a shortcut',
        cycleTheme: undefined,
      })
      expect(out.toggleSidebar).toBe('CmdOrCtrl+B')
      expect('bogusAction' in out).toBe(false)
      expect(out.openSettings).toBeUndefined()
    })

    it('returns an empty map for non-object input', () => {
      expect(normalizeShortcuts(null)).toEqual({})
      expect(normalizeShortcuts('CmdOrCtrl+B')).toEqual({})
    })
  })

  describe('resolveShortcuts', () => {
    it('fills defaults for missing actions', () => {
      const out = resolveShortcuts({ toggleSidebar: 'CmdOrCtrl+Shift+B' })
      expect(out.toggleSidebar).toBe('CmdOrCtrl+Shift+B')
      expect(out.openSettings).toBe(DEFAULT_SHORTCUTS.openSettings)
      expect(out.toggleTimeline).toBe(DEFAULT_SHORTCUTS.toggleTimeline)
    })

    it('drops malformed persisted entries, restoring the default', () => {
      const out = resolveShortcuts({ openSettings: 'Nope' })
      expect(out.openSettings).toBe(DEFAULT_SHORTCUTS.openSettings)
    })
  })

  describe('defaults', () => {
    it('every action has a label and a default accelerator', () => {
      for (const action of SHORTCUT_ACTIONS) {
        expect(DEFAULT_SHORTCUTS[action], `${action} default`).toBeTruthy()
      }
    })
  })
})

describe('shortcuts — tab & split actions', () => {
  it('includes the new tab/split actions', () => {
    for (const a of ['splitRight', 'splitDown', 'closeTab', 'nextTab', 'prevTab']) {
      expect(SHORTCUT_ACTIONS).toContain(a)
    }
  })

  it('defines a default accelerator and label for each new action', () => {
    for (const a of ['splitRight', 'splitDown', 'closeTab', 'nextTab', 'prevTab']) {
      expect(DEFAULT_SHORTCUTS[a as keyof typeof DEFAULT_SHORTCUTS]).toBeTruthy()
      expect(SHORTCUT_LABELS[a as keyof typeof SHORTCUT_LABELS]).toBeTruthy()
    }
  })
})
