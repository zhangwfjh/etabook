import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { keys } from './keys'
import type { AppConfig, SecretKey } from '../../shared/ipc'

export const useSettings = () =>
  useQuery({ queryKey: keys.settings, queryFn: () => window.api.settings.get() })

export const useUpdateSettings = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<AppConfig>) => window.api.settings.set(patch),
    onSuccess: (next) => qc.setQueryData(keys.settings, next),
  })
}

export const useSetSecret = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: { key: SecretKey; value: string }) =>
      window.api.settings.setSecret(req),
    onSuccess: (_d, { key }) => qc.invalidateQueries({ queryKey: ['secret', key] }),
  })
}

export const useHasSecret = (key: SecretKey) =>
  useQuery({ queryKey: ['secret', key], queryFn: () => window.api.settings.hasSecret({ key }) })
