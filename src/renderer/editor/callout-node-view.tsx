import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import type { CSSProperties } from 'react'
import { CALLOUT_TYPES } from './callout-types'

export function CalloutNodeView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const type = (node.attrs.type as string) || 'note'
  const title = (node.attrs.title as string) || ''
  const rawType = (node.attrs.rawType as string) || ''

  const kind = CALLOUT_TYPES.find((k) => k.canonical === type)
  const colorVar = kind?.colorVar ?? 'note'
  const label = kind?.label ?? type
  const icon = kind?.icon ?? 'ℹ'
  const isMath = !!kind?.math

  const style = {
    '--callout-color': `var(--callout-${colorVar})`,
  } as CSSProperties

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
      <div className="callout-header" contentEditable={false}>
        <span className="callout-icon" aria-hidden>{icon}</span>
        <span className="callout-type">{label}</span>
        {editor.isEditable ? (
          <input
            className="callout-title"
            value={title}
            placeholder="Optional title…"
            onChange={(e) => updateAttributes({ title: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        ) : title ? (
          <span className="callout-title callout-title--static">{title}</span>
        ) : null}
      </div>
      <NodeViewContent className="callout-body" />
    </NodeViewWrapper>
  )
}
