import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import { CALLOUT_TYPES } from './callout-types'

type SlashItem = {
  title: string
  description: string
  icon: string
  command: (props: { editor: any; range: any }) => void
}

type CalloutSlashItem = SlashItem & {
  // When set, selecting this item does not run `command` immediately;
  // instead the menu switches to showing the math sub-list.
  openMathPicker?: boolean
}

function insertCallout(editor: any, range: any, type: string, title = '') {
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent({
      type: 'callout',
      attrs: { type, title },
      content: [{ type: 'paragraph' }],
    })
    .run()
}

const ITEMS: SlashItem[] = [
  {
    title: 'AI Research Plan',
    description: 'Insert an AI planning callout block',
    icon: '✨',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'aiPlan',
        attrs: { id: `plan-${Date.now()}`, model: 'claude-sonnet-4.5' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Describe what you want the AI to plan...' }] }],
      }).run()
    },
  },
  {
    title: 'Callout',
    description: 'Obsidian-style callout (note, info, warning, …)',
    icon: 'ℹ',
    command: ({ editor, range }) => insertCallout(editor, range, 'note'),
  },
  {
    title: 'Math callout',
    description: 'Theorem, lemma, definition, proof, …',
    icon: '★',
    openMathPicker: true,
    command: () => {}, // replaced by picker logic in component
  } as CalloutSlashItem,
  {
    title: 'Heading 1',
    description: 'Large section heading',
    icon: 'H1',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run()
    },
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    icon: 'H2',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run()
    },
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    icon: 'H3',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run()
    },
  },
  {
    title: 'Bullet List',
    description: 'Unordered list',
    icon: '•',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: 'Ordered List',
    description: 'Numbered list',
    icon: '1.',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: 'Task List',
    description: 'Checklist with checkboxes',
    icon: '☑',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run()
    },
  },
  {
    title: 'Code Block',
    description: 'Syntax-highlighted code block',
    icon: '</>',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    title: 'Math Inline',
    description: 'Inline LaTeX formula ($...$)',
    icon: '∑',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'mathInline',
        attrs: { latex: 'E=mc^2' },
      }).run()
    },
  },
  {
    title: 'Math Block',
    description: 'Block LaTeX formula ($$...$$)',
    icon: '∫',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'mathBlock',
        attrs: { latex: '\\int_0^1 x\\,dx' },
      }).run()
    },
  },
  {
    title: 'Mermaid',
    description: 'Mermaid diagram',
    icon: '◢',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'codeBlock',
        attrs: { language: 'mermaid' },
        content: [{ type: 'text', text: 'graph TD\n  A --> B' }],
      }).run()
    },
  },
  {
    title: 'Blockquote',
    description: 'Quoted text block',
    icon: '❝',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: 'Table',
    description: '3x3 table',
    icon: '⊞',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    },
  },
  {
    title: 'Horizontal Rule',
    description: 'Divider line',
    icon: '—',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
]

export interface SlashCommandMenuRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

const MATH_ITEMS = CALLOUT_TYPES
  .filter((t) => t.math)
  .map((t) => ({
    title: t.label,
    description: `Insert a ${t.label.toLowerCase()} callout`,
    icon: t.icon,
    command: ({ editor, range }: { editor: any; range: any }) =>
      insertCallout(editor, range, t.canonical),
  }))

export const SlashCommandMenu = forwardRef<SlashCommandMenuRef, SuggestionProps>(
  (props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [mathPickerOpen, setMathPickerOpen] = useState(false)

    const baseItems = (ITEMS as CalloutSlashItem[]).filter((item) =>
      item.title.toLowerCase().includes(props.query?.toLowerCase() ?? ''),
    )

    const items = mathPickerOpen ? MATH_ITEMS : baseItems

    useEffect(() => {
      setSelectedIndex(0)
    }, [items, mathPickerOpen, props.query])

    function selectItem(index: number) {
      const item = items[index]
      if (!item) return
      if (!mathPickerOpen && (item as CalloutSlashItem).openMathPicker) {
        setMathPickerOpen(true)
        return
      }
      item.command({ editor: props.editor, range: props.range })
    }

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'Escape' && mathPickerOpen) {
          setMathPickerOpen(false)
          return true
        }
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i - 1 + items.length) % items.length)
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length)
          return true
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex)
          return true
        }
        return false
      },
    }))

    if (items.length === 0) return null

    return (
      <div className="slash-command-menu bg-bg-elevated border border-border rounded-lg shadow-lg p-1 min-w-[240px] max-h-[320px] overflow-y-auto">
        {mathPickerOpen ? (
          <div className="px-2 py-1 text-xs text-fg-subtle border-b border-border mb-1">
            Math callout type
          </div>
        ) : null}
        {items.map((item, index) => (
          <button
            key={item.title}
            onClick={() => selectItem(index)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm ${
              index === selectedIndex
                ? 'bg-accent/20 text-fg-primary'
                : 'text-fg-muted hover:bg-bg-subtle'
            }`}
          >
            <span className="w-6 text-center text-xs font-mono">{item.icon}</span>
            <div>
              <div className="text-sm">{item.title}</div>
              <div className="text-xs text-fg-subtle">{item.description}</div>
            </div>
          </button>
        ))}
      </div>
    )
  },
)

SlashCommandMenu.displayName = 'SlashCommandMenu'
