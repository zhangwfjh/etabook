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
import { renderMermaid, peekMermaid, memoDiagramHeight, peekDiagramHeight } from '../../markdown/mermaid'
import { calloutMeta } from '../../markdown/callout'
import {
  serializeToHtml, renderTableHtml, renderFrontmatterHtml, renderInlineMarkdownText
} from '../../markdown/serialize'
import {
  collectLinkDefs, resolveTargetPath, readNote, fileUrl, extractEmbedContent, headingOffset
} from '../../markdown/resolve'

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
  /** Absolute workspace root — enables embed/wikilink resolution. */
  workspace?: string
  /** Absolute path of the current document (embed cycle guard). */
  docPath?: string
  /** Reading-mode navigation: open a wikilink target note. */
  onOpenNote?: (target: string) => void
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
  Subscript: 'lp-sub',
  Superscript: 'lp-sup',
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
  /** Matches .lp-hr padding-top+bottom+border — keeps the doc-height estimate
 *   stable until first measurement (scrollbar jiggle fix). */
  override get estimatedHeight(): number { return 34 }
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
  /** Typical .katex-display height — estimate until measured. */
  override get estimatedHeight(): number { return 90 }
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
    else if (h > 0) display = target.slice(0, h) + target.slice(h).replaceAll('#', ' > ')
  }
  return { target: target.trim(), display: display.trim() }
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
  constructor(readonly target: string, readonly display: string, readonly ctx: LpCtx) { super() }
  override eq(o: WikiLinkWidget): boolean {
    return o.target === this.target && o.display === this.display && o.ctx.dark === this.ctx.dark
  }
  override toDOM(): HTMLElement {
    const a = document.createElement('a')
    a.className = 'lp-wikilink-chip'
    a.setAttribute('data-target', this.target)
    a.textContent = this.display
    // Async resolution: dim + tooltip when the target is Unresolved.
    if (this.ctx.workspace && !this.target.startsWith('#') && !/^[a-z][a-z0-9+.-]*:/i.test(this.target)) {
      void resolveTargetPath(this.target, this.ctx).then((p) => {
        if (!p) {
          a.classList.add('lp-unresolved')
          a.title = `Not found: ${this.target}`
        } else {
          a.setAttribute('data-path', p)
        }
      })
    }
    return a
  }
  override ignoreEvent(): boolean { return false }
}

class EmbedImageWidget extends WidgetType {
  constructor(readonly target: string, readonly ctx: LpCtx) { super() }
  override get estimatedHeight(): number { return imgHeightMemo.get(this.target) ?? -1 }
  override eq(o: EmbedImageWidget): boolean {
    return o.target === this.target && o.ctx.dark === this.ctx.dark
  }
  override toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span')
    const file = this.target.split('#')[0]
    if (/^[a-z][a-z0-9+.-]*:|^data:|^\/|^\.\//i.test(file) || !this.ctx.workspace) {
      const img = document.createElement('img')
      img.className = 'lp-embed-img'
      img.src = resolveEmbedSrc(this.target, this.ctx.docDir)
      img.alt = this.target
      // Memoize the loaded height so virtualized remounts estimate correctly
      // (scrollbar jiggle fix), and remeasure on load.
      img.addEventListener('load', () => {
        const line = img.closest('.cm-line')
        const h = line ? line.getBoundingClientRect().height : img.offsetHeight
        if (h > 0) imgHeightMemo.set(this.target, h)
        view.requestMeasure()
      })
      wrap.appendChild(img)
      return wrap
    }
    const img = document.createElement('img')
    img.className = 'lp-embed-img'
    img.alt = this.target
    img.addEventListener('load', () => {
      const line = img.closest('.cm-line')
      const h = line ? line.getBoundingClientRect().height : img.offsetHeight
      if (h > 0) imgHeightMemo.set(this.target, h)
      view.requestMeasure()
    })
    wrap.appendChild(img)
    void resolveTargetPath(this.target, this.ctx).then((p) => {
      if (p) img.src = fileUrl(p)
      else {
        wrap.innerHTML = ''
        const chip = document.createElement('a')
        chip.className = 'lp-embed-ref lp-unresolved'
        chip.title = `Not found: ${this.target}`
        chip.textContent = `🖼 ${this.target}`
        wrap.appendChild(chip)
      }
    })
    return wrap
  }
  override ignoreEvent(): boolean { return false }
}

// Memoized embed renderings: HTML per (target, theme, workspace) and its
// measured height. Remounts reuse the HTML synchronously (no placeholder
// stage) and reserve the known height — same pattern as MermaidWidget.
const embedHtmlMemo = new Map<string, string>()
const embedHeightMemo = new Map<string, number>()

