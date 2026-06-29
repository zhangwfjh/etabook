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
import type { FilesWriteRes } from '../../../shared/ipc'
import { editorRegistry, persistRegistry } from '@/editor/doc-registry'
import { FindReplacePanel } from '@/components/editor/FindReplacePanel'
import { useFindReplace } from '@/state/find-replace-store'

type Props = {
  filePath: string
  visible: boolean
}

export function DocSession({ filePath, visible }: Props) {
  const { data: file, isFetching } = useFile(filePath)
  const write = useWriteFile()
  const create = useCreateSnapshot()
  const qc = useQueryClient()
  const mgr = getMarkdownManager()
  const [editor, setEditor] = useState<TiptapEditor | null>(null)

  const mode = useWorkspace((s) => (s.docStates[filePath]?.mode ?? 'view'))
  const dirty = useWorkspace((s) => (s.docStates[filePath]?.dirty ?? false))

  const baseHash = useRef<string | null>(null)
  const savedMd = useRef<string>('')
  const snapshotTimer = useRef<NodeJS.Timeout | undefined>(undefined)
  const lastBlockFingerprint = useRef<string | null>(null)

  const initialDoc = (() => {
    if (!file) return null
    return mgr.parse(file.content) ?? null
  })()

  // Baseline hash + saved-md whenever the file blob changes.
  useEffect(() => {
    if (!file) return
    baseHash.current = file.hash
    const parsed = mgr.parse(file.content)
    savedMd.current = parsed ? (mgr.serialize(parsed) ?? file.content) : file.content
    lastBlockFingerprint.current = null
  }, [file, mgr])

  function currentMd(): string | null {
    if (!editor) return null
    return mgr.serialize(editor.state.doc.toJSON() as JSONContent)
  }

  function blockFingerprint(doc: JSONContent): string {
    return (doc.content ?? []).map((b) => `${b.type}:${textOf(b)}`).join('\n')
  }
  function textOf(node: JSONContent): string {
    if (typeof node.text === 'string') return node.text
    return (node.content ?? []).map(textOf).join('')
  }

  function autosnapshot(md: string | null, doc: JSONContent | null) {
    if (md == null || !doc) return
    const fp = blockFingerprint(doc)
    if (fp === lastBlockFingerprint.current) return
    lastBlockFingerprint.current = fp
    clearTimeout(snapshotTimer.current)
    snapshotTimer.current = setTimeout(() => {
      create.mutate(
        { filePath, content: md, trigger: 'manual', isAutosave: true },
        { onError: () => {} },
      )
    }, 1500)
  }

  function persistToDisk(): Promise<void> {
    const md = currentMd()
    if (md == null) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      write.mutate(
        { filePath, content: md, baseHash: baseHash.current ?? undefined },
        {
          onSuccess: (res: FilesWriteRes | null) => {
            if (res) baseHash.current = res.hash
            savedMd.current = md
            useWorkspace.getState().setDocDirty(filePath, false)
            toast.success('Saved.')
            resolve()
          },
          onError: (e: unknown) => {
            const msg = e instanceof Error ? e.message : String(e)
            toast.error(`Save failed: ${msg}`)
            reject(e)
          },
        },
      )
    })
  }

  // Register editor + persist into the module registries for the lifetime of this doc.
  useEffect(() => {
    if (editor) editorRegistry.set(filePath, editor)
    return () => { editorRegistry.delete(filePath) }
  }, [filePath, editor])
  useEffect(() => {
    persistRegistry.set(filePath, persistToDisk)
    return () => { persistRegistry.delete(filePath) }
  }, [filePath, editor, write, mgr])

  // Local-keyed save/snapshot/ai-plan shortcuts scoped to this doc's editor.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!visible) return // only the visible doc handles keys
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        persistToDisk()
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (!editor) return
        const md = mgr.serialize(editor.state.doc.toJSON() as JSONContent)
        if (md == null) return
        create.mutate({ filePath, content: md, trigger: 'manual', isAutosave: false })
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
  }, [visible, filePath, editor, create, mgr])

  // Content-changed listener, scoped to this doc.
  useEffect(() => {
    const off = window.api.files.onContentChanged((e) => {
      if (e.filePath !== filePath) return
      if (e.reason === 'self' || e.reason === 'restore') return
      if (dirty) {
        useWorkspace.getState().pushExternal({ filePath: e.filePath, newHash: e.hash, newMtime: e.mtime })
      } else {
        qc.invalidateQueries({ queryKey: fileQueryKey(e.filePath) })
      }
    })
    return off
  }, [filePath, dirty, qc])

  function handleReady(ed: TiptapEditor) {
    setEditor(ed)
    ed.on('update', () => {
      const json = ed.state.doc.toJSON() as JSONContent
      const md = mgr.serialize(json)
      if (md == null) return
      useWorkspace.getState().setDocDirty(filePath, md !== savedMd.current)
      autosnapshot(md, json)
    })
  }

  // Cleanup pending snapshot timer on unmount.
  useEffect(() => () => clearTimeout(snapshotTimer.current), [])


  // Auto-close the find/replace panel when leaving edit mode.
  useEffect(() => {
    if (mode !== 'edit') useFindReplace.getState().closePanel()
  }, [mode])

  return (
    <div style={visible ? { position: 'relative' } : { position: 'relative', display: 'none' }} className="h-full flex flex-col">
       <div className="flex-1 min-h-0 overflow-y-auto">
         <div className="max-w-[var(--width-canvas-max)] mx-auto px-6 py-8 w-full">
           {isFetching ? null : (
             <Editor initialContent={initialDoc} editable={mode === 'edit'} onReady={handleReady} />
           )}
         </div>
       </div>
      <FindReplacePanel editor={editor} />

    </div>
  )
}
