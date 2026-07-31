import { type ReactElement } from 'react'
import { Modal } from '@renderer/components/ui'

type Row = { keys: string; action: string }
type Group = { title: string; rows: Row[] }

const GROUPS: Group[] = [
  {
    title: 'File',
    rows: [
      { keys: 'Ctrl/Cmd + N', action: 'New file' },
      { keys: 'Ctrl/Cmd + O', action: 'Open file' },
      { keys: 'Ctrl/Cmd + S', action: 'Save' },
      { keys: 'Ctrl/Cmd + Shift + S', action: 'Save As' },
      { keys: 'Ctrl/Cmd + Shift + E', action: 'Export Markdown' },
      { keys: 'Ctrl/Cmd + Shift + H', action: 'Export HTML' },
      { keys: 'Ctrl/Cmd + Shift + P', action: 'Export PDF' }
    ]
  },
  {
    title: 'Edit',
    rows: [
      { keys: 'Ctrl/Cmd + B', action: 'Bold' },
      { keys: 'Ctrl/Cmd + I', action: 'Italic' },
      { keys: 'Ctrl/Cmd + E', action: 'Inline code' },
      { keys: 'Ctrl/Cmd + Shift + X', action: 'Strikethrough' },
      { keys: 'Ctrl/Cmd + F', action: 'Find' },
      { keys: '/', action: 'Slash command menu' }
    ]
  },
  {
    title: 'View',
    rows: [
      { keys: 'Ctrl/Cmd + Alt + 1', action: 'Source mode' },
      { keys: 'Ctrl/Cmd + Alt + 2', action: 'Live Preview mode' },
      { keys: 'Ctrl/Cmd + Alt + 3', action: 'Reading mode' },
      { keys: 'Ctrl/Cmd + \\', action: 'Toggle sidebar' },
      { keys: 'Ctrl/Cmd + Shift + L', action: 'Toggle theme' }
    ]
  },
  {
    title: 'Go',
    rows: [
      { keys: 'Ctrl/Cmd + K', action: 'Command palette' },
      { keys: 'Tab', action: 'Indent' }
    ]
  }
]

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }): ReactElement | null {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard Shortcuts">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
              {g.title}
            </h3>
            <div className="flex flex-col gap-1.5">
              {g.rows.map((r) => (
                <div key={r.keys} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-muted)]">{r.action}</span>
                  <kbd className="font-mono text-[12px] px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)]">
                    {r.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

void (undefined as unknown as ReactElement)
