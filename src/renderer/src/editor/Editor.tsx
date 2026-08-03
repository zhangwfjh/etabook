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
import { slashCommands } from './extensions/slash'

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
  onChange: (text: string) => void
}

type AugmentedView = EditorView & { _liveCompartment?: Compartment }

export function Editor(props: EditorProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
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
        liveCompartment.of(props.livePreview ? livePreviewPlugin({ docDir: props.docDir, reading: props.reading }) : []),
        slashCommands(),
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

  // External doc change (file open / tab switch) — replace only if it differs.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (view.state.doc.toString() === props.doc) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: props.doc },
      selection: { anchor: 0 }
    })
  }, [props.docId, props.doc])

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
      effects: view._liveCompartment.reconfigure(
        props.livePreview
          ? livePreviewPlugin({ docDir: props.docDir, reading: props.reading })
          : ([] as Extension[])
      )
    })
  }, [props.livePreview, props.docDir, props.reading])

  return (
    <div
      ref={hostRef}
      className={`h-full w-full overflow-hidden ${
        props.reading ? 'editor-reading editor-live' : props.livePreview ? 'editor-live' : 'editor-source'
      }`}
    />
  )
}