/** Note/heading/block embed — asynchronously resolved, then rendered through
 *  the shared serializer (same HTML as Reading/Export for the embedded slice).
 *  Depth + cycle guards per ADR-0002; placeholders make the limits visible. */
class EmbedNoteWidget extends WidgetType {
  constructor(readonly target: string, readonly ctx: LpCtx) { super() }
  private get memoKey(): string {
    return `${this.target}\u0000${this.ctx.dark ? 1 : 0}\u0000${this.ctx.workspace ?? ''}`
  }
  override get estimatedHeight(): number { return embedHeightMemo.get(this.memoKey) ?? -1 }
  override eq(o: EmbedNoteWidget): boolean {
    return o.target === this.target && o.ctx.dark === this.ctx.dark
  }
  override toDOM(view: EditorView): HTMLElement {
    const div = document.createElement('div')
    div.className = 'lp-embed-note'
    const key = this.memoKey
    const cached = embedHtmlMemo.get(key)
    if (cached !== undefined) {
      // Synchronous remount from cache — doc height stays stable.
      div.innerHTML = cached
      return div
    }
    const reserved = embedHeightMemo.get(key)
    if (reserved) div.style.minHeight = `${reserved}px`
    div.textContent = `Loading ${this.target}…`
    const settle = (heightChanged: boolean): void => {
      // Record the enclosing LINE height (not just the widget) — CM's
      // estimate replaces the whole line, leading included.
      const line = div.closest('.cm-line')
      const h = (line ?? div).getBoundingClientRect().height
      if (h > 0) embedHeightMemo.set(key, h)
      if (heightChanged) view.requestMeasure()
    }
    const hash = this.target.indexOf('#')
    const subpath = hash >= 0 ? this.target.slice(hash + 1) : undefined
    void resolveTargetPath(this.target, this.ctx)
      .then(async (p) => {
        if (!p) {
          div.classList.add('lp-unresolved')
          div.title = `Not found: ${this.target}`
          div.textContent = `📄 ${this.target}`
          return
        }
        const norm = (s: string): string => s.replace(/\\/g, '/')
        const chain = this.ctx.docPath ? [norm(this.ctx.docPath)] : []
        if (chain.includes(norm(p))) {
          div.className = 'lp-embed-note lp-embed-placeholder'
          div.textContent = `Circular embed: ${this.target}`
          return
        }
        const content = await readNote(p)
        const slice = extractEmbedContent(content, subpath)
        if (slice === null) {
          div.classList.add('lp-unresolved')
          div.title = `Section not found: ${this.target}`
          div.textContent = `📄 ${this.target}`
          return
        }
        const html = await serializeToHtml(slice, this.ctx.dark, {
          workspace: this.ctx.workspace,
          docDir: this.ctx.docDir,
          depth: 1,
          chain: [...chain, norm(p)],
          inApp: true
        })
        embedHtmlMemo.set(key, html)
        div.innerHTML = html
        // Watch for images inside the embedded slice loading late.
        for (const img of div.querySelectorAll('img')) {
          if (!img.complete) img.addEventListener('load', () => view.requestMeasure())
        }
        // Record the rendered height (for future remount reservations) and
        // remeasure — the placeholder height just changed to the real one.
        settle(true)
      })
      .catch(() => {
        div.className = 'lp-embed-note lp-embed-placeholder'
        div.textContent = `Could not load embed: ${this.target}`
      })
    return div
  }
  override ignoreEvent(): boolean { return false }
}

/** HTML entity glyph (`&copy;` etc.) outside code spans. innerHTML parses the
 *  entity (regex-validated form) into its glyph text node. */
class EntityWidget extends WidgetType {
  constructor(readonly entity: string) { super() }
  override eq(o: EntityWidget): boolean { return o.entity === this.entity }
  override toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'lp-entity'
    span.innerHTML = this.entity
    return span
  }
  override ignoreEvent(): boolean { return false }
}

/** Footnote reference — superscripted number with an anchor id. */
class FootnoteRefWidget extends WidgetType {
  constructor(readonly num: number, readonly id: string) { super() }
  override eq(o: FootnoteRefWidget): boolean { return o.num === this.num && o.id === this.id }
  override toDOM(): HTMLElement {
    const sup = document.createElement('sup')
    sup.className = 'lp-fn-ref'
    sup.id = `fnref-${this.id}`
    sup.textContent = String(this.num)
    return sup
  }
  override ignoreEvent(): boolean { return false }
}

/** Footnotes section at the end of the document — rendered definitions with
 *  back-links to their references. */
