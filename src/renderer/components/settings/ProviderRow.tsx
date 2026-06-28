import { useState } from 'react'
import type { ProviderCatalogInfo, ProviderConfig } from '../../../shared/ipc'
import { useSettings, useUpdateSettings, useSetSecret, useHasSecret } from '@/queries/settings'
import { useQueryClient } from '@tanstack/react-query'
import { keys } from '@/queries/keys'
import { secretKeyForProvider } from '@/lib/secret-key'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Eye, EyeOff, RefreshCw } from 'lucide-react'

type Props = {
  info: ProviderCatalogInfo
  config: ProviderConfig | undefined
}

export function ProviderRow({ info, config }: Props) {
  const { data: settings } = useSettings()
  const update = useUpdateSettings()
  const setSecret = useSetSecret()
  const qc = useQueryClient()
  const enabled = config?.enabled ?? false

  const secretKey = secretKeyForProvider(info.id)
  const hasKey = useHasSecret(secretKey)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)

  const cfgProviders = settings?.providers ?? {}

  function patchProviders(patch: Record<string, ProviderConfig>) {
    update.mutate({ providers: { ...cfgProviders, ...patch } })
  }

  function toggleEnabled(next: boolean) {
    const current = cfgProviders[info.id]
    const providers = {
      ...cfgProviders,
      [info.id]: {
        enabled: next,
        defaultModel: current?.defaultModel ?? info.models[0]?.id,
        ollamaEndpoint: current?.ollamaEndpoint,
      },
    }
    // Auto-select this provider if none is active yet
    const patch: Record<string, unknown> = { providers }
    if (next && !settings?.defaultProviderId) patch.defaultProviderId = info.id
    update.mutate(patch as Parameters<typeof update.mutate>[0])
  }

  function saveKey() {
    setSecret.mutate({ key: secretKey, value: apiKey }, { onSuccess: () => setApiKey('') })
  }


  function changeEndpoint(endpoint: string) {
    patchProviders({
      [info.id]: { ...cfgProviders[info.id], enabled: true, ollamaEndpoint: endpoint },
    })
  }

  function refreshOllama() {
    window.api.llm.ollamaRefresh({}).then(() => {
      qc.invalidateQueries({ queryKey: keys.providers })
    })
  }

  const pill = info.requiresOAuth
    ? { text: 'OAuth', cls: 'text-amber-600' }
    : info.isOllama
      ? { text: 'Local', cls: 'text-blue-600' }
      : hasKey.data
        ? { text: 'Key set', cls: 'text-emerald-600' }
        : { text: 'Add key', cls: 'text-amber-600' }

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{info.label}</span>
          <span className={`text-xs ${pill.cls}`}>{pill.text}</span>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={toggleEnabled}
          disabled={info.requiresOAuth}
        />
      </div>

      {enabled && !info.requiresOAuth && (
        <div className="space-y-3 border-l-2 border-border ml-1 pl-3">
          {info.needsApiKey && (
            <div className="space-y-1.5">
              <Label className="text-xs">API key</Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    placeholder={hasKey.data ? '••••••••' : 'Enter API key'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="h-8"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <Button size="sm" disabled={!apiKey} onClick={saveKey}>
                  Save
                </Button>
              </div>
              {hasKey.data && <p className="text-xs text-muted-foreground">Key is set.</p>}
            </div>
          )}

          {info.isOllama && (
            <div className="space-y-1.5">
              <Label className="text-xs">Endpoint</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={config?.ollamaEndpoint ?? 'http://localhost:11434/v1'}
                  onChange={(e) => changeEndpoint(e.target.value)}
                  className="h-8"
                />
                <Button size="sm" variant="outline" onClick={refreshOllama}>
                  <RefreshCw className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {enabled && info.requiresOAuth && (
        <p className="text-xs text-muted-foreground ml-1">
          Requires login — coming soon.
        </p>
      )}
    </div>
  )
}
