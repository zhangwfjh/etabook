import { type ReactElement } from 'react'
import { X } from 'lucide-react'
import type { Doc } from '@renderer/lib/store'
import { Button } from '@renderer/components/ui'

type Props = {
  docs: Doc[]
  activeId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
}

export function Tabs({ docs, activeId, onActivate, onClose }: Props): ReactElement {
  return (
    <div className="flex items-stretch h-9 border-b border-[var(--border)] bg-[var(--surface)] shrink-0 overflow-x-auto">
      {docs.map((doc) => {
        const active = doc.id === activeId
        return (
          <div
            key={doc.id}
            className={`group flex items-center gap-2 pl-3 pr-1.5 border-r border-[var(--border)] cursor-pointer text-[13px] transition-colors duration-100 ${
              active ? 'bg-[var(--bg)] text-[var(--text)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'
            }`}
            onClick={() => onActivate(doc.id)}
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
  )
}
