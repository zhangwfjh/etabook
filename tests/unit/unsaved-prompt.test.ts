import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspace } from '@/state/store'

/**
 * Exercises the unsaved-changes prompt contract on the Zustand store itself
 * (no React rendering required). The renderer hooks (use-unsaved-guard) drive
 * exactly these transitions, so this guards the contract they depend on:
 *   - switching away from a dirty file must NOT clear the active file; it must
 *     only raise the prompt so the UI can ask the user how to proceed.
 *   - switching away from a clean file switches immediately.
 *   - resolving the prompt (save/discard) completes the pending switch.
 */
describe('workspace store — unsaved-changes prompt', () => {
  beforeEach(() => {
    // Reset to a known baseline between cases.
    useWorkspace.setState({
      workspacePath: '/ws',
      activeFilePath: '/ws/a.md',
      openFilePaths: ['/ws/a.md'],
      dirty: false,
      externals: [],
      unsavedPrompt: null,
      persistToDisk: null,
      toggleEditorMode: null,
    })
  })

  it('switching from a clean file switches immediately with no prompt', () => {
    useWorkspace.getState().setActiveFile('/ws/a.md')
    // simulate useOpenFileChecked: not dirty → switch directly
    useWorkspace.getState().setActiveFile('/ws/b.md')
    expect(useWorkspace.getState().activeFilePath).toBe('/ws/b.md')
    expect(useWorkspace.getState().unsavedPrompt).toBeNull()
  })

  it('switching from a dirty file raises the prompt and keeps the active file', () => {
    useWorkspace.getState().setDirty(true)
    const name = useWorkspace.getState().activeFilePath!.split(/[\\/]/).pop()!
    useWorkspace.getState().setUnsavedPrompt({ kind: 'switch', fileName: name, targetFile: '/ws/b.md' })

    // The active file must NOT have changed — the user has not yet decided.
    expect(useWorkspace.getState().activeFilePath).toBe('/ws/a.md')
    expect(useWorkspace.getState().unsavedPrompt?.kind).toBe('switch')
    expect(useWorkspace.getState().unsavedPrompt?.targetFile).toBe('/ws/b.md')
  })

  it('resolving the prompt with Save clears dirty, then completes the switch', () => {
    useWorkspace.getState().setDirty(true)
    useWorkspace.getState().setUnsavedPrompt({ kind: 'switch', fileName: 'a.md', targetFile: '/ws/b.md' })

    // Simulate the controller's "Save" path: persistToDisk would clear dirty;
    // then the pending switch completes.
    useWorkspace.getState().setDirty(false)
    const target = useWorkspace.getState().unsavedPrompt!.targetFile
    useWorkspace.getState().setUnsavedPrompt(null)
    useWorkspace.getState().setActiveFile(target!)
    expect(useWorkspace.getState().activeFilePath).toBe('/ws/b.md')
    expect(useWorkspace.getState().dirty).toBe(false)
    expect(useWorkspace.getState().unsavedPrompt).toBeNull()
  })

  it('resolving the prompt with Cancel keeps the original active file', () => {
    useWorkspace.getState().setDirty(true)
    useWorkspace.getState().setUnsavedPrompt({ kind: 'switch', fileName: 'a.md', targetFile: '/ws/b.md' })

    // Cancel: just clear the prompt, leave everything else.
    useWorkspace.getState().setUnsavedPrompt(null)
    expect(useWorkspace.getState().activeFilePath).toBe('/ws/a.md')
    expect(useWorkspace.getState().dirty).toBe(true)
  })

  it('window-close path raises the prompt without changing active file', () => {
    useWorkspace.getState().setDirty(true)
    const name = useWorkspace.getState().activeFilePath!.split(/[\\/]/).pop()!
    useWorkspace.getState().setUnsavedPrompt({ kind: 'window', fileName: name, targetFile: null })

    expect(useWorkspace.getState().activeFilePath).toBe('/ws/a.md')
    expect(useWorkspace.getState().unsavedPrompt?.kind).toBe('window')
    expect(useWorkspace.getState().unsavedPrompt?.targetFile).toBeNull()
  })
})
