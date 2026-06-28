import { useQuery } from '@tanstack/react-query'
import { keys } from './keys'

export const useCatalog = () =>
  useQuery({
    queryKey: keys.providers,
    queryFn: () => window.api.llm.catalog(),
    staleTime: Infinity,
  })
