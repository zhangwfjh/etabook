import { useState, useEffect } from 'react'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import type { CSSProperties } from 'react'
import { X } from 'lucide-react'
import { TextSelection } from '@tiptap/pm/state'
import type { Node as PmNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/core'
import { CALLOUT_TYPES, resolveCalloutType } from './callout-types'

/**
 * Convert a callout into a blockquote. Removing the `[!type]` marker from a
 * callout (`> [!type] title` → `> title`) leaves a plain blockquote, so the
 * conversion is: wrap the title (as a paragraph) + body content in a
 * blockquote node. An empty callout becomes an empty blockquote paragraph.
 */
function calloutToBlockquote(editor: Editor, pos: number, node: PmNode): void {
  const schema = editor.state.schema
  const title = (node.attrs.title as string) || ''
  const body = node.content
  const blocks: PmNode[] = []
  if (title) {
    blocks.push(schema.nodes.paragraph.create(null, schema.text(title)))
  }
  if (body && body.size > 0) {
    body.forEach((child) => blocks.push(child as PmNode))
  }
  if (blocks.length === 0) {
    blocks.push(schema.nodes.paragraph.create())
  }
  const blockquote = schema.nodes.blockquote.create(null, blocks)
  const tr = editor.state.tr.replaceWith(pos, pos + node.nodeSize, blockquote)
  tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 2)))
  editor.view.dispatch(tr)
}

/** Match the callout header: `[!type]` + optional fold marker (+/-) + title. */
const HEADER_RE = /^\s*\[!([^\]]+)\]\s*([+-])?\s*(.*)$/

/** Build the editable raw header line from attrs: `[!type] title`. */
function headerFromAttrs(type: string, rawType: string, title: string, foldable: string): string {
  const t = rawType || type
  return `[!${t}]${foldable || ''}${title ? ' ' + title : ''}`
}

export function CalloutNodeView(props: NodeViewProps) {
  const { node, updateAttributes, selected, editor, getPos } = props
  const type = (node.attrs.type as string) || 'note'
  const title = (node.attrs.title as string) || ''
  const rawType = (node.attrs.rawType as string) || ''
  const foldable = (node.attrs.foldable as string) || ''

  const kind = CALLOUT_TYPES.find((k) => k.canonical === type)
  const colorVar = kind?.colorVar ?? 'note'
  const label = kind?.label ?? type
  const icon = kind?.icon ?? 'ℹ'
  const isMath = !!kind?.math

  const style = {
    '--callout-color': `var(--callout-${colorVar})`,
  } as CSSProperties

  const fromAttrs = headerFromAttrs(type, rawType, title, foldable)
  const [header, setHeader] = useState(fromAttrs)
  useEffect(() => {
    setHeader(fromAttrs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAttrs])

  // Focus-based toggle: the raw input shows ONLY when the header input is
  // focused (caret on the header line). When not focused, the header renders
  // exactly like view mode (icon + colored type + title). React state drives
  // this because focus/blur events reliably re-render this node view.
  const [focused, setFocused] = useState(false)

  function onHeaderChange(raw: string): void {
    setHeader(raw)
    if (raw.trim() === '') {
      const pos = getPos()
      if (typeof pos === 'number') calloutToBlockquote(editor, pos, node)
      return
    }
    const m = HEADER_RE.exec(raw)
    if (m) {
      const resolved = resolveCalloutType(m[1].trim())
      updateAttributes({
        type: resolved.canonical,
        rawType: resolved.rawType === resolved.canonical ? '' : resolved.rawType,
        foldable: m[2] ?? '',
        title: m[3].trim(),
      })
    }
  }

  return (
    <NodeViewWrapper
      as="aside"
      data-callout={type}
      data-callout-type={type}
      data-raw-type={rawType || undefined}
      data-math={isMath || undefined}
      className={`callout${selected ? ' is-selected' : ''}`}
      style={style}
    >
      <div className={`callout-header${focused ? ' is-focused' : ''}`} contentEditable={false}>
        {/* Field: wraps the static label and the raw input. The input is
            always present (never display:none) but invisible (opacity:0,
            position:absolute) when not focused — it overlays the static label
            so clicking the header focuses it. This breaks the chicken-and-egg
            where a display:none input can never receive focus. */}
        <div className="callout-header-field">
          <span className="callout-header-static">
            <span className="callout-icon" aria-hidden>{icon}</span>
            <span className="callout-type">{label}</span>
            {title ? <span className="callout-title">{title}</span> : null}
          </span>
          <input
            className="callout-header-input"
            type="text"
            value={header}
            spellCheck={false}
            onChange={(e) => onHeaderChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <button
          type="button"
          className="callout-remove"
          title="Remove callout"
          aria-label="Remove callout"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const pos = getPos()
            if (typeof pos === 'number') calloutToBlockquote(editor, pos, node)
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <NodeViewContent className="callout-body" />
    </NodeViewWrapper>
  )
}
