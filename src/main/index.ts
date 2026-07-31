import { app, BrowserWindow, nativeTheme, shell, Menu } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { registerFileIpc } from './ipc/files'
import { registerExportIpc } from './ipc/export'
import { buildAppMenu } from './menu'

const currentDir = dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

let mainWindow: BrowserWindow | null = null

function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 720,
    minHeight: 500,
    show: false,
    autoHideMenuBar: false,
    title: 'etabook',
    backgroundColor: '#15161A',
    webPreferences: {
      preload: join(currentDir, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // External links open in the browser, not a new Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await mainWindow.loadFile(join(currentDir, '../renderer/index.html'))
  }
}


// Forward native color-scheme changes so the renderer can follow "system" theme.
nativeTheme.on('updated', () => {
  mainWindow?.webContents.send('theme:sys-change', nativeTheme.shouldUseDarkColors)
})

async function refreshMenu(): Promise<void> {
  const menu = await buildAppMenu(getMainWindow)
  Menu.setApplicationMenu(menu)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    registerFileIpc(getMainWindow)
    registerExportIpc(getMainWindow)
    await refreshMenu()
    await createWindow()
    // Rebuild the menu periodically so the Recent list stays fresh; cheap.
    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) await createWindow()
      await refreshMenu()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

export {}
