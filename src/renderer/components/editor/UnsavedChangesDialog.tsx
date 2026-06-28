import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Props = {
  open: boolean
  fileNames: string[]
  onOpenChange: (v: boolean) => void
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

export function UnsavedChangesDialog({ open, fileNames, onOpenChange, onSave, onDiscard, onCancel }: Props) {
  const multiple = fileNames.length > 1
  const subject = multiple
    ? `${fileNames.length} files`
    : (fileNames[0] ? basename(fileNames[0]) : 'this file')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Save changes to {subject}?</DialogTitle>
          <DialogDescription>
            {multiple ? (
              <ul className="list-disc pl-5 mt-2 space-y-0.5">
                {fileNames.map((f) => <li key={f}>{basename(f)}</li>)}
              </ul>
            ) : (
              "Your changes will be lost if you don't save them."
            )}
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
