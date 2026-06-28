import { useEffect } from 'react'
import { useWorkspace } from '@/state/store'
import { matchesAccelerator } from '@/lib/accelerator'
import { useSettings } from '@/queries/settings'
import { DEFAULT_CONFIG, type ShortcutMap } from '../../shared/ipc'
import { useGoToLine } from '@/state/go-to-line-store'

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
        case 'splitRight':
          useWorkspace.getState().splitRight()
          break
        case 'splitDown':
          useWorkspace.getState().splitDown()
          break
        case 'closeTab': {
          const s = useWorkspace.getState()
          if (s.activeGroupId && s.activeFilePath) {
            if (s.docStates[s.activeFilePath]?.dirty) {
              s.setUnsavedPrompt({ kind: 'closeTab', docPath: s.activeFilePath })
            } else {
              s.closeTab(s.activeGroupId, s.activeFilePath)
            }
          }
          break
        }
        case 'nextTab':
        case 'prevTab': {
          const s = useWorkspace.getState()
          const g = s.groups.find((x) => x.id === s.activeGroupId)
          if (!g || g.docs.length < 2) break
          const idx = g.activeDoc ? g.docs.indexOf(g.activeDoc) : 0
          const delta = action === 'nextTab' ? 1 : -1
          const next = (idx + delta + g.docs.length) % g.docs.length
          s.setActiveTab(g.id, g.docs[next])
          break
        }
        case 'goToLine':
          useGoToLine.getState().setOpen(true)
          break
      }
    }

    function onKey(e: KeyboardEvent) {
      dispatch('toggleSidebar', e)
      dispatch('openSettings', e)
      dispatch('toggleTimeline', e)
      dispatch('splitRight', e)
      dispatch('splitDown', e)
      dispatch('closeTab', e)
      dispatch('nextTab', e)
      dispatch('prevTab', e)
      dispatch('goToLine', e)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcuts, onOpenSettings])
}
