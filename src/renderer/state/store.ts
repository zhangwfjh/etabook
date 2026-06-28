import { create } from 'zustand'

// --- pending external change (file changed on disk under a dirty doc) ----------
export type PendingExternal = { filePath: string; newHash: string; newMtime: number }

type FileClipboard = { path: string; mode: 'copy' | 'cut' }

// --- editor groups & per-doc state ---------------------------------------------
export type EditorGroup = {
  id: string
  docs: string[]
  activeDoc: string | null
}

export type DocState = { dirty: boolean; mode: 'view' | 'edit' }

export type DropZone = 'left' | 'right' | 'up' | 'down' | 'center'

// --- unsaved-changes prompt (per-doc / multi-doc) ------------------------------
export type UnsavedPrompt =
  | { kind: 'switch'; docPath: string }
  | { kind: 'closeTab'; docPath: string }
  | { kind: 'closeGroup'; docPaths: string[] }
  | { kind: 'window'; docPaths: string[] }

type WorkspaceState = {
  workspacePath: string | null
  groups: EditorGroup[]
  activeGroupId: string | null
  orientation: 'horizontal' | 'vertical'
  docStates: Record<string, DocState>

  // Private internal sequence for group ids (`g1`, `g2`, ...). Bumped via
  // `nextGroupId()` on a working-copy state object inside a `set()` updater.
  // Kept in state (not module scope) so it resets with `setWorkspace` / tests.
  _groupSeq: number

  // Derived (kept in sync by recompute()):
  activeFilePath: string | null
  openFilePaths: string[]
  dirty: boolean
  editorMode: 'view' | 'edit'

  // Other UI state
  sidebarOpen: boolean
  timelineOpen: boolean
  previewSnapshotId: string | null
  externals: PendingExternal[]
  selectedTreePath: string | null
  fileClipboard: FileClipboard | null

  // Imperative slots, re-bound to the active doc by EditorGroupPane.
  persistToDisk: (() => Promise<void>) | null
  toggleEditorMode: (() => void) | null

  unsavedPrompt: UnsavedPrompt | null

  // --- mutators ---
  setWorkspace(path: string | null): void
  openFile(path: string): void
  closeTab(groupId: string, path: string): void
  setActiveTab(groupId: string, path: string): void
  setActiveGroup(groupId: string): void
  reorderTab(groupId: string, fromIndex: number, toIndex: number): void
  moveTab(path: string, fromGroup: string, toGroup: string, index: number): void
  splitRight(): void
  splitDown(): void
  closeGroup(groupId: string): void
  dropOnZone(sourcePath: string, sourceGroup: string, targetGroup: string, zone: DropZone): void
  setDocDirty(path: string, dirty: boolean): void
  setDocMode(path: string, mode: 'view' | 'edit'): void

  setSidebarOpen(open: boolean): void
  setTimelineOpen(open: boolean): void
  setPreviewSnapshotId(id: string | null): void
  pushExternal(e: PendingExternal): void
  resolveExternal(filePath: string): void
  setUnsavedPrompt(p: UnsavedPrompt | null): void
  setSelectedTreePath(path: string | null): void
  setFileClipboard(cb: FileClipboard | null): void
  setPersistToDisk(fn: (() => Promise<void>) | null): void
  setToggleEditorMode(fn: (() => void) | null): void
}

const MAX_GROUPS = 2

// Read + increment the working-copy state's private sequence counter. MUST be
// called on an object the caller owns (e.g. a `{ ...s }` spread built inside a
// `set()` updater, or the initial state object) so the bump lands on the state
// returned to the store, not on the live previous state.
function nextGroupId(s: { _groupSeq: number }): string {
  s._groupSeq += 1
  return `g${s._groupSeq}`
}

function docStateOf(docStates: Record<string, DocState>, path: string | null): DocState {
  if (!path) return { dirty: false, mode: 'view' }
  return docStates[path] ?? { dirty: false, mode: 'view' }
}

