import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { keys } from './keys'

export const fileQueryKey = (p: string) => keys.file(p)
export const treeQueryKey = (ws: string) => keys.tree(ws)

export const useTree = (ws: string | null) =>
  useQuery({
    queryKey: ws ? treeQueryKey(ws) : ['tree', 'none'],
    queryFn: () => (ws ? window.api.files.list({ workspacePath: ws }) : Promise.resolve(null)),
    enabled: !!ws,
  })

export const useFile = (path: string | null) =>
  useQuery({
    queryKey: path ? fileQueryKey(path) : ['file', 'none'],
    queryFn: () => (path ? window.api.files.read({ filePath: path }) : Promise.resolve(null)),
    enabled: !!path,
  })

export const useWriteFile = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: { filePath: string; content: string; baseHash?: string }) =>
      window.api.files.write(req),
    onSuccess: (_res, req) => {
      if (!_res) return
      qc.setQueryData(fileQueryKey(req.filePath), (old: any) => old ? { ...old, hash: _res.hash, mtime: _res.mtime, size: _res.size } : old)
    },
  })
}

export const useCreateEntry = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: { workspacePath: string; relPath: string; content: string; isDirectory: boolean }) =>
      window.api.files.create(req),
    onSuccess: (_r, req) => qc.invalidateQueries({ queryKey: treeQueryKey(req.workspacePath) }),
  })
}

export const useRenameEntry = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: { filePath: string; newName: string }) => window.api.files.rename(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tree'] }),
  })
}

export const useCopyEntry = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: { filePath: string }) => window.api.files.copy(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tree'] }),
  })
}

export const useDeleteEntry = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: { filePath: string }) => window.api.files.delete(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tree'] }),
  })
}
