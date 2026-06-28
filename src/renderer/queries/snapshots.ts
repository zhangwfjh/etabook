import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { keys } from './keys'

export const snapshotListKey = (filePath: string) => keys.snapshots(filePath)

export const useSnapshots = (filePath: string | null) =>
  useQuery({
    queryKey: filePath ? snapshotListKey(filePath) : ['snapshots', 'none'],
    queryFn: () => (filePath ? window.api.snapshots.list({ filePath }) : Promise.resolve([])),
    enabled: !!filePath,
  })

export const useSnapshot = (id: string | null) =>
  useQuery({
    queryKey: id ? keys.snapshot(id) : ['snapshot', 'none'],
    queryFn: () => (id ? window.api.snapshots.get({ id }) : Promise.resolve(null)),
    enabled: !!id,
  })

export const useCreateSnapshot = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: { filePath: string; content: string; trigger: 'pre-ai'|'post-ai'|'manual'|'pre-restore'; model?: string; isAutosave: boolean }) =>
      window.api.snapshots.create(req),
    onSuccess: (_r, req) => qc.invalidateQueries({ queryKey: snapshotListKey(req.filePath) }),
  })
}

export const useRestoreSnapshot = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: { id: string; createPreRestoreSnapshot: boolean }) =>
      window.api.snapshots.restore(req),
    onSuccess: (content) => {
      if (!content) return
      qc.invalidateQueries({ queryKey: keys.file(content.filePath) })
      qc.invalidateQueries({ queryKey: snapshotListKey(content.filePath) })
    },
  })
}
