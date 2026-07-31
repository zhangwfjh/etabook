import { contextBridge, ipcRenderer } from 'electron'
import type { EditorAPI, FileContent, FSNode, AppConfig, RecentFile, MenuAction } from '@shared/types'

// Channels are a closed set; the preload only ever invokes these names.
type InvokeChannel =
  | 'fs:readFile'
  | 'fs:writeFile'
  | 'fs:pickOpenFile'
  | 'fs:pickSavePath'
  | 'fs:pickFolder'
  | 'fs:readDirTree'
  | 'fs:createFile'
  | 'fs:movePath'
  | 'fs:unlinkPath'
  | 'recent:get'
  | 'recent:add'
  | 'config:get'
  | 'config:set'
  | 'export:html'
  | 'export:pdf'

function invoke<T>(channel: InvokeChannel, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>
}

const api: EditorAPI = {
  readFile: (path: string) => invoke<FileContent>('fs:readFile', path),
  writeFile: (path: string, content: string) => invoke<void>('fs:writeFile', path, content),
  pickOpenFile: () => invoke<FileContent | null>('fs:pickOpenFile'),
  pickSavePath: (defaultName: string) => invoke<string | null>('fs:pickSavePath', defaultName),
  pickFolder: () => invoke<string | null>('fs:pickFolder'),
  readDirTree: (path: string) => invoke<FSNode[]>('fs:readDirTree', path),
  createFile: (path: string, content?: string) =>
    invoke<FileContent>('fs:createFile', path, content ?? ''),
  movePath: (from: string, to: string) => invoke<void>('fs:movePath', from, to),
  unlinkPath: (path: string) => invoke<void>('fs:unlinkPath', path),
  getRecentFiles: () => invoke<RecentFile[]>('recent:get'),
  addRecentFile: (path: string) => invoke<void>('recent:add', path),
  getConfig: () => invoke<AppConfig>('config:get'),
  setConfig: (config: AppConfig) => invoke<void>('config:set', config),
  exportHtml: (html: string, savePath: string) => invoke<void>('export:html', html, savePath),
  exportPdf: (html: string) => invoke<string | null>('export:pdf', html),
  onOpenRecent: (cb: (path: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, path: string): void => cb(path)
    ipcRenderer.on('menu:open-recent', listener)
    return () => ipcRenderer.off('menu:open-recent', listener)
  },
  onMenuAction: (cb: (action: MenuAction) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: MenuAction): void => cb(action)
    ipcRenderer.on('menu:action', listener)
    return () => ipcRenderer.off('menu:action', listener)
  },
  onThemeSysChange: (cb: (isDark: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, isDark: boolean): void => cb(isDark)
    ipcRenderer.on('theme:sys-change', listener)
    return () => ipcRenderer.off('theme:sys-change', listener)
  }
}

export type { EditorAPI }
export type ApiInstance = typeof api

contextBridge.exposeInMainWorld('api', api)
