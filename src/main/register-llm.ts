import { IPC, type StreamStartReq, type StreamStartRes, type OllamaRefreshReq } from '../shared/ipc'
import { resolveModel, streamFromGateway } from './llm-gateway'
import { buildCatalog } from './catalog'
import { discoverOllamaModels } from './ollama-discovery'
import { secretKeyForProvider } from './secret-key'
import { handle, broadcast } from './ipc-helpers'
import type { ConfigStore } from './config-store'

const OLLAMA_DEFAULT_ENDPOINT = 'http://localhost:11434/v1'

const activeStreams = new Map<string, AbortController>()

export function registerLlm(config: ConfigStore): void {
  const catalog = buildCatalog()

  handle(IPC.llmCatalog, () => {
    const cfg = config.get()
    const ollamaCfg = cfg.providers['ollama']
    if (ollamaCfg?.enabled) {
      const entry = catalog.find((p) => p.id === 'ollama')
      if (entry && entry.models.length === 0) {
        discoverOllamaModels(ollamaCfg.ollamaEndpoint ?? OLLAMA_DEFAULT_ENDPOINT)
          .then((models) => {
            entry.models = models
          })
          .catch(() => {
            // Ollama not running — leave models empty
          })
      }
    }
    return catalog
  })

  handle<[StreamStartReq], StreamStartRes>(IPC.llmStreamStart, async (_e, req) => {
    const cfg = config.get()
    const providerCfg = cfg.providers[req.provider]
    if (!providerCfg?.enabled) {
      throw new Error(`Provider not enabled: ${req.provider}`)
    }

    const resolved = resolveModel({
      provider: req.provider,
      model: req.model,
      ollamaEndpoint: providerCfg.ollamaEndpoint,
      getApiKey: (id) => config.getSecret(secretKeyForProvider(id)),
    })

    // Register the AbortController only after all throwing checks pass,
    // so a throw above doesn't leak a dead entry in the Map.
    const ac = new AbortController()
    activeStreams.set(req.abortKey, ac)

    streamFromGateway({
      resolved: resolved,
      prompt: req.prompt,
      system: req.system,
      abortSignal: ac.signal,
      onChunk: (delta) => {
        broadcast(IPC.llmOnStreamChunk, { abortKey: req.abortKey, delta })
      },
    })
      .then(() => {
        broadcast(IPC.llmOnStreamEnd, { abortKey: req.abortKey })
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return
        const message = err instanceof Error ? err.message : String(err)
        broadcast(IPC.llmOnStreamError, { abortKey: req.abortKey, message })
      })
      .finally(() => {
        activeStreams.delete(req.abortKey)
      })

    return { abortKey: req.abortKey }
  })

  handle<[{ abortKey: string }], void>(IPC.llmStreamCancel, (_e, req) => {
    const ac = activeStreams.get(req.abortKey)
    if (ac) {
      ac.abort()
      activeStreams.delete(req.abortKey)
    }
  })

  handle<[OllamaRefreshReq], void>(IPC.llmOllamaRefresh, async (_e, req) => {
    const cfg = config.get()
    const endpoint = req?.endpoint ?? cfg.providers['ollama']?.ollamaEndpoint ?? OLLAMA_DEFAULT_ENDPOINT
    const entry = catalog.find((p) => p.id === 'ollama')
    if (!entry) return
    try {
      entry.models = await discoverOllamaModels(endpoint)
    } catch {
      entry.models = []
    }
  })
}
