import { describe, it, expect } from 'vitest'
import { buildCatalog, providerLabel } from '../../src/main/catalog'

describe('catalog', () => {
  it('returns a non-empty list of providers', () => {
    const catalog = buildCatalog()
    expect(catalog.length).toBeGreaterThan(10)
  })

  it('includes major API-key providers', () => {
    const catalog = buildCatalog()
    const ids = catalog.map((p) => p.id)
    expect(ids).toContain('anthropic')
    expect(ids).toContain('openai')
    expect(ids).toContain('openrouter')
    expect(ids).toContain('google')
    expect(ids).toContain('vercel-ai-gateway')
  })

  it('marks oauth-only providers', () => {
    const catalog = buildCatalog()
    const codex = catalog.find((p) => p.id === 'openai-codex')
    expect(codex?.requiresOAuth).toBe(true)
    expect(codex?.needsApiKey).toBe(false)
  })

  it('marks API-key providers as needsApiKey', () => {
    const catalog = buildCatalog()
    const anthropic = catalog.find((p) => p.id === 'anthropic')
    expect(anthropic?.needsApiKey).toBe(true)
    expect(anthropic?.requiresOAuth).toBe(false)
  })

  it('includes models with id, name, and capabilities', () => {
    const catalog = buildCatalog()
    const anthropic = catalog.find((p) => p.id === 'anthropic')
    expect(anthropic?.models.length).toBeGreaterThan(0)
    const model = anthropic!.models[0]
    expect(model.id).toBeTruthy()
    expect(model.name).toBeTruthy()
    expect(typeof model.contextWindow).toBe('number')
    expect(typeof model.reasoning).toBe('boolean')
  })

  it('includes the synthetic ollama entry', () => {
    const catalog = buildCatalog()
    const ollama = catalog.find((p) => p.id === 'ollama')
    expect(ollama).toBeDefined()
    expect(ollama?.isOllama).toBe(true)
    expect(ollama?.needsApiKey).toBe(false)
    expect(ollama?.models).toEqual([])
  })

  it('providerLabel returns human-readable names', () => {
    expect(providerLabel('anthropic')).toBe('Anthropic')
    expect(providerLabel('openrouter')).toBe('OpenRouter')
    expect(providerLabel('vercel-ai-gateway')).toBe('Vercel AI Gateway')
    expect(providerLabel('xai')).toBe('xAI')
    expect(providerLabel('amazon-bedrock')).toBe('Amazon Bedrock')
  })
})
