import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC, type TreeNode, type FileReadResult, type FilesWriteRes, type FilesCreateRes, type FilesDeleteRes,
  type SnapshotMeta, type SnapshotContent, type AppConfig, type SecretKey, type ProviderCatalogInfo,
  type StreamStartReq, type StreamStartRes, type StreamChunkEvt, type StreamEndEvt, type StreamErrorEvt, type OllamaRefreshReq,
  type FilesContentChangedEvt, type FilesTreeChangedEvt, type WindowMaximizeEvt, type WindowCloseRequestedEvt,
} from '../shared/ipc'

function invoke<TReq = void, TRes = unknown>(channel: string) {
  return async (req?: TReq): Promise<TRes | null> => {
    const res = await ipcRenderer.invoke(channel, req as object)
    if (res && typeof res === 'object' && '__etabook_error' in (res as any)) {
      throw new Error((res as { __etabook_error: string }).__etabook_error)
    }
    return res as TRes
  }
}

function on<T>(channel: string, cb: (payload: T) => void) {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => { ipcRenderer.off(channel, listener) }
}

const workspace = {
  pick:   invoke<void, string | null>(IPC.workspacePick),
  current:invoke<void, string | null>(IPC.workspaceCurrent),
  switch: invoke<{ path: string | null }, string | null>(IPC.workspaceSwitch),
}

const files = {
  list:   invoke<{ workspacePath: string }, TreeNode>(IPC.filesList),
  read:   invoke<{ filePath: string }, FileReadResult>(IPC.filesRead),
  write:  invoke<{ filePath: string; content: string; baseHash?: string }, FilesWriteRes>(IPC.filesWrite),
  create: invoke<{ workspacePath: string; relPath: string; content: string; isDirectory: boolean }, FilesCreateRes>(IPC.filesCreate),
  rename: invoke<{ filePath: string; newName: string }, FilesCreateRes>(IPC.filesRename),
  copy:   invoke<{ filePath: string }, FilesCreateRes>(IPC.filesCopy),
  delete: invoke<{ filePath: string }, FilesDeleteRes>(IPC.filesDelete),
  reveal: invoke<{ filePath: string }, void>(IPC.filesReveal),
  onTreeChanged:    (cb: (e: FilesTreeChangedEvt) => void) => on(IPC.filesOnTreeChanged, cb),
  onContentChanged: (cb: (e: FilesContentChangedEvt) => void) => on(IPC.filesOnContentChanged, cb),
}

const snapshots = {
  list:   invoke<{ filePath: string }, SnapshotMeta[]>(IPC.snapshotsList),
  get:    invoke<{ id: string }, SnapshotContent | null>(IPC.snapshotsGet),
  restore:invoke<{ id: string; createPreRestoreSnapshot: boolean }, SnapshotContent>(IPC.snapshotsRestore),
  create: invoke<{ filePath: string; content: string; trigger: 'pre-ai'|'post-ai'|'manual'|'pre-restore'; model?: string; isAutosave: boolean }, SnapshotMeta>(IPC.snapshotsCreate),
}

const settings = {
  get:        invoke<void, AppConfig>(IPC.settingsGet),
  set:        invoke<Partial<AppConfig>, AppConfig>(IPC.settingsSet),
  setSecret:  invoke<{ key: SecretKey; value: string }, void>(IPC.settingsSetSecret),
  getSecret:  invoke<{ key: SecretKey }, string | null>(IPC.settingsGetSecret),
  hasSecret:  invoke<{ key: SecretKey }, boolean>(IPC.settingsHasSecret),
}

const llm = {
  catalog:       invoke<void, ProviderCatalogInfo[]>(IPC.llmCatalog),
  streamStart:   invoke<StreamStartReq, StreamStartRes>(IPC.llmStreamStart),
  streamCancel:  invoke<{ abortKey: string }, void>(IPC.llmStreamCancel),
  ollamaRefresh: invoke<OllamaRefreshReq, void>(IPC.llmOllamaRefresh),
  onStreamChunk: (cb: (e: StreamChunkEvt) => void) => on(IPC.llmOnStreamChunk, cb),
  onStreamEnd:   (cb: (e: StreamEndEvt) => void)   => on(IPC.llmOnStreamEnd, cb),
  onStreamError: (cb: (e: StreamErrorEvt) => void) => on(IPC.llmOnStreamError, cb),
}

const windowApi = {
  minimize:       invoke<void, void>(IPC.windowMinimize),
  maximizeToggle: invoke<void, void>(IPC.windowMaximizeToggle),
  close:          invoke<void, void>(IPC.windowClose),
  forceClose:     invoke<void, void>(IPC.windowForceClose),
  isMaximized:    invoke<void, boolean>(IPC.windowIsMaximized),
  onMaximizeChange: (cb: (e: WindowMaximizeEvt) => void) => on(IPC.windowOnMaximizeChange, cb),
  onCloseRequested: (cb: (e: WindowCloseRequestedEvt) => void) => on(IPC.windowOnCloseRequested, cb),
}

export const api = { workspace, files, snapshots, settings, llm, window: windowApi }

export type RendererApi = typeof api

contextBridge.exposeInMainWorld('api', Object.freeze(api))
