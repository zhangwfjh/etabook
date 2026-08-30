import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import {
  PanelLeft,
  Eye,
  Code,
  BookOpen,
  Command as CommandIcon,
  Sun,
  Moon,
  Columns2
} from 'lucide-react'
import type { EditorView as EditorViewType } from '@codemirror/view'
import { api } from '@renderer/lib/ipc'
import { useStore, useActiveDoc, type Doc } from '@renderer/lib/store'
import { useTheme } from '@renderer/features/settings/ThemeProvider'
import { Toolbar } from '@renderer/components/Toolbar'
import { getActiveEditorView } from '@renderer/lib/activeView'
import { Tabs } from '@renderer/components/Tabs'
import { StatusBar } from '@renderer/components/StatusBar'
import { Button, Tooltip } from '@renderer/components/ui'
import { FileTree } from '@renderer/features/fileTree/FileTree'
import { Outline } from '@renderer/features/outline/Outline'
import { QuickOpen } from '@renderer/features/quickOpen/QuickOpen'
import { EditorPane } from '@renderer/modes/Views'
import { CommandPalette } from '@renderer/features/commandPalette/CommandPalette'
import { buildCommands } from '@renderer/features/commandPalette/commands'
import { SettingsModal } from '@renderer/features/settings/SettingsModal'
import { ShortcutsModal } from '@renderer/features/shortcuts/ShortcutsModal'
import { ConfirmDialog, PromptDialog } from '@renderer/components/Dialogs'
import { ToastStack, useToasts } from '@renderer/components/Toast'
import {
  openFind,
  openReplace,
  findNextMatch,
  findPrevMatch,
  promptGotoLine
} from '@renderer/features/findReplace/findReplace'
import { dropEditorState } from '@renderer/editor/Editor'
import { installEditorApi } from '@renderer/features/findReplace/editorApi'
import { exportMarkdown, exportHtml, exportPdf } from '@renderer/features/export/export'
import type { MenuAction } from '@shared/types'

