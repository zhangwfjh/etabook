import { useRef, useEffect } from 'react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu'
import { TURN_INTO_TARGETS, isTurnableTarget } from './turn-into-targets'
import type { Editor } from '@tiptap/core'

export interface BlockActionsMenuProps {
  editor: Editor
  pos: number
  anchorEl: HTMLElement
  onRun: (id: string) => void
  onClose: () => void
}

/**
 * Virtual trigger: an invisible span positioned over the grip element so
 * radix DropdownMenu can anchor its content to it. The DropdownMenu opens
 * immediately (open={true}) and closes via onOpenChange.
 */
export function BlockActionsMenu({ editor, pos, anchorEl, onRun, onClose }: BlockActionsMenuProps) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const canTurn = isTurnableTarget(editor, pos)

  useEffect(() => {
    const sync = () => {
      const el = triggerRef.current
      if (!el) return
      const rect = anchorEl.getBoundingClientRect()
      el.style.position = 'fixed'
      el.style.left = `${rect.left}px`
      el.style.top = `${rect.top}px`
      el.style.width = `${rect.width}px`
      el.style.height = `${rect.height}px`
    }
    sync()
    window.addEventListener('scroll', sync, true)
    return () => window.removeEventListener('scroll', sync, true)
  }, [anchorEl])

  function run(id: string) {
    onRun(id)
    onClose()
  }

  return (
    <DropdownMenu open onOpenChange={(o) => { if (!o) onClose() }}>
      <DropdownMenuTrigger asChild>
        <span ref={triggerRef} aria-hidden style={{ pointerEvents: 'none' }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={4}
        className="min-w-[220px]"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={!canTurn}>
            Turn into
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[160px]">
            {TURN_INTO_TARGETS.map((target) => (
              <DropdownMenuItem
                key={target.label}
                onClick={() =>
                  run(
                    `turn-into:${target.type}${
                      target.attrs ? ':' + JSON.stringify(target.attrs) : ''
                    }`,
                  )
                }
              >
                {target.label}
                <DropdownMenuShortcut>{target.hotkey}</DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => run('cut')}>
            Cut <DropdownMenuShortcut>x</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => run('copy-link')}>
            Copy link <DropdownMenuShortcut>l</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => run('select')}>
            Select block <DropdownMenuShortcut>s</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" onClick={() => run('delete')}>
          Delete <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
