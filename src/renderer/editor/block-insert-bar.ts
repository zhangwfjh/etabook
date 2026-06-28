// src/renderer/editor/block-insert-bar.ts
//
// Between-block insert bar: a hairline divider with a centered + tag that
// appears in the seam between two adjacent top-level blocks. Clicking it
// inserts an empty paragraph at that seam and immediately drops it into
// raw-source edit mode — the same focus behavior as double-clicking a block.
//
// The bar is a FIXED-position overlay on document.body, positioned via
// getBoundingClientRect — NOT a ProseMirror widget decoration. This keeps it
// completely outside the .prose content DOM, so Tailwind Typography's owl
// selector and margin collapsing can never interact with it. Blocks never
// shift when the bar appears.

import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { getBlockSourceEditStorage } from './block-source-edit'
import { swapBlocks, pasteBlock } from './block-actions'

const key = new PluginKey('blockInsertBar')

// Pixel band above/below each seam that reveals the bar.
const REVEAL_BAND = 14

/**
 * Insert an empty paragraph at `seamPos`, then drop it into raw-source edit
 * mode via BlockSourceEdit's storage hook. The new block is focused exactly
 * like double-clicking it.
 */
function insertBetweenAndEdit(editor: Editor, seamPos: number): void {
  const view = editor.view
  const { tr, schema } = view.state
  const p = schema.nodes.paragraph.create()
  tr.insert(seamPos, p)
  tr.setMeta('skipTrailingNode', true)
  view.dispatch(tr)
  const storage = getBlockSourceEditStorage(editor)
  if (!storage?.startEditAt) return
  // seamPos is a block boundary (depth 0); +1 resolves inside the new
  // paragraph (depth 1) so startEditAt's guard passes.
  const startEditAt = storage.startEditAt
  requestAnimationFrame(() => startEditAt(seamPos + 1))
}

