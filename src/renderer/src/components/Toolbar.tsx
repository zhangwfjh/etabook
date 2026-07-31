import { type ReactElement } from 'react'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link as LinkIcon,
  Image as ImageIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code2,
  Table,
  Minus
} from 'lucide-react'
import { type EditorView } from '@codemirror/view'
import { markdownCommands } from '@renderer/editor/extensions/markdownKeymap'
import { Button, Tooltip } from '@renderer/components/ui'

// The toolbar holds a ref to the active EditorView so its buttons dispatch
// formatting commands directly into the editor.
export function getActiveEditorView(): EditorView | null {
  return (window as unknown as { __editorView?: EditorView }).__editorView ?? null
}

type Tool = { id: string; label: string; icon: ReactElement; run: () => void }

function buildTools(): Tool[] {
  const call = (fn: (v: EditorView) => boolean): void => {
    const v = getActiveEditorView()
    if (v) fn(v)
  }
  return [
    { id: 'h1', label: 'Heading 1', icon: <Heading1 size={16} />, run: () => call(markdownCommands.h1) },
    { id: 'h2', label: 'Heading 2', icon: <Heading2 size={16} />, run: () => call(markdownCommands.h2) },
    { id: 'h3', label: 'Heading 3', icon: <Heading3 size={16} />, run: () => call(markdownCommands.h3) },
    { id: 'bold', label: 'Bold (Ctrl+B)', icon: <Bold size={16} />, run: () => call(markdownCommands.bold) },
    { id: 'italic', label: 'Italic (Ctrl+I)', icon: <Italic size={16} />, run: () => call(markdownCommands.italic) },
    { id: 'strike', label: 'Strikethrough', icon: <Strikethrough size={16} />, run: () => call(markdownCommands.strike) },
    { id: 'code', label: 'Inline code', icon: <Code size={16} />, run: () => call(markdownCommands.code) },
    { id: 'link', label: 'Link', icon: <LinkIcon size={16} />, run: () => call(markdownCommands.link) },
    { id: 'image', label: 'Image', icon: <ImageIcon size={16} />, run: () => call(markdownCommands.image) },
    { id: 'bullet', label: 'Bullet list', icon: <List size={16} />, run: () => call(markdownCommands.bullet) },
    { id: 'ordered', label: 'Numbered list', icon: <ListOrdered size={16} />, run: () => call(markdownCommands.ordered) },
    { id: 'task', label: 'Task list', icon: <ListChecks size={16} />, run: () => call(markdownCommands.task) },
    { id: 'quote', label: 'Quote', icon: <Quote size={16} />, run: () => call(markdownCommands.quote) },
    { id: 'codeblock', label: 'Code block', icon: <Code2 size={16} />, run: () => call(markdownCommands.codeBlock) },
    { id: 'table', label: 'Table', icon: <Table size={16} />, run: () => call(markdownCommands.table) },
    { id: 'hr', label: 'Horizontal rule', icon: <Minus size={16} />, run: () => call(markdownCommands.hr) }
  ]
}

export function Toolbar(): ReactElement {
  const tools = buildTools()
  return (
    <div className="flex items-center gap-0.5 px-2 h-10 border-b border-[var(--border)] bg-[var(--surface)] shrink-0 overflow-x-auto">
      {tools.map((t, i) => (
        <div key={t.id} className="flex items-center">
          {i > 0 && (t.id === 'bold' || t.id === 'bullet' || t.id === 'codeblock') && (
            <span className="w-px h-5 bg-[var(--border)] mx-1" />
          )}
          <Tooltip label={t.label}>
            <Button size="icon" variant="ghost" onClick={t.run} aria-label={t.label}>
              {t.icon}
            </Button>
          </Tooltip>
        </div>
      ))}
    </div>
  )
}
