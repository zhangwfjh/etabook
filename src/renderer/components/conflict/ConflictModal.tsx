import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useWorkspace } from '@/state/store'
import { useQueryClient } from '@tanstack/react-query'
import { fileQueryKey } from '@/queries/files'

export function ConflictModal() {
  const externals = useWorkspace((s) => s.externals)
  const resolveExternal = useWorkspace((s) => s.resolveExternal)
  const qc = useQueryClient()

  if (externals.length === 0) return null

  const current = externals[0]
  if (!current) return null

  function handleKeep() {
    resolveExternal(current.filePath)
  }

  function handleDiscard() {
    qc.invalidateQueries({ queryKey: fileQueryKey(current.filePath) })
    resolveExternal(current.filePath)
  }

  function handleOverwrite() {
    resolveExternal(current.filePath)
  }

  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>External file change detected</DialogTitle>
          <DialogDescription>
            {current.filePath} was modified on disk while you had unsaved changes.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={handleKeep}>
            Keep my changes
          </Button>
          <Button variant="secondary" onClick={handleDiscard}>
            Discard mine, load disk
          </Button>
          <Button onClick={handleOverwrite}>
            Save mine over disk
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
