import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { GeneralTab } from './GeneralTab'
import { AiTab } from './AiTab'
import { ShortcutsTab } from './ShortcutsTab'
import { AboutTab } from './AboutTab'

const tabs = ['General', 'AI', 'Shortcuts', 'About'] as const
type Tab = typeof tabs[number]

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

export function SettingsModal({ open, onOpenChange }: Props) {
  const [tab, setTab] = useState<Tab>('General')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="flex gap-4 min-h-[320px]">
          <nav className="flex flex-col gap-1 w-32 shrink-0">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-left px-3 py-1.5 rounded text-sm ${
                  tab === t
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50'
                }`}
              >
                {t}
              </button>
            ))}
          </nav>
          <div className="flex-1 min-w-0">
            {tab === 'General' && <GeneralTab />}
            {tab === 'AI' && <AiTab />}
            {tab === 'Shortcuts' && <ShortcutsTab />}
            {tab === 'About' && <AboutTab />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
