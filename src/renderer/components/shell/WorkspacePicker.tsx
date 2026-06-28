import { useWorkspace } from '@/state/store'

export function WorkspacePicker() {
  const ws = useWorkspace(s => s.workspacePath)
  const setWorkspace = useWorkspace(s => s.setWorkspace)

  if (ws) return null

  async function handlePick() {
    const path = await window.api.workspace.pick()
    if (path) setWorkspace(path)
  }

  return (
    <div className="h-full grid place-items-center bg-bg-canvas text-fg-muted">
      <div className="text-center space-y-3">
        <div className="text-fg-primary text-lg">Pick a workspace folder</div>
        <div className="text-xs">Choose the root directory Etabook will read &amp; watch.</div>
        <button
          onClick={handlePick}
          className="px-3 py-1.5 rounded-default border border-border bg-bg-elevated text-fg-primary hover:bg-bg-subtle"
        >
          Open folder…
        </button>
      </div>
    </div>
  )
}
