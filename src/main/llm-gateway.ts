import { getModel, stream, type Model, type Api, type Context } from '@earendil-works/pi-ai'
import type { KnownProvider } from '@earendil-works/pi-ai'

export type ResolvedModel = {
  model: Model<Api>
  apiKey: string | null
}

export type ResolveArgs = {
  provider: string
  model: string
  ollamaEndpoint?: string
  getApiKey: (providerId: string) => string | null
}

const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434/v1'

export function resolveModel(args: ResolveArgs): ResolvedModel {
  if (args.provider === 'ollama') {
    const baseUrl = args.ollamaEndpoint ?? DEFAULT_OLLAMA_ENDPOINT
    const model: Model<'openai-completions'> = {
      id: args.model,
      name: args.model,
      api: 'openai-completions',
      provider: 'ollama',
      baseUrl,
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 32000,
    }
    return { model, apiKey: null }
  }

  const resolved = getModel(args.provider as KnownProvider, args.model as never)
  if (!resolved) {
    throw new Error(`Unknown model: ${args.provider}/${args.model}`)
  }

  const apiKey = args.getApiKey(args.provider)
  if (!apiKey) {
    throw new Error(`Missing API key for ${args.provider}. Set it in Settings.`)
  }

  return { model: resolved, apiKey }
}

export type StreamArgs = {
  resolved: ResolvedModel
  prompt: string
  system?: string
  abortSignal?: AbortSignal
  onChunk: (delta: string) => void
}

export async function streamFromGateway(args: StreamArgs): Promise<void> {
  const context: Context = {
    systemPrompt: args.system,
    messages: [{ role: 'user', content: args.prompt, timestamp: Date.now() }],
  }

  const s = stream(args.resolved.model, context, {
    apiKey: args.resolved.apiKey ?? undefined,
    signal: args.abortSignal,
  })

  for await (const event of s) {
    if (event.type === 'text_delta') {
      args.onChunk(event.delta)
    } else if (event.type === 'error') {
      if (event.reason === 'aborted' || args.abortSignal?.aborted) return
      throw new Error(event.error.errorMessage ?? 'Stream error')
    }
  }
}
