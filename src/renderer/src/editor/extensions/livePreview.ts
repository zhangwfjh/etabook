import {
  type DecorationSet,
  Decoration,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  EditorView,
} from '@codemirror/view'
import { Prec, StateField, Facet, type Extension, type EditorState, type Range } from '@codemirror/state'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import { renderMath, extractTex } from '../../markdown/katex'
import { resolveEmoji } from '../../markdown/emoji'
import { renderMermaid } from '../../markdown/mermaid'
import { calloutMeta } from '../../markdown/callout'

/**
 * When true, the decoration engine treats ALL lines as inactive — markup is
 * always hidden and widgets always shown. This is "reading mode": the same
 * live-preview surface, fully rendered, with no source ever revealed.
 * Driven by a Facet so both the ViewPlugin and the StateField consult it.
 */
export const readingModeFacet = Facet.define<boolean, boolean>({
  combine: (values) => values.some((v) => v)
})
/** Context threaded into both decoration builders. */
interface LpCtx {
  docDir?: string
  dark: boolean
}


/**
 * Live Preview — inline decoration engine.
 *
 * Line heights depend ONLY on CSS class, not on whether syntax tokens are
 * visible. A heading line styled .lp-h1-line is the same height whether
 * the `# ` prefix is currently hidden or revealed. This eliminates the
 * layout-shift ("vibrating") problem that block-widget-replacement causes.
 *
 * Three layers:
 *   1. Line classes (unconditional): font-size/weight/family per block type.
 *   2. Inline marks (unconditional): bold/italic/code-chip on content.
 *   3. Hide decorations (inactive lines only): `Decoration.replace({})` on
 *      markup tokens (`#`, `**`, `` ` ``, `>`) so they vanish from flow
 *      without changing the line's measured height.
 */

// ---- Line class mapping ----------------------------------------------------

const LINE_CLASS_BY_BLOCK: Record<string, string> = {
  ATXHeading1: 'lp-h1-line',
  ATXHeading2: 'lp-h2-line',
  ATXHeading3: 'lp-h3-line',
  ATXHeading4: 'lp-h4-line',
  ATXHeading5: 'lp-h5-line',
  ATXHeading6: 'lp-h6-line',
  SetextHeading1: 'lp-h1-line',
  SetextHeading2: 'lp-h2-line',
  Blockquote: 'lp-quote-line',
  FencedCode: 'lp-code-line',
  CodeBlock: 'lp-code-line',
  Frontmatter: 'lp-frontmatter-line',
  FootnoteDef: 'lp-fndef-line'
}

// Syntax tokens to HIDE on inactive (non-cursor) lines.
const HIDEABLE_SYNTAX = new Set([
  'HeaderMark',
  'EmphasisMark',
  'CodeMark',
  'CodeInfo',
  'LinkMark',
  'LinkTitle',
  'StrikethroughMark',
  'QuoteMark',
  'SubscriptMark',
  'SuperscriptMark'
])

// Inline content marks applied UNCONDITIONALLY (always styled).
const INLINE_MARK_CLASS: Record<string, string> = {
  StrongEmphasis: 'lp-strong',
  Emphasis: 'lp-em',
  InlineCode: 'lp-inline-code',
  Strikethrough: 'lp-strike',
  Link: 'lp-link',
  URL: 'lp-url',
  Highlight: 'lp-highlight',
  Tag: 'lp-tag',
  WikiLink: 'lp-wikilink',
  Embed: 'lp-embed',
  FootnoteRef: 'lp-footnote-ref'
}

// ---- Widgets ---------------------------------------------------------------

class BulletWidget extends WidgetType {
  override eq(): boolean {
    return true
  }
  override toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'lp-list-marker lp-bullet'
    span.textContent = '•'
    return span
  }
  override ignoreEvent(): boolean {
    return false
  }
}
const BULLET_WIDGET = new BulletWidget()

class TaskCheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) {
    super()
  }
  override eq(o: TaskCheckboxWidget): boolean {
    return o.checked === this.checked && o.pos === this.pos
  }
  override toDOM(view: EditorView): HTMLElement {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = this.checked
    input.className = 'lp-list-marker lp-task'
    input.setAttribute('contenteditable', 'false')
    input.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    input.addEventListener('click', () => {
      const pos = view.posAtDOM(input)
      const current = view.state.doc.sliceString(pos, pos + 3)
      const next = /\[x\]/i.test(current) ? '[ ]' : '[x]'
      view.dispatch({ changes: { from: pos, to: pos + 3, insert: next } })
    })
    return input
  }
  override ignoreEvent(event: Event): boolean {
    return event.type === 'mousedown' || event.type === 'click'
  }
}

