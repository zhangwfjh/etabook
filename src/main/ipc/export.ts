import { ipcMain, dialog, BrowserWindow, type BrowserWindow as BW } from 'electron'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export function registerExportIpc(mainWindow: () => BW | null): void {
  ipcMain.handle('export:html', async (_e, html: string, savePath: string): Promise<void> => {
    await mkdir(join(savePath, '..'), { recursive: true })
    await writeFile(savePath, html, 'utf8')
  })

  ipcMain.handle('export:pdf', async (_e, html: string): Promise<string | null> => {
    const win = mainWindow()
    const opts: Electron.SaveDialogOptions = {
      title: 'Export PDF',
      defaultPath: 'document.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    }
    const result = win
      ? await dialog.showSaveDialog(win, opts)
      : await dialog.showSaveDialog(opts)
    if (result.canceled || !result.filePath) return null

    const pdfWin = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: false, sandbox: true, javascript: false }
    })
    try {
      await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      const pdfData = await pdfWin.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4'
      })
      await writeFile(result.filePath, pdfData)
      return result.filePath
    } finally {
      pdfWin.destroy()
    }
  })
}