class FootnotesSectionWidget extends WidgetType {
  constructor(readonly items: { id: string; num: number; bodyHtml: string }[]) { super() }
  /** Section margin + hr + items × line — calibrated against the rendered
 *   metrics until first measurement (scrollbar jiggle fix). */
  override get estimatedHeight(): number { return 65 + this.items.length * 26 }
  override eq(o: FootnotesSectionWidget): boolean {
    return o.items.length === this.items.length &&
      o.items.every((it, i) => it.id === this.items[i].id && it.bodyHtml === this.items[i].bodyHtml)
  }
  override toDOM(): HTMLElement {
    const sec = document.createElement('section')
    sec.className = 'lp-footnotes'
    sec.innerHTML = '<hr>'
    const ol = document.createElement('ol')
    for (const it of this.items) {
      const li = document.createElement('li')
      li.id = `fn-${it.id}`
      li.innerHTML = it.bodyHtml
      const back = document.createElement('a')
      back.href = `#fnref-${it.id}`
      back.className = 'lp-fn-back'
      back.textContent = ' ↩'
      li.appendChild(back)
      ol.appendChild(li)
    }
    sec.appendChild(ol)
    return sec
  }
  override ignoreEvent(): boolean { return true }
}

/** Frontmatter — properties table (same HTML as export). */
class FrontmatterWidget extends WidgetType {
  constructor(readonly raw: string) { super() }
  /** Rows × cell height — estimate until measured. */
  override get estimatedHeight(): number {
    const rows = this.raw.split('\n').filter((l) => l && l !== '---' && l !== '...').length
    return rows * 29 + 2
  }
  override eq(o: FrontmatterWidget): boolean { return o.raw === this.raw }
  override toDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'lp-frontmatter-wrap'
    div.innerHTML = renderFrontmatterHtml(this.raw)
    return div
  }
  override ignoreEvent(): boolean { return false }
}

/** A real anchor (markdown link, reference link, or autolink). */
class LinkAnchorWidget extends WidgetType {
  constructor(readonly href: string, readonly text: string, readonly cls: string) { super() }
  override eq(o: LinkAnchorWidget): boolean {
    return o.href === this.href && o.text === this.text && o.cls === this.cls
  }
  override toDOM(): HTMLElement {
    const a = document.createElement('a')
    a.className = this.cls
    a.setAttribute('data-href', this.href)
    a.setAttribute('rel', 'noopener noreferrer')
    a.textContent = this.text
    return a
  }
  override ignoreEvent(): boolean { return false }
}

/** Mermaid block widget. Injects the SVG synchronously when it is already
 *  cached (remounts skip the placeholder stage), otherwise reserves the
 *  memoized height while the async render runs, and re-measures CodeMirror
 *  after the swap so the viewport does not jump. */
