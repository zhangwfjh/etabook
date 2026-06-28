import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { discoverOllamaModels } from '../../src/main/ollama-discovery'

describe('ollama-discovery', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('maps /api/tags response to ModelInfo[]', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { name: 'llama3.2' },
          { name: 'qwen2.5' },
        ],
      }),
    })

    const models = await discoverOllamaModels('http://localhost:11434/v1')
    expect(models).toHaveLength(2)
    expect(models[0]).toEqual({
      id: 'llama3.2',
      name: 'llama3.2',
      contextWindow: 128000,
      reasoning: false,
      input: ['text'],
    })
  })

  it('strips /v1 suffix from endpoint before calling /api/tags', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ models: [] }),
    })

    await discoverOllamaModels('http://localhost:11434/v1/')
    expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:11434/api/tags')
  })

  it('handles empty models array', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ models: [] }),
    })

    const models = await discoverOllamaModels('http://localhost:11434/v1')
    expect(models).toEqual([])
  })

  it('throws on non-OK response', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    })

    await expect(discoverOllamaModels('http://localhost:11434/v1')).rejects.toThrow(
      'Ollama /api/tags responded with 500',
    )
  })
})
