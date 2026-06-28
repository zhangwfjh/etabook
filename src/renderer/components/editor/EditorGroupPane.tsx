import { useEffect, useState } from 'react'
import { useWorkspace, type EditorGroup } from '@/state/store'
import { DocSession } from './DocSession'
import { DropZoneOverlay } from './DropZoneOverlay'
import { TabBar } from './TabBar'
import { CommandBar } from './CommandBar'
import { SnapshotPreview } from '@/components/snapshots/VersionTimeline'
import { getEditor, getPersist } from '@/editor/doc-registry'
import { cn } from '@/lib/utils'

type Props = {
  group: EditorGroup
  focused: boolean
}

export function EditorGroupPane({ group, focused }: Props) {
  const previewId = useWorkspace((s) => s.previewSnapshotId)
  const setPersistToDisk = useWorkspace((s) => s.setPersistToDisk)
  const setToggleEditorMode = useWorkspace((s) => s.setToggleEditorMode)
  const setDocMode = useWorkspace((s) => s.setDocMode)
  const setActiveGroup = useWorkspace((s) => s.setActiveGroup)
  const dropOnZone = useWorkspace((s) => s.dropOnZone)
  const [dropping, setDropping] = useState(false)

  const activeDoc = group.activeDoc

  // Re-bind the store's persistToDisk / toggleEditorMode to the active doc
  // whenever focus or the active doc changes. Only the focused pane owns the slots.
  useEffect(() => {
    if (!focused || !activeDoc) return

    setPersistToDisk(getPersist(activeDoc) ?? null)
    const editor = getEditor(activeDoc)
    setToggleEditorMode(() => {
      // Read CURRENT mode at call time — a value captured here would go stale
      // after the first toggle.
      const cur = useWorkspace.getState().docStates[activeDoc]?.mode ?? 'view'
      const next = cur === 'edit' ? 'view' : 'edit'
      setDocMode(activeDoc, next)
      editor?.setEditable(next === 'edit')
    })
    // No cleanup-nulls: when focus moves from pane A to pane B, React runs B's
    // new effect BEFORE A's cleanup (effects and cleanups interleave per fiber),
    // so a cleanup that nulled the slots would clobber B's freshly-written binding
    // and leave the slots empty. Instead each focused pane unconditionally writes
    // the slots for its own activeDoc; the newly-focused pane overwrites.
  }, [focused, activeDoc, setPersistToDisk, setToggleEditorMode, setDocMode])

  // Safety net: `dragend` ALWAYS fires on the drag source when a drag ends
  // (successful drop, drop on nothing, or Escape-cancel). `dragleave` is flaky,
  // so this guarantees the drop-zone overlay disappears in every case.
  useEffect(() => {
    function onDragEnd() { setDropping(false) }
    window.addEventListener('dragend', onDragEnd)
    return () => window.removeEventListener('dragend', onDragEnd)
  }, [])

  return (
    <div className={cn('h-full flex flex-col min-h-0', focused && 'etabook-group-focused')}>
      <TabBar group={group} focused={focused} />
      <div
        className="relative flex-1 min-h-0"
        // Click-to-focus (symmetric with the tab bar): any pointer press in
        // this group's area — read-only or edit, caret or no caret — makes it
        // the active group. The derived activeFilePath then drives the
        // StatusBar dirty flag, TitleBar view/edit toggle, and snapshot list.
        // onMouseDown fires before focus/caret resolution, so it also works in
        // read-only mode where a plain click places no caret.
        onMouseDown={() => {
          if (useWorkspace.getState().activeGroupId !== group.id) {
            setActiveGroup(group.id)
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-etabook-tab')) {
            e.preventDefault()
            setDropping(true)
          }
        }}
        onDragLeave={(e) => {
          // Only clear when leaving the wrapper itself, not a child.
          if (e.currentTarget === e.target) setDropping(false)
        }}
        onDrop={() => setDropping(false)}
      >
        {previewId && focused ? (
          <SnapshotPreview snapshotId={previewId} />
        ) : (
          group.docs.map((path) => (
            <DocSession key={path} filePath={path} visible={path === group.activeDoc} />
          ))
        )}
        {dropping && (
          <DropZoneOverlay
            allowSplit={useWorkspace.getState().groups.length < 2}
            onDropZone={(zone) => {
              const payload = window.__etabookDragPayload
              if (payload) dropOnZone(payload.path, payload.fromGroup, group.id, zone)
              setDropping(false)
            }}
          />
        )}
      </div>
      {focused && <CommandBar editor={activeDoc ? getEditor(activeDoc) : null} />}
    </div>
  )
}
