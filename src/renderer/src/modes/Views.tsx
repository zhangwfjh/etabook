import { useEffect, useRef, useState } from 'react'
import { type EditorView } from '@codemirror/view'
import { Editor } from '@renderer/editor/Editor'
import { useTheme } from '@renderer/features/settings/ThemeProvider'
import type { Doc } from '@renderer/lib/store'
import { dirname } from '@renderer/lib/fs'
import { renderMarkdown } from '@renderer/reading/render'

type Props = {
  doc: Doc
  onChange: (text: string) => void
  onCursorChange?: (pos: number) => void
  onView?: (view: EditorView | null) => void
  livePreview: boolean
}

export function EditorPane({ doc, onChange, onCursorChange, onView, livePreview }: Props): React.JSX.Element {
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
        readonly={false}
        livePreview={livePreview}
        docDir={docDir}
        onChange={onChange}
        onCursorChange={onCursorChange}
        onView={onView}
      />
    </div>
  )
}

export function ReadingPane({ doc }: { doc: Doc }): React.JSX.Element {
  const { dark } = useTheme()
  const [html, setHtml] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    renderMarkdown(doc.content, dark ? 'dark' : 'light')
      .then((out) => {
        if (!cancelled) setHtml(out)
      })
      .catch((err) => {
        // Graceful degradation: show an error note if rendering fails entirely.
        if (!cancelled) setHtml(`<p style="color:var(--danger)">Rendering error: ${String(err.message ?? err)}</p>`)
      })
    return () => {
      cancelled = true
    }
  }, [doc.content, dark])

  return (
    <div ref={containerRef} className="h-full w-full overflow-y-auto">
      <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
