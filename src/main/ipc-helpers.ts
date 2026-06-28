import { ipcMain, type IpcMainInvokeEvent, dialog, BrowserWindow } from 'electron'

export function handle<TArgs extends unknown[], TRet>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: TArgs) => Promise<TRet> | TRet,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(event, ...(args as TArgs))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { __etabook_error: message }
    }
  })
}

export function broadcast<T>(channel: string, payload: T): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload)
  }
}

export async function pickDirectory(): Promise<string | null> {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (res.canceled || res.filePaths.length === 0) return null
  return res.filePaths[0]!
}
