import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { app } from 'electron'
import { DEFAULT_CONFIG, type AppConfig } from '@shared/types'

/** Persisted config schema version. Bump when the meaning of a stored
 *  value changes, and add a migration step in `migrate()`. Main-owned:
 *  stamped on every write, never seen by the renderer. */
const CONFIG_VERSION = 2

/** The JSON on disk may carry keys beyond the AppConfig fields:
 *  `configVersion` (main-owned) and legacy keys pending migration. */
type StoredConfig = Partial<AppConfig> & { configVersion?: number; autosave?: boolean }

function file(): string {
  return `${app.getPath('userData')}/config.json`
}

async function readConfig(): Promise<StoredConfig> {
  try {
    return JSON.parse(await readFile(file(), 'utf8')) as StoredConfig
  } catch {
    return {}
  }
}

/** Upgrade a stored config to CONFIG_VERSION. Steps run in order, so each
 *  future bump appends its own step below the previous ones. */
function migrate(parsed: StoredConfig): AppConfig {
  // v2 — configs written by pre-repo builds may carry `autosave`, a
  // feature this app never had (files save only on explicit Ctrl+S /
  // Save As / Save & Close): strip it. Other keys pass through.
  const rest: StoredConfig = { ...parsed }
  delete rest.autosave
  return { ...DEFAULT_CONFIG, ...rest }
}

export async function getConfig(): Promise<AppConfig> {
  const parsed = await readConfig()
  if (parsed.configVersion === CONFIG_VERSION) return { ...DEFAULT_CONFIG, ...parsed }
  const migrated = migrate(parsed)
  await setConfig(migrated)
  return migrated
}

export async function setConfig(config: AppConfig): Promise<void> {
  await mkdir(dirname(file()), { recursive: true })
  await writeFile(file(), JSON.stringify({ ...config, configVersion: CONFIG_VERSION }, null, 2), 'utf8')
}
