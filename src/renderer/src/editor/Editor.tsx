import { useEffect, useLayoutEffect, useRef } from 'react'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import {
  coreExtensions,
  wrapCompartment,
  lineNumberCompartment,
  readonlyCompartment
} from './extensions/core'
import { editorTheme, themeCompartment } from './extensions/theme'
import { livePreviewPlugin, setLivePreviewTheme } from './extensions/livePreview'
import { slashCommands, slashCompartment } from './extensions/slash'

export type EditorProps = {
  doc: string
  onCursorChange?: (pos: number) => void
  onView?: (view: EditorView | null) => void
  docId: string
  dark: boolean
  lineWrap: boolean
  showLineNumbers: boolean
  readonly: boolean
  livePreview: boolean
  /** Reading mode: fully rendered, read-only, no source visible anywhere. */
  reading: boolean
  docDir?: string
  /** Absolute workspace root — enables embed/wikilink Resolution. */
  workspace?: string
  /** Reading-mode navigation: open a resolved note path (+ optional
   * subpath to scroll to). */
  onOpenNote?: (path: string, subpath?: string) => void
  /** Absolute path of this document (embed cycle guard). */
  docPath?: string
  onChange: (text: string) => void
}

type AugmentedView = EditorView & { _liveCompartment?: Compartment }

/** Toggle for CM's print-path full-document measure window (`printing`
 * widens the measured viewport to the entire document without scrolling).
 * `viewState` is private in CM's typings; validated at runtime so a CM
 * update that reshapes it returns null → caller falls back to the sweep. */
type PrintingState = { printing: boolean }
function printingStateOf(view: EditorView): PrintingState | null {
  const internals: unknown = view
  if (typeof internals !== 'object' || internals === null || !('viewState' in internals)) return null
  const vs: unknown = internals.viewState
  if (typeof vs !== 'object' || vs === null) return null
  const flag: unknown = 'printing' in vs ? vs.printing : undefined
  if (typeof flag !== 'boolean') return null
  return vs as PrintingState // shape validated above
}

/** Pin the scroller's total height in reading mode: CM re-estimates unmounted
 *  regions as the user scrolls (async widget estimates are approximate), which
 *  makes the scrollbar thumb resize ("jiggle"). A spacer below the content,
 *  kept in step by a ResizeObserver, absorbs the oscillation so the scrollbar
 *  stays put. Padding is capped — pathological estimate drift still settles. */
const PIN_MAX_PAD = 160
const pinnedViews = new WeakMap<EditorView, { spacer: HTMLElement; ro: ResizeObserver; pinned: number }>()

/** Per-tab editor state: undo history, selection, and scroll survive tab
 *  switches; closing a tab drops its entry. Keyed by store Doc.id. */
type StashedTab = { state: EditorState; scrollTop: number; anchorLine?: number; anchorOffsetPx?: number }

/** The doc line at the viewport top (+ px offset into it). Scroll positions
 * in px are meaningless across estimate↔real height transitions — setState
 * rebuilds the heightmap from estimates, the measure window re-measures —
 * so visible-position bookkeeping anchors to CONTENT instead. */
function viewportAnchor(view: EditorView): { line: number; offsetPx: number } | null {
  const rect = view.scrollDOM.getBoundingClientRect()
  const pos = view.posAtCoords({ x: rect.left + 24, y: rect.top + 1 })
  if (pos == null) return null
  const ln = view.state.doc.lineAt(pos)
  return { line: ln.number, offsetPx: view.scrollDOM.scrollTop - view.lineBlockAt(ln.from).top }
}
const stashedTabs = new Map<string, StashedTab>()

/** The anchor the reading-mode measure window should pin while heights
 * settle — set by the tab-switch restore (the INTENDED position), consumed
 * by the measure effect on the same commit. Null when no anchor restore
 * ran (first show, non-reading modes). */
let pendingWindowAnchor: { line: number; offsetPx: number } | null = null

/** Tell the editor an app-level scroll (e.g. wikilink heading jump) owns
 * the position: the reading-mode measure window must not re-pin it. */
export function markExternalScroll(): void {
  pendingWindowAnchor = null
}

