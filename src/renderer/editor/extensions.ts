import { StarterKit } from '@tiptap/starter-kit'
import { CharacterCount } from '@tiptap/extension-character-count'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { Heading } from '@tiptap/extension-heading'
import { Link } from '@tiptap/extension-link'
import { CodeBlock as PreservingCodeBlock, Code as PreservingCode } from './code-marks'
import { Image } from './image-extension'
import { Video, Audio } from './media'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { DragHandle } from './vendor/drag-handle'
import { createBlockHandleElement, blockActionsOnNodeChange } from './block-actions'
import { common, createLowlight } from 'lowlight'
import { BlockSourceEdit } from './block-source-edit'
import { AIPlan } from './ai-plan'
import { Callout } from './callout'
import { SlashCommand } from './slash-command'
import { MathInline, MathBlock } from './math'
import { Highlight } from './highlight'
import { Comment } from './comment'
import { EditableAttr } from './editable-attr'
import { CodeBlockNodeView } from './code-block-view'
import { TrailingNode } from './trailing-node'
import { AutoPair } from './auto-pair'
import { LineOps } from './line-ops'
import { Search } from './search'
import { MultiCursor } from './multi-cursor'
import { BlockInsertBar } from './block-insert-bar'
import { BlockRawFocus } from './block-raw-focus'

const lowlight = createLowlight(common)

export function buildExtensions() {
  return [
    StarterKit.configure({
      codeBlock: false,
      // Replace StarterKit's Code mark with ours: we don't preserve the
      // user's backtick count (multi-backtick spans normalize to single),
      // but we DO ensure a span whose content contains a backtick is fenced
      // with enough backticks to stay unambiguous — the stock mark corrupts
      // such spans. See code-marks.ts.
      code: false,
      // Replace StarterKit's Heading so we can allow levels 1-6 (stock caps
      // at 3).
      heading: false,
      // Replace StarterKit's Link to set openOnClick:false (the editor opens
      // links via its own handler, not on click inside the editable surface).
      link: false,
      // Disable StarterKit's TrailingNode — it fires appendTransaction on
      // selection-only transactions (clicks, cursor moves), spuriously
      // inserting a trailing paragraph and marking the file dirty when the
      // doc doesn't end in a paragraph. Our replacement only fires on
      // doc-changing transactions.
      trailingNode: false,
    }),
    EditableAttr,
    CharacterCount,
    AutoPair,
    LineOps,
    Search,
    MultiCursor,
    Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    PreservingCodeBlock.configure({ lowlight }).extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockNodeView)
      },
    }),
    PreservingCode,
    Highlight,
    Comment,
    Link.configure({ openOnClick: false, autolink: true }),
    Image.configure({ allowBase64: true, inline: false }),
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
    Video,
    Audio,
    AIPlan,
    Callout,
    BlockSourceEdit,
    DragHandle.configure({
      render: createBlockHandleElement,
      // Vendored plugin is @ts-nocheck; its inferred onNodeChange type is
      // `() => null`, but it actually invokes the callback with
      // { editor, node, pos }. Cast at this unexpressible library boundary.
      onNodeChange: blockActionsOnNodeChange as unknown as () => null,
    }),
    SlashCommand,
    MathInline,
    MathBlock,
    TrailingNode,
    BlockRawFocus,
    BlockInsertBar,
  ]
}
