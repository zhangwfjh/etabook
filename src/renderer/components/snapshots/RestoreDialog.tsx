import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useSnapshot, useRestoreSnapshot } from '@/queries/snapshots'

type Props = {
  snapshotId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
  filePath: string
  onRestored?: () => void
}

export function RestoreDialog({ snapshotId, open, onOpenChange, filePath: _filePath, onRestored }: Props) {
  void _filePath
  const { data: snapshot } = useSnapshot(snapshotId)
  const restore = useRestoreSnapshot()

  function handleRestore(withPreRestore: boolean) {
    if (!snapshotId) return
    restore.mutate(
      { id: snapshotId, createPreRestoreSnapshot: withPreRestore },
      { onSuccess: () => { onRestored?.(); onOpenChange(false) } },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore this snapshot?</DialogTitle>
          <DialogDescription>
            {snapshot
              ? `Snapshot from ${new Date(snapshot.createdAt).toLocaleString()} (${snapshot.trigger})`
              : 'Loading snapshot...'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="secondary" onClick={() => handleRestore(false)}>
            Restore without saving
          </Button>
          <Button onClick={() => handleRestore(true)}>
            Save current, then restore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