export const BlockInsertBar = Extension.create({
  name: 'blockInsertBar',

  addProseMirrorPlugins() {
    const editor = this.editor
    // The overlay element — created once, appended to document.body.
    let bar: HTMLDivElement | null = null
    // The seam (doc position) the bar is currently positioned at, or null.
    let activeSeam: number | null = null

    // editor.view is populated once the EditorView is constructed, well
    // before any runtime mousemove. Capture it lazily to be safe.
    const getView = (): EditorView => editor.view

    // Remove the overlay when the editor is torn down (HMR, file switch).
    editor.on('destroy', () => {
      bar?.remove()
      bar = null
      activeSeam = null
    })

    function ensureBar(): HTMLDivElement {
      if (bar) return bar
      bar = document.createElement('div')
      bar.className = 'block-insert-bar'
      bar.style.display = 'none'
      bar.setAttribute('aria-hidden', 'true')

      const line = document.createElement('span')
      line.className = 'block-insert-bar-line'

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'block-insert-bar-btn'
      btn.setAttribute('aria-label', 'Insert block')
      btn.textContent = '+'
      btn.tabIndex = -1
      btn.addEventListener('mousedown', (e) => e.preventDefault())
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (activeSeam == null) return
        insertBetweenAndEdit(editor, activeSeam)
      })
      bar.appendChild(line)

      const group = document.createElement('div')
      group.className = 'block-insert-bar-actions'

      const swapBtn = document.createElement('button')
      swapBtn.type = 'button'
      swapBtn.className = 'block-insert-bar-btn'
      swapBtn.setAttribute('aria-label', 'Swap blocks')
      swapBtn.textContent = '⇅'
      swapBtn.tabIndex = -1
      swapBtn.addEventListener('mousedown', (e) => e.preventDefault())
      swapBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (activeSeam == null) return
        swapBlocks(editor, activeSeam)
      })

      const pasteBtn = document.createElement('button')
      pasteBtn.type = 'button'
      pasteBtn.className = 'block-insert-bar-btn'
      pasteBtn.setAttribute('aria-label', 'Paste block')
      pasteBtn.textContent = '⎘'
      pasteBtn.tabIndex = -1
      pasteBtn.addEventListener('mousedown', (e) => e.preventDefault())
      pasteBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (activeSeam == null) return
        void pasteBlock(editor, activeSeam)
      })

      group.appendChild(btn)
      group.appendChild(swapBtn)
      group.appendChild(pasteBtn)
      bar.appendChild(group)
      // Moving back over the editor content re-shows it via mousemove.
      bar.addEventListener('mouseleave', () => hideBar())
      document.body.appendChild(bar)
      return bar
    }

    function showBar(seam: number) {
      const el = ensureBar()
      activeSeam = seam
      positionBar(el, seam)
      el.style.display = ''
    }

    function hideBar() {
      activeSeam = null
      if (bar) bar.style.display = 'none'
    }

    /**
     * Resolve a seam to the vertical midpoint of the gap between the two
     * blocks, using each block DOM element's bounding rect. Cursor-based
     * coordsAtPos returns the last text-line position, which is wrong for
     * blocks whose visual bottom extends past the text (code blocks with
     * padding/border, callouts, tables). DOM rects give the true edges.
     */
    function gapMidY(seam: number): number | null {
      const view = getView()
      const doc = view.state.doc
      if (seam < 1 || seam > doc.content.size) return null
      const aboveNode = doc.resolve(seam).nodeBefore
      if (!aboveNode) return null
      const aboveStart = seam - aboveNode.nodeSize
      const aboveEl = view.nodeDOM(aboveStart) as HTMLElement | null
      const belowEl = view.nodeDOM(seam) as HTMLElement | null
      if (!aboveEl || !belowEl) return null
      const aboveRect = aboveEl.getBoundingClientRect()
      const belowRect = belowEl.getBoundingClientRect()
      return (aboveRect.bottom + belowRect.top) / 2
    }

    function positionBar(el: HTMLElement, seam: number) {
      const midY = gapMidY(seam)
      if (midY == null) return
      const view = getView()
      const editorRect = view.dom.getBoundingClientRect()
      el.style.top = `${midY}px`
      el.style.left = `${editorRect.left}px`
      el.style.width = `${editorRect.width}px`
    }

    function nearestSeam(clientY: number): number | null {
      const doc = getView().state.doc
      let pos = 0
      let best: number | null = null
      let bestDist = Infinity
      for (let i = 0; i < doc.childCount; i++) {
        pos += doc.child(i).nodeSize
        if (i < doc.childCount - 1 && pos >= 1 && pos <= doc.content.size) {
          const midY = gapMidY(pos)
          if (midY == null) continue
          const dy = Math.abs(clientY - midY)
          if (dy < REVEAL_BAND && dy < bestDist) {
            best = pos
            bestDist = dy
          }
        }
      }
      return best
    }

    return [
      new Plugin({
        key,
        props: {
          handleDOMEvents: {
            mousemove(_view, event: MouseEvent) {
              // Only show in edit mode — hide immediately otherwise.
              if (!editor.isEditable) {
                if (activeSeam != null) hideBar()
                return false
              }
              // Ignore when the pointer is over the bar itself.
              if (event.target instanceof Node && bar?.contains(event.target)) {
                return false
              }
              const next = nearestSeam(event.clientY)
              if (next == null) {
                if (activeSeam != null) hideBar()
              } else if (next !== activeSeam) {
                showBar(next)
              } else {
                // Same seam — just refresh position (scroll may have moved it).
                if (bar) positionBar(bar, next)
              }
              return false
            },
            mouseleave(_view, event: MouseEvent) {
              // Don't hide when the pointer is moving onto the bar overlay —
              // the bar owns its own mouseleave. Without this, leaving the
              // editor DOM to click the + would hide it before the click.
              const rt = event.relatedTarget
              if (rt instanceof Node && bar?.contains(rt)) return false
              hideBar()
              return false
            },
            scroll() {
              // Reposition or hide on scroll — the seam's screen Y has moved.
              if (activeSeam != null && bar) {
                positionBar(bar, activeSeam)
              }
              return false
            },
          },
        },
      }),
    ]
  },
})
