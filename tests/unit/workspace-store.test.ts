import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspace } from '../../src/renderer/state/store'

describe('workspace store — editor groups & tabs', () => {
  beforeEach(() => {
    useWorkspace.setState({
      workspacePath: '/ws',
      groups: [{ id: 'g1', docs: [], activeDoc: null }],
      activeGroupId: 'g1',
      orientation: 'horizontal',
      docStates: {},
      _groupSeq: 1,
      externals: [],
      unsavedPrompt: null,
      persistToDisk: null,
      toggleEditorMode: null,
      sidebarOpen: true,
      timelineOpen: false,
      previewSnapshotId: null,
      selectedTreePath: null,
      fileClipboard: null,
    })
  })

  it('opens a file into the active group and activates it', () => {
    useWorkspace.getState().openFile('/ws/a.md')
    const s = useWorkspace.getState()
    expect(s.groups[0].docs).toEqual(['/ws/a.md'])
    expect(s.groups[0].activeDoc).toBe('/ws/a.md')
    expect(s.activeFilePath).toBe('/ws/a.md')
    expect(s.openFilePaths).toEqual(['/ws/a.md'])
  })

  it('opening an already-open file activates its existing tab instead of duplicating', () => {
    useWorkspace.getState().openFile('/ws/a.md')
    useWorkspace.getState().openFile('/ws/b.md')
    useWorkspace.getState().openFile('/ws/a.md')
    const s = useWorkspace.getState()
    expect(s.groups[0].docs).toEqual(['/ws/a.md', '/ws/b.md'])
    expect(s.groups[0].activeDoc).toBe('/ws/a.md')
  })

  it('switching the active tab updates activeFilePath', () => {
    useWorkspace.getState().openFile('/ws/a.md')
    useWorkspace.getState().openFile('/ws/b.md')
    useWorkspace.getState().setActiveTab('g1', '/ws/a.md')
    expect(useWorkspace.getState().activeFilePath).toBe('/ws/a.md')
  })

  it('closing the active tab activates a neighbor; closing the last tab removes the group', () => {
    useWorkspace.getState().openFile('/ws/a.md')
    useWorkspace.getState().openFile('/ws/b.md')
    useWorkspace.getState().closeTab('g1', '/ws/b.md')
    let s = useWorkspace.getState()
    expect(s.groups[0].docs).toEqual(['/ws/a.md'])
    expect(s.groups[0].activeDoc).toBe('/ws/a.md')

    useWorkspace.getState().closeTab('g1', '/ws/a.md')
    s = useWorkspace.getState()
    expect(s.groups).toEqual([])
    expect(s.activeFilePath).toBeNull()
    expect(s.activeGroupId).toBeNull()
  })

  it('splitRight moves the active doc into a new group and sets horizontal orientation', () => {
    useWorkspace.getState().openFile('/ws/a.md')
    useWorkspace.getState().splitRight()
    const s = useWorkspace.getState()
    expect(s.groups).toHaveLength(2)
    expect(s.orientation).toBe('horizontal')
    expect(s.groups[1].docs).toEqual(['/ws/a.md'])
    expect(s.groups[0].docs).toEqual([])
    expect(s.activeGroupId).toBe(s.groups[1].id)
  })

  it('splitRight at the 2-group cap is a no-op', () => {
    useWorkspace.getState().openFile('/ws/a.md')
    useWorkspace.getState().splitRight()
    expect(useWorkspace.getState().groups).toHaveLength(2)
    useWorkspace.getState().splitRight()
    expect(useWorkspace.getState().groups).toHaveLength(2)
  })

  it('closeGroup removes the group and focuses a neighbor', () => {
    useWorkspace.getState().openFile('/ws/a.md')
    useWorkspace.getState().splitRight()
    const second = useWorkspace.getState().groups[1].id
    useWorkspace.getState().closeGroup(second)
    const s = useWorkspace.getState()
    expect(s.groups).toHaveLength(1)
    expect(s.activeGroupId).toBe(s.groups[0].id)
  })

  it('reorderTab moves a tab within its group', () => {
    useWorkspace.getState().openFile('/ws/a.md')
    useWorkspace.getState().openFile('/ws/b.md')
    useWorkspace.getState().openFile('/ws/c.md')
    useWorkspace.getState().reorderTab('g1', 2, 0)
    expect(useWorkspace.getState().groups[0].docs).toEqual(['/ws/c.md', '/ws/a.md', '/ws/b.md'])
  })

  it('dirty is derived from the active doc; setDocDirty updates it', () => {
    useWorkspace.getState().openFile('/ws/a.md')
    expect(useWorkspace.getState().dirty).toBe(false)
    useWorkspace.getState().setDocDirty('/ws/a.md', true)
    expect(useWorkspace.getState().dirty).toBe(true)
    useWorkspace.getState().setDocDirty('/ws/a.md', false)
    expect(useWorkspace.getState().dirty).toBe(false)
  })

  it('editorMode is derived per-doc and defaults to view', () => {
    useWorkspace.getState().openFile('/ws/a.md')
    expect(useWorkspace.getState().editorMode).toBe('view')
    useWorkspace.getState().setDocMode('/ws/a.md', 'edit')
    expect(useWorkspace.getState().editorMode).toBe('edit')
  })

  it('setWorkspace clears groups and docStates', () => {
    useWorkspace.getState().openFile('/ws/a.md')
    useWorkspace.getState().setWorkspace('/other')
    const s = useWorkspace.getState()
    expect(s.groups).toEqual([{ id: expect.any(String), docs: [], activeDoc: null }])
    expect(s.docStates).toEqual({})
    expect(s.activeFilePath).toBeNull()
  })

  it('dropOnZone center reorders the tab within the target group', () => {
    useWorkspace.getState().openFile('/ws/a.md')
    useWorkspace.getState().openFile('/ws/b.md')
    useWorkspace.getState().dropOnZone('/ws/a.md', 'g1', 'g1', 'center')
    const s = useWorkspace.getState()
    expect(s.groups[0].docs).toEqual(['/ws/b.md', '/ws/a.md'])
    expect(s.groups[0].activeDoc).toBe('/ws/a.md')
  })

  it('dropOnZone on a leaf zone creates a new group with horizontal orientation', () => {
    useWorkspace.getState().openFile('/ws/a.md')
    useWorkspace.getState().dropOnZone('/ws/a.md', 'g1', 'g1', 'right')
    const s = useWorkspace.getState()
    expect(s.groups).toHaveLength(2)
    expect(s.orientation).toBe('horizontal')
    expect(s.groups[1].docs).toEqual(['/ws/a.md'])
    expect(s.groups[0].docs).toEqual([])
    expect(s.activeGroupId).toBe(s.groups[1].id)
  })

  it('dropOnZone left vs right position the new group on opposite sides of the target', () => {
    // Start from ONE group so a directional drop can spawn a 2nd (the cap is 2).
    useWorkspace.setState({
      _groupSeq: 1,
      groups: [{ id: 'g1', docs: ['/ws/a.md', '/ws/b.md'], activeDoc: '/ws/b.md' }],
      activeGroupId: 'g1',
    })
    // Drop b.md to the LEFT of g1: new group before g1.
    useWorkspace.getState().dropOnZone('/ws/b.md', 'g1', 'g1', 'left')
    let s = useWorkspace.getState()
    expect(s.groups).toHaveLength(2)
    expect(s.groups[0].docs).toEqual(['/ws/b.md'])
    expect(s.groups[1].id).toBe('g1')
    expect(s.groups[1].docs).toEqual(['/ws/a.md'])

    // Reset and drop to the RIGHT: new group after g1.
    useWorkspace.setState({
      _groupSeq: 1,
      groups: [{ id: 'g1', docs: ['/ws/a.md', '/ws/b.md'], activeDoc: '/ws/b.md' }],
      activeGroupId: 'g1',
    })
    useWorkspace.getState().dropOnZone('/ws/b.md', 'g1', 'g1', 'right')
    s = useWorkspace.getState()
    expect(s.groups).toHaveLength(2)
    expect(s.groups[0].id).toBe('g1')
    expect(s.groups[0].docs).toEqual(['/ws/a.md'])
    expect(s.groups[1].docs).toEqual(['/ws/b.md'])
  })

  it('dropOnZone at the 2-group cap falls back to a move into the target', () => {
    useWorkspace.setState({
      _groupSeq: 2,
      groups: [
        { id: 'g1', docs: ['/ws/a.md', '/ws/d.md'], activeDoc: '/ws/a.md' },
        { id: 'g2', docs: ['/ws/b.md'], activeDoc: '/ws/b.md' },
      ],
      activeGroupId: 'g1',
    })
    useWorkspace.getState().dropOnZone('/ws/a.md', 'g1', 'g2', 'right')
    const s = useWorkspace.getState()
    expect(s.groups).toHaveLength(2)
    const target = s.groups.find((g) => g.id === 'g2')
    expect(target?.docs).toEqual(['/ws/b.md', '/ws/a.md'])
    const source = s.groups.find((g) => g.id === 'g1')
    expect(source?.docs).toEqual(['/ws/d.md'])
  })

  it('moveTab between two groups hands off the active doc and prunes the emptied source', () => {
    useWorkspace.setState({
      _groupSeq: 2,
      groups: [
        { id: 'g1', docs: ['/ws/a.md'], activeDoc: '/ws/a.md' },
        { id: 'g2', docs: ['/ws/b.md'], activeDoc: '/ws/b.md' },
      ],
      activeGroupId: 'g1',
    })
    useWorkspace.getState().moveTab('/ws/b.md', 'g2', 'g1', 0)
    const s = useWorkspace.getState()
    expect(s.groups).toHaveLength(1)
    expect(s.groups[0].docs).toEqual(['/ws/b.md', '/ws/a.md'])
    expect(s.groups[0].activeDoc).toBe('/ws/b.md')
  })

  it('setActiveGroup changes the active group and the derived activeFilePath', () => {
    useWorkspace.setState({
      _groupSeq: 2,
      groups: [
        { id: 'g1', docs: ['/ws/a.md'], activeDoc: '/ws/a.md' },
        { id: 'g2', docs: ['/ws/b.md'], activeDoc: '/ws/b.md' },
      ],
      activeGroupId: 'g1',
    })
    useWorkspace.getState().setActiveGroup('g2')
    const s = useWorkspace.getState()
    expect(s.activeGroupId).toBe('g2')
    expect(s.activeFilePath).toBe('/ws/b.md')
  })

  it('openFile of a path in a non-active group activates that group + tab without duplicating', () => {
    useWorkspace.setState({
      _groupSeq: 2,
      groups: [
        { id: 'g1', docs: ['/ws/a.md'], activeDoc: '/ws/a.md' },
        { id: 'g2', docs: ['/ws/b.md'], activeDoc: '/ws/b.md' },
      ],
      activeGroupId: 'g1',
    })
    useWorkspace.getState().openFile('/ws/b.md')
    const s = useWorkspace.getState()
    expect(s.activeGroupId).toBe('g2')
    expect(s.groups[1].activeDoc).toBe('/ws/b.md')
    expect(s.groups[1].docs).toEqual(['/ws/b.md'])
  })
})
