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
  /** Reading-mode navigation: open a resolved note path. */
  onOpenNote?: (path: string) => void
  /** Absolute path of this document (embed cycle guard). */
  docPath?: string
  onChange: (text: string) => void
}

type AugmentedView = EditorView & { _liveCompartment?: Compartment }

/** Pin the scroller's total height in reading mode: CM re-estimates unmounted
 *  regions as the user scrolls (async widget estimates are approximate), which
 *  makes the scrollbar thumb resize ("jiggle"). A spacer below the content,
 *  kept in step by a ResizeObserver, absorbs the oscillation so the scrollbar
 *  stays put. Padding is capped — pathological estimate drift still settles. */
const PIN_MAX_PAD = 160
const pinnedViews = new WeakMap<EditorView, { spacer: HTMLElement; ro: ResizeObserver; pinned: number }>()

/** Per-tab editor state: undo history, selection, and scroll survive tab
 *  switches; closing a tab drops its entry. Keyed by store Doc.id. */
type StashedTab = { state: EditorState; scrollTop: number }
const stashedTabs = new Map<string, StashedTab>()
/** Doc ids closed while their state could still be stashed by the switch
 *  effect (close re-activates a neighbor, which triggers the stash path). */
const closedTabs = new Set<string>()

/** Forget a tab's stashed editor state (undo history). Call on tab close. */
export function dropEditorState(docId: string): void {
  stashedTabs.delete(docId)
  closedTabs.add(docId)
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
  propsRef.current = props

  useLayoutEffect(() => {
    if (!hostRef.current) return
    const onChangeExt = EditorView.updateListener.of((update) => {
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

    const liveCompartment = new Compartment()

    const state = EditorState.create({
      doc: props.doc,
      extensions: [
        ...coreExtensions({
          lineWrap: props.lineWrap,
          showLineNumbers: props.showLineNumbers,
          readonly: props.readonly
        }),
        themeCompartment.of(editorTheme(props.dark)),
        liveCompartment.of(
          props.livePreview
            ? livePreviewPlugin({
                docDir: props.docDir,
                dark: props.dark,
                reading: props.reading,
                workspace: props.workspace,
                docPath: props.docPath,
                onOpenNote: props.onOpenNote
              })
            : []
        ),
        slashCompartment.of(props.livePreview && !props.reading ? slashCommands() : []),
        onChangeExt
      ]
    })

    const view = new EditorView({ state, parent: hostRef.current }) as AugmentedView
    view._liveCompartment = liveCompartment
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
  // across documents. Falls through to an in-place text replacement when
  // there is no stash (tab first shown) or the stash is stale (content was
  // changed externally for the same doc id).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const prevId = prevDocIdRef.current
    if (prevId !== props.docId) {
      prevDocIdRef.current = props.docId
      if (!closedTabs.delete(prevId)) {
        stashedTabs.set(prevId, { state: view.state, scrollTop: view.scrollDOM.scrollTop })
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
          if (viewRef.current === view) view.scrollDOM.scrollTop = stashed.scrollTop
        })
        return
      }
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
  // the rest at default line height; block widgets (images, tables, embeds,
  // footnotes) differ, so the doc height — and with it the scrollbar thumb —
  // jumps the first time the user scrolls them into view. A single fast
  // top-to-bottom sweep mounts and measures every widget; CM then caches the
  // real heights and scrolling is stable.
  useEffect(() => {
    const view = viewRef.current
    if (!view || !props.reading) return
    let cancelled = false
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const later = (fn: () => void, ms: number): void => {
      const t = setTimeout(() => { timers.delete(t); if (!cancelled) fn() }, ms)
      timers.add(t)
    }
    const waitImages = (then: () => void, tries: number): void => {
      if (cancelled) return
      const imgs = Array.from(view.dom.querySelectorAll('img')).filter((i) => !i.complete)
      if (imgs.length === 0 || tries <= 0) { then(); return }
      later(() => waitImages(then, tries - 1), 100)
    }
    const timer = setTimeout(() => {
      const scroller = view.dom.querySelector<HTMLElement>('.cm-scroller')
      if (!scroller) return
      const restore = scroller.scrollTop
      const step = Math.max(200, scroller.clientHeight - 40)
      if (scroller.scrollHeight <= scroller.clientHeight * 2) return // nothing virtualized away
      // Engage the height pin BEFORE the sweep: its ratchet then learns the
      // true maximum while every region scrolls through, and the pad absorbs
      // the estimate oscillation afterwards.
      pinDocHeight(view, scroller)
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
      clearTimeout(timer)
      for (const t of timers) clearTimeout(t)
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