class MermaidWidget extends WidgetType {
  constructor(readonly code: string, readonly dark: boolean) { super() }
  override eq(o: MermaidWidget): boolean {
    // Re-render when the theme flips; otherwise key on code+theme.
    return o.code === this.code && o.dark === this.dark
  }
  override toDOM(view: EditorView): HTMLElement {
    const div = document.createElement('div')
    div.className = 'lp-mermaid'
    const cached = peekMermaid(this.code, this.dark)
    if (cached !== null) {
      div.innerHTML = cached
      // Record height for future placeholder reservations.
      requestAnimationFrame(() => {
        const h = div.getBoundingClientRect().height
        if (h > 0) memoDiagramHeight(this.code, this.dark, h)
      })
      return div
    }
    const reserved = peekDiagramHeight(this.code, this.dark)
    if (reserved) div.style.minHeight = `${reserved}px`
    div.textContent = 'Loading diagram…'
    renderMermaid(this.code, this.dark)
      .then((svg) => {
        div.innerHTML = svg
        div.style.minHeight = ''
        const h = div.getBoundingClientRect().height
        if (h > 0) memoDiagramHeight(this.code, this.dark, h)
        view.requestMeasure()
      })
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

/** Quote depth of a line's leading marks — `>> x`, `> > x`, and `>   > x`
 *  all nest two levels (spaces between markers are legal CommonMark). */
function quoteDepthOf(text: string): number {
  let depth = 0
  let i = 0
  while (i < text.length) {
    if (text[i] === '>') {
      depth++
      i++
      while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++
      continue
    }
    break
  }
  return depth
}

function buildDecorations(view: EditorView, ctx: LpCtx): DecorationSet {
  const { state } = view
  const { doc } = state
  const ranges: Range<Decoration>[] = []
  const calloutLineTypes = new Map<number, string>()
  // Quote level at which each callout sits (head line's `>` count) — used to
  // draw ancestor quote bars + the card edge as background layers.
  const calloutLineLevels = new Map<number, number>()
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
  const fullText = doc.sliceString(0)
  const linkDefs = collectLinkDefs(fullText)
  // Ranges whose raw text must not be entity-decoded or ref-link-scanned.
  const opaque: { from: number; to: number }[] = []
  // Footnote ids in first-reference order (Obsidian numbering).
  const fnSeen: string[] = []
  // Paired inline-HTML ranges already consumed by an opening-tag widget.
  const htmlPairs: { from: number; to: number }[] = []
  // Lines that carry their own list marker (vs. lazy/spurious ancestors).
  const listMarkLines = new Set<number>()
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
          const calloutLevel = Math.max(quoteDepthOf(headLine.text), 1)
          calloutHeads.set(headLine.number, {
            type: typeLower,
            title: m[2].trim(),
            from: headLine.from,
            to: headLine.to
          })
          const firstLineNum = headLine.number
          const lastLineNum = doc.lineAt(to).number
          // Tag every line with its callout type for line-class styling.
          for (let n = firstLineNum; n <= lastLineNum; n++) {
            calloutLineTypes.set(n, typeLower)
            calloutLineLevels.set(n, calloutLevel)
          }
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
      // Nested Blockquotes only style once (outermost) — the class used to
      // accumulate per nesting level ("lp-quote-line lp-quote-line").
      const lineClass = LINE_CLASS_BY_BLOCK[name]
      if (lineClass && !(name === 'Blockquote' && node.node?.parent?.name === 'Blockquote')) {
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

      // Link → real anchor widget on inactive lines (both inline and
      // reference forms). Reference labels resolve via the doc's definitions.
      if (name === 'Link' && from < to) {
        const lineNum = doc.lineAt(from).number
        const raw = doc.sliceString(from, to)
        const ref = raw.match(/^\[([\s\S]*?)\]\s*\[([^\]]*)\]\s*$/)
        if (ref) {
          const def = linkDefs.byLabel.get((ref[2] || ref[1]).toLowerCase())
          if (def && !activeLines.has(lineNum)) {
            opaque.push({ from, to })
            pushReplace(ranges, doc, from, to, {
              widget: new LinkAnchorWidget(def.url, ref[1], 'lp-link lp-link-anchor')
            })
          }
        } else if (!activeLines.has(lineNum)) {
          const urlNode = node.node?.getChild('URL')
          const href = urlNode ? doc.sliceString(urlNode.from, urlNode.to) : ''
          if (href) {
            const text = raw.replace(/^\[/, '').replace(/\]\s*\([\s\S]*\)\s*$/, '')
            pushReplace(ranges, doc, from, to, {
              widget: new LinkAnchorWidget(href, text, 'lp-link lp-link-anchor')
            })
          }
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
            if (name === 'QuoteMark') {
              // Also hide leading whitespace before the `>` (quote-in-list
              // indentation leaks otherwise; nesting is conveyed by the
              // composed line indent).
              const line = doc.lineAt(from)
              let ws = line.from
              while (ws < from && (doc.sliceString(ws, ws + 1) === ' ' || doc.sliceString(ws, ws + 1) === '\t')) {
                ws++
              }
              if (ws > line.from) pushReplace(ranges, doc, line.from, ws)
            }
          }
          pushReplace(ranges, doc, from, hideTo)
        }
      }

      // Standalone URL (bare / www / email autolink) → anchor on inactive lines.
      if (name === 'URL' && from < to && node.node?.parent?.name !== 'Link') {
        const lineNum = doc.lineAt(from).number
        if (!activeLines.has(lineNum)) {
          const raw = doc.sliceString(from, to)
          const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw)
          const href = hasScheme ? raw : /^www\./i.test(raw) ? `http://${raw}` : `mailto:${raw}`
          pushReplace(ranges, doc, from, to, {
            widget: new LinkAnchorWidget(href, raw, 'lp-url lp-link-anchor')
          })
        }
      }

