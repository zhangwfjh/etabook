import { useState, useRef, useEffect, useMemo } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import katex from 'katex'

function renderKatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: 'warn',
      output: 'html',
    })
  } catch {
    return `<span class="katex-error">${escapeHtml(latex)}</span>`
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&#39;'
    }
  })
}

export function MathInlineNodeView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const latex = (node.attrs.latex as string) ?? ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(latex)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (editing && taRef.current) {
      const ta = taRef.current
      ta.focus()
      ta.setSelectionRange(ta.value.length, ta.value.length)
    }
  }, [editing])

  const html = useMemo(() => renderKatex(editing ? draft : latex, false), [editing, draft, latex])

  function commit() {
    updateAttributes({ latex: draft })
    setEditing(false)
  }

  return (
    <NodeViewWrapper
      as="span"
      className={`etabook-math-inline${selected ? ' is-selected' : ''}`}
      style={{ display: 'inline-block', position: 'relative' }}
      contentEditable={false}
      onClick={() => {
        if (editor.isEditable) {
          setDraft(latex)
          setEditing(true)
        }
      }}
      onDoubleClick={() => {
        setDraft(latex)
        setEditing(true)
      }}
    >
      {editing ? (
        <textarea
          ref={taRef}
          className="etabook-math-edit-overlay"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
            else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit() }
          }}
          rows={1}
        />
      ) : (
        <span dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </NodeViewWrapper>
  )
}

export function MathBlockNodeView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const latex = (node.attrs.latex as string) ?? ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(latex)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (editing && taRef.current) {
      const ta = taRef.current
      ta.focus()
      ta.setSelectionRange(ta.value.length, ta.value.length)
    }
  }, [editing])

  const html = useMemo(() => renderKatex(editing ? draft : latex, true), [editing, draft, latex])

  function commit() {
    updateAttributes({ latex: draft })
    setEditing(false)
  }

  return (
    <NodeViewWrapper
      as="div"
      className={`etabook-math-block${selected ? ' is-selected' : ''}`}
      style={{ position: 'relative' }}
      contentEditable={false}
      onClick={() => {
        if (editor.isEditable) {
          setDraft(latex)
          setEditing(true)
        }
      }}
      onDoubleClick={() => {
        setDraft(latex)
        setEditing(true)
      }}
    >
      {editing ? (
        <textarea
          ref={taRef}
          className="etabook-math-edit-overlay"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
            else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit() }
          }}
          rows={Math.max(2, draft.split('\n').length)}
        />
      ) : (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </NodeViewWrapper>
  )
}