/** Doc ids closed while their state could still be stashed by the switch
 *  effect (close re-activates a neighbor, which triggers the stash path). */
const closedTabs = new Set<string>()

/** Forget a tab's stashed editor state (undo history). Call on tab close. */
export function dropEditorState(docId: string): void {
  stashedTabs.delete(docId)
  closedTabs.add(docId)
}

/** Drop stashed editor state for every doc id not in the live set. Covers
 * tab close (redundant with dropEditorState, harmless) and preview-tab
 * replacement, which removes a doc id without a tab-close event. */
export function pruneEditorStates(liveIds: Set<string>): void {
  for (const id of stashedTabs.keys()) {
    if (!liveIds.has(id)) stashedTabs.delete(id)
  }
}

function pinDocHeight(view: EditorView, scroller: HTMLElement): void {
  unpinDocHeight(view)
  const content = scroller.querySelector<HTMLElement>('.cm-content')
  if (!content) return
  const spacer = document.createElement('div')
  spacer.style.height = '0px'
  spacer.setAttribute('aria-hidden', 'true')
  scroller.appendChild(spacer)
  const state = { spacer, ro: null as unknown as ResizeObserver, pinned: scroller.scrollHeight }
  const adjust = (): void => {
    const contentH = content.getBoundingClientRect().height
    // Ratchet: the pin only grows. CM's estimate oscillates both ways as
    // regions mount/unmount; the max is the real measured height.
    if (contentH > state.pinned) state.pinned = contentH
    const pad = Math.max(0, Math.min(PIN_MAX_PAD, state.pinned - contentH))
    spacer.style.height = `${pad}px`
  }
  state.ro = new ResizeObserver(adjust)
  state.ro.observe(content)
  adjust()
  pinnedViews.set(view, state)
}

function unpinDocHeight(view: EditorView): void {
  const state = pinnedViews.get(view)
  if (!state) return
  state.ro.disconnect()
  state.spacer.remove()
  pinnedViews.delete(view)
}

