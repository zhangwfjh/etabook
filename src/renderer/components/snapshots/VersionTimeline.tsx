import { useState } from 'react'
import { useSnapshot, useSnapshots, useRestoreSnapshot } from '@/queries/snapshots'
import { useWorkspace } from '@/state/store'
import { RestoreDialog } from './RestoreDialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Camera, Bot, RotateCcw, Save, X, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SnapshotMeta } from '../../../shared/ipc'
import { Editor } from '@/editor/Editor'
import { getMarkdownManager } from '@/editor/markdown-manager'

const triggerIcon: Record<string, React.ReactNode> = {
  manual: <Camera className="size-3.5 shrink-0" />,
  'pre-ai': <Bot className="size-3.5 shrink-0" />,
  'post-ai': <Bot className="size-3.5 shrink-0" />,
  'pre-restore': <RotateCcw className="size-3.5 shrink-0" />,
}

const triggerLabel: Record<string, string> = {
  manual: 'Manual Save',
  'pre-ai': 'Pre-AI Write',
  'post-ai': 'Post-AI Write',
  'pre-restore': 'Pre-Restore',
}

/**
 * Sliding version-history panel on the right edge (spec §6.2, width 320px).
 * Toggle via store.timelineOpen (TitleBar clock icon / Ctrl+Alt+H).
 * Selecting a snapshot puts the canvas into read-only preview (EditorPane).
 * Restore writes the selected snapshot to disk and clears preview.
 */
export function VersionTimeline() {
  const open = useWorkspace((s) => s.timelineOpen)
  const setOpen = useWorkspace((s) => s.setTimelineOpen)
  const previewId = useWorkspace((s) => s.previewSnapshotId)
  const setPreviewId = useWorkspace((s) => s.setPreviewSnapshotId)
  const active = useWorkspace((s) => s.activeFilePath)

  const { data: snapshots } = useSnapshots(open ? active : null)
  const restore = useRestoreSnapshot()
  const [restoreId, setRestoreId] = useState<string | null>(null)

  function handleClose() {
    setOpen(false)
    setPreviewId(null)
  }

  function handleRestoreClick() {
    if (!previewId) return
    setRestoreId(previewId)
  }

  // In-flow column: width-animated (0 ↔ 320px). Stays in normal flow so it
  // reserves its own space and never masks the canvas, matching the left Sidebar.
  return (
    <>
      <div
        className="h-full overflow-hidden transition-[width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ width: open ? 'var(--width-timeline)' : '0px' }}
        aria-hidden={!open}
      >
      <aside className="h-full w-[var(--width-timeline)] bg-bg-elevated border-l border-border flex flex-col">
        <header className="flex items-center gap-2 px-3 h-9 border-b border-border shrink-0">
          <Clock className="size-3.5 text-fg-muted" />
          <span className="text-xs uppercase tracking-wide text-fg-muted">Version History</span>
          <div className="flex-1" />
          <button
            title="Close"
            onClick={handleClose}
            className="size-6 grid place-items-center rounded hover:bg-bg-subtle text-fg-muted"
          >
            <X className="size-3.5" />
          </button>
        </header>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-2 space-y-1">
            {/* Current version row — clears preview */}
            <button
              onClick={() => setPreviewId(null)}
              className={cn(
                'w-full text-left rounded px-2 py-2 text-xs',
                previewId === null ? 'bg-accent/15' : 'hover:bg-bg-subtle',
              )}
            >
              <div className="flex items-center gap-1.5 text-fg-primary font-medium">
                <span className="size-2 rounded-full bg-success" />
                Current Version
              </div>
              <div className="text-fg-subtle mt-0.5 pl-3.5">Live document</div>
            </button>

            {snapshots && snapshots.length > 0 ? (
              snapshots.map((s: SnapshotMeta) => (
                <button
                  key={s.id}
                  onClick={() => setPreviewId(s.id)}
                  className={cn(
                    'w-full text-left rounded px-2 py-2 text-xs',
                    previewId === s.id ? 'bg-accent/15' : 'hover:bg-bg-subtle',
                  )}
                >
                  <div className="flex items-center gap-1.5 text-fg-muted">
                    {triggerIcon[s.trigger] ?? <Camera className="size-3.5 shrink-0" />}
                    <span>{triggerLabel[s.trigger] ?? s.trigger}</span>
                  </div>
                  <div className="text-fg-subtle mt-0.5 pl-4">
                    {new Date(s.createdAt).toLocaleString()}
                  </div>
                  {s.model && (
                    <div className="text-fg-subtle pl-4 truncate">{s.model}</div>
                  )}
                </button>
              ))
            ) : (
              <div className="text-fg-subtle text-xs px-2 py-4 flex items-center gap-1.5">
                <Save className="size-3.5" />
                No snapshots yet. Press Ctrl+S to create one.
              </div>
            )}
          </div>
        </ScrollArea>

        {previewId && (
          <div className="border-t border-border p-2 shrink-0">
            <Button size="sm" className="w-full" onClick={handleRestoreClick} disabled={restore.isPending}>
              <RotateCcw className="size-3.5" />
              Restore This Version
            </Button>
          </div>
        )}
      </aside>
      </div>

      <RestoreDialog
        snapshotId={restoreId}
        open={!!restoreId}
        onOpenChange={(v) => { if (!v) setRestoreId(null) }}
        filePath={active ?? ''}
        onRestored={() => setPreviewId(null)}
      />
    </>
  )
}

/**
 * Read-only preview of the selected snapshot content. Rendered inside the
 * editor canvas while a snapshot is selected (EditorPane).
 */
export function SnapshotPreview({ snapshotId }: { snapshotId: string }) {
  const { data: snapshot } = useSnapshot(snapshotId)
  const mgr = getMarkdownManager()
  const doc = snapshot ? (mgr.parse(snapshot.content) ?? null) : null
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 max-w-[var(--width-canvas-max)] mx-auto px-6 py-8 w-full overflow-y-auto">
        {snapshot ? (
          <Editor initialContent={doc} editable={false} />
        ) : (
          <div className="text-fg-subtle text-sm">Loading snapshot...</div>
        )}
      </div>
    </div>
  )
}