export function App(): ReactElement {
  const { state, dispatch } = useStore()
  const { dark, setTheme, config, setConfig } = useTheme()
  const activeDoc = useActiveDoc()
  const [cursorPos, setCursorPos] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  // In-app dialog state (replaces window.prompt/confirm/alert).
  const [newFilePrompt, setNewFilePrompt] = useState<{ parentDir: string } | null>(null)
  const [closeConfirm, setCloseConfirm] = useState<{ docId: string; name: string } | null>(null)
  const { toasts, push, dismiss } = useToasts()
  // Sidebar width, persisted on drag end (clamped 180–480).
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    Math.min(480, Math.max(180, Math.round(config.sidebarWidth ?? 256)))
  )
  const resizeDrag = useRef<{ startX: number; startW: number } | null>(null)
  // Split editor: right pane pinned to its own doc; divider drag resizes.
  const [splitOpen, setSplitOpen] = useState(false)
  const [rightDocId, setRightDocId] = useState<string | null>(null)
  const [splitRatio, setSplitRatio] = useState(0.5)
  const [quickOpen, setQuickOpen] = useState(false)
  // Synchronous mirror of the focused pane — CM's focusChanged handler must
  // read it in the same event tick, before React commits the state update.
  const focusedPaneRef = useRef<'left' | 'right'>('left')
  const paneViews = useRef<{ left: EditorViewType | null; right: EditorViewType | null }>({ left: null, right: null })
  const splitDrag = useRef<{ startX: number; startRatio: number } | null>(null)

  /** Route the global editor-view bridge to the pane that owns focus.
   * Destroyed panes never leave a stale view behind: each side registers and
   * unregisters itself, and the bridge resolves focused > left > right. */
  const setPaneView = (side: 'left' | 'right', view: EditorViewType | null): void => {
    paneViews.current[side] = view
    const w = window as unknown as { __editorView?: EditorViewType }
    w.__editorView = (paneViews.current[focusedPaneRef.current] ?? paneViews.current.left ?? paneViews.current.right) ?? undefined
  }

  installEditorApi()

  // Keep the store dispatch reachable for the interactive test harness
  // (mirrors the __editorView pattern; dispatch is stable across renders).
  ;(window as unknown as { __storeDispatch?: typeof dispatch }).__storeDispatch = dispatch
  ;(window as unknown as { __storeGetState?: () => typeof state }).__storeGetState = () => state

  const openPath = useCallback((path: string): void => {
    api()
      .readFile(path)
      .then(({ content }) => dispatch({ type: 'open-doc', path, content }))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const offMenu = api().onMenuAction((action: MenuAction) => handleMenuAction(action))
    const offRecent = api().onOpenRecent((path) => openPath(path))
    return () => {
      offMenu()
      offRecent()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.docs, state.activeId])

  // --- Actions ---------------------------------------------------------------
  function newDoc(): void {
    dispatch({ type: 'new-doc' })
  }

  async function openFile(): Promise<void> {
    const result = await api().pickOpenFile()
    if (!result) return
    dispatch({ type: 'open-doc', path: result.path, content: result.content })
  }

  async function pickFolder(): Promise<void> {
    const folder = await api().pickFolder()
    if (!folder) return
    dispatch({ type: 'set-workspace', workspace: folder })
    const cfg = await api().getConfig()
    await api().setConfig({ ...cfg, workspace: folder })
  }

  async function createFile(parentDir: string, rawName: string): Promise<void> {
    const name = rawName.trim()
    if (!name) return
    const path = `${parentDir}/${name}`
    try {
      const { content } = await api().createFile(path, '')
      dispatch({ type: 'open-doc', path, content })
      setRefreshKey((k) => k + 1)
    } catch (err) {
      const reason = err instanceof Error && err.message ? ` — ${err.message}` : ''
      push('error', `Could not create ${name}${reason}`)
    }
  }

  async function save(active: Doc | null, saveAs = false): Promise<boolean> {
    if (!active) return false
    let path = active.path
    if (!path || saveAs) {
      path = (await api().pickSavePath(active.name)) ?? undefined
      if (!path) return false
    }
    dispatch({ type: 'save-status', status: 'saving' })
    try {
      await api().writeFile(path, active.content)
      await api().addRecentFile(path)
      dispatch({ type: 'mark-clean', id: active.id, path })
      return true
    } catch {
      dispatch({ type: 'save-status', status: 'error' })
      push('error', `Could not save ${active.name} — check the location and try again.`)
      return false
    }
  }

  function closeDoc(id: string): void {
    dropEditorState(id)
    dispatch({ type: 'close-doc', id })
  }

  /** Close request: dirty docs go through the themed confirm dialog. */
  function requestClose(id: string): void {
    const doc = state.docs.find((d) => d.id === id)
    if (doc?.dirty) setCloseConfirm({ docId: id, name: doc.name })
    else closeDoc(id)
  }

  async function handleCloseConfirm(choice: string | null): Promise<void> {
    const pending = closeConfirm
    setCloseConfirm(null)
    if (!pending || choice === null || choice === 'cancel') return
    if (choice === 'discard') {
      closeDoc(pending.docId)
      return
    }
    // 'save': save first; keep the tab open when saving fails (error toasted).
    const doc = state.docs.find((d) => d.id === pending.docId)
    if (!doc) return
    if (await save(doc)) closeDoc(pending.docId)
  }

  function handleMenuAction(action: MenuAction): void {
    const doc = activeDoc
    switch (action.type) {
      case 'new':
        newDoc()
        break
      case 'open':
        void openFile()
        break
      case 'save':
        void save(doc)
        break
      case 'save-as':
        void save(doc, true)
        break
      case 'mode-source':
        dispatch({ type: 'set-mode', mode: 'source' })
        break
      case 'mode-live':
        dispatch({ type: 'set-mode', mode: 'live' })
        break
      case 'mode-reading':
        dispatch({ type: 'set-mode', mode: 'reading' })
        break
      case 'toggle-sidebar':
        dispatch({ type: 'set-sidebar', open: !state.sidebarOpen })
        break
      case 'toggle-split':
        setSplitOpen((v) => !v)
        break
      case 'quick-open':
        setQuickOpen(true)
        break
      case 'toggle-theme':
        setTheme(dark ? 'light' : 'dark')
        break
      case 'command-palette':
        dispatch({ type: 'palette', open: true })
        break
       case 'find':
         openFind(getActiveEditorView())
         break
      case 'replace':
        openReplace(getActiveEditorView())
        break
      case 'find-next':
        findNextMatch(getActiveEditorView())
        break
      case 'find-prev':
        findPrevMatch(getActiveEditorView())
        break
      case 'goto-line':
        promptGotoLine(getActiveEditorView())
        break
      case 'export-md':
        void exportMarkdown(doc ?? state.docs[0])
        break
      case 'export-html':
        void exportHtml(doc ?? state.docs[0], dark, state.workspace)
        break
      case 'export-pdf':
        void exportPdf(doc ?? state.docs[0], dark, state.workspace)
        break
    }
  }

  // --- Command palette commands ---------------------------------------------
  const commands = buildCommands({
    onNew: newDoc,
    onOpen: () => void openFile(),
    onSave: () => void save(activeDoc),
    onSaveAs: () => void save(activeDoc, true),
    onModeSource: () => dispatch({ type: 'set-mode', mode: 'source' }),
    onModeLive: () => dispatch({ type: 'set-mode', mode: 'live' }),
    onModeReading: () => dispatch({ type: 'set-mode', mode: 'reading' }),
    onToggleTheme: () => setTheme(dark ? 'light' : 'dark'),
    onToggleSidebar: () => dispatch({ type: 'set-sidebar', open: !state.sidebarOpen }),
    onOpenSettings: () => dispatch({ type: 'settings', open: true }),
    onOpenShortcuts: () => dispatch({ type: 'shortcuts', open: true }),
    onFind: () => openFind(getActiveEditorView()),
    onExportMd: () => void exportMarkdown(activeDoc ?? state.docs[0]),
    onExportHtml: () => void exportHtml(activeDoc ?? state.docs[0], dark, state.workspace),
    onExportPdf: () => void exportPdf(activeDoc ?? state.docs[0], dark, state.workspace),
    onToggleSplit: () => setSplitOpen((v) => !v),
    onQuickOpen: () => setQuickOpen(true),
  })

  function jumpToPos(pos: number): void {
    const view = getActiveEditorView()
    if (view) {
      view.dispatch({ selection: { anchor: pos }, effects: [], scrollIntoView: true })
      view.focus()
    }
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--bg)] overflow-hidden">
      {/* Title bar / toolbar row */}
      <div className="flex items-center gap-1 h-10 px-2 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">
        <Tooltip label="Toggle sidebar (Ctrl+\)">
          <Button size="icon" variant="ghost" onClick={() => dispatch({ type: 'set-sidebar', open: !state.sidebarOpen })} aria-label="Toggle sidebar">
            <PanelLeft size={16} />
          </Button>
        </Tooltip>
        <span className="font-serif font-semibold text-base px-2 select-none">etabook</span>
        <div className="flex-1" />
        {/* Mode switcher */}
        <div className="inline-flex items-center rounded-[6px] border border-[var(--border)] overflow-hidden">
          <ModeButton active={state.mode === 'source'} onClick={() => dispatch({ type: 'set-mode', mode: 'source' })} icon={<Code size={14} />} label="Source" />
          <ModeButton active={state.mode === 'live'} onClick={() => dispatch({ type: 'set-mode', mode: 'live' })} icon={<Eye size={14} />} label="Live" />
          <ModeButton active={state.mode === 'reading'} onClick={() => dispatch({ type: 'set-mode', mode: 'reading' })} icon={<BookOpen size={14} />} label="Read" />
        </div>
        <Tooltip label="Toggle split view (Ctrl+Shift+\)">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setSplitOpen((v) => !v)}
            aria-label="Toggle split view"
          >
            <Columns2 size={16} />
          </Button>
        </Tooltip>
        <Tooltip label="Command palette (Ctrl+K)">
          <Button size="icon" variant="ghost" onClick={() => dispatch({ type: 'palette', open: true })} aria-label="Command palette">
            <CommandIcon size={16} />
          </Button>
        </Tooltip>
        <Tooltip label="Toggle theme">
          <Button size="icon" variant="ghost" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label="Toggle theme">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
        </Tooltip>
      </div>

      <Tabs
        docs={state.docs}
        activeId={state.activeId}
        onActivate={(id) => {
          // While the right pane owns focus, tab clicks re-pin it (VS Code
          // split behavior); otherwise they switch the active (left) doc.
          if (splitOpen && focusedPaneRef.current === 'right' && id !== state.activeId) {
            setRightDocId(id)
          } else {
            dispatch({ type: 'activate', id })
          }
        }}
        onClose={requestClose}
        onNew={newDoc}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        {state.sidebarOpen && (
          <aside
            className="relative border-r border-[var(--border)] bg-[var(--surface)] shrink-0 flex flex-col"
            style={{ width: sidebarWidth }}
          >
            <FileTree
              workspace={state.workspace}
              activePath={activeDoc?.path}
              onOpen={openPath}
              onPickFolder={pickFolder}
              onCreate={(parentDir) => setNewFilePrompt({ parentDir })}
              refreshKey={refreshKey}
            />
            <div className="border-t border-[var(--border)] max-h-[40%]">
              <Outline doc={activeDoc} onJump={jumpToPos} />
            </div>
            {/* Drag handle: drag to resize, double-click to reset (256px). */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize z-10 hover:bg-[var(--accent-soft)]"
              onPointerDown={(e) => {
                if (e.button !== 0) return
                resizeDrag.current = { startX: e.clientX, startW: sidebarWidth }
                e.currentTarget.setPointerCapture(e.pointerId)
                document.body.style.userSelect = 'none'
                document.body.style.cursor = 'col-resize'
              }}
              onPointerMove={(e) => {
                const d = resizeDrag.current
                if (d) setSidebarWidth(Math.min(480, Math.max(180, Math.round(d.startW + e.clientX - d.startX))))
              }}
              onPointerUp={() => {
                if (!resizeDrag.current) return
                resizeDrag.current = null
                document.body.style.userSelect = ''
                document.body.style.cursor = ''
                void setConfig({ sidebarWidth })
              }}
              onDoubleClick={() => {
                setSidebarWidth(256)
                void setConfig({ sidebarWidth: 256 })
              }}
            />
          </aside>
        )}

        {/* Editor area */}
        <main className="flex flex-col flex-1 min-w-0">
          {state.mode !== 'reading' && <Toolbar />}
          <div className="flex-1 min-h-0 flex overflow-hidden bg-[var(--bg)]">
            {/* Left pane — the active tab (tab clicks while the right pane is
                focused re-pin the right pane instead). */}
            <div
              className="min-w-0 flex-1 relative"
              style={splitOpen ? { flex: `0 0 ${Math.round(splitRatio * 100)}%` } : undefined}
              onFocusCapture={() => { focusedPaneRef.current = 'left' }}
            >
              {activeDoc ? (
                <EditorPaneBridge
                  doc={activeDoc}
                  mode={state.mode}
                  workspace={state.workspace}
                  onOpenNote={openPath}
                  onChange={(text) => dispatch({ type: 'set-content', id: activeDoc.id, content: text })}
                  onCursorChange={setCursorPos}
                  onReady={(v) => setPaneView('left', v)}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 select-none">
                  <span className="font-serif text-lg text-[var(--text)]">No tabs open</span>
                  <span className="text-[13px] text-[var(--text-muted)] flex items-center gap-1.5">
                    Press
                    <kbd className="font-mono text-[12px] px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)]">
                      Ctrl+N
                    </kbd>
                    for a new note, or open one from the sidebar
                  </span>
                </div>
              )}
            </div>
            {splitOpen && activeDoc && (
              <>
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize split"
                  className="w-1.5 cursor-col-resize hover:bg-[var(--accent-soft)] shrink-0"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return
                    splitDrag.current = { startX: e.clientX, startRatio: splitRatio }
                    e.currentTarget.setPointerCapture(e.pointerId)
                  }}
                  onPointerMove={(e) => {
                    const d = splitDrag.current
                    if (!d) return
                    const host = e.currentTarget.parentElement
                    if (!host) return
                    const ratio = d.startRatio + (e.clientX - d.startX) / host.clientWidth
                    setSplitRatio(Math.min(0.8, Math.max(0.2, ratio)))
                  }}
                  onPointerUp={() => { splitDrag.current = null }}
                  onDoubleClick={() => setSplitRatio(0.5)}
                />
                <div className="min-w-0 flex-1 relative" onFocusCapture={() => { focusedPaneRef.current = 'right' }}>
                  <EditorPaneBridge
                    doc={state.docs.find((d) => d.id === rightDocId) ?? activeDoc}
                    mode={state.mode}
                    workspace={state.workspace}
                    onOpenNote={openPath}
                    onChange={(text) => {
                      const rd = state.docs.find((d) => d.id === rightDocId)
                      dispatch({ type: 'set-content', id: rd ? rd.id : activeDoc.id, content: text })
                    }}
                    onCursorChange={setCursorPos}
                    onReady={(v) => setPaneView('right', v)}
                  />
                </div>
              </>
            )}
          </div>
          {activeDoc && (
            <StatusBar doc={activeDoc} cursorPos={cursorPos} mode={state.mode} saveStatus={state.saveStatus} />
          )}
        </main>
      </div>
      <QuickOpen open={quickOpen} onClose={() => setQuickOpen(false)} workspace={state.workspace} activePath={activeDoc?.path} onOpen={openPath} />

      <CommandPalette open={state.paletteOpen} onClose={() => dispatch({ type: 'palette', open: false })} commands={commands} />
      <SettingsModal open={state.settingsOpen} onClose={() => dispatch({ type: 'settings', open: false })} />
      <ShortcutsModal open={state.shortcutsOpen} onClose={() => dispatch({ type: 'shortcuts', open: false })} />

      <PromptDialog
        open={newFilePrompt !== null}
        title="New File"
        label="File name"
        initial="untitled.md"
        onResolve={(name) => {
          const pending = newFilePrompt
          setNewFilePrompt(null)
          if (pending && name) void createFile(pending.parentDir, name)
        }}
      />
      <ConfirmDialog
        open={closeConfirm !== null}
        title="Unsaved changes"
        message={
          <span>
            <strong className="text-[var(--text)]">{closeConfirm?.name}</strong> has unsaved changes.
          </span>
        }
        actions={[
          { label: 'Cancel', value: 'cancel', variant: 'ghost' },
          { label: 'Discard', value: 'discard', variant: 'danger-solid' },
          { label: 'Save & Close', value: 'save', variant: 'solid' }
        ]}
        onResolve={(choice) => void handleCloseConfirm(choice)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean
  onClick: () => void
  icon: ReactElement
  label: string
}): ReactElement {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 h-7 text-[13px] cursor-pointer transition-colors duration-100 ${
        active ? 'bg-[var(--accent)] text-[var(--accent-contrast)]' : 'hover:bg-[var(--surface-2)]'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

// Bridge that exposes the active EditorView up to the toolbar/find commands.
function EditorPaneBridge({
  doc,
  mode,
  workspace,
  onChange,
  onCursorChange,
  onReady,
  onOpenNote
}: {
  doc: Doc
  mode: 'source' | 'live' | 'reading'
  workspace?: string
  onChange: (text: string) => void
  onCursorChange: (pos: number) => void
  onReady: (view: EditorViewType | null) => void
  onOpenNote?: (path: string) => void
}): ReactElement {
  return (
    <EditorPane
      doc={doc}
      livePreview={mode === 'live' || mode === 'reading'}
      reading={mode === 'reading'}
      workspace={workspace}
      onOpenNote={onOpenNote}
      onChange={onChange}
      onCursorChange={onCursorChange}
      onView={onReady}
    />
  )
}
