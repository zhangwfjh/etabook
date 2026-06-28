import type { SecretKey } from '../../shared/ipc'

export function secretKeyForProvider(providerId: string): SecretKey {
  return `aiProvider:${providerId}` as SecretKey
}
