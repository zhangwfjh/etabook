import { applyEditorScale } from '@/lib/editor-scale'
import { useSettings, useUpdateSettings } from '@/queries/settings'
import { applyTheme, THEME_LABELS, THEME_ORDER, type ThemeName } from '@/themes'
import { useWorkspace } from '@/state/store'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DEFAULT_CONFIG } from '../../../shared/ipc'

export function GeneralTab() {
  const { data: settings } = useSettings()
  const update = useUpdateSettings()
  const sidebarOpen = useWorkspace((s) => s.sidebarOpen)
  const setSidebarOpen = useWorkspace((s) => s.setSidebarOpen)

  const theme = settings?.theme ?? DEFAULT_CONFIG.theme
  const editorScale = settings?.editorScale ?? DEFAULT_CONFIG.editorScale
  const retention = settings?.snapshotRetention ?? DEFAULT_CONFIG.snapshotRetention
  const exclusions = (settings?.fileExclusions ?? DEFAULT_CONFIG.fileExclusions).join(', ')

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Theme</Label>
        <Select
          value={theme}
          onValueChange={(v) => {
            applyTheme(v as ThemeName)
            update.mutate({ theme: v as ThemeName })
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THEME_ORDER.map((t) => (
              <SelectItem key={t} value={t}>{THEME_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label>Sidebar open</Label>
        <Switch
          checked={sidebarOpen}
          onCheckedChange={(v) => setSidebarOpen(v)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Text scale</Label>
          <span className="text-sm text-[color:var(--fg-muted)] tabular-nums">
            {Math.round(editorScale * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0.8}
          max={1.6}
          step={0.05}
          value={editorScale}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (Number.isFinite(v) && v >= 0.8 && v <= 1.6) {
              applyEditorScale(v)
              update.mutate({ editorScale: v })
            }
          }}
          className="w-full accent-[color:var(--accent)]"
        />
      </div>

      <div className="space-y-2">
        <Label>Snapshot retention ({retention})</Label>
        <Input
          type="number"
          min={5}
          max={500}
          value={retention}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            if (v >= 5 && v <= 500) update.mutate({ snapshotRetention: v })
          }}
        />
      </div>

      <div className="space-y-2">
        <Label>Excluded paths (comma-separated)</Label>
        <Input
          value={exclusions}
          onChange={(e) => {
            const list = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
            update.mutate({ fileExclusions: list })
          }}
        />
      </div>
    </div>
  )
}
