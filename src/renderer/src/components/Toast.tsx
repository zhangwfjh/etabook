import { useCallback, useRef, useState, type ReactElement } from 'react'
import { AlertCircle, Info, X } from 'lucide-react'

// Minimal toast stack: bottom-right, above the status bar. Errors stay until
// dismissed; informational toasts auto-expire.

export type Toast = {
  id: number
  kind: 'error' | 'info'
  text: string
}

const TOAST_TTL = 4500

export function useToasts(): {
  toasts: Toast[]
  push: (kind: Toast['kind'], text: string) => void
  dismiss: (id: number) => void
} {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number): void => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (kind: Toast['kind'], text: string): void => {
      const id = nextId.current++
      setToasts((list) => [...list, { id, kind, text }])
      if (kind === 'info') {
        setTimeout(() => {
          setToasts((list) => list.filter((t) => t.id !== id))
        }, TOAST_TTL)
      }
    },
    []
  )

  return { toasts, push, dismiss }
}

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }): ReactElement | null {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-10 right-3 z-[70] flex flex-col gap-2 items-end max-w-md pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="toast-in pointer-events-auto flex items-start gap-2 px-3 py-2 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] text-sm text-[var(--text)]"
        >
          {t.kind === 'error' ? (
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-[var(--danger)]" />
          ) : (
            <Info size={15} className="mt-0.5 shrink-0 text-[var(--accent)]" />
          )}
          <span className="leading-snug">{t.text}</span>
          <button
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss"
            className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text)] shrink-0 mt-0.5"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
