import { useState } from 'react'
import { useCatalog } from '@/queries/providers'
import { useSettings, useUpdateSettings } from '@/queries/settings'
import { ChevronDown, Globe, Server } from 'lucide-react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import type { ProviderCatalogInfo, ProviderConfig } from '../../../shared/ipc'

type Props = {
  editor: TiptapEditor | null
}

export function CommandBar({ editor }: Props) {
  const [input, setInput] = useState('')
  const [hovered, setHovered] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const { data: catalog } = useCatalog()
  const { data: cfg } = useSettings()
  const update = useUpdateSettings()

  const cfgProviders = cfg?.providers ?? {}
  const currentProviderId = cfg?.defaultProviderId ?? ''
  const currentProviderCfg = currentProviderId ? cfgProviders[currentProviderId] : undefined
  const currentModel = currentProviderCfg?.defaultModel ?? 'N/A'
  const currentCatalogEntry = catalog?.find((p) => p.id === currentProviderId)
  const enabledProviders = (catalog ?? []).filter((p) => cfgProviders[p.id]?.enabled)

  function selectModel(providerId: string, modelId: string) {
    setPickerOpen(false)
    const next = { ...cfgProviders }
    next[providerId] = { ...next[providerId], defaultModel: modelId }
    update.mutate({ providers: next, defaultProviderId: providerId })
  }

  function handleSubmit() {
    if (!input.trim() || !editor) return
    editor.chain().focus().insertContent({
      type: 'aiPlan',
      attrs: { id: `plan-${Date.now()}`, model: currentModel },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: input.trim() }] }],
    }).run()
    setInput('')
  }

  return (
    <div
      className={`border-t border-border bg-bg-elevated px-4 py-2 transition-opacity duration-200 ${
        hovered ? 'opacity-100' : 'opacity-30'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="max-w-[var(--width-canvas-max)] mr-auto flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
          placeholder="Ask Etabook to orchestrate..."
          className="flex-1 bg-transparent text-sm text-fg-primary placeholder:text-fg-subtle outline-none"
        />
        <div className="relative">
          <button
            onClick={() => setPickerOpen(!pickerOpen)}
            className="flex items-center gap-1.5 px-2 py-1 rounded border border-border text-xs text-fg-muted hover:bg-bg-subtle"
          >
            {currentCatalogEntry?.isOllama ? (
              <Server className="size-3" />
            ) : (
              <Globe className="size-3" />
            )}
            <span>{currentModel}</span>
            <ChevronDown className="size-3" />
          </button>
          {pickerOpen && enabledProviders.length > 0 && (
            <div className="absolute bottom-full right-0 mb-1 bg-bg-elevated border border-border rounded-lg shadow-lg p-1 min-w-[220px] max-h-[320px] overflow-y-auto">
              {enabledProviders.map((p) => (
                <ProviderGroup
                  key={p.id}
                  info={p}
                  config={cfgProviders[p.id]}
                  isCurrentProvider={p.id === currentProviderId}
                  onSelect={selectModel}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ProviderGroup({
  info,
  config,
  isCurrentProvider,
  onSelect,
}: {
  info: ProviderCatalogInfo
  config: ProviderConfig | undefined
  isCurrentProvider: boolean
  onSelect: (providerId: string, modelId: string) => void
}) {
  const selected = config?.defaultModel
  return (
    <div className="py-1">
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-fg-muted">
        {info.isOllama ? <Server className="size-3" /> : <Globe className="size-3" />}
        <span>{info.label}</span>
      </div>
      {info.models.length === 0 ? (
        <div className="px-2 py-0.5 text-xs text-fg-subtle italic">
          {info.isOllama ? 'No models — click Refresh in Settings' : 'No models'}
        </div>
      ) : (
        info.models.map((m) => {
          const active = isCurrentProvider && (selected ?? '') === m.id
          return (
            <button
              key={m.id}
              onClick={() => onSelect(info.id, m.id)}
              className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-left ${
                active
                  ? 'bg-accent/20 text-fg-primary'
                  : 'text-fg-muted hover:bg-bg-subtle'
              }`}
            >
              <span className="truncate">{m.name}</span>
              {m.reasoning && <span className="text-fg-subtle">🧠</span>}
              {active && <span className="ml-auto text-fg-subtle">✓</span>}
            </button>
          )
        })
      )}
    </div>
  )
}
