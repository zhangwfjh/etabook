import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './register-ipc'
import { IPC } from '../shared/ipc'

const isDev = !app.isPackaged
const preloadDir = join(import.meta.dirname, '../preload/index.cjs')
const rendererDir = join(import.meta.dirname, '../renderer/index.html')

let deps: ReturnType<typeof registerIpc> | null = null

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    backgroundColor: '#0b0d10',
    webPreferences: {
      preload: preloadDir,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.on('ready-to-show', () => win.show())
  // Intercept all close paths (titlebar button, Alt+F4, taskbar). Give the
  // renderer a chance to run its unsaved-changes guard first; if dirty, the
  // renderer shows a prompt and calls window:forceClose once resolved.
  //
  // No re-entrancy guard is needed: forceClose uses win.destroy(), which does
  // NOT re-emit 'close' (only win.close() does). preventDefault keeps the
  // window alive each time until the renderer decides to forceClose or the
  // user cancels (cancel simply does nothing — next close retries cleanly).
  win.on('close', (e) => {
    e.preventDefault()
    win.webContents.send(IPC.windowOnCloseRequested, { windowId: win.id })
  })
  const emitMaximize = () => win.webContents.send(IPC.windowOnMaximizeChange, { isMaximized: win.isMaximized() })
  win.on('maximize', emitMaximize)
  win.on('unmaximize', emitMaximize)
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(rendererDir)
  }
  return win
}

app.whenReady().then(() => {
  deps = registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  for (const w of deps?.fileWatchers.values() ?? []) w.close()
  if (process.platform !== 'darwin') app.quit()
})
