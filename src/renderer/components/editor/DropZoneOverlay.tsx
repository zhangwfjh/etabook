import { useState } from 'react'
import type { DropZone } from '@/state/store'
import { cn } from '@/lib/utils'

type Props = {
  onDropZone: (zone: DropZone) => void
  /** When false (group cap reached), only the center/merge zone is shown —
   *  directional triangles are hidden so they can't mislead (dropping on one
   *  would silently merge, which is indistinguishable from center). */
  allowSplit?: boolean
}

const ALL_ZONES: { id: DropZone; label: string; area: string }[] = [
  { id: 'left', label: '◀', area: '1 / 1 / 4 / 2' },
  { id: 'up', label: '▲', area: '1 / 1 / 2 / 4' },
  { id: 'center', label: '◇', area: '2 / 2 / 3 / 3' },
  { id: 'down', label: '▼', area: '3 / 1 / 4 / 4' },
  { id: 'right', label: '▶', area: '1 / 3 / 4 / 4' },
]

function zonesFor(allowSplit: boolean) {
  return allowSplit ? ALL_ZONES : ALL_ZONES.filter((z) => z.id === 'center')
}

export function DropZoneOverlay({ onDropZone, allowSplit = true }: Props) {
  const [hover, setHover] = useState<DropZone | null>(null)
  return (
    <div
      className="absolute inset-0 grid pointer-events-auto"
      style={{ gridTemplateRows: '1fr 1fr 1fr', gridTemplateColumns: '1fr 1fr 1fr', zIndex: 20 }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => {
        // Hover is tracked via dragover (which fires continuously and reliably
        // while over a zone), NOT enter/leave — dragleave races with drop and
        // nulls hover before the drop handler reads it, making drops silently
        // fail. Default to 'center' (merge) if the pointer wasn't clearly in a
        // directional zone, since merging is the lowest-surprise action.
        onDropZone(hover ?? 'center')
        setHover(null)
      }}
    >
      {zonesFor(allowSplit).map((z) => (
        <div
          key={z.id}
          className={cn(
            'm-[14%] rounded-[14px] border-2 border-dashed grid place-items-center transition-colors',
            hover === z.id
              ? 'border-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]'
              : 'border-transparent bg-transparent',
          )}
          style={{ gridArea: z.area }}
          // dragover continuously re-asserts the hovered zone while the pointer
          // is over it; this stays stable right through to the drop event.
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setHover(z.id)
          }}
        >
          <span className="text-[11px] uppercase tracking-wider font-semibold text-[color:var(--accent-strong)]">
            {z.label}
          </span>
        </div>
      ))}
    </div>
  )
}
