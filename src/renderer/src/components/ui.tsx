import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useEffect, type ReactElement, cloneElement } from 'react'
import { X } from 'lucide-react'

// --- Button ------------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'ghost' | 'outline' | 'solid' | 'danger'
  size?: 'sm' | 'md' | 'icon'
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  ghost: 'hover:bg-[var(--surface-2)] text-[var(--text)]',
  outline: 'border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--text)]',
  solid: 'bg-[var(--accent)] text-[var(--accent-contrast)] hover:opacity-90',
  danger: 'text-[var(--danger)] hover:bg-[var(--surface-2)]'
}

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-7 px-2 text-[13px] rounded-[5px]',
  md: 'h-9 px-3 text-sm rounded-[6px]',
  icon: 'h-8 w-8 rounded-[6px] inline-flex items-center justify-center'
}

export function Button({ variant = 'ghost', size = 'md', className = '', children, ...rest }: ButtonProps): ReactElement {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 cursor-pointer select-none transition-colors duration-150 ease-out disabled:opacity-40 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </button>
  )
}

// --- Tooltip -----------------------------------------------------------------

export function Tooltip({
  label,
  children,
  side = 'bottom'
}: {
  label: string
  children: ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
}): ReactElement {
  const sideClass =
    side === 'top'
      ? 'bottom-full mb-1 left-1/2 -translate-x-1/2'
      : side === 'left'
        ? 'right-full mr-1 top-1/2 -translate-y-1/2'
        : side === 'right'
          ? 'left-full ml-1 top-1/2 -translate-y-1/2'
          : 'top-full mt-1 left-1/2 -translate-x-1/2'
  return (
    <span className="relative group inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 ${sideClass} hidden group-hover:block rounded px-2 py-1 text-xs whitespace-nowrap bg-[var(--text)] text-[var(--bg)] shadow-md`}
      >
        {label}
      </span>
    </span>
  )
}

// --- Modal -------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-2xl'
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  width?: string
}): ReactElement | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/40 backdrop-blur-[1px]"
      onMouseDown={onClose}
    >
      <div
        className={`w-full ${width} mx-4 rounded-lg bg-[var(--surface)] border border-[var(--border)] shadow-xl flex flex-col max-h-[75vh]`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between px-4 h-12 border-b border-[var(--border)] shrink-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
              <X size={16} />
            </Button>
          </div>
        )}
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}

// Allow callers to pass a single child element with clone semantics.
export { cloneElement }
