import { type EditorView } from '@codemirror/view'
import { Editor } from '@renderer/editor/Editor'
import { useTheme } from '@renderer/features/settings/ThemeProvider'
import type { Doc } from '@renderer/lib/store'
import { dirname } from '@renderer/lib/fs'

type Props = {
  doc: Doc
  onChange: (text: string) => void
  onCursorChange?: (pos: number) => void
  onView?: (view: EditorView | null) => void
  livePreview: boolean
  /** Reading mode: same CM6 view fully rendered, read-only, links clickable. */
  reading: boolean
  /** Absolute workspace root — enables embed/wikilink Resolution. */
  workspace?: string
  /** Reading-mode navigation: open a resolved note path. */
  onOpenNote?: (path: string) => void
}

export function EditorPane({
  doc, onChange, onCursorChange, onView, livePreview, reading, workspace, onOpenNote
}: Props): React.JSX.Element {
  const { dark, config } = useTheme()
  const docDir = doc.path ? dirname(doc.path) : undefined

  return (
    <div className="h-full w-full overflow-hidden">
      <Editor
        doc={doc.content}
        docId={doc.id}
        dark={dark}
        lineWrap={config.lineWrap}
        showLineNumbers={config.showLineNumbers}
        readonly={reading}
        livePreview={livePreview}
        reading={reading}
        docDir={docDir}
        docPath={doc.path}
        workspace={workspace}
        onOpenNote={onOpenNote}
        onChange={onChange}
        onCursorChange={onCursorChange}
        onView={onView}
      />
    </div>
  )
}
