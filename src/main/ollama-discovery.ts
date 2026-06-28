import type { ModelInfo } from '../shared/ipc'

export async function discoverOllamaModels(endpoint: string): Promise<ModelInfo[]> {
  const base = endpoint.replace(/\/v1\/?$/, '')
  const res = await fetch(`${base}/api/tags`)
  if (!res.ok) {
    throw new Error(`Ollama /api/tags responded with ${res.status}`)
  }
  const data = (await res.json()) as { models?: { name: string }[] }
  return (data.models ?? []).map((m) => ({
    id: m.name,
    name: m.name,
    contextWindow: 128000,
    reasoning: false,
    input: ['text'] as ('text' | 'image')[],
  }))
}
