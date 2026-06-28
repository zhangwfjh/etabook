import type { SecretKey } from '../shared/ipc'

export function secretKeyForProvider(providerId: string): SecretKey {
  return `aiProvider:${providerId}` as SecretKey
}

export function secretKeyToFileName(key: SecretKey): string {
  return `.${key.replace(':', '-')}.enc`
}

export function parseProviderFromSecretKey(key: SecretKey): string {
  return key.replace('aiProvider:', '')
}
