import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Search, CornerDownLeft } from 'lucide-react'
import { Modal } from '@renderer/components/ui'
import type { CommandAction } from './commands'

type Props = {
  open: boolean
  onClose: () => void
  commands: CommandAction[]
}

export function CommandPalette({ open, onClose, commands }: Props): ReactElement | null {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => {
      const haystack = (c.title + ' ' + (c.keywords ?? '')).toLowerCase()
      // Simple fuzzy: every char of query appears in order.
      let qi = 0
      for (let i = 0; i < haystack.length && qi < q.length; i++) {
        if (haystack[i] === q[qi]) qi++
      }
      return qi === q.length
    })
  }, [query, commands])

  useEffect(() => {
    setActive(0)
  }, [query])

  const run = (cmd: CommandAction | undefined): void => {
    if (!cmd) return
    cmd.run()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} width="max-w-xl">
      <div className="flex items-center gap-2 px-3 h-11 border-b border-[var(--border)] -mx-4 -mt-4 mb-3">
        <Search size={16} className="opacity-60" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, filtered.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              run(filtered[active])
            }
          }}
          placeholder="Type a command…"
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--text-muted)]"
        />
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">No matches</div>
        )}
        {filtered.map((cmd, i) => (
          <button
            key={cmd.id}
            className={`flex items-center justify-between w-full text-left cursor-pointer px-3 py-2 rounded-[6px] text-sm transition-colors duration-100 ${
              i === active ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'hover:bg-[var(--surface-2)]'
            }`}
            onMouseEnter={() => setActive(i)}
            onClick={() => run(cmd)}
          >
            <span className="flex items-center gap-2">
              {cmd.icon}
              <span>{cmd.title}</span>
            </span>
            {i === active && <CornerDownLeft size={14} className="opacity-60" />}
          </button>
        ))}
      </div>
    </Modal>
  )
}
