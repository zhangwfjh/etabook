import { useEffect, useRef, useState } from 'react'
import { useFile, useWriteFile } from '@/queries/files'
import { useWorkspace } from '@/state/store'
import { Editor } from '@/editor/Editor'
import { getMarkdownManager } from '@/editor/markdown-manager'
import { useCreateSnapshot } from '@/queries/snapshots'
import { useQueryClient } from '@tanstack/react-query'
import { fileQueryKey } from '@/queries/files'
import { toast } from 'sonner'
import type { Editor as TiptapEditor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { SnapshotPreview } from '@/components/snapshots/VersionTimeline'
import { CommandBar } from './CommandBar'
export function EditorPane() {
  const active = useWorkspace((s) => s.activeFilePath)
  const setDirty = useWorkspace((s) => s.setDirty)
  const dirty = useWorkspace((s) => s.dirty)
  const { data: file, isFetching } = useFile(active)
  const write = useWriteFile()
  const create = useCreateSnapshot()
  const qc = useQueryClient()
  const mgr = getMarkdownManager()
  const [editor, setEditor] = useState<TiptapEditor | null>(null)
  const mode = useWorkspace((s) => s.editorMode)
  const setMode = useWorkspace((s) => s.setEditorMode)
  const baseHash = useRef<string | null>(null)
  const savedMd = useRef<string>('')
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastBlockFingerprint = useRef<string | null>(null)
  const previewId = useWorkspace((s) => s.previewSnapshotId)

  const initialDoc = (() => {
    if (!file) return null
    return mgr.parse(file.content) ?? null
  })()

  useEffect(() => {
    if (!file) return
    baseHash.current = file.hash
    // Baseline goes through the same parse→serialize round-trip as the
    // live 'update' comparison, so normalization differences (trailing
    // newlines, delimiter style, list markers) don't make a fully-undone
    // doc look dirty.
    const parsed = mgr.parse(file.content)
    savedMd.current = parsed ? (mgr.serialize(parsed) ?? file.content) : file.content
    // New file loaded → fingerprint baseline starts unknown so the first real
    // edit snapshots, but the pre-existing content doesn't.
    lastBlockFingerprint.current = null
  }, [file])
  // Derive the current markdown from the editor's document tree.
  function currentMd(): string | null {
    if (!editor) return null
    return mgr.serialize(editor.state.doc.toJSON() as JSONContent)
  }

  // A cheap fingerprint of the document's block structure: one line per
  // top-level node containing its type + text content. Two docs with the same
  // fingerprint have no block-level difference, so there is nothing worth
  // snapshotting. This suppresses snapshots for pure selection/cursor moves
  // and no-op transactions, while still firing when any block changes.
  function blockFingerprint(doc: JSONContent): string {
    const blocks = doc.content ?? []
    return blocks.map((b) => `${b.type}:${textOf(b)}`).join('\n')
  }

  // Recursively extract the text content of a node's descendants.
  function textOf(node: JSONContent): string {
    if (typeof node.text === 'string') return node.text
    return (node.content ?? []).map(textOf).join('')
  }

  // Debounced autosnapshot gated on block-level change: persists edits to the
  // snapshot folder (the safe "extra folder") so work-in-progress is never
  // lost, but NEVER overwrites the source file and ONLY fires when a block has
  // actually changed (not on selection-only updates).
  function autosnapshot(md: string | null, doc: JSONContent | null) {
    if (md == null || !active || !doc) return
    const fp = blockFingerprint(doc)
    if (fp === lastBlockFingerprint.current) return
    lastBlockFingerprint.current = fp
    if (snapshotTimer.current) clearTimeout(snapshotTimer.current)
    snapshotTimer.current = setTimeout(() => {
      create.mutate(
        { filePath: active, content: md, trigger: 'manual', isAutosave: true },
        { onError: () => {} },
      )
    }, 1500)
  }

  // Explicit save: writes the current edits to the source file on disk.
  // Returns a Promise that resolves once the write succeeds or rejects on
  // error (so the unsaved-changes flow can await it).
  function persistToDisk(): Promise<void> {
    const md = currentMd()
    if (md == null || !active) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      write.mutate(
        { filePath: active, content: md, baseHash: baseHash.current ?? undefined },
        {
          onSuccess: (res: any) => {
            if (res) baseHash.current = res.hash
            savedMd.current = md
            setDirty(false)
            toast.success('Saved.')
            resolve()
          },
          onError: (e: any) => {
            toast.error(`Save failed: ${e.message}`)
            reject(e)
          },
        },
      )
    })
  }

  // Expose persistToDisk to the store so the unsaved-changes prompt (and any
  // other non-EditorPane caller) can trigger an explicit save.
  const persistRef = useRef(persistToDisk)
  persistRef.current = persistToDisk
  useEffect(() => {
    useWorkspace.getState().setPersistToDisk(() => persistRef.current())
    return () => useWorkspace.getState().setPersistToDisk(null)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (!active) return
        persistRef.current()
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (!active || !editor) return
        const md = mgr.serialize(editor.state.doc.toJSON() as JSONContent)
        if (md == null) return
        create.mutate({ filePath: active, content: md, trigger: 'manual', isAutosave: false })
        toast.success('Snapshot saved.')
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        if (!editor) return
        editor.chain().focus().insertContent({
          type: 'aiPlan',
          attrs: { id: `plan-${Date.now()}`, model: 'claude-sonnet-4.5' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Describe what you want the AI to plan...' }] }],
        }).run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, editor, create, mgr])

  useEffect(() => {
    if (!active) return
    const off = window.api.files.onContentChanged((e) => {
      if (e.filePath !== active) return
      if (e.reason === 'self' || e.reason === 'restore') return
      if (dirty) {
        useWorkspace.getState().pushExternal({ filePath: e.filePath, newHash: e.hash, newMtime: e.mtime })
      } else {
        qc.invalidateQueries({ queryKey: fileQueryKey(e.filePath) })
      }
    })
    return off
  }, [active, dirty, qc])
  // Expose the mode toggle to siblings (StatusBar) via the store.
  // A ref ensures the store always holds the latest closure (which captures
  // the current editor instance), avoiding stale-capture across re-renders
  // that don't change [mode, editor] (e.g. dirty flips).
  const toggleModeRef = useRef(toggleMode)
  toggleModeRef.current = toggleMode
  useEffect(() => {
    const fn = () => toggleModeRef.current()
    useWorkspace.getState().setToggleEditorMode(fn)
    return () => useWorkspace.getState().setToggleEditorMode(null)
  }, [])

  function toggleMode() {
    setMode(mode === 'edit' ? 'view' : 'edit')
  }

  function handleReady(ed: TiptapEditor) {
    setEditor(ed)
    ed.on('update', () => {
      const json = ed.state.doc.toJSON() as JSONContent
      const md = mgr.serialize(json)
      if (md == null) return
      // Dirty is relative to the last saved file content, not the last
      // transaction — undoing back to the original must clear it.
      setDirty(md !== savedMd.current)
      autosnapshot(md, json)
    })
  }

  if (!active) {
    return (
      <div className="h-full grid place-items-center text-fg-subtle">
        Select a file from the sidebar.
      </div>
    )
  }
  if (isFetching) {
    return (
      <div className="h-full grid place-items-center text-fg-subtle">
        Loading...
      </div>
    )
  }
  if (!file) return null

    return (
    <div className="h-full flex flex-col">
      {previewId ? (
        <SnapshotPreview snapshotId={previewId} />
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-[var(--width-canvas-max)] mx-auto px-6 py-8 w-full">
            <Editor
              key={active}
              initialContent={initialDoc}
              editable={mode === 'edit'}
              onReady={handleReady}
            />
          </div>
        </div>
      )}
      <CommandBar editor={previewId ? null : editor} />
    </div>
  )
}