export function Editor(props: EditorProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const prevDocIdRef = useRef(props.docId)
  // Latest props for event handlers without recreating the view.
  const propsRef = useRef(props)

  // Stable across renders: the live-preview compartment (identity matters —
  // the view carries it) and the update listener (reads latest props via
  // propsRef, so it never needs recreating).
  const liveCompartmentRef = useRef<Compartment | null>(null)
  if (!liveCompartmentRef.current) liveCompartmentRef.current = new Compartment()
  const updateListenerRef = useRef<Extension | null>(null)
  if (!updateListenerRef.current) {
    updateListenerRef.current = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        propsRef.current.onChange(update.state.doc.toString())
      }
      if (update.selectionSet && propsRef.current.onCursorChange) {
        propsRef.current.onCursorChange(update.state.selection.main.head)
      }
      // Split panes: route the view bridge to whichever pane owns focus.
      if (update.focusChanged && update.view.hasFocus) {
        propsRef.current.onView?.(update.view)
      }
    })
  }

  /** A fresh EditorState for the given text, built with the CURRENT props
   * (theme, wrap, live-preview config). Used at mount and whenever a doc id
   * is shown for the first time — a fresh state is the only way to start
   * with empty undo history. */
  const makeState = (docText: string): EditorState => {
    const p = propsRef.current
    return EditorState.create({
      doc: docText,
      extensions: [
        ...coreExtensions({
          lineWrap: p.lineWrap,
          showLineNumbers: p.showLineNumbers,
          readonly: p.readonly
        }),
        themeCompartment.of(editorTheme(p.dark)),
        liveCompartmentRef.current!.of(
          p.livePreview
            ? livePreviewPlugin({
                docDir: p.docDir,
                dark: p.dark,
                reading: p.reading,
                workspace: p.workspace,
                docPath: p.docPath,
                onOpenNote: p.onOpenNote
              })
            : []
        ),
        slashCompartment.of(p.livePreview && !p.readonly ? slashCommands() : []),
        updateListenerRef.current!
      ]
    })
  }
  propsRef.current = props
  useLayoutEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({ state: makeState(props.doc), parent: hostRef.current }) as AugmentedView
    view._liveCompartment = liveCompartmentRef.current!
    viewRef.current = view
    propsRef.current.onView?.(view)

    return () => {
      view.destroy()
      viewRef.current = null
      propsRef.current.onView?.(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tab switch: stash the outgoing tab's full editor state (undo history,
  // selection, scroll) and restore the incoming tab's, so undo never bleeds
  // across documents. A doc id with no stash gets a fresh state (empty
  // history); an external content change for the SAME id is applied as an
  // in-place text replacement.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const prevId = prevDocIdRef.current
    if (prevId !== props.docId) {
      prevDocIdRef.current = props.docId
      if (!closedTabs.delete(prevId)) {
        const anchor = viewportAnchor(view)
        stashedTabs.set(prevId, {
          state: view.state,
          scrollTop: view.scrollDOM.scrollTop,
          anchorLine: anchor?.line,
          anchorOffsetPx: anchor?.offsetPx
        })
      }
      const stashed = stashedTabs.get(props.docId)
      if (stashed && stashed.state.doc.toString() === props.doc) {
        const p = propsRef.current
        const live = (view as AugmentedView)._liveCompartment
        // Re-apply the live configuration compartments to the restored
        // state: it can hold values stashed before a theme/wrap/mode change,
        // and a live-preview plugin bound to the previous tab's doc
        // path/dir. Effects-only update — undo history is untouched.
        const restored = stashed.state.update({
          effects: [
            themeCompartment.reconfigure(editorTheme(p.dark)),
            wrapCompartment.reconfigure(p.lineWrap ? EditorView.lineWrapping : []),
            lineNumberCompartment.reconfigure(p.showLineNumbers ? lineNumbers() : []),
            readonlyCompartment.reconfigure(EditorState.readOnly.of(p.readonly)),
            ...(live
              ? [
                  live.reconfigure(
                    p.livePreview
                      ? livePreviewPlugin({
                          docDir: p.docDir,
                          dark: p.dark,
                          reading: p.reading,
                          workspace: p.workspace,
                          docPath: p.docPath,
                          onOpenNote: p.onOpenNote
                        })
                      : ([] as Extension[])
                  )
                ]
              : []),
            slashCompartment.reconfigure(p.livePreview && !p.reading ? slashCommands() : []),
          ]
        })
        view.setState(restored.state)
        p.onCursorChange?.(restored.state.selection.main.head)
        view.requestMeasure()
        requestAnimationFrame(() => {
          if (viewRef.current !== view) return
          // Land on the stashed CONTENT anchor. The fresh heightmap holds
          // estimates, so a heightmap-derived pixel lands a few lines off;
          // a second frame refines against the real mounted line (on-screen
          // by then), and the reading-mode measure window below keeps
          // pinning the intended anchor as heights turn real.
          if (stashed.anchorLine !== undefined && stashed.anchorLine <= view.state.doc.lines) {
            const line = view.state.doc.line(stashed.anchorLine)
            const offsetPx = stashed.anchorOffsetPx ?? 0
            view.scrollDOM.scrollTop = view.lineBlockAt(line.from).top + offsetPx
            pendingWindowAnchor = { line: line.number, offsetPx }
            // A user scroll between now and the measure window owns the
            // position — clear the intent so the window pins theirs.
            view.scrollDOM.addEventListener(
              'wheel',
              () => { pendingWindowAnchor = null },
              { once: true, passive: true }
            )
            view.scrollDOM.addEventListener(
              'touchstart',
              () => { pendingWindowAnchor = null },
              { once: true, passive: true }
            )
            requestAnimationFrame(() => {
              if (viewRef.current !== view) return
              const visible = view.visibleRanges.some((r) => line.from >= r.from && line.from <= r.to)
              if (!visible) return
              const domAt = view.domAtPos(line.from)
              const host = domAt.node.nodeType === 1 ? (domAt.node as HTMLElement) : domAt.node.parentElement
              const lineEl = host?.closest('.cm-line')
              if (lineEl instanceof HTMLElement) {
                const scRect = view.scrollDOM.getBoundingClientRect()
                const realTop =
                  lineEl.getBoundingClientRect().top - scRect.top + view.scrollDOM.scrollTop
                view.scrollDOM.scrollTop = realTop + offsetPx
              }
            })
          } else {
            pendingWindowAnchor = null
            view.scrollDOM.scrollTop = stashed.scrollTop
          }
        })
        return
      }
      // No usable stash: this doc id is shown for the first time (or its
      // stash went stale — e.g. a preview tab replaced in place). Install a
      // FRESH state: a text-replace transaction would inherit the previous
      // document's undo history, and Ctrl+Z would resurrect its content
      // into this tab.
      view.setState(makeState(props.doc))
      propsRef.current.onCursorChange?.(0)
      view.requestMeasure()
      pendingWindowAnchor = null
      // A fresh open starts at the TOP: setState does not reset the
      // scroller's scroll position, so zero it before the next paint
      // (rAF runs pre-paint — no intermediate frame at the old pixel).
      requestAnimationFrame(() => {
        if (viewRef.current === view) view.scrollDOM.scrollTop = 0
      })
      return
    }
    // External doc change for the same doc id — replace only if it differs.
    if (view.state.doc.toString() === props.doc) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: props.doc },
      selection: { anchor: 0 }
    })
  }, [props.docId, props.doc])

  // Reading mode: pre-measure the whole document once after doc/mode changes.
  // CodeMirror only measures lines/widgets inside the viewport and estimates
  // the rest (block widgets — images, tables, embeds, footnotes — estimate
  // badly), so the doc height, and with it the scrollbar thumb, would jump
  // the first time the user scrolls an unmeasured region into view.
  //
  // Measurement happens WITHOUT scrolling: CM's print path widens the
  // measured viewport to the entire document (`viewState.printing`), so
  // every line/widget mounts and measures in place while the scroll
  // position — what the user sees — never moves. (The previous approach
  // swept scrollTop top-to-bottom and back, which visibly raced the
  // scrollbar on every tab switch.) `viewState` is CM-internal: if it ever
  // disappears, fall back to the scroll sweep rather than lose measurement.
  useEffect(() => {
    const view = viewRef.current
    if (!view || !props.reading) return
    let cancelled = false
    const timers = new Set<number>()
    const later = (fn: () => void, ms: number): void => {
      const t = window.setTimeout(() => { timers.delete(t); if (!cancelled) fn() }, ms)
      timers.add(t)
    }
    const waitImages = (then: () => void, tries: number): void => {
      if (cancelled) return
      const imgs = Array.from(view.dom.querySelectorAll('img')).filter((i) => !i.complete)
      if (imgs.length === 0 || tries <= 0) { then(); return }
      later(() => waitImages(then, tries - 1), 100)
    }
    const timer = window.setTimeout(() => {
      const scroller = view.dom.querySelector<HTMLElement>('.cm-scroller')
      if (!scroller) return
      if (scroller.scrollHeight <= scroller.clientHeight * 2) return // nothing virtualized away
      // One-shot full mount — skip pathological docs (DOM cost).
      if (view.state.doc.lines > 3000) return
      // Engage the height pin around the window: async content (embeds via
      // IPC, images) grows the document in steps; the pin's ratchet absorbs
      // the oscillation so the scrollbar doesn't jiggle.
      pinDocHeight(view, scroller)
      const vs = printingStateOf(view)
      if (vs) {
        // Pin the viewport-top line while heights settle: mounting the full
        // document grows content ABOVE the viewport (estimate → real), which
        // would otherwise slide the view down. Re-pinning each frame holds
        // the anchor line at the viewport top through the whole window.
        // Anchor: the INTENDED restore position when set (the landing is
        // estimate-based until this window measures; pinning the intended
        // line converges it to exact). Cleared on user wheel/touch or an
        // app-level scroll (markExternalScroll) — those own the position.
        const anchor = pendingWindowAnchor ?? viewportAnchor(view)
        pendingWindowAnchor = null
        let pinRaf = 0
        let pinning = true
        const stopPin = (): void => {
          pinning = false
          cancelAnimationFrame(pinRaf)
        }
        // User input wins: stop pinning if the user scrolls mid-window.
        scroller.addEventListener('wheel', stopPin, { once: true, passive: true })
        scroller.addEventListener('touchstart', stopPin, { once: true, passive: true })
        const pin = (): void => {
          if (!pinning || cancelled) return
          if (anchor && anchor.line <= view.state.doc.lines) {
            const blk = view.lineBlockAt(view.state.doc.line(anchor.line).from)
            view.scrollDOM.scrollTop = blk.top + anchor.offsetPx
          }
          pinRaf = requestAnimationFrame(pin)
        }
        pin()
        vs.printing = true
        view.requestMeasure()
        const release = (): void => {
          // Dwell so async content settles and CM records the real heights
          // before the extra regions unmount; one extra beat of pinning
          // covers the unmount re-measure, then hands control back.
          waitImages(() => {
            view.requestMeasure()
            later(() => {
              vs.printing = false
              view.requestMeasure()
              later(stopPin, 100)
            }, 200)
          }, 5)
        }
        release()
        return
      }
      // Fallback: the old top-to-bottom scroll sweep (visible scrollbar
      // race, but keeps heights measured if CM internals change shape).
      const restore = scroller.scrollTop
      const step = Math.max(200, scroller.clientHeight - 40)
      let y = 0
      let guard = 0
      const sweep = (): void => {
        // Recompute the end each step: async content grows the document
        // mid-sweep; a stale stop would leave doc-end widgets unmeasured.
        const maxScroll = scroller.scrollHeight - scroller.clientHeight
        y += step
        scroller.scrollTop = Math.min(y, maxScroll)
        waitImages(() => {
          if (y < maxScroll && guard++ < 200) {
            later(sweep, 30)
          } else {
            // Dwell at the bottom so CodeMirror mounts and measures the
            // doc-end widgets (footnotes section) before we restore.
            view.requestMeasure()
            later(() => {
              scroller.scrollTop = restore
              view.requestMeasure()
            }, 200)
          }
        }, 5)
      }
      sweep()
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      for (const t of timers) window.clearTimeout(t)
      // If a doc/mode change interrupts the measure window, snap the
      // printing flag back off (plain object — safe on a destroyed view).
      const vs = printingStateOf(view)
      if (vs) vs.printing = false
      unpinDocHeight(view)
    }
  }, [props.reading, props.docId, props.doc])

  // Reconfigure theme on dark toggle + sync the live-preview render theme.
  useEffect(() => {
    setLivePreviewTheme(props.dark ? 'dark' : 'light')
    viewRef.current?.dispatch({
      effects: themeCompartment.reconfigure(editorTheme(props.dark))
    })
  }, [props.dark])

  // Reconfigure wrap.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.reconfigure(props.lineWrap ? EditorView.lineWrapping : [])
    })
  }, [props.lineWrap])

  // Reconfigure line numbers.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: lineNumberCompartment.reconfigure(props.showLineNumbers ? lineNumbers() : [])
    })
  }, [props.showLineNumbers])

  // Reconfigure read-only.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readonlyCompartment.reconfigure(EditorState.readOnly.of(props.readonly))
    })
  }, [props.readonly])

  // Reconfigure live preview / docDir / reading.
  useEffect(() => {
    const view = viewRef.current as AugmentedView | null
    if (!view?._liveCompartment) return
    view.dispatch({
      effects: [
        view._liveCompartment.reconfigure(
          props.livePreview
            ? livePreviewPlugin({
                docDir: props.docDir,
                dark: props.dark,
                reading: props.reading,
                workspace: props.workspace,
                docPath: props.docPath,
                onOpenNote: props.onOpenNote
              })
            : ([] as Extension[])
        ),
        // The slash menu exists only on the Live Preview surface.
        slashCompartment.reconfigure(
          props.livePreview && !props.reading ? slashCommands() : []
        )
      ]
    })
  }, [props.livePreview, props.docDir, props.reading, props.dark, props.workspace, props.docPath, props.onOpenNote])

  return (
    <div
      ref={hostRef}
      className={`h-full w-full overflow-hidden ${
        props.reading ? 'editor-reading editor-live' : props.livePreview ? 'editor-live' : 'editor-source'
      }`}
    />
  )
}
