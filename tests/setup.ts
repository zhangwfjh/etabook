import { vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/mock-user-data',
    isPackaged: false,
    whenReady: () => Promise.resolve(),
    on: vi.fn(),
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: () => Buffer.from(''),
    decryptString: () => '',
  },
  ipcMain: {
    handle: vi.fn(),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
  shell: {
    showItemInFolder: vi.fn(),
    trashItem: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('chokidar', () => ({
  default: {
    watch: () => ({
      on: vi.fn().mockReturnThis(),
      close: vi.fn(),
    }),
  },
}))

export {}
