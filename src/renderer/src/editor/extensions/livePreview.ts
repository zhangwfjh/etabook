import {
  type DecorationSet,
  Decoration,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  EditorView
} from '@codemirror/view'
import { Prec, type Extension, type EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { resolveAsset } from '@renderer/lib/fs'

/**
 * Live Preview — Obsidian/Typora-style render-in-place.
 *
 * Walks the Lezer markdown tree and emits decorations that:
 *  - HIDE markup (`#`, `**`, `` ` ``, `>`, `[]()`) on lines WITHOUT the cursor;
 *  - MARK rendered spans (headings, bold, italic, code chips, quotes, links);
 *  - WIDGET-replace list markers, task checkboxes, images, thematic breaks.
 *
 * Rebuilt only when doc/selection/viewport changes (performance gate, per plan).
 */

// Doc dir is passed via the plugin factory; stored module-level so the
// builder reads it without plumbing it through every call.
let currentDocDir: string | undefined

class LivePreviewPlugin {
  decorations: DecorationSet
  constructor(view: EditorView) {
    this.decorations = buildDecorations(view)
  }
  update(update: ViewUpdate): void {
    if (update.docChanged || update.selectionSet || update.viewportChanged) {
      this.decorations = buildDecorations(update.view)
    }
  }
}

function cursorOnLine(state: EditorState, from: number, to: number): boolean {
  const lineFrom = state.doc.lineAt(from).from
  const lineTo = state.doc.lineAt(to).to
  for (const range of state.selection.ranges) {
    if (range.from <= lineTo && range.to >= lineFrom) return true
  }
  return false
}

// --- Widgets -----------------------------------------------------------------

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
    input.className = 'lp-task'
    input.addEventListener('mousedown', (e) => e.preventDefault())
    input.addEventListener('change', () => {
      const mark = this.checked ? '[x]' : '[ ]'
      const next = this.checked ? '[ ]' : '[x]'
      view.dispatch({ changes: { from: this.pos, to: this.pos + mark.length, insert: next } })
    })
    return input
  }
  override ignoreEvent(): boolean {
    return false
  }
}

class ListBulletWidget extends WidgetType {
  constructor(readonly text: string) {
    super()
  }
  override eq(o: ListBulletWidget): boolean {
    return o.text === this.text
  }
  override toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'lp-list-bullet'
    span.textContent = this.text
    return span
  }
}

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) {
    super()
  }
  override eq(o: ImageWidget): boolean {
    return o.src === this.src
  }
  override toDOM(): HTMLElement {
    const img = document.createElement('img')
    img.src = this.src
    img.alt = this.alt
    img.className = 'lp-image'
    img.style.maxWidth = '100%'
    img.style.borderRadius = '6px'
    img.style.display = 'block'
    img.style.margin = '0.5em 0'
    return img
  }
}

class HrWidget extends WidgetType {
  override toDOM(): HTMLElement {
    const hr = document.createElement('hr')
    hr.className = 'lp-hr'
    return hr
  }
}

// --- Decoration builder ------------------------------------------------------

type DecoSpec = {
  from: number
  to: number
  value: ReturnType<typeof Decoration.mark> | ReturnType<typeof Decoration.replace> | ReturnType<typeof Decoration.widget>
}

const MARKUP_MARKS = new Set([
  'HeaderMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'QuoteMark',
  'LinkMark'
])

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view
  const docDir = currentDocDir
  const decos: DecoSpec[] = []

  // Heading nodes are named ATXHeading1..6 / SetextHeading1..2; derive level.
  const headingLevelClass = (nodeName: string): string => {
    const m = nodeName.match(/Heading([1-6])/)
    return `lp-h${m ? m[1] : 1}`
  }

  for (const range of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: range.from,
      to: range.to,
      enter(node) {
        const name = node.name
        const from = node.from
        const to = node.to

        if (/^(ATX|Setext)Heading[1-6]$/.test(name)) {
          decos.push({ from, to, value: Decoration.mark({ class: `lp-heading ${headingLevelClass(name)}` }) })
          return
        }

        // Hide markup marks (#, **, `, >, []) unless the cursor is on this line.
        if (MARKUP_MARKS.has(name) && !cursorOnLine(state, from, to)) {
          decos.push({ from, to, value: Decoration.replace({}) })
          return
        }

        if (name === 'StrongEmphasis') decos.push({ from, to, value: Decoration.mark({ class: 'lp-strong' }) })
        if (name === 'Emphasis') decos.push({ from, to, value: Decoration.mark({ class: 'lp-em' }) })
        if (name === 'Strikethrough') decos.push({ from, to, value: Decoration.mark({ class: 'lp-strike' }) })
        if (name === 'InlineCode' || name === 'CodeText') decos.push({ from, to, value: Decoration.mark({ class: 'lp-code' }) })
        if (name === 'Link') decos.push({ from, to, value: Decoration.mark({ class: 'lp-link' }) })
        if (name === 'URL') decos.push({ from, to, value: Decoration.mark({ class: 'lp-url' }) })
        if (name === 'Blockquote') decos.push({ from, to, value: Decoration.mark({ class: 'lp-quote' }) })

        if (name === 'ListMark' && !cursorOnLine(state, from, to)) {
          const text = state.doc.sliceString(from, to)
          if (/^\d+\./.test(text)) {
            decos.push({ from, to, value: Decoration.replace({ widget: new ListBulletWidget(text + ' ') }) })
          } else {
            decos.push({ from, to, value: Decoration.replace({ widget: new ListBulletWidget('• ') }) })
          }
        }

        if (name === 'TaskMarker' && !cursorOnLine(state, from, to)) {
          const text = state.doc.sliceString(from, to)
          const checked = /\[x\]/i.test(text)
          decos.push({ from, to, value: Decoration.replace({ widget: new TaskCheckboxWidget(checked, from) }) })
        }

        if (name === 'HorizontalRule' && !cursorOnLine(state, from, to)) {
          decos.push({ from, to, value: Decoration.replace({ widget: new HrWidget() }) })
        }

        if (name === 'Image' && !cursorOnLine(state, from, to)) {
          let src = ''
          let alt = ''
          // node.node is the full SyntaxNode (has children); SyntaxNodeRef doesn't.
          const full = node.node
          if (full) {
            for (let child = full.firstChild; child; child = child.nextSibling) {
              if (child.name === 'URL') src = state.doc.sliceString(child.from, child.to)
              if (child.name === 'LinkLabel') alt = state.doc.sliceString(child.from, child.to)
            }
          }
          if (!src || !alt) {
            const raw = state.doc.sliceString(from, to)
            const m = raw.match(/^!\[([\s\S]*)\]\(([\s\S]*?)\)$/)
            if (m) {
              if (!alt) alt = m[1]
              if (!src) src = m[2]
            }
          }
          decos.push({ from, to, value: Decoration.replace({ widget: new ImageWidget(resolveAsset(src, docDir), alt) }) })
        }
      }
    })
  }
  // Decoration.set sorts internally (input is in tree-walk order, not fully sorted).
  return Decoration.set(decos.map((d) => d.value.range(d.from, d.to)), true)
}

export function livePreviewPlugin(docDir?: string): Extension {
  currentDocDir = docDir
  return Prec.lowest([
    ViewPlugin.fromClass(LivePreviewPlugin, {
      decorations: (v) => v.decorations,
      provide: (plugin) =>
        EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none)
    })
  ])
}
