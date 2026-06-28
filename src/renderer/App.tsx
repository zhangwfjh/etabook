import { Fragment, useEffect, useState } from 'react'
import { TitleBar } from '@/components/shell/TitleBar'
import { StatusBar } from '@/components/shell/StatusBar'
import { WorkspacePicker } from '@/components/shell/WorkspacePicker'
import { EditorGroupPane } from '@/components/editor/EditorGroupPane'
import { Splitter } from '@/components/editor/Splitter'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { VersionTimeline } from '@/components/snapshots/VersionTimeline'
import { SettingsModal } from '@/components/settings/SettingsModal'
import { ConflictModal } from '@/components/conflict/ConflictModal'
import { ErrorBoundary } from '@/components/system/ErrorBoundary'
import { UnsavedChangesController } from '@/components/editor/UnsavedChangesController'
import { useShortcuts } from '@/hooks/use-shortcuts'
import { useEditorScaleInput } from '@/hooks/use-editor-scale-input'
import { useCloseRequestGuard } from '@/hooks/use-unsaved-guard'
import { useWorkspace } from '@/state/store'
import { useSettings } from '@/queries/settings'
import { applyEditorScale } from '@/lib/editor-scale'

export default function App() {
  const ws = useWorkspace((s) => s.workspacePath)
  const groups = useWorkspace((s) => s.groups)
  const activeGroupId = useWorkspace((s) => s.activeGroupId)
  const orientation = useWorkspace((s) => s.orientation)
  const { data: settings } = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Sync editor scale from persisted config (source of truth) to the CSS var.
  // main.tsx pre-paints from localStorage to avoid flash; this reconciles any drift.
  useEffect(() => {
    if (settings?.editorScale !== undefined) {
      applyEditorScale(settings.editorScale)
    }
  }, [settings?.editorScale])

  useShortcuts({ onOpenSettings: () => setSettingsOpen(true) })
  useEditorScaleInput()
  useCloseRequestGuard()

  return (
    <ErrorBoundary>
      <div className="h-full grid grid-rows-[36px_1fr_24px] bg-bg-canvas text-fg-primary">
        <TitleBar onOpenSettings={() => setSettingsOpen(true)} />
        {ws ? (
          <div className="grid grid-cols-[auto_1fr_auto] min-h-0">
            <Sidebar />
            <main
              className="min-h-0 flex"
              style={{ flexDirection: orientation === 'horizontal' ? 'row' : 'column' }}
            >
              {groups.map((g, i) => (
                <Fragment key={g.id}>
                  <div className="flex-1 min-w-0 min-h-0">
                    <EditorGroupPane group={g} focused={g.id === activeGroupId} />
                  </div>
                  {i < groups.length - 1 && <Splitter orientation={orientation} />}
                </Fragment>
              ))}
            </main>
            <VersionTimeline />
          </div>
        ) : (
          <WorkspacePicker />
        )}
        <StatusBar />
        <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
        <UnsavedChangesController />
        <ConflictModal />
      </div>
    </ErrorBoundary>
  )
}
