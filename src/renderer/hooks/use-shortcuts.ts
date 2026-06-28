import { useEffect } from 'react'
import { useWorkspace } from '@/state/store'
import { matchesAccelerator } from '@/lib/accelerator'
import { useSettings } from '@/queries/settings'
import { DEFAULT_CONFIG, type ShortcutMap } from '../../shared/ipc'

type Props = { onOpenSettings: () => void }

/**
 * Global keyboard shortcuts, dispatched via the user-configurable accelerator
 * map in `AppConfig.shortcuts`. A missing/null accelerator disables the
 * action; malformed accelerators silently never match.
 *
 * `useSettings()` provides the live config; the handler reads the latest
 * shortcuts through a ref-less closure over the query data, re-binding the
 * keydown listener whenever settings change.
 */
export function useShortcuts({ onOpenSettings }: Props) {
  const { data: settings } = useSettings()
  const shortcuts: ShortcutMap = settings?.shortcuts ?? DEFAULT_CONFIG.shortcuts

  useEffect(() => {
    function dispatch(action: keyof ShortcutMap, e: KeyboardEvent) {
      const acc = shortcuts[action]
      if (!acc) return
      if (matchesAccelerator(acc, e)) e.preventDefault()
      else return
      switch (action) {
        case 'toggleSidebar':
          useWorkspace.getState().setSidebarOpen(!useWorkspace.getState().sidebarOpen)
          break
        case 'openSettings':
          onOpenSettings()
          break
        case 'toggleTimeline':
          useWorkspace.getState().setTimelineOpen(!useWorkspace.getState().timelineOpen)
          break
      }
    }

    function onKey(e: KeyboardEvent) {
      dispatch('toggleSidebar', e)
      dispatch('openSettings', e)
      dispatch('toggleTimeline', e)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcuts, onOpenSettings])
}
