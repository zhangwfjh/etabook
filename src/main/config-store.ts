import { app, safeStorage as electronSafeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_CONFIG,
  DEFAULT_SHORTCUTS,
  resolveShortcuts,
  type AppConfig,
  type SecretKey,
} from '../shared/ipc'
import { secretKeyToFileName, secretKeyForProvider } from './secret-key'

type SafeStorageLike = {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(cipher: Buffer): string
} | undefined

export type ConfigStore = {
  get(): AppConfig
  set(patch: Partial<AppConfig>): AppConfig
  hasSecret(key: SecretKey): boolean
  getSecret(key: SecretKey): string | null
  setSecret(key: SecretKey, value: string): void
}

export type ConfigStoreOptions = {
  userDataDir?: string
  safeStorage?: SafeStorageLike
}

const EDITOR_SCALE_MIN = 0.8
const EDITOR_SCALE_MAX = 1.6

function clampEditorScale(v: number): number {
  if (!Number.isFinite(v)) return 1.0
  return Math.min(EDITOR_SCALE_MAX, Math.max(EDITOR_SCALE_MIN, Math.round(v * 100) / 100))
}

export function createConfigStore(opts: ConfigStoreOptions = {}): ConfigStore {
  const userDataDir = opts.userDataDir ?? app.getPath('userData')
  const safeStorage = opts.safeStorage ?? (electronSafeStorage as SafeStorageLike)
  if (!existsSync(userDataDir)) mkdirSync(userDataDir, { recursive: true })

  const configPath = join(userDataDir, 'config.json')
  const memorySecrets = new Map<SecretKey, string>()
  if (safeStorage?.isEncryptionAvailable()) {
    try { loadSecretsFromDisk(safeStorage, userDataDir, memorySecrets) } catch {}
  }
  function loadConfig(): AppConfig {
    if (!existsSync(configPath)) return { ...DEFAULT_CONFIG }
    try {
      const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>
      if (typeof parsed.configVersion !== 'number' || parsed.configVersion < 2) {
        return migrateV1toV2(parsed)
      }
      const merged: AppConfig = { ...DEFAULT_CONFIG, ...(parsed as Partial<AppConfig>) }
      if (merged.theme !== 'paper-light' && merged.theme !== 'paper-dark') {
        merged.theme = DEFAULT_CONFIG.theme
      }
      // Legacy v2 configs persisted `fontSize` (px) before editorScale replaced it.
      // Derive a sane scale from the raw parsed object (DEFAULT_CONFIG spreads 1.0
      // into merged, so checking merged would never detect the missing field).
      if (typeof parsed.editorScale === 'number' && !Number.isNaN(parsed.editorScale)) {
        merged.editorScale = clampEditorScale(parsed.editorScale)
      } else {
        const legacyFs = typeof parsed.fontSize === 'number' ? parsed.fontSize : 14
        merged.editorScale = clampEditorScale(legacyFs / 14)
      }
      // Merge persisted shortcuts over defaults; drop malformed entries.
      merged.shortcuts = resolveShortcuts(parsed.shortcuts)
      return merged
    } catch {
      return { ...DEFAULT_CONFIG }
    }
  }

  function migrateV1toV2(parsed: Record<string, unknown>): AppConfig {
    const cfg: AppConfig = { ...DEFAULT_CONFIG }
    cfg.workspacePath = (parsed.workspacePath as string | null) ?? null
    if (parsed.theme === 'paper-light' || parsed.theme === 'paper-dark') cfg.theme = parsed.theme
    cfg.sidebarOpen = (parsed.sidebarOpen as boolean) ?? true
    cfg.editorScale = clampEditorScale(((parsed.fontSize as number) ?? 14) / 14)
    cfg.fileExclusions = (parsed.fileExclusions as string[]) ?? DEFAULT_CONFIG.fileExclusions
    cfg.snapshotRetention = (parsed.snapshotRetention as number) ?? DEFAULT_CONFIG.snapshotRetention

    const oldProviders = (parsed.providers ?? {}) as Record<string, { model?: string; ollamaEndpoint?: string }>
    cfg.providers = {}
    for (const [id, old] of Object.entries(oldProviders)) {
      if (id === 'ollama') {
        cfg.providers['ollama'] = {
          enabled: true,
          defaultModel: old.model,
          ollamaEndpoint: old.ollamaEndpoint ?? 'http://localhost:11434/v1',
        }
      } else {
        cfg.providers[id] = { enabled: true, defaultModel: old.model }
      }
    }

    for (const id of ['anthropic', 'openai', 'vercel-ai-gateway']) {
      if (cfg.providers[id]?.enabled) {
        cfg.defaultProviderId = id
        break
      }
    }

    migrateLegacySecretFiles(userDataDir, safeStorage, memorySecrets)

    // v1 configs predate the shortcuts field; defaults apply.
    cfg.shortcuts = { ...DEFAULT_SHORTCUTS }
    cfg.configVersion = 2

    // Persist the migrated config so we don't re-migrate
    writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8')

    return cfg
  }

  let cached: AppConfig = loadConfig()

  return {
    get: () => ({ ...cached }),
    set: (patch) => {
      cached = { ...cached, ...patch }
      writeFileSync(configPath, JSON.stringify(cached, null, 2), 'utf8')
      return { ...cached }
    },
    hasSecret: (key) => {
      if (memorySecrets.has(key)) return true
      if (!safeStorage?.isEncryptionAvailable()) return false
      return existsSync(secretFilePath(userDataDir, key))
    },
    getSecret: (key) => {
      const mem = memorySecrets.get(key)
      if (mem !== undefined) return mem
      if (!safeStorage?.isEncryptionAvailable()) return null
      try {
        const buf = readFileSync(secretFilePath(userDataDir, key))
        return safeStorage.decryptString(buf)
      } catch { return null }
    },
    setSecret: (key, value) => {
      memorySecrets.set(key, value)
      if (safeStorage?.isEncryptionAvailable()) {
        const buf = safeStorage.encryptString(value)
        writeFileSync(secretFilePath(userDataDir, key), buf)
      }
    },
  }
}

