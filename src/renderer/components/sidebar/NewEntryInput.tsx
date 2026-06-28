import { useEffect, useRef, useState } from 'react'
import { FileText, Folder } from 'lucide-react'

type Props = {
  type: 'file' | 'folder'
  depth: number
  onSubmit: (value: string) => void
  onCancel: () => void
}

/** Inline input row for naming a new file or folder. Manages its own value state. */
export function NewEntryInput({ type, depth, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  function submit() {
    const trimmed = value.trim()
    if (trimmed) onSubmit(trimmed)
    else onCancel()
  }

  return (
    <div
      className="w-full flex items-center gap-1 px-1 py-0.5"
      style={{ paddingLeft: 4 + depth * 12 + 12 }}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {type === 'file' ? (
        <FileText className="size-3.5 shrink-0 text-fg-muted" />
      ) : (
        <Folder className="size-3.5 shrink-0 text-fg-muted" />
      )}
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') onCancel()
        }}
        placeholder={type === 'file' ? 'untitled.md' : 'new-folder'}
        className="bg-bg-subtle border border-border rounded px-1 text-sm text-fg-primary outline-none w-full"
      />
    </div>
  )
}