      // --- 4. List marker widgets ---
      if (name === 'ListMark' && from < to) {
        const line = doc.lineAt(from)
        const lineNum = line.number
        listMarkLines.add(lineNum)
        const taskLead = line.text.match(/^(\s*[-*+]\s+)\[[ xX]\]/)
        const taskFrom = taskLead != null ? line.from + taskLead[1].length : undefined
        if (!activeLines.has(lineNum)) {
          // Hide the raw source indentation before the marker (nesting is
          // conveyed by the composed line indent, not by leaked spaces).
          let ws = line.from
          while (ws < from) {
            const c = doc.sliceString(ws, ws + 1)
            if (c !== ' ' && c !== '\t') break
            ws++
          }
          if (ws > line.from) pushReplace(ranges, doc, line.from, ws)
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
        if (!activeLines.has(lineNum)) {
          const text = doc.sliceString(from, to)
          const checked = /\[x\]/i.test(text)
          // Swallow one following space so the label doesn't read indented
          // (the checkbox widget provides its own spacing via CSS margin).
          const taskHideTo = doc.sliceString(to, to + 1) === ' ' ? to + 1 : to
          pushReplace(ranges, doc, from, taskHideTo, {
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
      // Inline raw HTML / angle autolinks on inactive lines.
      // Paired open+content+close renders as one widget so the content is
      // styled by the tag (e.g. <span style="color:red">…</span>).
      if (name === 'HTMLTag' && from < to) {
        const lineNum = doc.lineAt(from).number
        if (!activeLines.has(lineNum)) {
          const raw = doc.sliceString(from, to)
          const email = raw.match(/^<([a-zA-Z][\w.+-]*@[a-zA-Z][\w.-]*[a-zA-Z])>$/)
          const uri = raw.match(/^<([a-z][a-z0-9+.-]*:[^<>\s]*)>$/i)
          if (email) {
            pushReplace(ranges, doc, from, to, {
              widget: new LinkAnchorWidget(`mailto:${email[1]}`, email[1], 'lp-url lp-link-anchor')
            })
          } else if (uri) {
            pushReplace(ranges, doc, from, to, {
              widget: new LinkAnchorWidget(uri[1], uri[1], 'lp-url lp-link-anchor')
            })
          } else if (htmlPairs.some((p) => from >= p.from && to <= p.to)) {
            // consumed by its opening tag's widget
          } else {
            const open = raw.match(/^<([a-zA-Z][\w-]*)[^<>]*>$/)
            if (open && !/\/>$/.test(raw)) {
              let close: SyntaxNode | null = null
              for (let sib = node.node?.nextSibling ?? null; sib; sib = sib.nextSibling) {
                if (sib.name === 'HTMLTag') {
                  const sraw = doc.sliceString(sib.from, sib.to)
                  if (sraw.toLowerCase() === `</${open[1].toLowerCase()}>`) { close = sib; break }
                  if (/^<[a-zA-Z]/.test(sraw)) break
                }
              }
              if (close) {
                htmlPairs.push({ from, to: close.to })
                pushReplace(ranges, doc, from, close.to, {
                  widget: new InlineHtmlWidget(doc.sliceString(from, close.to))
                })
              } else {
                pushReplace(ranges, doc, from, to, { widget: new InlineHtmlWidget(raw) })
              }
            } else {
              pushReplace(ranges, doc, from, to, { widget: new InlineHtmlWidget(raw) })
            }
          }
        }
      }
      // Hard line break (two trailing spaces or backslash before newline).
      if (name === 'HardBreak' && from < to) {
        const lineNum = doc.lineAt(from).number
        if (!activeLines.has(lineNum)) {
          pushReplace(ranges, doc, from, to, { widget: HARD_BREAK })
        }
      }
      // Escape `\*`: consume the backslash on inactive lines.
      if (name === 'Escape' && from < to) {
        const lineNum = doc.lineAt(from).number
        if (!activeLines.has(lineNum)) pushReplace(ranges, doc, from, from + 1)
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
          pushReplace(ranges, doc, from, to, { widget: new WikiLinkWidget(target, display, ctx) })
        }
      }
      // Embed `![[target]]`: image → img widget; note/heading/block →
      // transclusion widget (resolved + rendered like Reading/Export).
      if (name === 'Embed' && from < to) {
        const lineNum = doc.lineAt(from).number
        if (!activeLines.has(lineNum)) {
          const target = doc.sliceString(from + 3, to - 2)
          if (IMAGE_EXT_RE.test(target)) {
            pushReplace(ranges, doc, from, to, { widget: new EmbedImageWidget(target, ctx) })
          } else {
            pushReplace(ranges, doc, from, to, { widget: new EmbedNoteWidget(target, ctx) })
          }
        }
      }
      // Footnote reference `[^id]` → superscripted number (ref-order numbering).
      if (name === 'FootnoteRef' && from < to) {
        const id = doc.sliceString(from + 2, to - 1)
        if (!fnSeen.includes(id)) fnSeen.push(id)
        const lineNum = doc.lineAt(from).number
        if (!activeLines.has(lineNum)) {
          pushReplace(ranges, doc, from, to, {
            widget: new FootnoteRefWidget(fnSeen.indexOf(id) + 1, id)
          })
        }
      }
      // Opaque ranges: raw text that must not be entity-decoded post-iterate.
      if (name === 'InlineCode' || name === 'Comment' || name === 'InlineMath' ||
          name === 'Emoji' || name === 'FencedCode' || name === 'CodeBlock' ||
          name === 'HTMLBlock' || name === 'CommentBlock' || name === 'Frontmatter' ||
          name === 'BlockMath') {
        opaque.push({ from, to })
      }
      // HR handled by block StateField (below) since it's a block widget.
    }
  })
  const lineCount = doc.lines

  for (let n = 1; n <= lineCount; n++) {
    const line = doc.line(n)
    // Composed block indentation: quote level × 1em + list depth × 1.5em,
    // applied unconditionally (cursor lines too) so revealing source never
    // shifts the line horizontally. Code lines keep their own CSS padding.
    //
    // Quote level prefers the raw leading `>` count — deeper nesting often
    // STARTS mid-line (`>> x`), so resolving the tree at column 0
    // undercounts. List depth resolves at the first content position for
    // the same reason (`> - x`, `  - x`).
    const raw = line.text
    const marks = quoteDepthOf(raw)
    let cut = 0
    while (cut < raw.length && (raw[cut] === '>' || raw[cut] === ' ' || raw[cut] === '\t')) cut++
    const probePos = line.length > 0 ? Math.min(line.from + cut, line.to - 1) : line.from
    const at = tree.resolveInner(probePos, 1)
    let quoteLevel = marks
    let ancestorQuotes = 0
    let listDepth = 0
    let inCode = false
    for (let p: SyntaxNode | null = at; p; p = p.parent) {
      if (p.name === 'Blockquote') ancestorQuotes++
      else if (p.name === 'ListItem') listDepth++
      else if (p.name === 'FencedCode' || p.name === 'CodeBlock') inCode = true
    }
    quoteLevel = Math.max(quoteLevel, ancestorQuotes)
    // A line that starts with `>` but carries no list marker of its own
    // (e.g. a `>` separator inside a callout body) must not inherit list
    // depth from lazy ancestors — quote level alone positions it.
    if (marks > 0 && !listMarkLines.has(n)) listDepth = 0
    const calloutLevel = calloutLineLevels.get(n)
    if (!inCode && (quoteLevel > 0 || listDepth > 0 || calloutLevel)) {
      const em = quoteLevel * 1 + listDepth * 1.5
      // Nested-structure bars (Obsidian draws one per quote level; a line
      // element has a single border-left, so extra bars are background
      // layers positioned in the padding zone):
      //   - plain quote lines: border = level 1; stripes for levels 2..L
      //   - callout lines: ancestor quote bars, then the card edge + card
      //     background at the callout's level, then nested-quote bars below
      const layers: string[] = []
      const positions: string[] = []
      const sizes: string[] = []
      const bar = (color: string, offsetEm: number, widthPx: number): void => {
        layers.push(`linear-gradient(${color},${color})`)
        positions.push(`${offsetEm}em 0`)
        sizes.push(`${widthPx}px 100%`)
      }
      let cls = 'lp-indent-line'
      if (calloutLevel) {
        if (calloutLevel >= 2) {
          cls += ' lp-callout-nested'
          for (let k = 1; k <= calloutLevel - 1; k++) bar('var(--accent)', k - 1, 3)
          bar('var(--callout-accent)', calloutLevel - 1, 4)
          layers.push('linear-gradient(var(--surface-2),var(--surface-2))')
          positions.push(`calc(${calloutLevel - 1}em + 4px) 0`)
          sizes.push(`calc(100% - ${calloutLevel - 1}em - 4px) 100%`)
        }
        for (let k = calloutLevel + 1; k <= quoteLevel; k++) bar('var(--accent)', k - 1, 3)
      } else {
        for (let k = 2; k <= quoteLevel; k++) bar('var(--accent)', k - 1, 3)
      }
      let style = `padding-left: ${em}em`
      if (layers.length > 0) {
        style += `;background-image:${layers.join(',')};background-position:${positions.join(',')};background-size:${sizes.join(',')};background-repeat:no-repeat`
      }
      ranges.push(
        Decoration.line({ class: cls, attributes: { style } }).range(line.from)
      )
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

  // --- 6. Post-iterate text pass (inactive lines only) -----------------------
  const inOpaque = (pos: number, end: number): boolean =>
    opaque.some((r) => pos >= r.from && end <= r.to) ||
    htmlPairs.some((r) => pos >= r.from && end <= r.to)
  const ENTITY_RE = /&(?:[a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#[xX][0-9a-fA-F]+);/g
  const REF_LINK_RE = /\[([^\]\n]+)\]\[([^\]\n]*)\]/g
  for (let n = 1; n <= lineCount; n++) {
    if (activeLines.has(n)) continue
    const line = doc.line(n)
    // HTML entity → glyph widget (outside code/HTML/opaque spans).
    ENTITY_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = ENTITY_RE.exec(line.text)) !== null) {
      const abs = line.from + m.index
      if (inOpaque(abs, abs + m[0].length)) continue
      pushReplace(ranges, doc, abs, abs + m[0].length, { widget: new EntityWidget(m[0]) })
    }
    // Reference links the parser left as plain text (`[text][label]`).
    REF_LINK_RE.lastIndex = 0
    while ((m = REF_LINK_RE.exec(line.text)) !== null) {
      const abs = line.from + m.index
      const end = abs + m[0].length
      if (inOpaque(abs, end)) continue
      const def = linkDefs.byLabel.get((m[2] || m[1]).toLowerCase())
      if (!def) continue
      pushReplace(ranges, doc, abs, end, {
        widget: new LinkAnchorWidget(def.url, m[1], 'lp-link lp-link-anchor')
      })
    }
  }
  // Link-definition lines render nothing on inactive lines.
  for (const def of linkDefs.defs) {
    if (!activeLines.has(def.line)) {
      const line = doc.line(def.line)
      pushReplace(ranges, doc, line.from, line.to)
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
// Table block widget — pre-rendered by the shared serializer (alignment,
// inline formatting, reference links) so it matches Reading/Export exactly.
class TableWidget extends WidgetType {
  constructor(readonly html: string) { super() }
  /** Header + rows × row height — estimate until measured (jiggle fix). */
  override get estimatedHeight(): number {
    const rows = (this.html.match(/<tr>/g) ?? []).length
    return rows * 35 + 16
  }
  override eq(o: TableWidget): boolean { return o.html === this.html }
  override toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'lp-table-wrap'
    wrap.innerHTML = this.html
    return wrap
  }
  override ignoreEvent(): boolean { return false }
}

// Block decorations for Tables, HorizontalRules, and Images.
// These MUST be a StateField — CM6 forbids block decorations from ViewPlugins.
// Rendered-height memo for images (keyed by src): once an image has loaded
// anywhere in the session, every later mount estimates at its real height, so
// virtualized remounts don't change the doc height (scrollbar jiggle fix).
const imgHeightMemo = new Map<string, number>()
class ImageBlockWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) { super() }
  override get estimatedHeight(): number { return imgHeightMemo.get(this.src) ?? -1 }
  override eq(o: ImageBlockWidget): boolean { return o.src === this.src }
  override toDOM(view: EditorView): HTMLElement {
    const img = document.createElement('img')
    img.src = this.src
    img.alt = this.alt
    img.style.maxWidth = '100%'
    img.style.borderRadius = '8px'
    img.style.padding = '1em 0'
    img.style.display = 'block'
    img.addEventListener('load', () => {
      const h = img.offsetHeight
      if (h > 0 && imgHeightMemo.get(this.src) !== h) {
        imgHeightMemo.set(this.src, h)
        view.requestMeasure()
      }
    })
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
  const fullText = doc.sliceString(0)
  const linkDefs = collectLinkDefs(fullText)
  // Footnote collection for the definitions-hiding + section widget.
  const fnOrder: string[] = []
  const fnDefs = new Map<string, string>()
  tree.iterate({
    enter(n) {
      if (n.name === 'FootnoteRef') {
        const id = doc.sliceString(n.from + 2, n.to - 1)
        if (!fnOrder.includes(id)) fnOrder.push(id)
      }
      if (n.name === 'FootnoteDef') {
        const raw = doc.sliceString(n.from, n.to)
        const rm = raw.match(/^\[\^([\w-]+)\]:\s*/)
        if (rm) fnDefs.set(rm[1], raw.slice(rm[0].length))
      }
    }
  })
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
          const html = node.node
            ? renderTableHtml(node.node, fullText, linkDefs)
            : '<table></table>'
          const replaceTo = doc.lineAt(node.to).to
          ranges.push(Decoration.replace({ block: true, widget: new TableWidget(html) }).range(node.from, replaceTo))
        }
      }
      // Frontmatter → properties-table block widget (same HTML as export).
      if (node.name === 'Frontmatter' && node.from < node.to) {
        const firstLineNum = doc.lineAt(node.from).number
        const lastLineNum = doc.lineAt(node.to).number
        let anyActive = false
        for (let n = firstLineNum; n <= lastLineNum; n++) {
          if (activeLines.has(n)) { anyActive = true; break }
        }
        if (!anyActive) {
          const replaceTo = doc.lineAt(node.to).to
          ranges.push(
            Decoration.replace({ block: true, widget: new FrontmatterWidget(doc.sliceString(node.from, node.to)) }).range(node.from, replaceTo)
          )
        }
      }
      // Footnote definitions: hidden here; rendered once in the section widget.
      if (node.name === 'FootnoteDef' && node.from < node.to) {
        const firstLineNum = doc.lineAt(node.from).number
        const lastLineNum = doc.lineAt(node.to).number
        let anyActive = false
        for (let n = firstLineNum; n <= lastLineNum; n++) {
          if (activeLines.has(n)) { anyActive = true; break }
        }
        if (!anyActive) {
          const replaceTo = doc.lineAt(node.to).to
          ranges.push(Decoration.replace({ block: true, widget: BLANK_BLOCK }).range(node.from, replaceTo))
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
  // Footnotes section at the document end (ref-order numbering, back-links).
  if (fnOrder.length > 0) {
    const items = fnOrder.map((id, i) => {
      const body = (fnDefs.get(id) ?? '')
        .split('\n')
        .map((l) => l.replace(/^ {4}/, '').replace(/^\t/, ''))
        .join('\n')
        .trim()
      return { id, num: i + 1, bodyHtml: renderInlineMarkdownText(body, linkDefs) }
    })
    ranges.push(
      Decoration.widget({ block: true, widget: new FootnotesSectionWidget(items), side: 1 }).range(doc.length)
    )
  }
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

/** Click handler (reading mode): anchors open externally; wikilinks open the
 *  target note or scroll to the heading; task checkboxes toggle (their own
 *  widget handles the click). */
function readingClickHandler(ctx: LpCtx): Extension {
  return EditorView.domEventHandlers({
    click(event, view) {
      if (!view.state.facet(readingModeFacet)) return false
      const target = event.target as HTMLElement | null

      // Real anchor widgets (links, autolinks) — data-href attribute.
      const anchorEl = target?.closest<HTMLElement>('.lp-link-anchor')
      if (anchorEl) {
        const href = anchorEl.getAttribute('data-href')
        if (href) {
          window.open(href, '_blank', 'noopener,noreferrer')
          return true
        }
      }

      // Wikilinks — open the resolved note, or scroll to a heading in-place.
      const wikiEl = target?.closest<HTMLElement>('.lp-wikilink-chip')
      if (wikiEl) {
        const wikiTarget = wikiEl.getAttribute('data-target') ?? ''
        const hash = wikiTarget.indexOf('#')
        const file = (hash >= 0 ? wikiTarget.slice(0, hash) : wikiTarget).trim()
        const subpath = hash >= 0 ? wikiTarget.slice(hash + 1) : ''
        if (!file) {
          // Same-note heading link: scroll this doc to the heading.
          const off = headingOffset(view.state.doc.sliceString(0), subpath)
          if (off >= 0) {
            view.dispatch({ selection: { anchor: off }, effects: EditorView.scrollIntoView(off, { y: 'start' }) })
            return true
          }
        } else if (ctx.onOpenNote) {
          const path = wikiEl.getAttribute('data-path')
          if (path) {
            ctx.onOpenNote(path)
            return true
          }
          void resolveTargetPath(wikiTarget, ctx).then((p) => {
            if (p) ctx.onOpenNote?.(p)
          })
          return true
        }
      }

      // Fallback: legacy link/url marks — resolve href from the tree.
      const linkEl = target?.closest('.lp-link, .lp-url')
      if (linkEl) {
        const pos = view.posAtDOM(linkEl)
        const url = linkUrlAt(view.state, pos)
        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer')
          return true
        }
      }
      return false
    }
  })
}

export interface LivePreviewOpts {
  docDir?: string
  dark?: boolean
  reading?: boolean
  /** Absolute workspace root — enables embed/wikilink Resolution. */
  workspace?: string
  /** Absolute path of this document (embed cycle guard). */
  docPath?: string
  /** Reading-mode navigation: open a resolved note path. */
  onOpenNote?: (path: string) => void
}

export function livePreviewPlugin(opts: LivePreviewOpts = {}): Extension {
  const reading = opts.reading ?? false
  const ctx: LpCtx = {
    docDir: opts.docDir,
    dark: opts.dark ?? false,
    workspace: opts.workspace,
    docPath: opts.docPath,
    onOpenNote: opts.onOpenNote
  }
  return Prec.lowest([
    readingModeFacet.of(reading),
    reading ? readingClickHandler(ctx) : [],
    blockDecorations(ctx),
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet
        private unwatchVisibility: (() => void) | undefined
        constructor(view: EditorView) {
          this.decorations = buildDecorations(view, ctx)
          // Hidden windows never fire rAF, which stalls CodeMirror's viewport
          // measurement loop (large cm-gap spacers swallow the document).
          // Force a re-measure whenever the window becomes visible again.
          const onVis = (): void => { view.requestMeasure() }
          document.addEventListener('visibilitychange', onVis)
          this.unwatchVisibility = () => document.removeEventListener('visibilitychange', onVis)
        }
        update(update: ViewUpdate): void {
          if (update.docChanged || update.selectionSet || update.focusChanged || update.viewportChanged) {
            this.decorations = buildDecorations(update.view, ctx)
          }
        }
        destroy(): void {
          this.unwatchVisibility?.()
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
