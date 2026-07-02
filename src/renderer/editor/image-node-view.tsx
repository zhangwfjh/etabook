import { useRef, useCallback, useState } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { getBlockSourceEditStorage } from './block-source-edit'

type Align = 'left' | 'center' | 'right'

const ALIGN_ICONS: Record<Align, typeof AlignLeft> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
}

/**
 * Image node view with resize handles, alignment hover-buttons, and caption.
 *
 * - **Resize**: drag the bottom-right corner handle to set pixel width. The
 *   aspect ratio is preserved (height auto-scales). Width round-trips through
 *   Obsidian's `![alt|W](src)` markdown syntax.
 * - **Alignment**: three small buttons appear on hover
 *   (left/center/right). Alignment is a presentation attribute stored in the
 *   ProseMirror JSON; it does not persist through markdown serialization.
 * - **Caption**: when the image has a non-empty `title`, it renders as an
 *   italic `<figcaption>` below the image.
 * - **Source edit**: double-click dispatches to block-source-edit's
 *   `startEditAt` so the user can edit `![alt](src "title")` directly.
 */
export function ImageNodeView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const src = (node.attrs.src as string) ?? ''
  const alt = (node.attrs.alt as string) ?? ''
  const title = (node.attrs.title as string) ?? ''
  const width = typeof node.attrs.width === 'number' ? node.attrs.width : null
  const align = (node.attrs.align as Align) || 'center'
  const caption = title.trim()

  const figureRef = useRef<HTMLElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [hovered, setHovered] = useState(false)

  // ── Resize via corner drag ──────────────────────────────────────────
  const dragging = useRef(false)

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragging.current = true

      const startX = e.clientX
      const startWidth = imgRef.current?.offsetWidth ?? width ?? 400
      const naturalWidth = imgRef.current?.naturalWidth ?? startWidth

      function onMove(ev: PointerEvent) {
        if (!dragging.current) return
        const delta = ev.clientX - startX
        let next = Math.round(startWidth + delta)
        next = Math.max(80, Math.min(next, naturalWidth))
        updateAttributes({ width: next })
      }
      function onUp() {
        dragging.current = false
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
      }
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    },
    [width, updateAttributes],
  )

  // ── Double-click → source edit ──────────────────────────────────────
  function handleDoubleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const pos = getPos()
    if (typeof pos !== 'number') return
    const storage = getBlockSourceEditStorage(editor)
    storage?.startEditAt?.(pos)
  }

  // Select node on click (so the toolbar stays visible).
  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    const pos = getPos()
    if (typeof pos !== 'number') return
    editor.commands.setNodeSelection(pos)
  }

  const showControls = hovered || selected
  const alignClass = `etabook-figure--${align}`
  const imgStyle = width ? { width: `${width}px` } : undefined

  return (
    <NodeViewWrapper
      as="figure"
      ref={figureRef}
      className={`etabook-figure ${alignClass}${selected ? ' is-selected' : ''}`}
      draggable
      data-drag-handle
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <div className="etabook-figure-img-wrap" contentEditable={false}>
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          title={title || undefined}
          style={imgStyle}
          draggable={false}
        />
        <div className={`etabook-figure-controls${showControls ? ' is-visible' : ''}`}>
          {(['left', 'center', 'right'] as Align[]).map((a) => {
            const Icon = ALIGN_ICONS[a]
            return (
              <button
                key={a}
                type="button"
                className={`etabook-align-btn${align === a ? ' is-active' : ''}`}
                title={`Align ${a}`}
                aria-label={`Align ${a}`}
                contentEditable={false}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  updateAttributes({ align: a })
                }}
              >
                <Icon className="size-3.5" />
              </button>
            )
          })}
        </div>
        <div
          className={`etabook-resize-handle${showControls ? ' is-visible' : ''}`}
          contentEditable={false}
          onPointerDown={onHandlePointerDown}
        />
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </NodeViewWrapper>
  )
}
