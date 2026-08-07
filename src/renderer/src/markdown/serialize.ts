/**
 * Lezer-tree → HTML serializer for export.
 *
 * Replaces the markdown-it pipeline. The same parsed tree that drives the
 * on-screen decorations drives export, so Live == Reading == Export
 * (single-renderer unification). Emits clean semantic HTML:
 * `<h1>`, `<p>`, `<pre><code>`, `<table>`, KaTeX math, etc.
 */

import { parser, GFM, Subscript, Superscript, Emoji } from '@lezer/markdown'
import type { SyntaxNode } from '@lezer/common'
import { mathExtension } from './math'
import { renderMath, extractTex } from './katex'
import { resolveEmoji } from './emoji'
import { highlightCodeToHtml, resolveCodeParser, codeHighlightCss } from './highlight'
import { renderMermaid } from './mermaid'
import { obsidianExtension } from './obsidian'
import { calloutMeta } from './callout'

// MUST match the editor's parser (markdownLanguage = GFM + Subscript +
// Superscript + Emoji, plus the math + Obsidian extensions) so Live == Reading == Export.
const markdownParser = parser.configure([GFM, Subscript, Superscript, Emoji, mathExtension, obsidianExtension])

// Mark / delimiter nodes that are structural only — produce no HTML.
// `URL` is intentionally NOT skipped — bare/angle autolinks render via the
// `URL` case below (a Link's destination URL is suppressed there by parent check).
const SKIP_NODES = new Set([
  'HeaderMark', 'EmphasisMark', 'CodeMark', 'CodeInfo', 'LinkMark',
  'LinkTitle', 'StrikethroughMark', 'QuoteMark', 'ListMark',
  'TaskMarker', 'TableDelimiter', 'SubscriptMark', 'SuperscriptMark'
])

// Footnote id → display number, populated per serializeToHtml pass.
let activeFootnotes: Map<string, number> | null = null

// Callout first line:  > [!type] optional title
const CALLOUT_RE = /^>\s*\[!([\w-]+)\]\s*(.*)$/
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** Find a direct child of `node` by name; null if absent. */
function child(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let c = node.firstChild; c; c = c.nextSibling) if (c.name === name) return c
  return null
}

/** Render the inline content of `node` (text gaps + child nodes), skipping
 * marks. `from`/`to` default to the node bounds and let callers skip
 * surrounding delimiters (e.g. `==highlight==`). */