class HrWidget extends WidgetType {
  override toDOM(): HTMLElement {
    const hr = document.createElement('hr')
    hr.className = 'lp-hr'
    return hr
  }
}

class InlineMathWidget extends WidgetType {
  constructor(readonly tex: string) { super() }
  override eq(o: InlineMathWidget): boolean { return o.tex === this.tex }
  override toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'lp-math-inline math-inline'
    span.innerHTML = renderMath(this.tex, false)
    return span
  }
  override ignoreEvent(): boolean { return false }
}

class BlockMathWidget extends WidgetType {
  constructor(readonly tex: string) { super() }
  override eq(o: BlockMathWidget): boolean { return o.tex === this.tex }
  override toDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'lp-math-block math-display'
    div.innerHTML = renderMath(this.tex, true)
    return div
  }
  override ignoreEvent(): boolean { return false }
}

class EmojiWidget extends WidgetType {
  constructor(readonly glyph: string) { super() }
  override eq(o: EmojiWidget): boolean { return o.glyph === this.glyph }
  override toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'lp-emoji'
    span.textContent = this.glyph
    return span
  }
  override ignoreEvent(): boolean { return false }
}

// Inline raw HTML (e.g. <b>, <span>) — rendered verbatim on inactive lines.
class InlineHtmlWidget extends WidgetType {
  constructor(readonly html: string) { super() }
  override eq(o: InlineHtmlWidget): boolean { return o.html === this.html }
  override toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'lp-html-inline'
    span.innerHTML = this.html
    return span
  }
  override ignoreEvent(): boolean { return false }
}

// Hard line break — renders a <br> on inactive lines.
class HardBreakWidget extends WidgetType {
  override eq(): boolean { return true }
  override toDOM(): HTMLElement {
    const br = document.createElement('br')
    return br
  }
  override ignoreEvent(): boolean { return true }
}
const HARD_BREAK = new HardBreakWidget()

// Raw HTML block — renders the user's HTML verbatim (reading mode / inactive
// lines). Scripts inserted via innerHTML never execute (HTML spec), so this is
// safe for the user's own local content.
class RawHtmlBlockWidget extends WidgetType {
  constructor(readonly html: string) { super() }
  override eq(o: RawHtmlBlockWidget): boolean { return o.html === this.html }
  override toDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'lp-html-block'
    div.innerHTML = this.html
    return div
  }
  override ignoreEvent(): boolean { return false }
}

// Empty block widget used to hide HTML comment blocks (DOM strips comments,
// so we render nothing).
class BlankBlockWidget extends WidgetType {
  override eq(): boolean { return true }
  override toDOM(): HTMLElement {
    const div = document.createElement('div')
    div.style.display = 'none'
    return div
  }
  override ignoreEvent(): boolean { return true }
}
const BLANK_BLOCK = new BlankBlockWidget()

// ---- Obsidian widgets ------------------------------------------------------

/** Resolve a wiki/embed target + alias from a `[[…]]` inner string. */
function parseWikiInner(inner: string): { target: string; display: string } {
  const pipe = inner.indexOf('|')
  let target: string, alias: string | undefined
  if (pipe >= 0) { target = inner.slice(0, pipe); alias = inner.slice(pipe + 1) }
  else target = inner
  let display = alias ?? target
  if (!alias) {
    const h = target.indexOf('#')
    if (h === 0) display = target.slice(1) || target
    else if (h > 0) display = target.slice(0, h)
  }
  return { target, display }
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i

/** Build a relative URL for an embed target using the doc's directory. */
function resolveEmbedSrc(target: string, docDir?: string): string {
  if (/^https?:|^data:|^file:|^\//.test(target)) return target
  return docDir ? `${docDir}/${target}` : target
}

class TagWidget extends WidgetType {
  constructor(readonly label: string) { super() }
  override eq(o: TagWidget): boolean { return o.label === this.label }
  override toDOM(): HTMLElement {
    const a = document.createElement('a')
    a.className = 'lp-tag-chip'
    a.textContent = this.label
    return a
  }
  override ignoreEvent(): boolean { return false }
}

class WikiLinkWidget extends WidgetType {
  constructor(readonly target: string, readonly display: string) { super() }
  override eq(o: WikiLinkWidget): boolean { return o.target === this.target && o.display === this.display }
  override toDOM(): HTMLElement {
    const a = document.createElement('a')
    a.className = 'lp-wikilink-chip'
    a.setAttribute('data-target', this.target)
    a.textContent = this.display
    return a
  }
  override ignoreEvent(): boolean { return false }
}

class EmbedImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) { super() }
  override eq(o: EmbedImageWidget): boolean { return o.src === this.src }
  override toDOM(): HTMLElement {
    const img = document.createElement('img')
    img.className = 'lp-embed-img'
    img.src = this.src
    img.alt = this.alt
    return img
  }
  override ignoreEvent(): boolean { return false }
}

