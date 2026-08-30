import { app, BrowserWindow, nativeTheme, protocol, net, shell, Menu } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { registerFileIpc } from './ipc/files'
import { registerExportIpc } from './ipc/export'
import { buildAppMenu } from './menu'

const currentDir = dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

// Separate userData dir when requested (ETABOOK_USER_DATA=<dir>): lets a
// dev instance run beside an installed/other copy — the single-instance
// lock and stored config/recent files are per userData, so without this a
// second copy silently quits (requestSingleInstanceLock below).
if (process.env['ETABOOK_USER_DATA']) {
  app.setPath('userData', process.env['ETABOOK_USER_DATA'])
}

// Local-file image protocol. The renderer (http origin in dev, file:// in
// production) cannot load file:// subresources — Chromium blocks cross-origin
// file access. This streams local images regardless of origin; the renderer's
// IPC surface already grants full local read access, so no new capability.
protocol.registerSchemesAsPrivileged([
  { scheme: 'etabook-file', privileges: { standard: true, secure: true } }
])

function registerLocalFileProtocol(): void {
  protocol.handle('etabook-file', (request) => {
    // Standard-scheme URLs parse the Windows drive letter as the host
    // (`etabook-file://d/etabook/...`); reassemble it into the file path.
    const u = new URL(request.url)
    const host = u.host
    const path = decodeURIComponent(u.pathname)
    const abs = host ? `${host}:${path}` : path
    return net.fetch('file:///' + abs.replace(/^\/+/, ''))
  })
}

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'
// Dev-only: expose a CDP endpoint so the test harness can drive the renderer
// over Chromium DevTools Protocol (see test/runner.ts). No-op in packaged builds.
if (isDev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9223')
  // Keep the renderer processing input/paints while the window is occluded or
  // the session is disconnected (RDP) — otherwise CDP input dispatch stalls.
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('remote-allow-origins', '*')
}

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
    registerLocalFileProtocol()
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
