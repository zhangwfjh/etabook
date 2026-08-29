import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Button, Modal } from '@renderer/components/ui'

// --- Confirm -----------------------------------------------------------------
// Themed replacement for window.confirm. `actions` renders right-to-left in
// the order given; Escape / backdrop / X resolve as null (cancel).

export type ConfirmAction = {
  label: string
  value: string
  variant?: 'solid' | 'danger-solid' | 'ghost'
}

export function ConfirmDialog({
  open,
  title,
  message,
  actions,
  onResolve
}: {
  open: boolean
  title: string
  message: ReactNode
  actions: ConfirmAction[]
  onResolve: (value: string | null) => void
}): ReactElement | null {
  if (!open) return null
  return (
    <Modal open={open} onClose={() => onResolve(null)} title={title} width="max-w-sm">
      <div className="text-sm text-[var(--text-muted)] leading-relaxed">{message}</div>
      <div className="flex justify-end gap-2 mt-5">
        {actions.map((a) => (
          <Button key={a.value} size="sm" variant={a.variant ?? 'ghost'} onClick={() => onResolve(a.value)}>
            {a.label}
          </Button>
        ))}
      </div>
    </Modal>
  )
}

// --- Prompt ------------------------------------------------------------------
// Themed replacement for window.prompt. Enter confirms, Escape cancels; the
// confirm button stays disabled while the trimmed value is empty.

export function PromptDialog({
  open,
  title,
  label,
  initial = '',
  placeholder = '',
  confirmLabel = 'Create',
  onResolve
}: {
  open: boolean
  title: string
  label: string
  initial?: string
  placeholder?: string
  confirmLabel?: string
  onResolve: (value: string | null) => void
}): ReactElement | null {
  const [value, setValue] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue(initial)
      // Focus once per open; select the basename so typing replaces it.
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        const dot = el.value.lastIndexOf('.')
        el.setSelectionRange(0, dot > 0 ? dot : el.value.length)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const trimmed = value.trim()
  return (
    <Modal open={open} onClose={() => onResolve(null)} title={title} width="max-w-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (trimmed) onResolve(trimmed)
        }}
      >
        <label className="block text-sm text-[var(--text-muted)] mb-1.5">{label}</label>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className="w-full h-8 px-2 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] text-sm outline-none focus-visible:border-[var(--accent)]"
        />
        <div className="flex justify-end gap-2 mt-5">
          <Button type="button" size="sm" variant="ghost" onClick={() => onResolve(null)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" variant="solid" disabled={!trimmed}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