class EmbedRefWidget extends WidgetType {
  constructor(readonly target: string) { super() }
  override eq(o: EmbedRefWidget): boolean { return o.target === this.target }
  override toDOM(): HTMLElement {
    const a = document.createElement('a')
    a.className = 'lp-embed-ref'
    a.setAttribute('data-target', this.target)
    a.textContent = '📄 ' + this.target
    return a
  }
  override ignoreEvent(): boolean { return false }
}

/** Mermaid block widget. Renders asynchronously: starts as a placeholder,
 *  swaps in the SVG when mermaid resolves, then re-equates on theme changes. */
class MermaidWidget extends WidgetType {
  constructor(readonly code: string, readonly dark: boolean) { super() }
  override eq(o: MermaidWidget): boolean {
    // Re-render when the theme flips; otherwise key on code+theme.
    return o.code === this.code && o.dark === this.dark
  }
  override toDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'lp-mermaid'
    div.textContent = 'Loading diagram…'
    renderMermaid(this.code, this.dark)
      .then((svg) => { div.innerHTML = svg })
      .catch(() => { div.textContent = 'Invalid diagram' })
    return div
  }
  override ignoreEvent(): boolean { return false }
}

const CALLOUT_HEAD_RE = /^>\s*\[!([\w-]+)\]\s*(.*)$/

/** Callout header bar — replaces the `> [!type] title` first line with an
 *  icon + title. Rendered as an inline widget so the raw source reappears
 *  when the cursor enters the line (standard live-preview behavior). */
class CalloutHeaderWidget extends WidgetType {
  constructor(readonly type: string, readonly title: string) { super() }
  override eq(o: CalloutHeaderWidget): boolean {
    return o.type === this.type && o.title === this.title
  }
  override toDOM(): HTMLElement {
    const meta = calloutMeta(this.type)
    const span = document.createElement('span')
    span.className = 'lp-callout-header'
    span.innerHTML = meta.icon
    const label = document.createElement('span')
    label.className = 'lp-callout-header-text'
    label.textContent = this.title || meta.defaultTitle
    span.appendChild(label)
    return span
  }
  override ignoreEvent(): boolean { return false }
}


// ---- Decoration builder ----------------------------------------------------

function cursorOnLine(state: EditorState, from: number, to: number): boolean {
  const lineFrom = state.doc.lineAt(from).from
  const lineTo = state.doc.lineAt(to).to
  for (const range of state.selection.ranges) {
    if (range.from <= lineTo && range.to >= lineFrom) return true
  }
  return false
}

