import { type ReactElement } from 'react'
import { Modal } from '@renderer/components/ui'
import { useTheme } from './ThemeProvider'
import type { EditorMode, ThemeMode } from '@shared/types'

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }): ReactElement | null {
  const { config, setConfig, theme, setTheme } = useTheme()

  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <Section title="Appearance">
        <Row label="Theme">
          <Segmented
            value={theme}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' }
            ]}
            onChange={(v) => setTheme(v as ThemeMode)}
          />
        </Row>
        <Row label="Default editor mode">
          <Segmented
            value={config.editorMode}
            options={[
              { value: 'source', label: 'Source' },
              { value: 'live', label: 'Live Preview' },
              { value: 'reading', label: 'Reading' }
            ]}
            onChange={(v) => void setConfig({ editorMode: v as EditorMode })}
          />
        </Row>
        <Row label="Font size">
          <input
            type="range"
            min={12}
            max={24}
            value={config.fontSize}
            onChange={(e) => void setConfig({ fontSize: Number(e.target.value) })}
            className="accent-[var(--accent)]"
          />
          <span className="text-sm w-8 text-right">{config.fontSize}</span>
        </Row>
      </Section>

      <Section title="Editor">
        <Row label="Line wrap">
          <Toggle checked={config.lineWrap} onChange={(v) => void setConfig({ lineWrap: v })} />
        </Row>
        <Row label="Show line numbers">
          <Toggle checked={config.showLineNumbers} onChange={(v) => void setConfig({ showLineNumbers: v })} />
        </Row>
      </Section>
    </Modal>
  )
}

function Section({ title, children }: { title: string; children: ReactElement[] }): ReactElement {
  return (
    <div className="mb-6">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-3">{title}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactElement | ReactElement[] }): ReactElement {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function Segmented({
  value,
  options,
  onChange
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}): ReactElement {
  return (
    <div className="inline-flex rounded-[6px] border border-[var(--border)] overflow-hidden">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1 text-[13px] cursor-pointer transition-colors duration-100 ${
            value === o.value ? 'bg-[var(--accent)] text-[var(--accent-contrast)]' : 'hover:bg-[var(--surface-2)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }): ReactElement {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full cursor-pointer transition-colors duration-150 relative ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--surface-2)] border border-[var(--border)]'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-[var(--surface)] shadow-sm transition-transform duration-150 ${checked ? 'translate-x-4' : ''}`}
      />
    </button>
  )
}
