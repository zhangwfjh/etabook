import { useState, useEffect, useRef } from 'react'

type PromptDialogProps = {
  open: boolean
  label: string
  placeholder?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

export function PromptDialog({ open, label, placeholder, onSubmit, onCancel }: PromptDialogProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  if (!open) return null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (value.trim()) onSubmit(value.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
      <span className="text-xs text-fg-muted whitespace-nowrap">{label}</span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { if (!value.trim()) onCancel() }}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
        placeholder={placeholder}
        className="bg-bg-subtle border border-border rounded px-1.5 py-0.5 text-sm text-fg-primary outline-none w-32"
      />
    </form>
  )
}
