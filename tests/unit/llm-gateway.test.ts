import { describe, it, expect } from 'vitest'
import { resolveModel } from '../../src/main/llm-gateway'

describe('llm-gateway resolveModel', () => {
  it('resolves a catalog provider model with apiKey', () => {
    const { model, apiKey } = resolveModel({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      getApiKey: (id) => (id === 'anthropic' ? 'sk-test-key' : null),
    })
    expect(model.id).toBe('claude-sonnet-4-20250514')
    expect(model.provider).toBe('anthropic')
    expect(apiKey).toBe('sk-test-key')
  })

  it('resolves an ollama model as a synthetic openai-completions model', () => {
    const { model, apiKey } = resolveModel({
      provider: 'ollama',
      model: 'llama3.2',
      ollamaEndpoint: 'http://localhost:11434/v1',
      getApiKey: () => null,
    })
    expect(model.id).toBe('llama3.2')
    expect(model.api).toBe('openai-completions')
    expect(model.baseUrl).toBe('http://localhost:11434/v1')
    expect(apiKey).toBeNull()
  })

  it('uses default ollama endpoint when none specified', () => {
    const { model } = resolveModel({
      provider: 'ollama',
      model: 'llama3.2',
      getApiKey: () => null,
    })
    expect(model.baseUrl).toBe('http://localhost:11434/v1')
  })

  it('throws on unknown catalog model', () => {
    expect(() =>
      resolveModel({
        provider: 'anthropic',
        model: 'this-model-does-not-exist-xyz',
        getApiKey: () => 'sk-test',
      }),
    ).toThrow('Unknown model: anthropic/this-model-does-not-exist-xyz')
  })

  it('throws when API key is missing for a non-ollama provider', () => {
    expect(() =>
      resolveModel({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        getApiKey: () => null,
      }),
    ).toThrow('Missing API key for anthropic')
  })
})
