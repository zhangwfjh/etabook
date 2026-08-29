// Shared types crossing the main/preload/renderer boundary.
// Source of truth for the `window.api` surface (EditorAPI).

export type FSNode = {
  name: string
  path: string
  isDir: boolean
  children?: FSNode[]
}

export type MenuAction =
  | { type: 'new' }
  | { type: 'open' }
  | { type: 'save' }
  | { type: 'save-as' }
  | { type: 'export-md' }
  | { type: 'export-html' }
  | { type: 'export-pdf' }
  | { type: 'mode-source' }
  | { type: 'mode-live' }
  | { type: 'mode-reading' }
  | { type: 'command-palette' }
  | { type: 'find' }
  | { type: 'replace' }
  | { type: 'find-next' }
  | { type: 'find-prev' }
  | { type: 'goto-line' }
  | { type: 'toggle-sidebar' }
  | { type: 'toggle-theme' }

export type ThemeMode = 'light' | 'dark' | 'system'
export type EditorMode = 'source' | 'live' | 'reading'

export type AppConfig = {
  theme: ThemeMode
  fontUi: string
  fontEditor: string
  fontCode: string
  fontSize: number
  editorMode: EditorMode
  lineWrap: boolean
  showLineNumbers: boolean
  /** Sidebar pixel width, persisted across sessions (clamped 180–480). */
  sidebarWidth?: number
  workspace?: string
  lastFile?: string
}

export type RecentFile = { path: string; name: string; openedAt: number }

export type FileContent = { path: string; content: string }

export type EditorAPI = {
  readFile(path: string): Promise<FileContent>
  writeFile(path: string, content: string): Promise<void>
  pickOpenFile(): Promise<FileContent | null>
  pickSavePath(defaultName: string): Promise<string | null>
  pickFolder(): Promise<string | null>
  readDirTree(path: string): Promise<FSNode[]>
  createFile(path: string, content?: string): Promise<FileContent>
  movePath(from: string, to: string): Promise<void>
  unlinkPath(path: string): Promise<void>
  getRecentFiles(): Promise<RecentFile[]>
  addRecentFile(path: string): Promise<void>
  getConfig(): Promise<AppConfig>
  setConfig(config: AppConfig): Promise<void>
  exportHtml(html: string, savePath: string): Promise<void>
  exportPdf(html: string): Promise<string | null>
  onOpenRecent(cb: (path: string) => void): () => void
  onMenuAction(cb: (a: MenuAction) => void): () => void
  onThemeSysChange(cb: (isDark: boolean) => void): () => void
}

export const DEFAULT_CONFIG: AppConfig = {
  theme: 'system',
  fontUi: 'Geist Variable',
  fontEditor: 'Geist Variable',
  fontCode: 'JetBrains Mono',
  fontSize: 16,
  editorMode: 'live',
  lineWrap: true,
  showLineNumbers: false
}
