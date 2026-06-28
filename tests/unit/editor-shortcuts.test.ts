import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_ACTIONS,
  SHORTCUT_LABELS,
  resolveShortcuts,
} from '../../src/shared/shortcuts'

describe('editor feature shortcuts', () => {
  const editorActions = [
    'find',
    'replace',
    'undo',
    'redo',
    'duplicateLine',
    'moveLineUp',
    'moveLineDown',
    'selectNextOccurrence',
    'skipOccurrence',
    'selectAllOccurrences',
    'addCursorAbove',
    'addCursorBelow',
    'goToLine',
  ]

  it('every editor action is registered', () => {
    for (const action of editorActions) {
      expect(SHORTCUT_ACTIONS, `missing action: ${action}`).toContain(action)
    }
  })

  it('every editor action has a label', () => {
    for (const action of editorActions) {
      expect(SHORTCUT_LABELS[action as keyof typeof SHORTCUT_LABELS], `missing label: ${action}`).toBeTruthy()
    }
  })

  it('every editor action has a default accelerator', () => {
    for (const action of editorActions) {
      expect(DEFAULT_SHORTCUTS[action as keyof typeof DEFAULT_SHORTCUTS], `missing default: ${action}`).toBeTruthy()
    }
  })

  it('resolveShortcuts fills in defaults for editor actions', () => {
    const resolved = resolveShortcuts({})
    for (const action of editorActions) {
      expect(resolved[action as keyof typeof resolved], `unresolved: ${action}`).toBeTruthy()
    }
  })

  it('editor action defaults do not collide with existing closeTab (CmdOrCtrl+W)', () => {
    const closeTabAccel = DEFAULT_SHORTCUTS.closeTab
    const editorAccels = editorActions.map((a) => DEFAULT_SHORTCUTS[a as keyof typeof DEFAULT_SHORTCUTS])
    expect(editorAccels, 'no editor default may be CmdOrCtrl+W').not.toContain(closeTabAccel)
  })
})
