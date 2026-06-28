import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('themes / loadInitialTheme', () => {
  let store: Record<string, string>

  beforeEach(() => {
    vi.resetModules()
    store = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function load() {
    const m = await import('../../src/renderer/themes')
    return m.loadInitialTheme()
  }

  it('returns a valid stored theme', async () => {
    localStorage.setItem('etabook.theme', 'paper-dark')
    expect(await load()).toBe('paper-dark')
  })

  it('ignores a legacy stored id and falls back to OS preference', async () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) }) // dark
    localStorage.setItem('etabook.theme', 'pure-dark')
    expect(await load()).toBe('paper-dark')
  })

  it('defaults to paper-light when OS prefers light', async () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    expect(await load()).toBe('paper-light')
  })

  it('defaults to paper-dark when OS prefers dark', async () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    expect(await load()).toBe('paper-dark')
  })

  it('falls back to OS preference when localStorage throws', async () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied') } })
    expect(await load()).toBe('paper-light')
  })
})
