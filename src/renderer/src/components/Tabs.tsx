import { useEffect, useRef, type ReactElement } from 'react'
import { Plus, X } from 'lucide-react'
import type { Doc } from '@renderer/lib/store'
import { Button, Tooltip } from '@renderer/components/ui'

type Props = {
  docs: Doc[]
  activeId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

export function Tabs({ docs, activeId, onActivate, onClose, onNew }: Props): ReactElement {
  const stripRef = useRef<HTMLDivElement>(null)

  // Wheel over the strip scrolls it horizontally (vertical wheel, common in
  // editors). Registered non-passive so the page never scrolls instead.
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      if (el.scrollWidth <= el.clientWidth) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div className="flex items-stretch h-9 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">
      <div ref={stripRef} className="flex items-stretch flex-1 min-w-0 overflow-x-auto">
        {docs.map((doc) => {
          const active = doc.id === activeId
          return (
            <div
              key={doc.id}
              className={`group flex items-center gap-2 pl-3 pr-1.5 border-r border-[var(--border)] cursor-pointer text-[13px] transition-colors duration-100 shrink-0 ${
                active ? 'bg-[var(--bg)] text-[var(--text)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'
              }`}
              onClick={() => onActivate(doc.id)}
              onAuxClick={(e) => {
                // Middle-click closes the tab (standard editor behavior).
                if (e.button === 1) {
                  e.preventDefault()
                  onClose(doc.id)
                }
              }}
              title={doc.path ?? doc.name}
            >
              {doc.dirty && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />}
              <span className="truncate max-w-[160px]">{doc.name}</span>
              <Button
                size="icon"
                variant="ghost"
                className="opacity-0 group-hover:opacity-100 h-5 w-5"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(doc.id)
                }}
                aria-label={`Close ${doc.name}`}
              >
                <X size={12} />
              </Button>
            </div>
          )
        })}
      </div>
      <div className="flex items-center px-1 shrink-0">
        <Tooltip label="New file (Ctrl+N)">
          <Button size="icon" variant="ghost" onClick={onNew} aria-label="New file">
            <Plus size={16} />
          </Button>
        </Tooltip>
      </div>
    </div>
  )
}
