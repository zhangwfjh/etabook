import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'

type Heading = { level: 2 | 3; text: string; pos: number }
type H2Entry = { index: number; heading: Heading; children: Heading[] }

type Props = {
  editor: TiptapEditor | null
  scrollEl: HTMLDivElement | null
}

/**
 * Floating table of contents.
 *
 * Shows only level-2 headers, pinned in the right margin of the editor pane.
 * Hovering an H2 emphasizes it and expands its level-3 children; the active
 * section (tracked from scroll position) is also kept open and highlighted.
 * Clicking an entry scrolls the document to that heading.
 *
 * Renders nothing when there are no H2s; otherwise shows the full rail when the
 * pane gutter fits it, or collapses to a dot line (expand-on-hover) otherwise.
 */
export function FloatingToc({ editor, scrollEl }: Props) {
  const [headings, setHeadings] = useState<Heading[]>([])
  const [hovered, setHovered] = useState<number | null>(null)
  const [active, setActive] = useState(0)
  const [activeChild, setActiveChild] = useState<number | null>(null)
  const [wide, setWide] = useState(false)
  const [gutter, setGutter] = useState(0)
  const [railHover, setRailHover] = useState(false)
  const hoverTimer = useRef<number | undefined>(undefined)
  const railCloseTimer = useRef<number | undefined>(undefined)
  // Group flat headings into H2 sections with their following H3 children.
  const entries = useMemo<H2Entry[]>(() => {
    const out: H2Entry[] = []
    let i = 0
    while (i < headings.length) {
      if (headings[i].level !== 2) { i++; continue }
      const children: Heading[] = []
      let j = i + 1
      while (j < headings.length && headings[j].level === 3) {
        children.push(headings[j])
        j++
      }
      out.push({ index: i, heading: headings[i], children })
      i = j
    }
    return out
  }, [headings])

  // Collect headings from the doc; rebuild on every editor transaction.
  useEffect(() => {
    if (!editor) { setHeadings([]); return }
    const collect = () => {
      const found: Heading[] = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          const level = node.attrs.level
          if (level === 2 || level === 3) {
            found.push({ level, text: node.textContent, pos })
          }
        }
        return true
      })
      setHeadings(found)
    }
    collect()
    editor.on('update', collect)
    return () => { editor.off('update', collect) }
  }, [editor])

  // Keep the active H2 in sync with the scroll position.
  useEffect(() => {
    if (!editor || !scrollEl || entries.length === 0) return
    const view = editor.view
    let raf = 0
    const recompute = () => {
      raf = 0
      const base = scrollEl.getBoundingClientRect().top
      const probe = scrollEl.scrollTop + 80
      const topOf = (pos: number): number | null => {
        const dom = view.nodeDOM(pos) as HTMLElement | null
        if (!dom) return null
        return dom.getBoundingClientRect().top - base + scrollEl.scrollTop
      }
      // active H2 = last section whose heading top is above the probe
      let idx = 0
      for (let k = 0; k < entries.length; k++) {
        const top = topOf(entries[k].heading.pos)
        if (top !== null && top <= probe) idx = k
      }
      // active H3 = last child (within the active section) past the probe
      let childPos: number | null = null
      for (const c of entries[idx].children) {
        const top = topOf(c.pos)
        if (top !== null && top <= probe) childPos = c.pos
      }
      setActive(idx)
      setActiveChild(childPos)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(recompute) }
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    recompute()
    return () => {
      scrollEl.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [editor, scrollEl, entries])

  // Single gate: show the full rail only when the gutter (space between the
  // editor text column's right edge and the pane's right edge) comfortably
  // fits it. Otherwise collapse to the dot line. `railHover` only re-opens the
  // *collapsed* rail as a transient overlay — it never overrides a too-narrow
  // gutter into the expanded-in-flow state, so text is never masked at rest.
  useEffect(() => {
    if (!editor || !scrollEl) { setWide(false); return }
    const editorDom = editor.view.dom as HTMLElement
    const recompute = () => {
      const g = scrollEl.getBoundingClientRect().right - editorDom.getBoundingClientRect().right
      setGutter(g)
      // rail (224) + small offset + comfortable breathing margin
      setWide(g >= 300)
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(editorDom)
    ro.observe(scrollEl)
    window.addEventListener('resize', recompute)
    return () => { ro.disconnect(); window.removeEventListener('resize', recompute) }
  }, [editor, scrollEl])

  // Clear any pending timers on unmount.
  useEffect(() => () => { clearTimeout(hoverTimer.current); clearTimeout(railCloseTimer.current) }, [])
  // `overlay` = collapsed-at-rest but revealed by hover (floats over content,
  // never masks the text column at rest). `wide` alone = expanded in-flow.
  const collapsed = !wide
  const overlay = !wide && railHover
  if (!editor || entries.length === 0) return null

  const goTo = (pos: number) => {
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null
    dom?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Anchor the expanded rail beside the text column with a comfortable gap.
  // rail-left = W - X - 224; text-right = W - gutter; gap = rail-left - text-right = gutter - X - 224.
  // For gap G: X = gutter - 224 - G.
  const TEXT_GAP = 32
  const tocRight = wide ? `${Math.max(8, gutter - 224 - TEXT_GAP)}px` : undefined

  // Delay H3 expansion so a quick sweep across H2s doesn't strobe every group.
  const HOVER_DELAY = 350
  const scheduleHover = (idx: number | null) => {
    clearTimeout(hoverTimer.current)
    if (idx === null) { setHovered(null); return }
    hoverTimer.current = window.setTimeout(() => { setHovered(idx); hoverTimer.current = undefined }, HOVER_DELAY)
  }

  return (
    <nav
      className="etabook-toc-rail"
      style={tocRight ? ({ '--toc-right': tocRight } as CSSProperties) : undefined}
      data-collapsed={(collapsed && !overlay) || undefined}
      data-overlay={overlay || undefined}
      aria-label="Table of contents"
      onMouseEnter={() => { clearTimeout(railCloseTimer.current); setRailHover(true) }}
      onMouseLeave={() => {
        // Delay collapsing so a transient cursor exit (e.g. the rail shrinking
        // when an H3 group collapses) doesn't snap it shut mid-exploration.
        railCloseTimer.current = window.setTimeout(() => { setRailHover(false); railCloseTimer.current = undefined }, 1000)
      }}
    >
      <div className="etabook-toc">
        <div className="etabook-toc-caption">Contents</div>
        {entries.map((e) => {
          const isOpen = hovered === e.index || active === e.index
          const isActive = active === e.index
          return (
            <div
              key={e.heading.pos}
              className="etabook-toc-h2-wrap"
              data-open={isOpen || undefined}
              data-active={isActive || undefined}
              onMouseEnter={() => scheduleHover(e.index)}
              onMouseLeave={() => scheduleHover(null)}
            >
              <a
                className="etabook-toc-h2"
                data-hovered={hovered === e.index || undefined}
                data-active={isActive || undefined}
                onClick={(ev) => { ev.preventDefault(); goTo(e.heading.pos) }}
                href="#"
              >
                {e.heading.text}
              </a>
              {e.children.length > 0 && (
                <div className="etabook-toc-sub">
                  <div className="etabook-toc-sub-inner">
                    {e.children.map((c) => (
                      <a
                        key={c.pos}
                        className="etabook-toc-h3"
                        data-active={activeChild === c.pos || undefined}
                        onClick={(ev) => { ev.preventDefault(); goTo(c.pos) }}
                        href="#"
                      >
                        {c.text}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </nav>
  )
}

