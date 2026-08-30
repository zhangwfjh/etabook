import type { EditorView } from '@codemirror/view'

/**
 * The active EditorView bridge. The editor pane publishes its view here so
 * toolbar buttons, palette commands, and the test harness can dispatch into
 * the focused editor without prop-drilling. Lives outside component modules
 * so React Fast Refresh boundaries stay clean.
 */
export function getActiveEditorView(): EditorView | null {
  return (window as unknown as { __editorView?: EditorView }).__editorView ?? null
}
