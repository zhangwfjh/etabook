import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import type { MenuAction } from '@shared/types'
import { buildRecentMenuTemplate } from './lib/recent'

const isMac = process.platform === 'darwin'

function send(win: BrowserWindow | null, action: MenuAction): void {
  win?.webContents.send('menu:action', action)
}

export async function buildAppMenu(mainWindow: () => BrowserWindow | null): Promise<Menu> {
  const win = () => mainWindow()
  const recents = await buildRecentMenuTemplate()

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([{
          label: 'etabook',
          submenu: [
            { role: 'about', label: 'About etabook' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide', label: 'Hide etabook' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit', label: 'Quit etabook' }
          ]
        }] as MenuItemConstructorOptions[])
      : ([] as MenuItemConstructorOptions[])),
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => send(win(), { type: 'new' })
        },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => send(win(), { type: 'open' })
        },
        {
          label: 'Open Recent',
          submenu: recents
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => send(win(), { type: 'save' })
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => send(win(), { type: 'save-as' })
        },
        { type: 'separator' },
        {
          label: 'Export Markdown',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => send(win(), { type: 'export-md' })
        },
        {
          label: 'Export HTML',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => send(win(), { type: 'export-html' })
        },
        {
          label: 'Export PDF',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => send(win(), { type: 'export-pdf' })
        },
        ...(!isMac ? [{ type: 'separator' as const }, { role: 'quit' as const }] : [])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => send(win(), { type: 'find' })
        },
        {
          label: 'Replace',
          accelerator: 'CmdOrCtrl+H',
          click: () => send(win(), { type: 'replace' })
        },
        { type: 'separator' },
        {
          label: 'Find Next',
          accelerator: 'CmdOrCtrl+G',
          click: () => send(win(), { type: 'find-next' })
        },
        {
          label: 'Find Previous',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => send(win(), { type: 'find-prev' })
        },
        { type: 'separator' },
        {
          label: 'Go to Line…',
          accelerator: 'CmdOrCtrl+Alt+G',
          click: () => send(win(), { type: 'goto-line' })
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Source Mode',
          accelerator: 'CmdOrCtrl+Alt+1',
          click: () => send(win(), { type: 'mode-source' })
        },
        {
          label: 'Live Preview Mode',
          accelerator: 'CmdOrCtrl+Alt+2',
          click: () => send(win(), { type: 'mode-live' })
        },
        {
          label: 'Reading Mode',
          accelerator: 'CmdOrCtrl+Alt+3',
          click: () => send(win(), { type: 'mode-reading' })
        },
        { type: 'separator' },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+\\',
          click: () => send(win(), { type: 'toggle-sidebar' })
        },
        {
          label: 'Toggle Theme',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => send(win(), { type: 'toggle-theme' })
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Go',
      submenu: [
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+K',
          click: () => send(win(), { type: 'command-palette' })
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+/',
          click: () => send(win(), { type: 'command-palette' })
        }
      ]
    }
  ]

  return Menu.buildFromTemplate(template)
}