// Recompute all derived fields from the authoritative state. Called after every
// structural mutation. Mutates `s` in place for the derived keys, then returns it
// so callers can pass it straight to `set`.
function recompute(s: WorkspaceState): WorkspaceState {
  const activeGroup = s.groups.find((g) => g.id === s.activeGroupId) ?? null
  const activeFilePath = activeGroup?.activeDoc ?? null
  s.activeFilePath = activeFilePath
  const seen = new Set<string>()
  s.openFilePaths = s.groups.flatMap((g) => g.docs).filter((p) => {
    if (seen.has(p)) return false
    seen.add(p)
    return true
  })
  const ds = docStateOf(s.docStates, activeFilePath)
  s.dirty = ds.dirty
  s.editorMode = ds.mode
  return s
}

// Remove a doc's DocState if no group references it (avoids unbounded growth).
function pruneDocStates(groups: EditorGroup[], docStates: Record<string, DocState>): Record<string, DocState> {
  const referenced = new Set(groups.flatMap((g) => g.docs))
  const next: Record<string, DocState> = {}
  for (const [path, st] of Object.entries(docStates)) if (referenced.has(path)) next[path] = st
  return next
}

// Prune empty groups, preserving order. If the active group was pruned, refocus
// a neighbor. When ALL groups are empty, collapse to a truly empty state
// (`groups: []`, `activeGroupId: null`); `openFile` recreates a group on demand.
function pruneEmptyGroups(s: WorkspaceState): void {
  const nonEmpty = s.groups.filter((g) => g.docs.length > 0)
  if (nonEmpty.length === s.groups.length) return
  s.groups = nonEmpty
  if (s.groups.length === 0) {
    s.activeGroupId = null
    return
  }
  if (!s.groups.some((g) => g.id === s.activeGroupId)) {
    s.activeGroupId = s.groups[0].id
  }
}

// Apply a tab move on a plain state object: remove `path` from `fromGroup`
// (fixing its activeDoc if it was the moved tab), insert it at `index` in
// `toGroup`, then prune empty groups + stale doc states + recompute. Shared by
// `moveTab` and `dropOnZone` so neither delegates to the other inside a `set()`
// updater — delegating then returning the pre-delegation state silently reverts
// the inner commit.
function applyMove(
  s: WorkspaceState,
  path: string,
  fromGroup: string,
  toGroup: string,
  index: number,
): WorkspaceState {
  let groups = s.groups.map((g) => {
    if (g.id !== fromGroup) return g
    const docs = g.docs.filter((p) => p !== path)
    const activeDoc = g.activeDoc === path ? (docs[0] ?? null) : g.activeDoc
    return { ...g, docs, activeDoc }
  })
  groups = groups.map((g) => {
    if (g.id !== toGroup) return g
    const docs = [...g.docs]
    const at = Math.max(0, Math.min(index, docs.length))
    docs.splice(at, 0, path)
    return { ...g, docs, activeDoc: path }
  })
  const next: WorkspaceState = { ...s, groups }
  pruneEmptyGroups(next)
  next.docStates = pruneDocStates(next.groups, next.docStates)
  return recompute(next)
}

