import { useLlmStream } from '@/hooks/use-llm-stream'
import { useSettings } from '@/queries/settings'

export function useStreamAIPlan() {
  const cfg = useSettings().data
  const llm = useLlmStream()

  return async function streamAIPlan(args: {
    prompt: string
    onDelta: (d: string) => void
  }): Promise<string> {
    if (!cfg) throw new Error('Settings not loaded.')

    const providerId = cfg.defaultProviderId
    if (!providerId) throw new Error('No default provider set. Configure one in Settings.')

    const providerCfg = cfg.providers[providerId]
    if (!providerCfg?.enabled) throw new Error(`Provider ${providerId} is not enabled.`)

    const model = providerCfg.defaultModel
    if (!model) throw new Error(`No model selected for ${providerId}.`)

    return llm.stream({
      prompt: args.prompt,
      model,
      providerId,
      onDelta: args.onDelta,
      onComplete: () => {},
      onError: () => {},
    })
  }
}