function renderInline(node: SyntaxNode, src: string, from: number = node.from, to: number = node.to): string {
  let html = ''
  let pos = from
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.to <= from || c.from >= to) continue
    if (c.from > pos) html += esc(src.slice(pos, c.from))
    html += renderInlineNode(c, src)
    pos = c.to
  }
  if (pos < to) html += esc(src.slice(pos, to))
  return html
}
function renderInlineNode(node: SyntaxNode, src: string): string {
  const { name } = node
  if (SKIP_NODES.has(name)) return ''

  switch (name) {
    case 'StrongEmphasis':
      return `<strong>${renderInline(node, src)}</strong>`
    case 'Emphasis':
      return `<em>${renderInline(node, src)}</em>`
    case 'InlineCode':
      return `<code>${esc(src.slice(node.from + 1, node.to - 1))}</code>`
    case 'Strikethrough':
      return `<del>${renderInline(node, src)}</del>`
    case 'Subscript':
      return `<sub>${renderInline(node, src)}</sub>`
    case 'Superscript':
      return `<sup>${renderInline(node, src)}</sup>`
    case 'Emoji': {
      // Node spans `:name:`; strip the colons and resolve the shortcode.
      const name = src.slice(node.from + 1, node.to - 1)
      return esc(resolveEmoji(name))
    }
    case 'HardBreak':
      return '<br>'
    case 'HTMLTag':
      // Inline raw HTML — GFM/CommonMark pass it through verbatim.
      return src.slice(node.from, node.to)
    case 'URL': {
      // Bare/angle autolinks. Inside a Link this is the destination, already
      // emitted on the <a href>, so suppress it here to avoid duplication.
      if (node.parent?.name === 'Link') return ''
      const raw = src.slice(node.from, node.to)
      const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw)
      const href = hasScheme ? raw : `mailto:${raw}`
      return `<a href="${escAttr(href)}">${esc(raw)}</a>`
    }
    case 'Link': {
      const urlNode = child(node, 'URL')
      const url = urlNode ? escAttr(src.slice(urlNode.from, urlNode.to)) : ''
      return `<a href="${url}">${renderInline(node, src)}</a>`
    }
    case 'Image': {
      const raw = src.slice(node.from, node.to)
      const m = raw.match(/^!\[([\s\S]*)\]\(([\s\S]*?)\)$/)
      const url = m ? escAttr(m[2]) : ''
      const alt = m ? esc(m[1]) : ''
      return `<img src="${url}" alt="${alt}">`
    }
    case 'InlineMath':
      return `<span class="math math-inline">${renderMath(extractTex(src.slice(node.from, node.to)), false)}</span>`
    case 'Highlight':
      return `<mark>${renderInline(node, src, node.from + 2, node.to - 2)}</mark>`
    case 'Comment':
      return '' // %%hidden%% in reading/export
    case 'Tag': {
      const label = src.slice(node.from, node.to) // includes leading #
      return `<a class="ofm-tag" href="#">${esc(label)}</a>`
    }
    case 'WikiLink': {
      const inner = src.slice(node.from + 2, node.to - 2)
      const { target, display } = parseWikiInner(inner)
      return `<a class="ofm-wikilink" data-target="${escAttr(target)}" href="#">${esc(display)}</a>`
    }
    case 'Embed': {
      const target = src.slice(node.from + 3, node.to - 2)
      if (IMAGE_EXT_RE.test(target)) {
        return `<img class="ofm-embed" src="${escAttr(target)}" alt="${escAttr(target)}">`
      }
      return `<a class="ofm-embed ofm-embed-ref" data-target="${escAttr(target)}" href="#">📄 ${esc(target)}</a>`
    }
    case 'FootnoteRef': {
      const id = src.slice(node.from + 2, node.to - 1)
      const n = activeFootnotes?.get(id)
      if (n === undefined) return esc(src.slice(node.from, node.to))
      return `<sup class="ofm-fn-ref"><a href="#fn-${escAttr(id)}" id="fnref-${escAttr(id)}">${n}</a></sup>`
    }
    default:
      return renderInline(node, src)
  }
}

function renderTableRow(row: SyntaxNode, src: string, tag: 'td' | 'th'): string {
  const cells: string[] = []
  for (let c = row.firstChild; c; c = c.nextSibling) {
    if (c.name === 'TableCell') {
      cells.push(`<${tag}>${renderInline(c, src)}</${tag}>`)
    }
  }
  return `<tr>${cells.join('')}</tr>`
}

