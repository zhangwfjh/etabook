import { getProviders, getModels } from '@earendil-works/pi-ai'
import type { ProviderCatalogInfo } from '../shared/ipc'

const OAUTH_ONLY_PROVIDERS: Record<string, true> = {
  'openai-codex': true,
  'github-copilot': true,
}

const PROVIDER_LABELS: Record<string, string> = {
  'vercel-ai-gateway': 'Vercel AI Gateway',
  'openrouter': 'OpenRouter',
  'google': 'Google Gemini',
  'google-vertex': 'Google Vertex AI',
  'xai': 'xAI',
  'zai': 'Z.AI',
  'zai-coding-cn': 'Z.AI Coding (China)',
  'amazon-bedrock': 'Amazon Bedrock',
  'github-copilot': 'GitHub Copilot',
  'openai-codex': 'OpenAI Codex',
  'azure-openai-responses': 'Azure OpenAI',
  'cloudflare-workers-ai': 'Cloudflare Workers AI',
  'cloudflare-ai-gateway': 'Cloudflare AI Gateway',
  'nvidia': 'NVIDIA NIM',
  'deepseek': 'DeepSeek',
  'ant-ling': 'Ant Ling',
  'moonshotai': 'Moonshot AI',
  'moonshotai-cn': 'Moonshot AI (China)',
  'minimax': 'MiniMax',
  'minimax-cn': 'MiniMax (China)',
  'huggingface': 'Hugging Face',
  'opencode': 'OpenCode Zen',
  'opencode-go': 'OpenCode Go',
  'kimi-coding': 'Kimi For Coding',
  'xiaomi': 'Xiaomi MiMo',
  'xiaomi-token-plan-cn': 'Xiaomi MiMo (CN)',
  'xiaomi-token-plan-ams': 'Xiaomi MiMo (AMS)',
  'xiaomi-token-plan-sgp': 'Xiaomi MiMo (SGP)',
}

export function providerLabel(id: string): string {
  return PROVIDER_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1)
}

export function buildCatalog(): ProviderCatalogInfo[] {
  const piProviders = getProviders()
  const catalog: ProviderCatalogInfo[] = piProviders.map((id) => {
    const requiresOAuth = OAUTH_ONLY_PROVIDERS[id] === true
    const models = requiresOAuth
      ? []
      : getModels(id as never).map((model) => ({
          id: model.id,
          name: model.name,
          contextWindow: model.contextWindow,
          reasoning: model.reasoning,
          input: model.input,
        }))
    return {
      id,
      label: providerLabel(id),
      needsApiKey: !requiresOAuth,
      requiresOAuth,
      models,
    }
  })

  catalog.push({
    id: 'ollama',
    label: 'Ollama',
    needsApiKey: false,
    requiresOAuth: false,
    isOllama: true,
    models: [],
  })

  return catalog
}
