import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile, writeFile, readdir, mkdir, rename, unlink } from 'node:fs/promises'
import { type Dirent, existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { FSNode, FileContent } from '@shared/types'
import { getRecentFiles, addRecentFile } from '../lib/recent'
import { getConfig, setConfig } from '../lib/config'

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '.DS_Store', 'dist', 'out', 'build', '.cache'
])

const SHOWABLE_EXTS = new Set([
  '.md', '.markdown', '.mdx', '.txt', '.mdown',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'
])

function openDialog(opts: Electron.OpenDialogOptions, win: BrowserWindow | null): Promise<Electron.OpenDialogReturnValue> {
  return win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts)
}

function saveDialog(opts: Electron.SaveDialogOptions, win: BrowserWindow | null): Promise<Electron.SaveDialogReturnValue> {
  return win ? dialog.showSaveDialog(win, opts) : dialog.showSaveDialog(opts)
}

export function registerFileIpc(mainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('fs:readFile', async (_e, path: string): Promise<FileContent> => {
    const content = await readFile(path, 'utf8')
    return { path, content }
  })

  ipcMain.handle('fs:writeFile', async (_e, path: string, content: string): Promise<void> => {
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, content, 'utf8')
  })

  ipcMain.handle('fs:pickOpenFile', async (): Promise<FileContent | null> => {
    const result = await openDialog(
      {
        title: 'Open Markdown',
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx', 'txt', 'mdown'] }],
        properties: ['openFile']
      },
      mainWindow()
    )
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]
    const content = await readFile(path, 'utf8')
    await addRecentFile(path)
    return { path, content }
  })

  ipcMain.handle('fs:pickSavePath', async (_e, defaultName: string): Promise<string | null> => {
    const result = await saveDialog(
      { title: 'Save', defaultPath: defaultName, filters: [{ name: 'Markdown', extensions: ['md'] }] },
      mainWindow()
    )
    return result.canceled || !result.filePath ? null : result.filePath
  })

  ipcMain.handle('fs:pickFolder', async (): Promise<string | null> => {
    const result = await openDialog({ title: 'Open Folder', properties: ['openDirectory'] }, mainWindow())
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle('fs:readDirTree', async (_e, root: string): Promise<FSNode[]> => {
    return readTree(root, 0)
  })

  ipcMain.handle('fs:createFile', async (_e, path: string, content: string): Promise<FileContent> => {
    if (!existsSync(path)) {
      await mkdir(join(path, '..'), { recursive: true })
      await writeFile(path, content ?? '', 'utf8')
    }
    return { path, content: await readFile(path, 'utf8') }
  })

  ipcMain.handle('fs:movePath', async (_e, from: string, to: string): Promise<void> => {
    await rename(from, to)
  })

  ipcMain.handle('fs:unlinkPath', async (_e, path: string): Promise<void> => {
    await unlink(path)
  })

  ipcMain.handle('recent:get', () => getRecentFiles())
  ipcMain.handle('recent:add', (_e, p: string) => addRecentFile(p))
  ipcMain.handle('config:get', () => getConfig())
  ipcMain.handle('config:set', (_e, c) => setConfig(c))
}

function isInteresting(entry: Dirent): boolean {
  if (entry.isDirectory()) return !IGNORED_DIRS.has(entry.name)
  if (!entry.isFile()) return false
  return SHOWABLE_EXTS.has(extname(entry.name).toLowerCase())
}

async function readTree(dir: string, depth: number): Promise<FSNode[]> {
  if (depth > 8) return []
  let entries: Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: FSNode[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (!isInteresting(entry)) continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      const children = await readTree(fullPath, depth + 1)
      if (children.length > 0) {
        out.push({ name: entry.name, path: fullPath, isDir: true, children })
      }
    } else if (entry.isFile()) {
      out.push({ name: entry.name, path: fullPath, isDir: false })
    }
  }
  out.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true })
  })
  return out
}