function buildDecorations(view: EditorView, ctx: LpCtx): DecorationSet {
  const { state } = view
  const { doc } = state
  const ranges: Range<Decoration>[] = []
  const listItemDepths = new Map<number, number>()
  // Callout: lineNum → type (ALL lines); head info for first line only.
  const calloutLineTypes = new Map<number, string>()
  const calloutHeads = new Map<number, { type: string; title: string; from: number; to: number }>()
  // Collect active (cursor) line numbers.
  const activeLines = new Set<number>()
  // In reading mode, treat ALL lines as inactive (markup always hidden).
  if (!state.facet(readingModeFacet) && view.hasFocus) {
    for (const r of state.selection.ranges) {
      const first = doc.lineAt(r.from).number
      const last = doc.lineAt(r.to).number
      for (let n = first; n <= last; n++) activeLines.add(n)
    }
  }

  // Force full-doc parse coverage so decorations cover everything.
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state)

  tree.iterate({
    enter(node) {
      const name = node.name
      const from = node.from
      const to = node.to
      if (from >= to) return

      // --- 1. Line classes (unconditional) ---
      // Expand fenced-code active lines: clicking any line of a fence
      // activates the whole block so marks hide/reveal consistently.
      if (name === 'FencedCode') {
        const firstLine = doc.lineAt(from).number
        const lastLine = doc.lineAt(to).number
        let anyActive = false
        for (let n = firstLine; n <= lastLine; n++) {
          if (activeLines.has(n)) {
            anyActive = true
            break
          }
        }
        if (anyActive) {
          for (let n = firstLine; n <= lastLine; n++) activeLines.add(n)
        }
      }

      // Table: expand active lines like FencedCode so the whole table
      // reveals its raw source when the cursor enters any line.
      if (name === 'Table') {
        const firstLine = doc.lineAt(from).number
        const lastLine = doc.lineAt(to).number
        let anyActive = false
        for (let n = firstLine; n <= lastLine; n++) {
          if (activeLines.has(n)) { anyActive = true; break }
        }
        if (anyActive) {
          for (let n = firstLine; n <= lastLine; n++) activeLines.add(n)
        }
      }

      // Callout detection: a blockquote whose first line matches `> [!type]`.
      // Record head-line info for the post-iteration decoration pass.
      if (name === 'Blockquote' && from < to) {
        const firstLineEnd = doc.lineAt(from).to
        const firstLineText = doc.sliceString(from, firstLineEnd)
        const m = firstLineText.match(CALLOUT_HEAD_RE)
        if (m) {
          const typeLower = m[1].toLowerCase()
          const headLine = doc.lineAt(from)
          calloutHeads.set(headLine.number, {
            type: typeLower,
            title: m[2].trim(),
            from: headLine.from,
            to: headLine.to
          })
          const firstLineNum = headLine.number
          const lastLineNum = doc.lineAt(to).number
          // Tag every line with its callout type for line-class styling.
          for (let n = firstLineNum; n <= lastLineNum; n++) calloutLineTypes.set(n, typeLower)
          // Expand active lines across the whole callout so cursor entry
          // anywhere reveals the raw source consistently.
          let anyActive = false
          for (let n = firstLineNum; n <= lastLineNum; n++) {
            if (activeLines.has(n)) { anyActive = true; break }
          }
          if (anyActive) {
            for (let n = firstLineNum; n <= lastLineNum; n++) activeLines.add(n)
          }
        }
      }

      // Line classes — apply to every line of the block.
      // FencedCode gets first/last variants for border + rounded corners.
      const lineClass = LINE_CLASS_BY_BLOCK[name]
      if (lineClass) {
        const firstLine = doc.lineAt(from)
        const lastLine = doc.lineAt(to)
        for (let n = firstLine.number; n <= lastLine.number; n++) {
          const line = doc.line(n)
          let cls = lineClass
          if (name === 'FencedCode') {
            if (n === firstLine.number) cls += ' lp-code-first'
            if (n === lastLine.number) cls += ' lp-code-last'
          }
          ranges.push(Decoration.line({ class: cls }).range(line.from))
        }
      }

      // --- 2. Inline marks (unconditional) ---
      const markClass = INLINE_MARK_CLASS[name]
      if (markClass) {
        ranges.push(Decoration.mark({ class: markClass }).range(from, to))
      }

      // Footnote reference: Link nodes whose text starts with [^ get a chip class.
      if (name === 'Link' && from < to) {
        const text = doc.sliceString(from, to)
        if (/^\^\[/.test(text.slice(1))) {
          ranges.push(Decoration.mark({ class: 'lp-footnote-ref' }).range(from, to))
        }
      }

      // --- 3. Hide decorations (inactive lines only) ---
      if (HIDEABLE_SYNTAX.has(name)) {
        const lineNum = doc.lineAt(from).number
        // Callout head lines: the `>` is swallowed by the header widget
        // (post-iteration), so skip the QuoteMark hide to avoid overlap.
        const skipHide = name === 'QuoteMark' && calloutHeads.has(lineNum)
        if (!skipHide && !activeLines.has(lineNum)) {
          let hideTo = to
          // HeaderMark / QuoteMark swallow trailing space so the hidden
          // state doesn't read indented.
          if (name === 'HeaderMark' || name === 'QuoteMark') {
            while (hideTo < doc.length && doc.sliceString(hideTo, hideTo + 1) === ' ') {
              hideTo++
            }
          }
          pushReplace(ranges, doc, from, hideTo)
        }
      }

      // URL inside a Link: hide the destination `(url)` on inactive lines.
      if (name === 'URL' && from < to) {
        const parent = node.node?.parent
        if (parent?.name === 'Link') {
          const lineNum = doc.lineAt(from).number
          if (!activeLines.has(lineNum)) {
            // Hide from the `(` before the URL to the `)` after.
            const parenFrom = from > 0 && doc.sliceString(from - 1, from) === '(' ? from - 1 : from
            const parenTo = doc.sliceString(to, to + 1) === ')' ? to + 1 : to
            pushReplace(ranges, doc, parenFrom, parenTo)
          }
        }
      }

      // --- 4. List marker widgets ---
      if (name === 'ListMark' && from < to) {
        const line = doc.lineAt(from)
        const lineNum = line.number
        // Compute nesting depth by counting ListItem ancestors.
        let depth = 0
        for (let p = node.node?.parent; p; p = p.parent) {
          if (p.name === 'ListItem') depth++
        }
        listItemDepths.set(lineNum, depth)
        const taskLead = line.text.match(/^(\s*[-*+]\s+)\[[ xX]\]/)
        const taskFrom = taskLead != null ? line.from + taskLead[1].length : undefined
        if (!activeLines.has(lineNum)) {
          if (taskFrom !== undefined) {
            pushReplace(ranges, doc, from, taskFrom)
          } else {
            const markText = doc.sliceString(from, to)
            if (markText === '-' || markText === '*' || markText === '+') {
              const hasSpace = doc.sliceString(to, to + 1) === ' '
              pushReplace(ranges, doc, from, hasSpace ? to + 1 : to, {
                widget: BULLET_WIDGET
              })
            }
          }
        }
      }

      // Task checkbox widget.
      if (name === 'TaskMarker' && from < to) {
        const lineNum = doc.lineAt(from).number
        // Ensure task lines are tracked as list items too.
        if (!listItemDepths.has(lineNum)) listItemDepths.set(lineNum, 1)
        if (!activeLines.has(lineNum)) {
          const text = doc.sliceString(from, to)
          const checked = /\[x\]/i.test(text)
          pushReplace(ranges, doc, from, to, {
            widget: new TaskCheckboxWidget(checked, from)
          })
        }
      }

      // Tables: rendered as block widgets by the StateField (not inline) so
      // the cursor positioning modifications from the inline approach are reverted.
      // Image: hide source syntax on inactive lines (block widget renders below).
      if (name === 'Image' && from < to && !cursorOnLine(state, from, to)) {
        pushReplace(ranges, doc, from, to)
      }

      // Inline math: replace $...$ with rendered KaTeX on inactive lines.
      if (name === 'InlineMath' && from < to) {
        const lineNum = doc.lineAt(from).number
        if (!activeLines.has(lineNum)) {
          pushReplace(ranges, doc, from, to, {
            widget: new InlineMathWidget(extractTex(doc.sliceString(from, to)))
          })
        }
      }
      // Emoji shortcode: replace `:name:` with the resolved glyph on inactive lines.
      if (name === 'Emoji' && from < to) {
        const lineNum = doc.lineAt(from).number
        if (!activeLines.has(lineNum)) {
          const emojiName = doc.sliceString(from + 1, to - 1)
          pushReplace(ranges, doc, from, to, {
            widget: new EmojiWidget(resolveEmoji(emojiName))
          })
        }
      }
      // Inline raw HTML (e.g. <b>): render verbatim on inactive lines.
      if (name === 'HTMLTag' && from < to) {
        const lineNum = doc.lineAt(from).number
        if (!activeLines.has(lineNum)) {
          pushReplace(ranges, doc, from, to, {
            widget: new InlineHtmlWidget(doc.sliceString(from, to))
          })
        }
      }
      // Hard line break (two trailing spaces or backslash before newline).
      if (name === 'HardBreak' && from < to) {
        const lineNum = doc.lineAt(from).number
        if (!activeLines.has(lineNum)) {
          pushReplace(ranges, doc, from, to, { widget: HARD_BREAK })
        }
      }
      // --- 5. Obsidian inline nodes ---
      // Highlight `==x==`: hide the `==` delimiters on inactive lines so the
      // content reads as plain highlighted text (mark class does the styling).
      if (name === 'Highlight' && from < to) {
        const lineNum = doc.lineAt(from).number
        if (!activeLines.has(lineNum)) {
          pushReplace(ranges, doc, from, from + 2)
          pushReplace(ranges, doc, to - 2, to)
        }
      }
      // Comment `%%x%%`: hide the whole node (content + delimiters) when inactive.
      if (name === 'Comment' && from < to) {
        const lineNum = doc.lineAt(from).number
        if (!activeLines.has(lineNum)) {
          pushReplace(ranges, doc, from, to)
        }
      }
      // Tag `#name`: replace with a chip on inactive lines.
      if (name === 'Tag' && from < to) {
        const lineNum = doc.lineAt(from).number
        if (!activeLines.has(lineNum)) {
          pushReplace(ranges, doc, from, to, { widget: new TagWidget(doc.sliceString(from, to)) })
        }
      }
      // WikiLink `[[…]]`: replace with a themed chip on inactive lines.
      if (name === 'WikiLink' && from < to) {
        const lineNum = doc.lineAt(from).number
        if (!activeLines.has(lineNum)) {
          const { target, display } = parseWikiInner(doc.sliceString(from + 2, to - 2))
          pushReplace(ranges, doc, from, to, { widget: new WikiLinkWidget(target, display) })
        }
      }
      // Embed `![[target]]`: image → inline img; note → ref chip.
      if (name === 'Embed' && from < to) {
        const lineNum = doc.lineAt(from).number
        if (!activeLines.has(lineNum)) {
          const target = doc.sliceString(from + 3, to - 2)
          if (IMAGE_EXT_RE.test(target)) {
            pushReplace(ranges, doc, from, to, {
              widget: new EmbedImageWidget(resolveEmbedSrc(target, ctx.docDir), target)
            })
          } else {
            pushReplace(ranges, doc, from, to, { widget: new EmbedRefWidget(target) })
          }
        }
      }
      // Footnote reference `[^id]`: keep the mark; on inactive lines also hide
      // the brackets so it reads as a superscript-style ref.
      if (name === 'FootnoteRef' && from < to) {
        const lineNum = doc.lineAt(from).number
        if (!activeLines.has(lineNum)) {
          pushReplace(ranges, doc, from, from + 2)
          pushReplace(ranges, doc, to - 1, to)
        }
      }
      // HR handled by block StateField (below) since it's a block widget.
    }
  })
  const lineCount = doc.lines

  for (let n = 1; n <= lineCount; n++) {
    const line = doc.line(n)
    if (listItemDepths.has(n)) {
      const depth = listItemDepths.get(n)!
      const indent = 1.5 + (depth - 1) * 1.5
      ranges.push(Decoration.line({ class: 'lp-list-line', attributes: { style: `padding-left: ${indent}em` } }).range(line.from))
    }
    // Callout line classes + header widget.
    const ctype = calloutLineTypes.get(n)
    if (ctype) {
      const isHead = calloutHeads.has(n)
      const cls = `lp-callout-line ${isHead ? 'lp-callout-head' : 'lp-callout-body'} lp-callout-${ctype}`
      // Remove the default quote-line class conflict by overriding here.
      ranges.push(Decoration.line({ class: cls }).range(line.from))
      if (isHead && !activeLines.has(n)) {
        const head = calloutHeads.get(n)!
        pushReplace(ranges, doc, head.from, head.to, {
          widget: new CalloutHeaderWidget(head.type, head.title)
        })
      }
    }
  }

  return Decoration.set(ranges, true)
}

