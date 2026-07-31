import { type Extension } from '@codemirror/state'
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'

type BlockSpec = { label: string; insert: string; detail?: string; boost?: number }

const BLOCKS: BlockSpec[] = [
  { label: 'H1', insert: '# Heading\n', detail: 'Heading 1', boost: 10 },
  { label: 'H2', insert: '## Heading\n', detail: 'Heading 2' },
  { label: 'H3', insert: '### Heading\n', detail: 'Heading 3' },
  { label: 'H4', insert: '#### Heading\n', detail: 'Heading 4' },
  { label: 'H5', insert: '##### Heading\n', detail: 'Heading 5' },
  { label: 'H6', insert: '###### Heading\n', detail: 'Heading 6' },
  { label: 'Bulleted list', insert: '- item\n', detail: 'Unordered list' },
  { label: 'Numbered list', insert: '1. item\n', detail: 'Ordered list' },
  { label: 'Task list', insert: '- [ ] task\n', detail: 'Checkbox list' },
  { label: 'Quote', insert: '> quote\n', detail: 'Blockquote' },
  { label: 'Code block', insert: '```js\n\n```\n', detail: 'Fenced code' },
  { label: 'Table', insert: '| Column A | Column B |\n| --- | --- |\n| cell | cell |\n', detail: 'GFM table' },
  { label: 'Image', insert: '![alt text](https://)\n', detail: 'Image' },
  { label: 'Link', insert: '[text](https://)\n', detail: 'Link' },
  { label: 'Horizontal rule', insert: '---\n', detail: 'Thematic break' },
  { label: 'Math block', insert: '$$\n\\boxed{x}\n$$\n', detail: 'KaTeX (Reading mode)' }
]

function slashCompletions(ctx: CompletionContext): CompletionResult | null {
  // Trigger only at line start (or after whitespace) when `/` is typed.
  const line = ctx.state.doc.lineAt(ctx.pos)
  const prefix = line.text.slice(0, ctx.pos - line.from)
  const m = prefix.match(/(^|\s)\/[\w-]*$/)
  if (!m) return null

  const word = ctx.matchBefore(/\/[\w-]*/)
  if (!word) return null

  const from = word.from + 1 // skip the slash itself
  return {
    from,
    to: ctx.pos,
    options: BLOCKS.map((b) => ({
      label: b.label,
      detail: b.detail,
      boost: b.boost,
      apply: (view, _completion, fromPos, toPos) => {
        // Replace from the slash through the current cursor.
        const slashFrom = fromPos - 1
        view.dispatch({
          changes: { from: slashFrom, to: toPos, insert: b.insert },
          selection: { anchor: slashFrom + b.insert.length },
          scrollIntoView: true
        })
      }
    })),
    validFor: /^[\w-]*$/
  }
}

export function slashCommands(): Extension {
  return autocompletion({
    override: [slashCompletions],
    defaultKeymap: true,
    closeOnBlur: true,
    activateOnTyping: true
  })
}
