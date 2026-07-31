import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { RecentFile } from '@shared/types'

const MAX_RECENT = 25

function file(): string {
  return join(app.getPath('userData'), 'recent.json')
}

export async function getRecentFiles(): Promise<RecentFile[]> {
  try {
    const raw = await readFile(file(), 'utf8')
    const data = JSON.parse(raw) as RecentFile[]
    if (!Array.isArray(data)) return []
    // Drop missing files; keep ordering (most-recent first).
    const present = data.filter((r) => r && typeof r.path === 'string' && existsSync(r.path))
    return present.slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

export async function addRecentFile(path: string): Promise<void> {
  const list = await getRecentFiles()
  const filtered = list.filter((r) => r.path !== path)
  const entry: RecentFile = {
    path,
    name: path.split(/[\\/]/).pop() ?? path,
    openedAt: Date.now()
  }
  const next = [entry, ...filtered].slice(0, MAX_RECENT)
  await mkdir(dirname(file()), { recursive: true })
  await writeFile(file(), JSON.stringify(next, null, 2), 'utf8')
}

export async function buildRecentMenuTemplate(): Promise<Electron.MenuItemConstructorOptions[]> {
  const recents = await getRecentFiles()
  if (recents.length === 0) {
    return [{ label: 'No Recent Files', enabled: false }]
  }
  return recents.map((r) => ({
    label: r.name,
    sublabel: r.path,
    click: () => {
      // Renderer listens for this channel and opens the path via window.api.readFile.
      for (const w of BrowserWindow.getAllWindows()) {
        w.webContents.send('menu:open-recent', r.path)
      }
    }
  }))
}
