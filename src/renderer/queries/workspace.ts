import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { keys } from './keys'

export const useCurrentWorkspace = () =>
  useQuery({ queryKey: keys.workspace, queryFn: () => window.api.workspace.current() })

export const usePickWorkspace = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => window.api.workspace.pick(),
    onSuccess: (path) => {
      qc.setQueryData(keys.workspace, path)
      if (path) qc.invalidateQueries({ queryKey: ['tree', path] })
    },
  })
}
