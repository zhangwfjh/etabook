import { Compartment, EditorSelection, type Extension } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSection
} from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'
import { openTableShapePicker } from './table'

/**
 * Slash Menu — the "/" block-insert menu on the Live Preview surface.
 *
 * Built on CodeMirror's autocompletion tooltip rather than a bespoke popup:
 * filtering, keyboard navigation, and cursor-anchored positioning come for
 * free, and BLOCKS below is the single catalog of insertable blocks.
 *
 * Semantics:
 * - Live Preview only — Source Mode users type markdown by hand. Mounted
 *   through `slashCompartment`, reconfigured by Editor.tsx.
 * - Never opens where markup is literal: code, math, comments, frontmatter,
 *   links (Lezer node names in SUPPRESSED).
 * - Empty line → the block template replaces the query in place.
 * - Line with content → text blocks transform the line (prefix moves to the
 *   line start, the existing text becomes the block content); containers
 *   (code, table, math, mermaid, …) insert a fresh block below the line.
 */

/** Runtime toggle: holds the extension only while Live Preview is active. */
export const slashCompartment = new Compartment()

const BASIC: CompletionSection = { name: 'Basic blocks', rank: 0 }
const MEDIA: CompletionSection = { name: 'Media & embeds', rank: 1 }
const ADVANCED: CompletionSection = { name: 'Advanced', rank: 2 }

/** Text block: single-line prefix; transforms the current line. */
type TextBlock = {
  kind: 'text'
  label: string
  detail: string
  /** Icon class suffix — styled by the mask rules in codemirror.css. */
  icon: string
  section: CompletionSection
  keywords?: string
  prefix: string
  placeholder: string
}

/** Container block: multi-line construct; always inserted as a fresh block. */
type ContainerBlock = {
  kind: 'container'
  label: string
  detail: string
  icon: string
  section: CompletionSection
  keywords?: string
  template: string
  /** [anchor, head] offsets into `template`; default: after the block. */
  cursor?: [number, number]
  /** Open the table shape picker instead of inserting a template. */
  picker?: 'table'
  /** Footnote definition — number computed from the doc at apply time. */
  footnote?: boolean
}

type BlockSpec = TextBlock | ContainerBlock

const BLOCKS: BlockSpec[] = [
  // --- Basic blocks -------------------------------------------------------
  { kind: 'text', label: 'Heading 1', detail: 'Section heading', icon: 'slash-h1', section: BASIC, keywords: 'h1 title big', prefix: '# ', placeholder: 'Heading' },
  { kind: 'text', label: 'Heading 2', detail: 'Section heading', icon: 'slash-h2', section: BASIC, keywords: 'h2 title', prefix: '## ', placeholder: 'Heading' },
  { kind: 'text', label: 'Heading 3', detail: 'Section heading', icon: 'slash-h3', section: BASIC, keywords: 'h3 title', prefix: '### ', placeholder: 'Heading' },
  { kind: 'text', label: 'Heading 4', detail: 'Section heading', icon: 'slash-h4', section: BASIC, keywords: 'h4', prefix: '#### ', placeholder: 'Heading' },
  { kind: 'text', label: 'Heading 5', detail: 'Section heading', icon: 'slash-h5', section: BASIC, keywords: 'h5', prefix: '##### ', placeholder: 'Heading' },
  { kind: 'text', label: 'Heading 6', detail: 'Section heading', icon: 'slash-h6', section: BASIC, keywords: 'h6', prefix: '###### ', placeholder: 'Heading' },
  { kind: 'text', label: 'Bulleted list', detail: 'Unordered list', icon: 'slash-list', section: BASIC, keywords: 'bullet unordered ul point', prefix: '- ', placeholder: 'List item' },
  { kind: 'text', label: 'Numbered list', detail: 'Ordered list', icon: 'slash-list-ordered', section: BASIC, keywords: 'ordered ol number', prefix: '1. ', placeholder: 'List item' },
  { kind: 'text', label: 'Task list', detail: 'Checkbox list', icon: 'slash-task', section: BASIC, keywords: 'todo checkbox check', prefix: '- [ ] ', placeholder: 'Task' },
  { kind: 'text', label: 'Quote', detail: 'Blockquote', icon: 'slash-quote', section: BASIC, keywords: 'blockquote cite', prefix: '> ', placeholder: 'Quote' },
  { kind: 'text', label: 'Callout', detail: 'Note box — edit [!type]', icon: 'slash-callout', section: BASIC, keywords: 'admonition note info tip warning danger alert box', prefix: '> [!note] ', placeholder: 'Title' },
  { kind: 'container', label: 'Code block', detail: 'Fenced code', icon: 'slash-code', section: BASIC, keywords: 'code fence snippet program', template: '```js\n\n```\n', cursor: [6, 6] },
  { kind: 'container', label: 'Divider', detail: 'Thematic break', icon: 'slash-hr', section: BASIC, keywords: 'hr horizontal rule line separator', template: '---\n' },
  // --- Media & embeds -----------------------------------------------------
  { kind: 'container', label: 'Image', detail: 'Markdown image', icon: 'slash-image', section: MEDIA, keywords: 'picture photo img', template: '![alt text](https://)\n', cursor: [2, 10] },
  { kind: 'container', label: 'Link', detail: 'Hyperlink', icon: 'slash-link', section: MEDIA, keywords: 'url hyperlink', template: '[text](https://)\n', cursor: [1, 5] },
  { kind: 'container', label: 'Note embed', detail: 'Embed another note', icon: 'slash-embed', section: MEDIA, keywords: 'embed include transclude', template: '![[Note]]\n', cursor: [3, 7] },
  // --- Advanced -----------------------------------------------------------
  { kind: 'container', label: 'Table', detail: 'GFM table — pick a shape', icon: 'slash-table', section: ADVANCED, keywords: 'grid gfm columns rows', template: '| Column A | Column B |\n| --- | --- |\n| cell | cell |\n', picker: 'table' },
  { kind: 'container', label: 'Math block', detail: 'KaTeX display math', icon: 'slash-math', section: ADVANCED, keywords: 'latex katex formula equation', template: '$$\n\\boxed{x}\n$$\n', cursor: [3, 12] },
  { kind: 'container', label: 'Mermaid diagram', detail: 'Flowchart / graph', icon: 'slash-mermaid', section: ADVANCED, keywords: 'diagram flowchart graph chart', template: '```mermaid\ngraph TD;\n  A --> B;\n```\n', cursor: [11, 20] },
  { kind: 'container', label: 'Footnote', detail: 'Footnote definition', icon: 'slash-fn', section: ADVANCED, keywords: 'citation reference fn', template: '', footnote: true }
]

