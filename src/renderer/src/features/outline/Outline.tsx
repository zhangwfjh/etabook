import { type ReactElement, useEffect, useState } from 'react'
import type { Doc } from '@renderer/lib/store'

type Heading = { level: number; text: string; pos: number }

function parseHeadings(doc: Doc): Heading[] {
  const lines = doc.content.split('\n')
  let char = 0
  const out: Heading[] = []
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*$/)
    if (m) {
      out.push({ level: m[1].length, text: m[2].replace(/[#*`_~>]/g, '').trim(), pos: char })
    }
    char += line.length + 1
  }
  return out
}

export function Outline({
  doc,
  onJump
}: {
  doc: Doc | null
  onJump: (pos: number) => void
}): ReactElement {
  const [, setTick] = useState(0)
  useEffect(() => {
    setTick((t) => t + 1)
  }, [doc?.content])

  if (!doc) {
    return <div className="p-4 text-sm text-[var(--text-muted)]">No document open.</div>
  }
  const headings = parseHeadings(doc)
  if (headings.length === 0) {
    return <div className="p-4 text-sm text-[var(--text-muted)]">No headings found.</div>
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 h-9 flex items-center border-b border-[var(--border)] shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Outline</span>
      </div>
      <div className="flex-1 overflow-y-auto py-2 text-[13px]">
        {headings.map((h, i) => (
          <button
            key={i}
            className="block w-full text-left cursor-pointer hover:bg-[var(--surface-2)] transition-colors duration-100 py-1 truncate"
            style={{ paddingLeft: 12 + (h.level - 1) * 14, paddingRight: 8 }}
            onClick={() => onJump(h.pos)}
            title={h.text}
          >
            {h.text}
          </button>
        ))}
      </div>
    </div>
  )
}
