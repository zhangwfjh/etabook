import { create } from 'zustand'

export type PendingExternal = {
  filePath: string
  newHash: string
  newMtime: number
}

type FileClipboard = { path: string; mode: 'copy' | 'cut' }

type WorkspaceState = {
  workspacePath: string | null
  activeFilePath: string | null
  openFilePaths: string[]
  sidebarOpen: boolean
  dirty: boolean
  externals: PendingExternal[]
  timelineOpen: boolean
  previewSnapshotId: string | null
  editorMode: 'view' | 'edit'
  /** Set by EditorPane; toggling mode from elsewhere (e.g. StatusBar) routes through this. */
  toggleEditorMode: (() => void) | null
  /**
   * Pending unsaved-changes prompt. When non-null, a modal is shown asking the
   * user how to handle dirty edits before completing a close action.
   *   kind: 'switch' (opening another file) | 'window' (closing the app)
   *   fileName: display name of the dirty file
   *   targetFile: file to switch to after resolving (switch only)
   */
  unsavedPrompt: { kind: 'switch' | 'window'; fileName: string; targetFile: string | null } | null
  /** Currently selected node in the sidebar tree (file OR folder). Drives sidebar-scoped keyboard ops (copy/cut/paste/delete). */
  selectedTreePath: string | null
  /** In-memory file clipboard for sidebar copy/cut → paste. `cut` is cleared after a successful paste. */
  fileClipboard: FileClipboard | null

  setWorkspace(path: string | null): void
  setActiveFile(path: string | null): void
  addOpenFile(path: string): void
  removeOpenFile(path: string): void
  setSidebarOpen(open: boolean): void
  setDirty(dirty: boolean): void
  pushExternal(e: PendingExternal): void
  resolveExternal(filePath: string): void
  setTimelineOpen(open: boolean): void
  setPreviewSnapshotId(id: string | null): void
  setEditorMode(mode: 'view' | 'edit'): void
  setToggleEditorMode(fn: (() => void) | null): void
  setUnsavedPrompt(p: WorkspaceState['unsavedPrompt']): void
  /** Set by EditorPane; performs an explicit write of current edits to disk. */
  persistToDisk: (() => Promise<void>) | null
  setPersistToDisk(fn: (() => Promise<void>) | null): void
  setSelectedTreePath(path: string | null): void
  setFileClipboard(cb: FileClipboard | null): void
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  workspacePath: null,
  activeFilePath: null,
  openFilePaths: [],
  dirty: false,
  externals: [],
  sidebarOpen: true,
  timelineOpen: false,
  previewSnapshotId: null,
  editorMode: 'view',
  toggleEditorMode: null,
  unsavedPrompt: null,
  persistToDisk: null,
  selectedTreePath: null,
  fileClipboard: null,
  setWorkspace: (p) => set({ workspacePath: p, activeFilePath: null, openFilePaths: [], selectedTreePath: null, fileClipboard: null }),
  setActiveFile: (p) => set({ activeFilePath: p, dirty: false, editorMode: 'view' }),
  addOpenFile: (p) => set((s) => s.openFilePaths.includes(p) ? s : { openFilePaths: [...s.openFilePaths, p] }),
  removeOpenFile: (p) => set((s) => ({
    openFilePaths: s.openFilePaths.filter(x => x !== p),
    activeFilePath: s.activeFilePath === p ? null : s.activeFilePath,
  })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setDirty: (dirty) => set({ dirty }),
  pushExternal: (e) => set((s) => ({ externals: [...s.externals, e] })),
  resolveExternal: (filePath) => set((s) => ({ externals: s.externals.filter(x => x.filePath !== filePath) })),
  setTimelineOpen: (open) => set({ timelineOpen: open }),
  setPreviewSnapshotId: (id) => set({ previewSnapshotId: id }),
  setEditorMode: (mode) => set({ editorMode: mode }),
  setToggleEditorMode: (fn) => set({ toggleEditorMode: fn }),
  setUnsavedPrompt: (p) => set({ unsavedPrompt: p }),
  setPersistToDisk: (fn) => set({ persistToDisk: fn }),
  setSelectedTreePath: (path) => set({ selectedTreePath: path }),
  setFileClipboard: (cb) => set({ fileClipboard: cb }),
}))