/** Syntax nodes where "/" is literal text — never offer the menu there. */
const SUPPRESSED: Record<string, true> = {
  FencedCode: true,
  CodeBlock: true,
  CommentBlock: true,
  HTMLBlock: true,
  Frontmatter: true,
  BlockMath: true,
  InlineMath: true,
  InlineCode: true,
  Comment: true,
  URL: true,
  AutomaticLink: true
}

/** Resolve the insert text + cursor span for an empty-line insertion. */
function buildTemplate(
  spec: BlockSpec,
  state: { doc: { toString(): string } }
): { text: string; anchor: number; head: number } {
  if (spec.kind === 'text') {
    const text = spec.prefix + spec.placeholder + '\n'
    const from = spec.prefix.length
    return { text, anchor: from, head: from + spec.placeholder.length }
  }
  if (spec.footnote) {
    // Next free number: footnotes already referenced or defined anywhere.
    let max = 0
    for (const m of state.doc.toString().matchAll(/\[\^(\d+)\]/g)) max = Math.max(max, +m[1])
    const prefix = `[^${max + 1}]: `
    const text = prefix + 'Footnote text\n'
    return { text, anchor: prefix.length, head: text.length - 1 }
  }
  const [anchor = spec.template.length, head = anchor] = spec.cursor ?? []
  return { text: spec.template, anchor, head }
}

/**
 * Apply a picked block. `from`/`to` span the filter text after the "/";
 * the slash itself sits at `from - 1`.
 */
function applyBlock(view: EditorView, spec: BlockSpec, from: number, to: number): void {
  const slashFrom = from - 1
  const line = view.state.doc.lineAt(slashFrom)
  // The trigger requires whitespace (or line start) before the "/" — that
  // separator goes away with the query, so "text /h" → "# text", not "# text ".
  const cutFrom =
    slashFrom > line.from && /\s/.test(line.text[slashFrom - 1 - line.from]) ? slashFrom - 1 : slashFrom
  const before = line.text.slice(0, cutFrom - line.from)
  const after = line.text.slice(to - line.from)
  const hasContent = before.trim() !== '' || after.trim() !== ''

  // Table — remove the query, then open the shape picker at the cursor
  // (picker inserts on the empty line / below a content line).
  if (spec.kind === 'container' && spec.picker === 'table') {
    view.dispatch({
      changes: { from: cutFrom, to },
      selection: EditorSelection.cursor(hasContent ? line.to : cutFrom),
      scrollIntoView: true
    })
    openTableShapePicker(view)
    return
  }

  // Empty line — the template replaces the query in place.
  if (!hasContent) {
    const { text, anchor, head } = buildTemplate(spec, view.state)
    view.dispatch({
      changes: { from: slashFrom, to, insert: text },
      selection: EditorSelection.range(slashFrom + anchor, slashFrom + head),
      scrollIntoView: true
    })
    return
  }

  // Text block — transform the line: prefix to line start, text is content.
  if (spec.kind === 'text') {
    const contentEnd = line.from + spec.prefix.length + before.length + after.length
    view.dispatch({
      changes: [
        { from: cutFrom, to },
        { from: line.from, insert: spec.prefix }
      ],
      selection: EditorSelection.range(contentEnd, contentEnd),
      scrollIntoView: true
    })
    return
  }

  // Container — leave the line alone, insert a fresh block below it.
  const { text, anchor, head } = buildTemplate(spec, view.state)
  view.dispatch({
    changes: [
      { from: cutFrom, to },
      { from: line.to, insert: '\n' + text }
    ],
    selection: EditorSelection.range(line.to + 1 + anchor, line.to + 1 + head),
    scrollIntoView: true
  })
}

function slashCompletions(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos)
  const typed = line.text.slice(0, ctx.pos - line.from)
  if (!/(^|\s)\/[\w-]*$/.test(typed)) return null

  let node: SyntaxNode | null = syntaxTree(ctx.state).resolveInner(ctx.pos, -1)
  while (node) {
    if (SUPPRESSED[node.name]) return null
    node = node.parent
  }

  const query = typed.slice(typed.lastIndexOf('/') + 1).toLowerCase()
  const options: Completion[] = []
  for (const spec of BLOCKS) {
    const haystack = `${spec.label} ${spec.detail} ${spec.keywords ?? ''}`.toLowerCase()
    if (query && !haystack.includes(query)) continue
    options.push({
      label: spec.label,
      detail: spec.detail,
      type: spec.icon,
      section: spec.section,
      apply: (view, _completion, from, to) => applyBlock(view, spec, from, to)
    })
  }
  if (options.length === 0) return null

  return {
    from: ctx.pos - query.length,
    to: ctx.pos,
    options,
    // Keyword matching happens above; `filter: false` stops CM from
    // re-matching labels and preserves catalog/section order.
    filter: false
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
