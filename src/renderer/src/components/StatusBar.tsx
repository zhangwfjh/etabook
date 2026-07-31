import { type ReactElement } from 'react'
import { type Doc } from '@renderer/lib/store'
import { wordCount, readingTime, lineColFromPos } from '@renderer/lib/fs'
import type { EditorMode } from '@shared/types'

type Props = {
  doc: Doc
  cursorPos: number
  mode: EditorMode
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
}

const modeLabel: Record<EditorMode, string> = {
  source: 'Source',
  live: 'Live Preview',
  reading: 'Reading'
}

const saveLabel: Record<Props['saveStatus'], (doc: Doc) => string> = {
  idle: (doc) => (doc.dirty ? 'Unsaved' : 'Saved'),
  saving: () => 'Saving…',
  saved: () => 'Saved',
  error: () => 'Save error'
}

export function StatusBar({ doc, cursorPos, mode, saveStatus }: Props): ReactElement {
  const words = wordCount(doc.content)
  const chars = doc.content.length
  const rt = readingTime(doc.content)
  const { line, col } = lineColFromPos(doc.content, Math.min(cursorPos, doc.content.length))
  const sLabel = saveLabel[saveStatus](doc)

  return (
    <div className="flex items-center justify-between px-3 h-6 text-[11px] text-[var(--text-muted)] border-t border-[var(--border)] bg-[var(--surface)] shrink-0 select-none">
      <div className="flex items-center gap-3">
        <span>{modeLabel[mode]}</span>
        <span className={doc.dirty ? 'text-[var(--accent)]' : ''}>{sLabel}</span>
      </div>
      <div className="flex items-center gap-4">
        <span>{words} words</span>
        <span>{chars} chars</span>
        <span>{rt} min read</span>
        {mode !== 'reading' && (
          <span>
            Ln {line}, Col {col}
          </span>
        )}
      </div>
    </div>
  )
}
