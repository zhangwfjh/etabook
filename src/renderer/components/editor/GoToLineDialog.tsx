import { useState, useEffect, type FormEvent } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import type { Editor as TiptapEditor } from '@tiptap/react'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  editor: TiptapEditor | null
}

/**
 * Resolve a 1-indexed line (top-level block) number to a doc position.
 * Each top-level block counts as one line. Clamps to [1, blockCount].
 */
function lineToPos(editor: TiptapEditor, line: number): { pos: number; total: number } {
  const { doc } = editor.state
  const total = doc.childCount
  let pos = 1
  let currentLine = 1
  doc.forEach((_node, offset) => {
    if (currentLine === line) pos = offset + 1
    currentLine++
  })
  if (line < 1) return { pos: 1, total }
  if (line > total) return { pos: Math.max(1, doc.content.size - 1), total }
  return { pos, total }
}

export function GoToLineDialog({ open, onOpenChange, editor }: Props) {
  const [value, setValue] = useState('')

  useEffect(() => {
    if (open) setValue('')
  }, [open])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!editor) return
    const line = parseInt(value, 10)
    if (!Number.isFinite(line)) {
      toast.error('Enter a line number')
      return
    }
    const { pos, total } = lineToPos(editor, line)
    const clamped = Math.min(Math.max(line, 1), total)
    if (clamped !== line) toast.message(`Clamped to line ${clamped}`)
    editor.chain().focus().setTextSelection(pos).run()
    const coords = editor.view.coordsAtPos(pos)
    editor.view.dom.scrollTop = coords.top - 100
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Go to line</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Input
            type="number"
            min={1}
            autoFocus
            placeholder="Line number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Go</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