/**
 * Push a Decoration.replace, splitting at line breaks (CM6 forbids
 * plugin-sourced replace decorations that cross line boundaries).
 */
function pushReplace(
  ranges: Range<Decoration>[],
  doc: EditorState['doc'],
  from: number,
  to: number,
  spec: Parameters<typeof Decoration.replace>[0] = {}
): void {
  if (from >= to) return
  const startLine = doc.lineAt(from)
  if (to <= startLine.to) {
    ranges.push(Decoration.replace(spec).range(from, to))
    return
  }
  let cursor = from
  let first = true
  while (cursor < to) {
    const line = doc.lineAt(cursor)
    const segEnd = Math.min(to, line.to)
    if (segEnd > cursor) {
      ranges.push(Decoration.replace(first ? spec : {}).range(cursor, segEnd))
      first = false
    }
    cursor = line.to + 1
  }
}
// Table block widget — renders table markdown as HTML matching Reading mode.
function tableMarkdownToHtml(src: string): string {
  const lines = src.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) return '<p>' + escapeHtml(src) + '</p>'
  const splitRow = (line: string) => line.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
  const header = splitRow(lines[0])
  // lines[1] is the delimiter row (| --- | --- |), skip it
  const bodyRows = lines.slice(2).map(splitRow)
  let html = '<table><thead><tr>'
  for (const h of header) html += `<th>${renderInline(h)}</th>`
  html += '</tr></thead><tbody>'
  for (const row of bodyRows) {
    html += '<tr>'
    for (const cell of row) html += `<td>${renderInline(cell)}</td>`
    html += '</tr>'
  }
  html += '</tbody></table>'
  return html
}