/** Render block children of a container (e.g., blockquote). */
function renderBlocks(parent: SyntaxNode, src: string): string {
  const parts: string[] = []
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    switch (node.name) {
      case 'Paragraph':
        parts.push(`<p>${renderInline(node, src)}</p>`)
        break
      case 'ATXHeading1': parts.push(`<h1>${renderInline(node, src)}</h1>`); break
      case 'ATXHeading2': parts.push(`<h2>${renderInline(node, src)}</h2>`); break
      case 'ATXHeading3': parts.push(`<h3>${renderInline(node, src)}</h3>`); break
      case 'BulletList':
      case 'OrderedList': {
        const ordered = node.name === 'OrderedList'
        const items: string[] = []
        for (let li = node.firstChild; li; li = li.nextSibling) {
          if (li.name === 'ListItem') items.push(`<li>${renderListItemContent(li, src)}</li>`)
        }
        parts.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`)
        break
      }
      default:
        if (!SKIP_NODES.has(node.name)) parts.push(renderInline(node, src))
    }
  }
  return parts.join('\n')
}

function renderListItemContent(node: SyntaxNode, src: string): string {
  const parts: string[] = []
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'Paragraph') parts.push(renderInline(c, src))
    else if (!SKIP_NODES.has(c.name) && c.name !== 'ListMark') parts.push(renderInlineNode(c, src))
  }
  return parts.join(' ')
}

function renderTable(node: SyntaxNode, src: string): string {
  const rows: string[] = []
  for (let r = node.firstChild; r; r = r.nextSibling) {
    if (r.name === 'TableHeader') rows.push(renderTableRow(r, src, 'th'))
    else if (r.name === 'TableRow') rows.push(renderTableRow(r, src, 'td'))
  }
  return `<table>${rows.join('')}</table>`
}

/** Split a `[[target|alias]]` / `[[target#head]]` inner string into target + display. */
function parseWikiInner(inner: string): { target: string; display: string } {
  const pipe = inner.indexOf('|')
  let target: string, alias: string | undefined
  if (pipe >= 0) { target = inner.slice(0, pipe); alias = inner.slice(pipe + 1) }
  else { target = inner }
  let display = alias ?? target
  if (!alias) {
    const h = target.indexOf('#')
    if (h === 0) display = target.slice(1) || target // [[#Heading]] → Heading
    else if (h > 0) display = target.slice(0, h)      // [[Note#Head]] → Note
  }
  return { target, display }
}
/** Render a `---\n…\n---` frontmatter block as a properties table. */
function renderFrontmatter(raw: string): string {
  const lines = raw.split('\n').filter((l) => l && l !== '---' && l !== '...')
  const rows = lines.map((l) => {
    const ci = l.indexOf(':')
    const key = ci >= 0 ? l.slice(0, ci).trim() : l.trim()
    const val = ci >= 0 ? l.slice(ci + 1).trim() : ''
    return `<tr><th>${esc(key)}</th><td>${esc(val)}</td></tr>`
  })
  return `<div class="ofm-frontmatter"><table>${rows.join('')}</table></div>`
}

/** Render a callout (`> [!type] title` blockquote) as a titled, typed card with icon. */
function renderCallout(node: SyntaxNode, src: string): string {
  const raw = src.slice(node.from, node.to)
  const lines = raw.split('\n')
  const m = (lines[0] || '').match(CALLOUT_RE)
  if (!m) return `<blockquote>${renderBlocks(node, src).trim()}</blockquote>`
  const meta = calloutMeta(m[1])
  const title = m[2].trim()
  const titleHtml = esc(title || meta.defaultTitle)
  // Body = remaining lines with the leading `>` (and optional space) stripped.
  const body = lines.slice(1).map((l) => l.replace(/^>\s?/, '')).join('\n')
  const sub = markdownParser.parse(body)
  const bodyHtml = renderBlocks(sub.topNode, body).trim()
  return `<div class="ofm-callout ofm-callout-${escAttr(meta.type)}">` +
    `<div class="ofm-callout-title">${meta.icon}<span>${titleHtml}</span></div>` +
    `<div class="ofm-callout-body">${bodyHtml}</div></div>`
}

/** Serialize a markdown source string to semantic HTML body content.
 *  `dark` selects the Mermaid theme (diagrams are pre-rendered to SVG). */
export async function serializeToHtml(src: string, dark = false): Promise<string> {
  const tree = markdownParser.parse(src)

  // Footnote pass: collect definitions in document order, number them, and
  // expose the map to FootnoteRef rendering via the module-level state.
  const fnDefs: { id: string; body: string }[] = []
  tree.iterate({
    enter(n) {
      if (n.name === 'FootnoteDef') {
        const rm = src.slice(n.from, n.to).match(/^\[\^([\w-]+)\]:\s*([\s\S]*)$/)
        if (rm) fnDefs.push({ id: rm[1], body: rm[2] })
      }
    }
  })
  const fnMap = new Map<string, number>()
  fnDefs.forEach((f, i) => fnMap.set(f.id, i + 1))
  activeFootnotes = fnMap

  const parts: string[] = []

  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    switch (node.name) {
      case 'ATXHeading1': parts.push(`<h1>${renderInline(node, src).trim()}</h1>`); break
      case 'ATXHeading2': parts.push(`<h2>${renderInline(node, src).trim()}</h2>`); break
      case 'ATXHeading3': parts.push(`<h3>${renderInline(node, src).trim()}</h3>`); break
      case 'ATXHeading4': parts.push(`<h4>${renderInline(node, src).trim()}</h4>`); break
      case 'ATXHeading5': parts.push(`<h5>${renderInline(node, src).trim()}</h5>`); break
      case 'ATXHeading6': parts.push(`<h6>${renderInline(node, src).trim()}</h6>`); break
      case 'SetextHeading1': parts.push(`<h1>${renderInline(node, src).trim()}</h1>`); break
      case 'SetextHeading2': parts.push(`<h2>${renderInline(node, src).trim()}</h2>`); break
      case 'Paragraph': parts.push(`<p>${renderInline(node, src)}</p>`); break
      case 'BulletList':
      case 'OrderedList': {
        const ordered = node.name === 'OrderedList'
        const items: string[] = []
        for (let li = node.firstChild; li; li = li.nextSibling) {
          if (li.name !== 'ListItem') continue
          const task = child(li, 'Task')
          if (task) {
            const marker = child(task, 'TaskMarker')
            const checked = marker ? /\[x\]/i.test(src.slice(marker.from, marker.to)) : false
            items.push(
              `<li class="task-list-item"><input type="checkbox" disabled${checked ? ' checked' : ''}>${renderInline(task, src)}</li>`
            )
          } else {
            items.push(`<li>${renderListItemContent(li, src)}</li>`)
          }
        }
        parts.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`)
        break
      }
      case 'Blockquote': {
        // Callout: first line matches `> [!type]`. Else a normal blockquote.
        const firstLine = src.slice(node.from, node.to).split('\n')[0] || ''
        if (CALLOUT_RE.test(firstLine)) parts.push(renderCallout(node, src))
        else parts.push(`<blockquote>${renderBlocks(node, src).trim()}</blockquote>`)
        break
      }
      case 'FencedCode':
      case 'CodeBlock': { // indented code is the `CodeBlock` node (NOT `IndentedCode`)
        // A CodeBlock holds one CodeText child per source line; concatenate all.
        let code = ''
        for (let c = node.firstChild; c; c = c.nextSibling) {
          if (c.name === 'CodeText') code += src.slice(c.from, c.to)
        }
        const infoNode = child(node, 'CodeInfo')
        const lang = infoNode ? src.slice(infoNode.from, infoNode.to).trim() : ''
        if (lang.toLowerCase() === 'mermaid') {
          parts.push(`<div class="ofm-mermaid">${await renderMermaid(code, dark)}</div>`)
        } else {
          const codeParser = await resolveCodeParser(lang)
          parts.push(highlightCodeToHtml(code, codeParser))
        }
        break
      }
      case 'HTMLBlock':
      case 'CommentBlock':
        // Raw HTML — GFM/CommonMark pass it through verbatim.
        parts.push(src.slice(node.from, node.to))
        break
      case 'HorizontalRule':
        parts.push('<hr>')
        break
      case 'Frontmatter':
        parts.push(renderFrontmatter(src.slice(node.from, node.to)))
        break
      case 'FootnoteDef':
        break // rendered in the footnotes section at the end
      case 'Table':
        parts.push(renderTable(node, src))
        break
      case 'BlockMath':
        parts.push(`<div class="math math-display">${renderMath(extractTex(src.slice(node.from, node.to)), true)}</div>`)
        break
      default:
        parts.push(renderInline(node, src))
    }
  }
  let out = parts.join('\n')
  if (fnDefs.length) {
    const items = fnDefs
      .map((f) => `<li id="fn-${escAttr(f.id)}">${esc(f.body)} <a href="#fnref-${escAttr(f.id)}" class="ofm-fn-back">↩</a></li>`)
      .join('')
    out += `\n<section class="ofm-footnotes"><hr><ol>${items}</ol></section>`
  }
  activeFootnotes = null
  return out
}

const EXPORT_CSS = `
:root{--bg:#FBFAF6;--surface:#fff;--surface-2:#F4F2EC;--text:#1F1D1A;--text-muted:#6B665C;--border:#E5E1D6;--accent:#0F6E64;--hl-keyword:#9333EA;--hl-string:#059669;--hl-number:#C2410C;--hl-comment:#94A3B8;--hl-function:#2563EB;--hl-type:#7C3AED;--hl-variable:#1F1D1A;--hl-property:#2563EB;--hl-regexp:#C2410C;--hl-atom:#9333EA;--hl-punctuation:#6B665C}
.dark{--bg:#15161A;--surface:#1C1E24;--surface-2:#131419;--text:#E8E6E1;--text-muted:#9AA0A8;--border:#2A2D35;--accent:#3DD9C6;--hl-keyword:#C792EA;--hl-string:#C3E88D;--hl-number:#F78C6C;--hl-comment:#6A7A82;--hl-function:#82AAFF;--hl-type:#FFCB6B;--hl-variable:#EEFFFF;--hl-property:#82AAFF;--hl-regexp:#F07178;--hl-atom:#C792EA;--hl-punctuation:#89DDFF}
html,body{margin:0;background:var(--bg);color:var(--text);font-family:Fraunces,Georgia,serif;line-height:1.7}
.prose{max-width:70ch;margin:2em auto;padding:0 32px;font-size:1.0625rem}
.prose h1{font-size:2.1em;font-weight:600;margin-top:0.5em;margin-bottom:0.3em}
.prose h2{font-size:1.65em;font-weight:600;border-bottom:1px solid var(--border);padding-bottom:0.2em}
.prose h3{font-size:1.35em;font-weight:600}
.prose h4{font-size:1.15em;font-weight:600}
.prose h5,.prose h6{font-size:1em;color:var(--text-muted)}
.prose p{margin:0.8em 0}
.prose a{color:var(--accent);text-decoration:underline}
.prose strong{font-weight:700}
.prose em{font-style:italic}
.prose del{color:var(--text-muted)}
.prose ul,.prose ol{padding-left:1.6em;margin:0.8em 0}
.prose ul{list-style:disc outside}
.prose ol{list-style:decimal outside}
.prose li{margin:0.25em 0}
.prose .task-list-item{list-style:none;margin-left:-1.6em}
.prose .task-list-item input{margin-right:0.4em}
.prose blockquote{border-left:3px solid var(--accent);padding-left:1em;color:var(--text-muted);font-style:italic;margin:0.8em 0}
.prose code{font-family:JetBrains Mono,ui-monospace,monospace;font-size:0.85em;background:var(--surface-2);padding:0.1em 0.3em;border-radius:3px}
.prose pre{background:var(--surface-2);border-radius:8px;padding:1em;overflow-x:auto;margin:0.8em 0;border:1px solid var(--border)}
.prose pre code{background:none;padding:0;font-size:0.85em}
.prose hr{border:none;border-top:1px solid var(--border);margin:2em 0}
.prose table{border-collapse:collapse;width:100%;margin:0.8em 0}
.prose th,.prose td{border:1px solid var(--border);padding:6px 12px;text-align:left}
.prose th{background:var(--surface-2);font-weight:600}
.prose img{max-width:100%;border-radius:8px}
.prose .math-display{margin:1em 0;text-align:center}
.prose mark{background:rgba(15,110,100,0.10);padding:0.05em 0.15em;border-radius:3px}
.dark .prose mark{background:rgba(61,217,198,0.12)}
.prose .ofm-tag{display:inline-block;padding:0 0.4em;background:var(--surface-2);border:1px solid var(--border);border-radius:999px;color:var(--text-muted);text-decoration:none;font-size:0.82em;font-family:system-ui,sans-serif}
.prose .ofm-wikilink,.prose .ofm-embed-ref{display:inline-block;padding:0 0.4em;background:rgba(15,110,100,0.10);border-radius:4px;color:var(--accent);text-decoration:none;font-size:0.92em;font-family:system-ui,sans-serif}
.dark .prose .ofm-wikilink,.dark .prose .ofm-embed-ref{background:rgba(61,217,198,0.12)}
.prose img.ofm-embed{max-width:100%;border-radius:8px;margin:0.6em 0;display:block}
.prose .ofm-fn-ref{font-size:0.75em;line-height:0}
.prose .ofm-fn-ref a{color:var(--accent);text-decoration:none}
.prose .ofm-footnotes{font-size:0.85em;color:var(--text-muted);margin-top:2em}
.prose .ofm-footnotes ol{padding-left:1.4em}
.prose .ofm-frontmatter{margin:0 0 1.2em;border:1px solid var(--border);border-radius:8px;overflow:hidden;font-family:system-ui,sans-serif;font-size:0.86em}
.prose .ofm-frontmatter table{width:100%;border-collapse:collapse;margin:0}
.prose .ofm-frontmatter th,.prose .ofm-frontmatter td{border:none;border-top:1px solid var(--border);padding:4px 10px;text-align:left}
.prose .ofm-frontmatter tr:first-child th,.prose .ofm-frontmatter tr:first-child td{border-top:none}
.prose .ofm-frontmatter th{color:var(--text-muted);width:30%;font-weight:500}
.prose .ofm-callout{margin:1em 0;border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:6px;background:var(--surface-2);overflow:hidden}
.prose .ofm-callout-title{display:flex;align-items:center;gap:0.4em;font-weight:600;font-family:system-ui,sans-serif;font-size:0.95em;padding:0.5em 1em;color:var(--accent)}
.prose .ofm-callout-title svg{width:16px;height:16px;flex-shrink:0}
.prose .ofm-callout-title span{color:var(--text)}
.prose .ofm-callout-body{padding:0 1em 0.6em}
.prose .ofm-callout-body>:first-child{margin-top:0}
.prose .ofm-callout-body>:last-child{margin-bottom:0}
.prose .ofm-callout-note,.prose .ofm-callout-info,.prose .ofm-callout-abstract,.prose .ofm-callout-summary,.prose .ofm-callout-quote{border-left-color:var(--hl-function)}
.prose .ofm-callout-note .ofm-callout-title,.prose .ofm-callout-info .ofm-callout-title,.prose .ofm-callout-abstract .ofm-callout-title,.prose .ofm-callout-summary .ofm-callout-title,.prose .ofm-callout-quote .ofm-callout-title{color:var(--hl-function)}
.prose .ofm-callout-tip,.prose .ofm-callout-important{border-left-color:#C2410C}
.prose .ofm-callout-tip .ofm-callout-title,.prose .ofm-callout-important .ofm-callout-title{color:#C2410C}
.prose .ofm-callout-success,.prose .ofm-callout-check,.prose .ofm-callout-done{border-left-color:var(--hl-string)}
.prose .ofm-callout-success .ofm-callout-title,.prose .ofm-callout-check .ofm-callout-title,.prose .ofm-callout-done .ofm-callout-title{color:var(--hl-string)}
.prose .ofm-callout-question,.prose .ofm-callout-faq{border-left-color:var(--hl-keyword)}
.prose .ofm-callout-question .ofm-callout-title,.prose .ofm-callout-faq .ofm-callout-title{color:var(--hl-keyword)}
.prose .ofm-callout-warning,.prose .ofm-callout-caution,.prose .ofm-callout-attention{border-left-color:var(--hl-number)}
.prose .ofm-callout-warning .ofm-callout-title,.prose .ofm-callout-caution .ofm-callout-title,.prose .ofm-callout-attention .ofm-callout-title{color:var(--hl-number)}
.prose .ofm-callout-danger,.prose .ofm-callout-error,.prose .ofm-callout-failure,.prose .ofm-callout-bug{border-left-color:#B4341F}
.prose .ofm-callout-danger .ofm-callout-title,.prose .ofm-callout-error .ofm-callout-title,.prose .ofm-callout-failure .ofm-callout-title,.prose .ofm-callout-bug .ofm-callout-title{color:#B4341F}
.prose .ofm-callout-example{border-left-color:var(--hl-type)}
.prose .ofm-callout-example .ofm-callout-title{color:var(--hl-type)}
.prose .ofm-mermaid{margin:1em 0;text-align:center;overflow-x:auto}
.prose .ofm-mermaid svg{max-width:100%;height:auto}
${codeHighlightCss()}
`

/** Build a self-contained HTML document for export (HTML/PDF). */
export function wrapExportDocument(bodyHtml: string, dark: boolean): string {
  return `<!doctype html>
<html lang="en" class="${dark ? 'dark' : ''}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Document</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css">
<style>${EXPORT_CSS}</style>
</head>
<body>
<div class="prose">${bodyHtml}</div>
</body>
</html>`
}
