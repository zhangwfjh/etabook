import { DEFAULT_SHORTCUTS, SHORTCUT_ACTIONS, SHORTCUT_LABELS, normalizeAccelerator, normalizeShortcuts, resolveShortcuts } from './shortcuts'
import type { ShortcutAction, ShortcutMap } from './shortcuts'

export { DEFAULT_SHORTCUTS, SHORTCUT_ACTIONS, SHORTCUT_LABELS, normalizeAccelerator, normalizeShortcuts, resolveShortcuts }
export type { ShortcutAction, ShortcutMap }
export const IPC = {
  workspacePick:        'workspace:pick',
  workspaceCurrent:     'workspace:current',
  workspaceSwitch:      'workspace:switch',
  filesList:            'files:list',
  filesRead:            'files:read',
  filesWrite:           'files:write',
  filesCreate:          'files:create',
  filesRename:          'files:rename',
  filesPaste:           'files:paste',
  filesCopy:            'files:copy',
  filesDelete:          'files:delete',
  filesTrash:           'files:trash',
  filesReveal:          'files:reveal',
  filesOnTreeChanged:   'files:onTreeChanged',
  filesOnContentChanged:'files:onContentChanged',
  snapshotsList:        'snapshots:list',
  snapshotsGet:         'snapshots:get',
  snapshotsRestore:     'snapshots:restore',
  snapshotsCreate:      'snapshots:create',
  settingsGet:          'settings:get',
  settingsSet:          'settings:set',
  settingsSetSecret:    'settings:setSecret',
  settingsGetSecret:    'settings:getSecret',
  settingsHasSecret:    'settings:hasSecret',
  llmCatalog:           'llm:catalog',
  llmStreamStart:       'llm:streamStart',
  llmStreamCancel:      'llm:streamCancel',
  llmOllamaRefresh:     'llm:ollamaRefresh',
  llmOnStreamChunk:     'llm:onStreamChunk',
  llmOnStreamEnd:       'llm:onStreamEnd',
  llmOnStreamError:     'llm:onStreamError',
  windowMinimize:       'window:minimize',
  windowMaximizeToggle: 'window:maximizeToggle',
  windowClose:          'window:close',
  windowForceClose:     'window:forceClose',
  windowIsMaximized:    'window:isMaximized',
  windowOnMaximizeChange:'window:onMaximizeChange',
  windowOnCloseRequested:'window:onCloseRequested',
} as const

export type IpcEventChannel =
  | typeof IPC.filesOnTreeChanged
  | typeof IPC.filesOnContentChanged
  | typeof IPC.llmOnStreamChunk
  | typeof IPC.llmOnStreamEnd
  | typeof IPC.llmOnStreamError
  | typeof IPC.windowOnMaximizeChange
  | typeof IPC.windowOnCloseRequested

export type TreeNode = {
  name: string
  path: string
  relPath: string
  isDirectory: boolean
  children?: TreeNode[]
}

export type FileReadResult = {
  content: string
  hash: string
  mtime: number
  size: number
}

export type SnapshotTrigger = 'pre-ai' | 'post-ai' | 'manual' | 'pre-restore'

export type SnapshotMeta = {
  id: string
  filePath: string
  createdAt: number
  trigger: SnapshotTrigger
  model?: string
  byteSize: number
  isAutosave: boolean
}

export type SnapshotContent = SnapshotMeta & {
  content: string
}

export type SecretKey = `aiProvider:${string}`

export type ModelInfo = {
  id: string
  name: string
  contextWindow: number
  reasoning: boolean
  input: ('text' | 'image')[]
}

export type ProviderCatalogInfo = {
  id: string
  label: string
  needsApiKey: boolean
  requiresOAuth: boolean
  isOllama?: boolean
  models: ModelInfo[]
}

export type ProviderConfig = {
  enabled: boolean
  defaultModel?: string
  ollamaEndpoint?: string
  systemPrompt?: string
}

export type AppConfig = {
  workspacePath: string | null
  theme: 'paper-light' | 'paper-dark'
  sidebarOpen: boolean
  /**
   * Editor content scale factor (0.8–1.6). Applied as a font-size multiplier on
   * the `.etabook-editor` surface; em-based headings/code scale proportionally.
   */
  editorScale: number
  providers: Record<string, ProviderConfig>
  defaultProviderId?: string
  fileExclusions: string[]
  snapshotRetention: number
  /**
   * User-customizable keyboard shortcuts. Keys are stable action ids
   * (see `ShortcutAction`); values are accelerator strings like
   * `CmdOrCtrl+B`. Missing/undefined entries fall back to defaults.
   */
  shortcuts: ShortcutMap
  configVersion: number
}

export const DEFAULT_CONFIG: AppConfig = {
  workspacePath: null,
  theme: 'paper-light',
  sidebarOpen: true,
  editorScale: 1.0,
  providers: {},
  defaultProviderId: undefined,
  fileExclusions: ['.git', 'node_modules', '.etabook'],
  snapshotRetention: 50,
  shortcuts: { ...DEFAULT_SHORTCUTS },
  configVersion: 2,
}

export type StreamStartReq = {
  provider: string
  model: string
  prompt: string
  system?: string
  abortKey: string
}

export type OllamaRefreshReq = {
  endpoint?: string
}

export type StreamStartRes = { abortKey: string }
export type StreamChunkEvt = { abortKey: string; delta: string }
export type StreamEndEvt   = { abortKey: string }
export type StreamErrorEvt = { abortKey: string; message: string }

export type FilesWriteRes = { hash: string; mtime: number; size: number }
export type FilesCreateRes = { filePath: string }
export type FilesDeleteRes = { ok: true }
export type FilesPasteReq = { srcPath: string; destDir: string; mode: 'copy' | 'cut' }

export type FilesTreeChangedEvt = {
  workspacePath: string
  tree: TreeNode
}

export type FilesContentChangedEvt = {
  filePath: string
  hash: string
  mtime: number
  reason: 'external' | 'self' | 'restore'
}

export type WindowMaximizeEvt = { isMaximized: boolean }
export type WindowCloseRequestedEvt = { windowId: number }
