import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspace } from '@/state/store'

describe('workspace store — unsaved-changes prompt contract', () => {
  beforeEach(() => {
    useWorkspace.setState({
      workspacePath: '/ws',
      groups: [{ id: 'g1', docs: ['/ws/a.md'], activeDoc: '/ws/a.md' }],
      activeGroupId: 'g1',
      orientation: 'horizontal',
      docStates: {},
      externals: [],
      unsavedPrompt: null,
      persistToDisk: null,
      toggleEditorMode: null,
      sidebarOpen: true,
      timelineOpen: false,
      previewSnapshotId: null,
      selectedTreePath: null,
      fileClipboard: null,
      _groupSeq: 1,
    })
  })

  it('switch prompt carries a single docPath', () => {
    useWorkspace.getState().setDocDirty('/ws/a.md', true)
    useWorkspace.getState().setUnsavedPrompt({ kind: 'switch', docPath: '/ws/b.md' })
    const p = useWorkspace.getState().unsavedPrompt
    expect(p?.kind).toBe('switch')
    // Narrow the discriminated union via `kind` to read docPath safely — no cast.
    if (p?.kind === 'switch') expect(p.docPath).toBe('/ws/b.md')
    // active file unchanged until resolved
    expect(useWorkspace.getState().activeFilePath).toBe('/ws/a.md')
  })

  it('closeTab prompt carries the closing doc', () => {
    useWorkspace.getState().setDocDirty('/ws/a.md', true)
    useWorkspace.getState().setUnsavedPrompt({ kind: 'closeTab', docPath: '/ws/a.md' })
    expect(useWorkspace.getState().unsavedPrompt?.kind).toBe('closeTab')
  })

  it('closeGroup / window prompts carry a doc list', () => {
    useWorkspace.getState().setUnsavedPrompt({ kind: 'window', docPaths: ['/ws/a.md', '/ws/b.md'] })
    const p = useWorkspace.getState().unsavedPrompt
    expect(p?.kind).toBe('window')
    if (p?.kind === 'window') expect(p.docPaths).toEqual(['/ws/a.md', '/ws/b.md'])
  })

  it('resolving clears the prompt', () => {
    useWorkspace.getState().setUnsavedPrompt({ kind: 'switch', docPath: '/ws/b.md' })
    useWorkspace.getState().setUnsavedPrompt(null)
    expect(useWorkspace.getState().unsavedPrompt).toBeNull()
  })
})