/** Render common inline markdown within table cells → safe HTML. */
function renderInline(text: string): string {
  let s = escapeHtml(text)
  // Links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  // Bold/italic/strike/code (order matters: bold before italic, code last)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  return s
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Table block widget — renders the table markdown as an HTML <table> matching Reading mode.
class TableWidget extends WidgetType {
  constructor(readonly src: string) { super() }
  override eq(o: TableWidget): boolean { return o.src === this.src }
  override toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'lp-table-wrap'
    wrap.innerHTML = tableMarkdownToHtml(this.src)
    return wrap
  }
  override ignoreEvent(): boolean { return false }
}

// Block decorations for Tables, HorizontalRules, and Images.
// These MUST be a StateField — CM6 forbids block decorations from ViewPlugins.
class ImageBlockWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) { super() }
  override eq(o: ImageBlockWidget): boolean { return o.src === this.src }
  override toDOM(): HTMLElement {
    const img = document.createElement('img')
    img.src = this.src
    img.style.maxWidth = '100%'
    img.style.borderRadius = '8px'
    img.style.padding = '1em 0'
    img.style.display = 'block'
    return img
  }
}

function blockDecorationField(state: EditorState, ctx: LpCtx): DecorationSet {
  const doc = state.doc
  const ranges: Range<Decoration>[] = []
  const activeLines = new Set<number>()
  if (!state.facet(readingModeFacet)) {
    for (const r of state.selection.ranges) {
      const first = doc.lineAt(r.from).number
      const last = doc.lineAt(r.to).number
      for (let n = first; n <= last; n++) activeLines.add(n)
    }
  }
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state)
  tree.iterate({
    enter(node) {
      if (node.name === 'Table' && node.from < node.to) {
        const firstLineNum = doc.lineAt(node.from).number
        const lastLineNum = doc.lineAt(node.to).number
        let anyActive = false
        for (let n = firstLineNum; n <= lastLineNum; n++) {
          if (activeLines.has(n)) { anyActive = true; break }
        }
        if (!anyActive) {
          const src = doc.sliceString(node.from, node.to)
          const replaceTo = doc.lineAt(node.to).to
          ranges.push(Decoration.replace({ block: true, widget: new TableWidget(src) }).range(node.from, replaceTo))
        }
      }
      if (node.name === 'HorizontalRule' && node.from < node.to) {
        const lineNum = doc.lineAt(node.from).number
        if (!activeLines.has(lineNum)) {
          ranges.push(Decoration.replace({ block: true, widget: new HrWidget() }).range(node.from, node.to))
        }
      }
      if (node.name === 'Image' && node.from < node.to) {
        const lineNum = doc.lineAt(node.from).number
        if (!activeLines.has(lineNum)) {
          let src = ''
          let alt = ''
          const full = node.node
          if (full) {
            for (let c = full.firstChild; c; c = c.nextSibling) {
              if (c.name === 'URL') src = doc.sliceString(c.from, c.to)
              if (c.name === 'LinkLabel') alt = doc.sliceString(c.from, c.to)
            }
          }
          if (!src) {
            const raw = doc.sliceString(node.from, node.to)
            const m = raw.match(/^!\[([\s\S]*)\]\(([\s\S]*?)\)$/)
            if (m) { alt = m[1]; src = m[2] }
          }
          const lineEnd = doc.lineAt(node.to).to
          ranges.push(Decoration.widget({ block: true, widget: new ImageBlockWidget(src, alt), side: 1 }).range(lineEnd))
        }
      }
      if (node.name === 'BlockMath' && node.from < node.to) {
        const firstLineNum = doc.lineAt(node.from).number
        const lastLineNum = doc.lineAt(node.to).number
        let anyActive = false
        for (let n = firstLineNum; n <= lastLineNum; n++) {
          if (activeLines.has(n)) { anyActive = true; break }
        }
        if (!anyActive) {
          const raw = doc.sliceString(node.from, node.to)
          const replaceTo = doc.lineAt(node.to).to
          ranges.push(
            Decoration.replace({ block: true, widget: new BlockMathWidget(extractTex(raw)) }).range(node.from, replaceTo)
          )
        }
      }
      // Raw HTML block / HTML comment.
      if ((node.name === 'HTMLBlock' || node.name === 'CommentBlock') && node.from < node.to) {
        const firstLineNum = doc.lineAt(node.from).number
        const lastLineNum = doc.lineAt(node.to).number
        let anyActive = false
        for (let n = firstLineNum; n <= lastLineNum; n++) {
          if (activeLines.has(n)) { anyActive = true; break }
        }
        if (!anyActive) {
          const replaceTo = doc.lineAt(node.to).to
          if (node.name === 'HTMLBlock') {
            const raw = doc.sliceString(node.from, node.to)
            ranges.push(
              Decoration.replace({ block: true, widget: new RawHtmlBlockWidget(raw) }).range(node.from, replaceTo)
            )
          } else {
            // CommentBlock: hide it entirely (DOM strips comments).
            ranges.push(Decoration.replace({ block: true, widget: BLANK_BLOCK }).range(node.from, replaceTo))
          }
        }
      }
      // Mermaid fenced code block → rendered diagram widget (block).
      if (node.name === 'FencedCode' && node.from < node.to) {
        const info = node.node?.getChild('CodeInfo')
        const lang = info ? doc.sliceString(info.from, info.to).trim().toLowerCase() : ''
        if (lang === 'mermaid') {
          const firstLineNum = doc.lineAt(node.from).number
          const lastLineNum = doc.lineAt(node.to).number
          let anyActive = false
          for (let n = firstLineNum; n <= lastLineNum; n++) {
            if (activeLines.has(n)) { anyActive = true; break }
          }
          if (!anyActive) {
            let code = ''
            const full = node.node
            if (full) for (let c = full.firstChild; c; c = c.nextSibling) {
              if (c.name === 'CodeText') code += doc.sliceString(c.from, c.to)
            }
            const replaceTo = doc.lineAt(node.to).to
            ranges.push(
              Decoration.replace({ block: true, widget: new MermaidWidget(code, ctx.dark) }).range(node.from, replaceTo)
            )
          }
        }
      }
    }
  })
  return Decoration.set(ranges, true)
}

