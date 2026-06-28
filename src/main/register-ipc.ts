import { app, BrowserWindow } from 'electron'
import { join, sep } from 'node:path'
import { statSync } from 'node:fs'
import { IPC, type FilesWriteRes, type FilesCreateRes, type FilesDeleteRes, type FilesPasteReq, type AppConfig, type SecretKey, type SnapshotTrigger } from '../shared/ipc'
import { createConfigStore, type ConfigStore } from './config-store'
import { listTree, readFile, writeFile, createEntry, renameEntry, deleteEntry, copyEntry, pasteEntry, trashEntry, reveal } from './file-service'
import { createSnapshotService, type SnapshotService } from './snapshot-service'
import { handle, broadcast, pickDirectory } from './ipc-helpers'
import { registerLlm } from './register-llm'
import chokidar, { type FSWatcher } from 'chokidar'

export type Deps = {
  config: ConfigStore
  snapshots: SnapshotService
  fileWatchers: Map<string, FSWatcher>
}

export function registerIpc(): Deps {
  const userData = app.getPath('userData')
  const runtimeDir = join(userData, '.etabook')
  const config = createConfigStore({ userDataDir: userData })
  const snapshots = createSnapshotService({ runtimeDir, retention: config.get().snapshotRetention })

  const fileWatchers = new Map<string, FSWatcher>()
  const lastSeenHash = new Map<string, string>()

  function getCurrentHash(filePath: string): string | null {
    try { return readFile(filePath).hash } catch { return null }
  }

  function ensureWatcher(workspacePath: string) {
    let w = fileWatchers.get(workspacePath)
    if (w) return w
    w = chokidar.watch(workspacePath, {
      ignored: (p: string) =>
        p.includes(`${workspacePath}${sep}node_modules`) ||
        p.includes(`${workspacePath}${sep}.git`) ||
        p.includes(`${workspacePath}${sep}.etabook`),
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    })
    w.on('add', () => emitTree(workspacePath))
    w.on('unlink', () => emitTree(workspacePath))
    w.on('addDir', () => emitTree(workspacePath))
    w.on('unlinkDir', () => emitTree(workspacePath))
    w.on('change', (p: string) => {
      const newHash = getCurrentHash(p)
      if (!newHash) return
      const last = lastSeenHash.get(p)
      if (last === newHash) return
      const stat = statSync(p)
      lastSeenHash.set(p, newHash)
      broadcast(IPC.filesOnContentChanged, { filePath: p, hash: newHash, mtime: stat.mtimeMs, reason: 'external' as const })
    })
    fileWatchers.set(workspacePath, w)
    return w
  }

  function emitTree(workspacePath: string) {
    try {
      const tree = listTree(workspacePath, config.get().fileExclusions)
      broadcast(IPC.filesOnTreeChanged, { workspacePath, tree })
    } catch {}
  }

  function getWorkspace(): string | null {
    return config.get().workspacePath
  }
  function setWorkspace(p: string | null) {
    config.set({ workspacePath: p })
    if (p) ensureWatcher(p)
  }

  handle(IPC.workspacePick, async () => {
    const picked = await pickDirectory()
    if (!picked) return null
    setWorkspace(picked)
    return picked
  })
  handle(IPC.workspaceCurrent, () => getWorkspace())
  handle(IPC.workspaceSwitch, (_e, p: string | null) => {
    setWorkspace(p)
    return p
  })

  handle(IPC.filesList, (_e, req: { workspacePath: string }) => {
    return listTree(req.workspacePath, config.get().fileExclusions)
  })
  handle(IPC.filesRead, (_e, req: { filePath: string }) => readFile(req.filePath))
  handle<[{ filePath: string; content: string; baseHash?: string }], FilesWriteRes>(IPC.filesWrite, (_e, req) => {
    const res = writeFile(req.filePath, req.content, req.baseHash)
    lastSeenHash.set(req.filePath, res.hash)
    return res
  })
  handle<[{ workspacePath: string; relPath: string; content: string; isDirectory: boolean }], FilesCreateRes>(IPC.filesCreate, (_e, req) => {
    return createEntry(req.workspacePath, req.relPath, req.content, req.isDirectory)
  })
  handle<[{ filePath: string; newName: string }], FilesCreateRes>(IPC.filesRename, (_e, req) => {
    return renameEntry(req.filePath, req.newName)
  })
  handle<[{ filePath: string }], FilesDeleteRes>(IPC.filesDelete, (_e, req) => {
    return deleteEntry(req.filePath)
  })
  handle<[{ filePath: string }], FilesDeleteRes>(IPC.filesTrash, async (_e, req) => {
    return trashEntry(req.filePath)
  })
  handle<[{ filePath: string }], FilesCreateRes>(IPC.filesCopy, (_e, req) => {
    return copyEntry(req.filePath)
  })
  handle<[FilesPasteReq], FilesCreateRes>(IPC.filesPaste, (_e, req) => {
    return pasteEntry(req.srcPath, req.destDir, req.mode)
  })
  handle(IPC.filesReveal, (_e, req: { filePath: string }) => {
    reveal(req.filePath)
  })

  handle(IPC.snapshotsList, (_e, req: { filePath: string }) => snapshots.list(req.filePath))
  handle(IPC.snapshotsGet,   (_e, req: { id: string }) => snapshots.get(req.id))
  handle(IPC.snapshotsRestore, (_e, req: { id: string; createPreRestoreSnapshot: boolean }) => snapshots.restore(req.id, { createPreRestoreSnapshot: req.createPreRestoreSnapshot }))
  handle(IPC.snapshotsCreate, (_e, req: { filePath: string; content: string; trigger: SnapshotTrigger; model?: string; isAutosave: boolean }) => {
    return snapshots.create(req)
  })

  handle(IPC.settingsGet, () => config.get())
  handle(IPC.settingsSet, (_e, patch: Partial<AppConfig>) => {
    const next = config.set(patch)
    if (patch.workspacePath !== undefined && patch.workspacePath !== null) ensureWatcher(patch.workspacePath)
    return next
  })
  handle(IPC.settingsSetSecret, (_e, req: { key: SecretKey; value: string }) => {
    config.setSecret(req.key, req.value)
  })
  handle(IPC.settingsGetSecret, (_e, req: { key: SecretKey }) => {
    return config.getSecret(req.key)
  })
  handle(IPC.settingsHasSecret, (_e, req: { key: SecretKey }) => config.hasSecret(req.key))

  // ── Window controls (frameless titlebar) ────────────────────────────────
  handle(IPC.windowMinimize, (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  // windowClose triggers the renderer-side unsaved-changes guard (see
  // main/index.ts on('close')); the renderer decides whether to proceed.
  handle(IPC.windowClose, (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  // forceClose bypasses the guard: used after the user has resolved the
  // unsaved-changes prompt (or when there is nothing dirty to save).
  handle(IPC.windowForceClose, (e) => BrowserWindow.fromWebContents(e.sender)?.destroy())
  handle(IPC.windowMaximizeToggle, (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    if (w.isMaximized()) w.unmaximize(); else w.maximize()
  })
  handle(IPC.windowIsMaximized, (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false)

  registerLlm(config)

  const boot = getWorkspace()
  if (boot) ensureWatcher(boot)

  return { config, snapshots, fileWatchers }
}