export const useWorkspace = create<WorkspaceState>((set) => {
  // Local split helper — internal only, never exposed on the public type.
  // splitRight/splitDown are thin wrappers over it.
  function split(orientation: 'horizontal' | 'vertical') {
    set((s) => {
      if (s.groups.length >= MAX_GROUPS) return s
      const next: WorkspaceState = { ...s }
      const activeGroup = s.groups.find((g) => g.id === s.activeGroupId)
      const activeDoc = activeGroup?.activeDoc ?? null
      const newG: EditorGroup = { id: nextGroupId(next), docs: [], activeDoc: null }
      let groups = [...s.groups, newG]
      if (activeDoc && activeGroup) {
        groups = groups.map((g) => {
          if (g.id === activeGroup.id) {
            const docs = g.docs.filter((p) => p !== activeDoc)
            const activeDoc2 = docs[0] ?? null
            return { ...g, docs, activeDoc: activeDoc2 }
          }
          if (g.id === newG.id) return { ...g, docs: [activeDoc], activeDoc }
          return g
        })
      }
      next.groups = groups
      next.activeGroupId = newG.id
      next.orientation = orientation
      // NOTE: deliberately do NOT prune empty groups here — a split is meant to
      // leave an empty source pane so another file can be opened into it.
      return recompute(next)
    })
  }

  const init: WorkspaceState = {
    workspacePath: null,
    groups: [],
    activeGroupId: null,
    orientation: 'horizontal',
    docStates: {},
    _groupSeq: 0,
    activeFilePath: null,
    openFilePaths: [],
    dirty: false,
    editorMode: 'view',
    externals: [],
    unsavedPrompt: null,
    sidebarOpen: true,
    timelineOpen: false,
    previewSnapshotId: null,
    persistToDisk: null,
    toggleEditorMode: null,
    selectedTreePath: null,
    fileClipboard: null,

    setWorkspace: (path) =>
      set((s) => {
        const next: WorkspaceState = {
          ...s,
          _groupSeq: 0,
          workspacePath: path,
          orientation: 'horizontal',
          docStates: {},
          selectedTreePath: null,
          fileClipboard: null,
        }
        const g: EditorGroup = { id: nextGroupId(next), docs: [], activeDoc: null }
        next.groups = [g]
        next.activeGroupId = g.id
        return recompute(next)
      }),

    openFile: (path) =>
      set((s) => {
        // Already open somewhere? Activate that group + tab.
        for (const g of s.groups) {
          if (g.docs.includes(path)) {
            const groups = s.groups.map((gr) => (gr.id === g.id ? { ...gr, activeDoc: path } : gr))
            return recompute({ ...s, groups, activeGroupId: g.id })
          }
        }
        // Else append to the active group; recreate one if the store is empty.
        const next: WorkspaceState = { ...s }
        let groups = next.groups
        let activeGroupId = next.activeGroupId
        if (groups.length === 0 || !activeGroupId || !groups.some((g) => g.id === activeGroupId)) {
          const g: EditorGroup = { id: nextGroupId(next), docs: [], activeDoc: null }
          groups = [...groups, g]
          activeGroupId = g.id
        }
        groups = groups.map((g) =>
          g.id === activeGroupId ? { ...g, docs: [...g.docs, path], activeDoc: path } : g,
        )
        next.groups = groups
        next.activeGroupId = activeGroupId
        return recompute(next)
      }),
    setActiveTab: (groupId, path) =>
      set((s) => {
        const groups = s.groups.map((g) => (g.id === groupId ? { ...g, activeDoc: path } : g))
        return recompute({ ...s, groups, activeGroupId: groupId })
      }),

    setActiveGroup: (groupId) => set((s) => recompute({ ...s, activeGroupId: groupId })),

    reorderTab: (groupId, fromIndex, toIndex) =>
      set((s) => {
        const groups = s.groups.map((g) => {
          if (g.id !== groupId) return g
          const docs = [...g.docs]
          if (fromIndex < 0 || fromIndex >= docs.length || toIndex < 0 || toIndex >= docs.length) return g
          const [moved] = docs.splice(fromIndex, 1)
          docs.splice(toIndex, 0, moved)
          return { ...g, docs }
        })
        return recompute({ ...s, groups })
      }),

    moveTab: (path, fromGroup, toGroup, index) =>
      set((s) => applyMove(s, path, fromGroup, toGroup, index)),

    closeTab: (groupId, path) =>
      set((s) => {
        const groups = s.groups.map((g) => {
          if (g.id !== groupId) return g
          const idx = g.docs.indexOf(path)
          if (idx === -1) return g
          const docs = g.docs.filter((p) => p !== path)
          let activeDoc = g.activeDoc
          if (activeDoc === path) activeDoc = docs[idx] ?? docs[idx - 1] ?? docs[0] ?? null
          return { ...g, docs, activeDoc }
        })
        const next: WorkspaceState = { ...s, groups }
        pruneEmptyGroups(next)
        next.docStates = pruneDocStates(next.groups, next.docStates)
        return recompute(next)
      }),

    splitRight: () => split('horizontal'),
    splitDown: () => split('vertical'),

    closeGroup: (groupId) =>
      set((s) => {
        if (s.groups.length <= 1) {
          const groups = s.groups.map((g) => (g.id === groupId ? { ...g, docs: [], activeDoc: null } : g))
          const next: WorkspaceState = { ...s, groups }
          pruneEmptyGroups(next)
          next.docStates = pruneDocStates(next.groups, next.docStates)
          return recompute(next)
        }
        const idx = s.groups.findIndex((g) => g.id === groupId)
        const groups = s.groups.filter((g) => g.id !== groupId)
        let activeGroupId = s.activeGroupId
        if (activeGroupId === groupId) {
          activeGroupId = (groups[idx - 1] ?? groups[idx] ?? groups[0])?.id ?? null
        }
        const next: WorkspaceState = { ...s, groups, activeGroupId }
        next.docStates = pruneDocStates(next.groups, next.docStates)
        return recompute(next)
      }),

    dropOnZone: (sourcePath, sourceGroup, targetGroup, zone) =>
      set((s) => {
        const target = s.groups.find((g) => g.id === targetGroup)
        if (!target) return s
        // Center zone, or a directional zone at the group cap: move the tab into
        // the target group. Inlined via `applyMove` — MUST NOT delegate to
        // moveTab inside this updater (that reverts the move).
        if (zone === 'center') {
          return applyMove(s, sourcePath, sourceGroup, targetGroup, target.docs.length)
        }
        const wantsHorizontal = zone === 'left' || zone === 'right'
        const orientation = wantsHorizontal ? 'horizontal' : 'vertical'
        if (s.groups.length >= MAX_GROUPS) {
          return applyMove(s, sourcePath, sourceGroup, targetGroup, target.docs.length)
        }
        // Under cap + directional: spawn a new group holding the dragged doc,
        // positioned relative to the target group per the drop direction.
        // left/up → before the target; right/down → after. (The old code always
        // appended, so left==right and up==down.)
        const next: WorkspaceState = { ...s }
        const newG: EditorGroup = { id: nextGroupId(next), docs: [], activeDoc: null }
        const targetIndex = s.groups.findIndex((g) => g.id === targetGroup)
        const insertAt = (zone === 'left' || zone === 'up') ? targetIndex : targetIndex + 1
        const groups = [...s.groups]
        groups.splice(insertAt, 0, newG)
        const mapped = groups.map((g) => {
          if (g.id === sourceGroup) {
            const docs = g.docs.filter((p) => p !== sourcePath)
            const activeDoc = g.activeDoc === sourcePath ? (docs[0] ?? null) : g.activeDoc
            return { ...g, docs, activeDoc }
          }
          if (g.id === newG.id) return { ...g, docs: [sourcePath], activeDoc: sourcePath }
          return g
        })
        next.groups = mapped
        next.activeGroupId = newG.id
        next.orientation = orientation
        // NOTE: deliberately do NOT prune empty groups here — tearing off a
        // new pane is split-like: leave an empty source pane for reuse.
        return recompute(next)
      }),

    setDocDirty: (path, dirty) =>
      set((s) => {
        const cur = docStateOf(s.docStates, path)
        const docStates = { ...s.docStates, [path]: { ...cur, dirty } }
        return recompute({ ...s, docStates })
      }),

    setDocMode: (path, mode) =>
      set((s) => {
        const cur = docStateOf(s.docStates, path)
        const docStates = { ...s.docStates, [path]: { ...cur, mode } }
        return recompute({ ...s, docStates })
      }),

    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    setTimelineOpen: (open) => set({ timelineOpen: open }),
    setPreviewSnapshotId: (id) => set({ previewSnapshotId: id }),
    pushExternal: (e) => set((s) => ({ externals: [...s.externals, e] })),
    resolveExternal: (filePath) => set((s) => ({ externals: s.externals.filter((x) => x.filePath !== filePath) })),
    setUnsavedPrompt: (p) => set({ unsavedPrompt: p }),
    setSelectedTreePath: (path) => set({ selectedTreePath: path }),
    setFileClipboard: (cb) => set({ fileClipboard: cb }),
    setPersistToDisk: (fn) => set({ persistToDisk: fn }),
    setToggleEditorMode: (fn) => set({ toggleEditorMode: fn }),
  }

  // Seed the very first group from the initial sequence (g1).
  const seedId = nextGroupId(init)
  init.groups = [{ id: seedId, docs: [], activeDoc: null }]
  init.activeGroupId = seedId
  return init
})
