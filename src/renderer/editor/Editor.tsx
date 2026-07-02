import {
  useEditor,
  EditorContent,
  type Editor as TiptapEditor,
} from '@tiptap/react'
import { useEffect, useRef } from 'react'
import type { JSONContent } from '@tiptap/core'
import { buildExtensions } from './extensions'
import { forceRestoreRawBlocks } from './block-raw-focus'

// Extensions are pure configuration — created once at module scope, not per
// render. This prevents useEditor from detecting "options changed" and
// destroying/re-creating the editor on every state update.
const extensions = buildExtensions()

type Props = {
  initialContent: JSONContent | null
  editable?: boolean
  onReady?: (editor: TiptapEditor) => void
  className?: string
}

export function Editor({
  initialContent,
  editable = true,
  onReady,
  className,
}: Props) {
  const editor = useEditor({
    extensions,
    content: initialContent ?? undefined,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none etabook-editor',
      },
    },
    onCreate: ({ editor }) => onReady?.(editor),
  })
  const prevEditable = useRef(editable)
  useEffect(() => {
    if (!editor) return
    if (editable !== editor.isEditable) editor.setEditable(editable)
    if (prevEditable.current !== editable) {
      prevEditable.current = editable
      // When switching to view mode, explicitly restore any raw-swapped
      // block. The plugin's update() handler should do this, but the
      // setEditable → updateState path uses the same state object, which
      // some ProseMirror versions treat as a no-op, skipping plugin view
      // updates. This direct call is the reliable path.
      if (!editable) forceRestoreRawBlocks(editor)
    }
  }, [editor, editable])
  useEffect(() => () => editor?.destroy(), [editor])

  // During initial mount and HMR re-mount, useEditor returns null for a
  // render before the new editor is ready. Render a placeholder so layout
  // doesn't collapse to a black screen during that window.
  if (!editor) {
    return <div className="etabook-editor opacity-0" aria-hidden />
  }

  return <EditorContent editor={editor} className={className} />
}
