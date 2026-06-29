import { useEffect, useState } from 'react'
import { Copy, History, Minus, PanelLeft, Redo2, Save, Settings, Square, Undo2, X } from 'lucide-react'
import { useWorkspace } from '@/state/store'
import { getEditor, subscribeEditors } from '@/editor/doc-registry'
import { useSettings } from '@/queries/settings'
import { resolveShortcuts } from '../../../shared/ipc'

type Props = { onOpenSettings: () => void }
export function TitleBar({ onOpenSettings }: Props) {
  const ws = useWorkspace(s => s.workspacePath)
  const active = useWorkspace(s => s.activeFilePath)
  const sidebarOpen = useWorkspace(s => s.sidebarOpen)
  const setSidebarOpen = useWorkspace(s => s.setSidebarOpen)
  const timelineOpen = useWorkspace(s => s.timelineOpen)
  const setTimelineOpen = useWorkspace(s => s.setTimelineOpen)
  const mode = useWorkspace(s => s.editorMode)
  const toggleMode = useWorkspace(s => s.toggleEditorMode)
  const dirty = useWorkspace(s => s.dirty)
  const persistToDisk = useWorkspace(s => s.persistToDisk)
  const [saving, setSaving] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const { data: settings } = useSettings()
  const shortcuts = resolveShortcuts(settings?.shortcuts)
  useEffect(() => {
    window.api.window.isMaximized().then(m => setMaximized(m ?? false))
    const off = window.api.window.onMaximizeChange(e => setMaximized(e.isMaximized))
    return off
  }, [])

  const noDrag = { WebkitAppRegion: 'none' } as React.CSSProperties
  useEffect(() => {
    let editor = active ? getEditor(active) : null

    const read = () => {
      const ed = active ? getEditor(active) : null
      setCanUndo(!!ed && ed.can().undo())
      setCanRedo(!!ed && ed.can().redo())
    }

    if (!active) { setCanUndo(false); setCanRedo(false); return }

    // The editor for the active file is registered asynchronously (after
    // DocSession's handleReady), so on `active` change getEditor() often
    // returns null here. Re-check inside the registry subscription so the
    // transaction listener binds the moment the editor appears.
    if (editor) {
      read()
      editor.on('transaction', read)
    }
    const off = subscribeEditors(() => {
      const next = active ? getEditor(active) : null
      if (next === editor) return
      editor?.off('transaction', read)
      editor = next
      if (editor) {
        read()
        editor.on('transaction', read)
      } else {
        setCanUndo(false); setCanRedo(false)
      }
    })
    return () => { editor?.off('transaction', read); off() }
  }, [active])

  const isEditMode = mode === 'edit'
  function handleUndo() {
    const editor = active ? getEditor(active) : null
    editor?.chain().focus().undo().run()
  }
  function handleRedo() {
    const editor = active ? getEditor(active) : null
    editor?.chain().focus().redo().run()
  }

  return (
    <header className="h-9 flex items-center gap-2 px-2 border-b border-border bg-bg-elevated select-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center gap-2" style={noDrag}>
        <button
          title="Toggle sidebar (Ctrl+B)"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="size-7 grid place-items-center rounded hover:bg-bg-subtle text-fg-muted"
        >
          <PanelLeft className="size-4" />
        </button>
      </div>
      <div className="text-xs text-fg-muted truncate flex-1 min-w-0">
        Etabook{ws ? ` — ${ws.split(/[\\/]/).pop()}` : ''}{active ? ` — ${active.split(/[\\/]/).pop()}` : ''}
      </div>
      <div className="flex items-center gap-2" style={noDrag}>
        {active && isEditMode && (
          <div className="flex items-center gap-0.5" style={noDrag}>
            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              title={`Undo (${shortcuts.undo ?? ''})`}
              className="p-1 rounded hover:bg-bg-subtle text-fg-muted disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Undo"
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={!canRedo}
              title={`Redo (${shortcuts.redo ?? ''})`}
              className="p-1 rounded hover:bg-bg-subtle text-fg-muted disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Redo"
            >
              <Redo2 size={14} />
            </button>
          </div>
        )}
        {active && toggleMode && (
          <div
            className="flex items-center text-[11px] rounded border border-border overflow-hidden"
            title="Toggle edit / read-only view"
          >
            <button
              onClick={() => mode !== 'view' && toggleMode()}
              className={`px-2 py-0.5 leading-none ${mode === 'view' ? 'bg-bg-subtle text-fg-primary' : 'text-fg-muted hover:bg-bg-subtle'}`}
            >
              View
            </button>
            <button
              onClick={() => mode !== 'edit' && toggleMode()}
              className={`px-2 py-0.5 leading-none ${mode === 'edit' ? 'bg-bg-subtle text-fg-primary' : 'text-fg-muted hover:bg-bg-subtle'}`}
            >
              Edit
            </button>
          </div>
        )}
        {active && persistToDisk && (
          <button
            title="Save (Ctrl+S)"
            disabled={!dirty || saving}
            onClick={() => {
              setSaving(true)
              Promise.resolve(persistToDisk()).finally(() => setSaving(false))
            }}
            className="size-7 grid place-items-center rounded hover:bg-bg-subtle text-fg-muted disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Save className="size-4" />
          </button>
        )}
        <button
          title="Toggle version history (Ctrl+Alt+H)"
          onClick={() => setTimelineOpen(!timelineOpen)}
          className={`size-7 grid place-items-center rounded hover:bg-bg-subtle ${timelineOpen ? 'text-fg-primary bg-bg-subtle' : 'text-fg-muted'}`}
        >
          <History className="size-4" />
        </button>
        <button
          title="Settings (Ctrl+,)"
          onClick={onOpenSettings}
          className="size-7 grid place-items-center rounded hover:bg-bg-subtle text-fg-muted"
        >
          <Settings className="size-4" />
        </button>
      </div>
      <div className="flex items-stretch ml-2 -mr-2" style={noDrag}>
        <button
          title="Minimize"
          onClick={() => window.api.window.minimize()}
          className="size-9 grid place-items-center hover:bg-bg-subtle text-fg-muted"
        >
          <Minus className="size-4" />
        </button>
        <button
          title={maximized ? 'Restore' : 'Maximize'}
          onClick={() => window.api.window.maximizeToggle()}
          className="size-9 grid place-items-center hover:bg-bg-subtle text-fg-muted"
        >
          {maximized ? <Copy className="size-3.5 -scale-x-100" /> : <Square className="size-3.5" />}
        </button>
        <button
          title="Close"
          onClick={() => window.api.window.close()}
          className="size-9 grid place-items-center hover:bg-red-500 hover:text-white text-fg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
    </header>
  )
}