function secretFilePath(dir: string, key: SecretKey) {
  return join(dir, secretKeyToFileName(key))
}

function loadSecretsFromDisk(ss: NonNullable<SafeStorageLike>, dir: string, into: Map<SecretKey, string>) {
  const files = readdirSync(dir)
  for (const file of files) {
    if (!file.startsWith('.aiProvider-') || !file.endsWith('.enc')) continue
    try {
      const buf = readFileSync(join(dir, file))
      const value = ss.decryptString(buf)
      const provider = file.slice('.aiProvider-'.length, -'.enc'.length)
      into.set(secretKeyForProvider(provider), value)
    } catch {}
  }
}

/**
 * v1→v2 secret migration: legacy `.aiGatewayApiKey.enc` and `.ollamaApiKey.enc`
 * files are decrypted and re-written under the new per-provider names, then the
 * old files are removed. No-op when encryption is unavailable or files are absent.
 */
const LEGACY_SECRET_MAP: Record<string, string> = {
  'aiGatewayApiKey': 'vercel-ai-gateway',
  'ollamaApiKey': 'ollama',
}

function migrateLegacySecretFiles(
  dir: string,
  safeStorage: SafeStorageLike,
  into: Map<SecretKey, string>,
) {
  if (!safeStorage?.isEncryptionAvailable()) return
  for (const [legacyKey, providerId] of Object.entries(LEGACY_SECRET_MAP)) {
    const legacyPath = join(dir, `.${legacyKey}.enc`)
    if (!existsSync(legacyPath)) continue
    try {
      const value = safeStorage.decryptString(readFileSync(legacyPath))
      const newKey = secretKeyForProvider(providerId)
      into.set(newKey, value)
      writeFileSync(secretFilePath(dir, newKey), safeStorage.encryptString(value))
      // Remove the legacy file only after the new one is written.
      rmSync(legacyPath, { force: true })
    } catch {}
  }
}
