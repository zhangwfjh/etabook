import { useSettings } from '@/queries/settings'
import { useCatalog } from '@/queries/providers'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ProviderRow } from './ProviderRow'
import type { ProviderConfig } from '../../../shared/ipc'

export function AiTab() {
  const { data: settings } = useSettings()
  const { data: catalog } = useCatalog()

  const cfgProviders = settings?.providers ?? {}
  const enabledCount = catalog?.filter((p) => cfgProviders[p.id]?.enabled).length ?? 0

  return (
    <div className="space-y-4">
      {enabledCount === 0 && (
        <p className="text-xs text-muted-foreground">
          Enable a provider below to get started. Models are picked from the AI command bar.
        </p>
      )}

      <div className="space-y-2">
        <Label>Providers</Label>
        <ScrollArea className="h-[300px] pr-3">
          <div className="space-y-2">
            {catalog?.map((info) => (
              <ProviderRow
                key={info.id}
                info={info}
                config={cfgProviders[info.id] satisfies ProviderConfig | undefined}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
