import { cn } from '@/lib/utils'

type Props = {
  orientation: 'horizontal' | 'vertical'
}

export function Splitter({ orientation }: Props) {
  const isH = orientation === 'horizontal'
  return (
    <div
      role="separator"
      aria-orientation={isH ? 'vertical' : 'horizontal'}
      className={cn(
        'etabook-splitter shrink-0 bg-border transition-colors',
        'hover:bg-[color-mix(in_srgb,var(--accent)_45%,var(--border))]',
        isH ? 'w-[5px] cursor-col-resize' : 'h-[5px] cursor-row-resize',
      )}
    />
  )
}
