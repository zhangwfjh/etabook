import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Props = {
  open: boolean
  fileName: string
  onOpenChange: (v: boolean) => void
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

/**
 * Modal prompt shown when the user attempts to close a file or the window
 * while there are unsaved edits. Mirrors the three-option pattern of
 * RestoreDialog (Save / Don't save / Cancel).
 *
 *   Save    → persist edits to the source file, then proceed with the close.
 *   Don't   → discard edits and proceed.
 *   Cancel  → abort the close, keep editing.
 */
export function UnsavedChangesDialog({ open, fileName, onOpenChange, onSave, onDiscard, onCancel }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Save changes to {fileName}?</DialogTitle>
          <DialogDescription>
            Your changes will be lost if you don't save them.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="secondary" onClick={onDiscard}>Don't save</Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