function blockDecorations(ctx: LpCtx) {
  return StateField.define<DecorationSet>({
    create(state) { return blockDecorationField(state, ctx) },
    update(prev, tr) {
      if (tr.docChanged || tr.selection) return blockDecorationField(tr.state, ctx)
      return prev
    },
    provide: (f) => EditorView.decorations.from(f)
  })
}

// ---- Plugin ----------------------------------------------------------------

/** Extract the URL string from a Link syntax node at the given position. */
function linkUrlAt(state: EditorState, pos: number): string | null {
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state)
  let node: SyntaxNode | null = tree.resolve(pos, 1)
  // Walk up to find a Link or URL node.
  while (node && node.name !== 'Link' && node.name !== 'URL') node = node.parent
  if (!node) return null
  if (node.name === 'URL') return state.doc.sliceString(node.from, node.to)
  // Link node — find the URL child.
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'URL') return state.doc.sliceString(c.from, c.to)
  }
  return null
}

/** Click handler: in reading mode, clicking a link opens it externally. */
function readingClickHandler(): Extension {
  return EditorView.domEventHandlers({
    click(event, view) {
      if (!view.state.facet(readingModeFacet)) return false
      const target = event.target as HTMLElement | null
      const linkEl = target?.closest('.lp-link, .lp-url')
      if (!linkEl) return false
      const pos = view.posAtDOM(linkEl)
      const url = linkUrlAt(view.state, pos)
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer')
        return true
      }
      return false
    }
  })
}
export function livePreviewPlugin(opts: { docDir?: string; dark?: boolean; reading?: boolean } = {}): Extension {
  const reading = opts.reading ?? false
  const ctx: LpCtx = { docDir: opts.docDir, dark: opts.dark ?? false }
  return Prec.lowest([
    readingModeFacet.of(reading),
    reading ? readingClickHandler() : [],
    blockDecorations(ctx),
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet
        constructor(view: EditorView) {
          this.decorations = buildDecorations(view, ctx)
        }
        update(update: ViewUpdate): void {
          if (update.docChanged || update.selectionSet || update.focusChanged || update.viewportChanged) {
            this.decorations = buildDecorations(update.view, ctx)
          }
        }
      },
      {
        decorations: (v) => v.decorations
      }
    )
  ])
}

export function setLivePreviewTheme(_theme: 'light' | 'dark'): void {
  // Theme switching handled by CSS variables; no JS action needed.
}
