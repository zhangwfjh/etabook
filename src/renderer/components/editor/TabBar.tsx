import { useWorkspace, type EditorGroup } from '@/state/store'
import { useCloseTabChecked } from '@/hooks/use-unsaved-guard'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Window-global drag payload fallback. HTML5 DnD clears `dataTransfer` after the
// drop event, so the drop-zone overlay (Task 12) cannot read the tab payload back.
// We mirror it here on drag start; the writer is the only owner of this field.
declare global {
  interface Window {
    __etabookDragPayload?: { path: string; fromGroup: string }
  }
}

type Props = {
  group: EditorGroup
  focused: boolean
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

export function TabBar({ group, focused }: Props) {
  const activeGroupId = useWorkspace((s) => s.activeGroupId)
  const setActiveTab = useWorkspace((s) => s.setActiveTab)
  const setActiveGroup = useWorkspace((s) => s.setActiveGroup)
  const closeTabChecked = useCloseTabChecked()
  const docStates = useWorkspace((s) => s.docStates)
  const reorderTab = useWorkspace((s) => s.reorderTab)

  function selectTab(path: string) {
    setActiveGroup(group.id)
    setActiveTab(group.id, path)
  }

  function handleClose(e: React.MouseEvent, path: string) {
    e.stopPropagation()
    closeTabChecked(group.id, path)
  }

    return (
    <div
      className="etabook-tabbar flex items-stretch bg-bg-elevated border-b border-border px-2 pt-1.5 gap-1"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-etabook-tab')) e.preventDefault()
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData('application/x-etabook-tab')
        if (!raw) return
        let parsed: unknown
        try { parsed = JSON.parse(raw) } catch { return }
        // Runtime-narrow the parsed JSON — never trust shape blindly.
        if (!parsed || typeof parsed !== 'object' || !('path' in parsed) || !('fromGroup' in parsed)) return
        const p = parsed as { path: string; fromGroup: string }
        if (p.fromGroup !== group.id) return // cross-group is handled by the overlay
        const from = group.docs.indexOf(p.path)
        if (from === -1) return
        // Drop position: find the tab under the pointer's x midpoint.
        const tabs = Array.from(e.currentTarget.children) as HTMLElement[]
        let to = group.docs.length - 1
        for (let i = 0; i < tabs.length; i++) {
          const r = tabs[i].getBoundingClientRect()
          if (e.clientX < r.left + r.width / 2) { to = i; break }
        }
        reorderTab(group.id, from, to)
      }}
    >
      {group.docs.map((path) => {
        const active = group.activeDoc === path && activeGroupId === group.id
        const dirty = docStates[path]?.dirty ?? false
        return (
          <div
            key={path}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                'application/x-etabook-tab',
                JSON.stringify({ path, fromGroup: group.id }),
              )
              e.dataTransfer.effectAllowed = 'move'
              // Window-global fallback for the drop-zone overlay (Task 12),
              // because dataTransfer is cleared after the drop event.
              window.__etabookDragPayload = { path, fromGroup: group.id }
            }}
            onClick={() => selectTab(path)}
            onDragEnd={() => { delete window.__etabookDragPayload }}
            data-focused={focused}
            className={cn(
              'etabook-tab group flex items-center gap-1.5 px-2.5 py-1 text-[13px] cursor-default select-none',
              'rounded-t-[10px] border border-transparent',
              active
                ? 'bg-bg-canvas border-border text-fg-primary'
                : 'text-fg-muted hover:text-fg-primary',
            )}
            title={path}
          >
            <span className="truncate max-w-[160px]">{basename(path)}</span>
            {dirty ? (
              <>
                <span
                  className="size-[7px] rounded-full bg-accent shrink-0"
                  aria-label="unsaved"
                />
                <button
                  type="button"
                  onClick={(e) => handleClose(e, path)}
                  className={cn(
                    'size-[15px] grid place-items-center rounded-sm text-fg-subtle hover:bg-bg-subtle shrink-0',
                    active ? 'grid' : 'hidden group-hover:grid',
                  )}
                  aria-label={`Close ${basename(path)}`}
                >
                  <X className="size-3" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={(e) => handleClose(e, path)}
                className="size-[15px] grid place-items-center rounded-sm text-fg-subtle opacity-0 group-hover:opacity-100 hover:bg-bg-subtle shrink-0"
                style={{ opacity: active ? 1 : undefined }}
                aria-label={`Close ${basename(path)}`}
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
