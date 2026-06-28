import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConfigStore } from '../../src/main/config-store'

describe('config-store', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'etabook-cfg-'))
  })

  it('persists and reloads config', () => {
    const store = createConfigStore({ userDataDir: dir, safeStorage: undefined })
    const initial = store.get()
    expect(initial.theme).toBe('paper-light')

    store.set({ theme: 'paper-dark', editorScale: 1.3 })
    const reloaded = createConfigStore({ userDataDir: dir, safeStorage: undefined }).get()
    expect(reloaded.theme).toBe('paper-dark')
    expect(reloaded.editorScale).toBe(1.3)

    rmSync(dir, { recursive: true, force: true })
  })

  it('coerces a legacy persisted theme to the default', () => {
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ theme: 'pure-dark' }), 'utf8')
    const store = createConfigStore({ userDataDir: dir, safeStorage: undefined })
    expect(store.get().theme).toBe('paper-light')

    rmSync(dir, { recursive: true, force: true })
  })

  it('in-memory secrets stay out of disk', () => {
    const store = createConfigStore({ userDataDir: dir, safeStorage: undefined })
    const key = 'aiProvider:anthropic' as const
    store.setSecret(key, 'sk-test')
    expect(store.getSecret(key)).toBe('sk-test')
    expect(store.hasSecret(key)).toBe(true)
    expect(existsSync(join(dir, 'config.json'))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('migrates v1 config to v2 on first load', () => {
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({
        workspacePath: null,
        theme: 'paper-dark',
        sidebarOpen: false,
        fontSize: 16,
        providers: {
          anthropic: { model: 'claude-sonnet-4-20250514' },
          ollama: { model: 'llama3.2', ollamaEndpoint: 'http://localhost:11434/v1' },
        },
        fileExclusions: ['.git'],
        snapshotRetention: 30,
      }),
      'utf8',
    )

    const store = createConfigStore({ userDataDir: dir, safeStorage: undefined })
    const cfg = store.get()

    expect(cfg.configVersion).toBe(2)
    expect(cfg.providers['anthropic']).toEqual({
      enabled: true,
      defaultModel: 'claude-sonnet-4-20250514',
    })
    expect(cfg.providers['ollama']).toEqual({
      enabled: true,
      defaultModel: 'llama3.2',
      ollamaEndpoint: 'http://localhost:11434/v1',
    })
    expect(cfg.defaultProviderId).toBe('anthropic')
    expect(cfg.theme).toBe('paper-dark')
    // Legacy fontSize (px) migrated to an editorScale multiplier: 16/14 ≈ 1.14
    expect(cfg.editorScale).toBeCloseTo(1.14, 2)
    expect(cfg.snapshotRetention).toBe(30)
  })

  it('derives editorScale from legacy v2 config with fontSize', () => {
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({ configVersion: 2, fontSize: 21 }),
      'utf8',
    )
    const cfg = createConfigStore({ userDataDir: dir, safeStorage: undefined }).get()
    // Already-v2 path: fontSize 21 -> 21/14 = 1.5
    expect(cfg.editorScale).toBeCloseTo(1.5, 2)
  })

  it('clamps editorScale to the supported range on load', () => {
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({ configVersion: 2, editorScale: 3 }),
      'utf8',
    )
    const cfg = createConfigStore({ userDataDir: dir, safeStorage: undefined }).get()
    expect(cfg.editorScale).toBe(1.6)
  })

  it('does not re-migrate an already-v2 config', () => {
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({
        configVersion: 2,
        providers: { openrouter: { enabled: true, defaultModel: 'some-model' } },
        defaultProviderId: 'openrouter',
      }),
      'utf8',
    )

    const store = createConfigStore({ userDataDir: dir, safeStorage: undefined })
    const cfg = store.get()

    expect(cfg.configVersion).toBe(2)
    expect(cfg.providers['anthropic']).toBeUndefined()
    expect(cfg.defaultProviderId).toBe('openrouter')
  })
  it('migrates legacy aiGatewayApiKey secret file to aiProvider:vercel-ai-gateway', () => {
    // Fake safeStorage: encrypt/decrypt are identity-via-prefix so we can observe round-trip.
    const fakeSafeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (plain: string) => Buffer.from(`enc:${plain}`),
      decryptString: (cipher: Buffer) => cipher.toString().replace(/^enc:/, ''),
    }
    // Write legacy v1 config + legacy secret file
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ providers: {} }), 'utf8')
    writeFileSync(join(dir, '.aiGatewayApiKey.enc'), fakeSafeStorage.encryptString('sk-gateway-key'))

    const store = createConfigStore({ userDataDir: dir, safeStorage: fakeSafeStorage })
    store.get() // trigger migration

    // Legacy key should be readable under the new per-provider name
    expect(store.getSecret('aiProvider:vercel-ai-gateway' as const)).toBe('sk-gateway-key')
    expect(store.hasSecret('aiProvider:vercel-ai-gateway' as const)).toBe(true)
    // Old file removed, new file created
    expect(existsSync(join(dir, '.aiGatewayApiKey.enc'))).toBe(false)
    expect(existsSync(join(dir, '.aiProvider-vercel-ai-gateway.enc'))).toBe(true)

    rmSync(dir, { recursive: true, force: true })
  })

  it('migrates legacy ollamaApiKey secret file to aiProvider:ollama', () => {
    const fakeSafeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (plain: string) => Buffer.from(`enc:${plain}`),
      decryptString: (cipher: Buffer) => cipher.toString().replace(/^enc:/, ''),
    }
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ providers: {} }), 'utf8')
    writeFileSync(join(dir, '.ollamaApiKey.enc'), fakeSafeStorage.encryptString('sk-ollama-key'))

    const store = createConfigStore({ userDataDir: dir, safeStorage: fakeSafeStorage })
    store.get()

    expect(store.getSecret('aiProvider:ollama' as const)).toBe('sk-ollama-key')
    expect(existsSync(join(dir, '.ollamaApiKey.enc'))).toBe(false)
    expect(existsSync(join(dir, '.aiProvider-ollama.enc'))).toBe(true)

    rmSync(dir, { recursive: true, force: true })
  })
  it('persists and reloads custom shortcuts', () => {
    const store = createConfigStore({ userDataDir: dir, safeStorage: undefined })
    store.set({ shortcuts: { toggleSidebar: 'CmdOrCtrl+Shift+B' } })

    const reloaded = createConfigStore({ userDataDir: dir, safeStorage: undefined }).get()
    expect(reloaded.shortcuts.toggleSidebar).toBe('CmdOrCtrl+Shift+B')
    // Untouched actions keep their defaults.
    expect(reloaded.shortcuts.openSettings).toBe('CmdOrCtrl+Comma')

    rmSync(dir, { recursive: true, force: true })
  })

  it('drops malformed persisted shortcuts and restores defaults', () => {
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({ configVersion: 2, shortcuts: { toggleSidebar: 'Nope', openSettings: 'Ctrl+Z' } }),
      'utf8',
    )
    const cfg = createConfigStore({ userDataDir: dir, safeStorage: undefined }).get()
    // 'Nope' is malformed → default restored; valid entry preserved.
    expect(cfg.shortcuts.toggleSidebar).toBe('CmdOrCtrl+B')
    expect(cfg.shortcuts.openSettings).toBe('Ctrl+Z')

    rmSync(dir, { recursive: true, force: true })
  })

  it('provides default shortcuts for a v1 config with no shortcuts field', () => {
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ providers: {} }), 'utf8')
    const store = createConfigStore({ userDataDir: dir, safeStorage: undefined })
    const cfg = store.get() // triggers v1→v2 migration
    expect(cfg.shortcuts.toggleSidebar).toBe('CmdOrCtrl+B')
    expect(cfg.shortcuts.cycleTheme).toBe('CmdOrCtrl+J')

    rmSync(dir, { recursive: true, force: true })
  })
})
