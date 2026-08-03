/**
 * Lezer-tree → HTML serializer for export.
 *
 * Replaces the markdown-it pipeline. The same parsed tree that drives the
 * on-screen decorations drives export, so Live == Reading == Export
 * (single-renderer unification). Emits clean semantic HTML:
 * `<h1>`, `<p>`, `<pre><code>`, `<table>`, KaTeX math, etc.
 */

import { parser, GFM } from '@lezer/markdown'
import type { SyntaxNode } from '@lezer/common'
import { mathExtension } from './math'
import { renderMath, extractTex } from './katex'
import { highlightCodeToHtml, resolveCodeParser, codeHighlightCss } from './highlight'

const markdownParser = parser.configure([GFM, mathExtension])

// Mark / delimiter nodes that are structural only — produce no HTML.
const SKIP_NODES = new Set([
  'HeaderMark', 'EmphasisMark', 'CodeMark', 'CodeInfo', 'LinkMark',
  'LinkTitle', 'StrikethroughMark', 'QuoteMark', 'ListMark',
  'TaskMarker', 'TableDelimiter', 'URL'
])

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

/** Render the inline content of a node — text gaps + child nodes, skipping marks. */
function renderInline(node: SyntaxNode, src: string): string {
  let html = ''
  let pos = node.from
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.from > pos) html += esc(src.slice(pos, c.from))
    html += renderInlineNode(c, src)
    pos = c.to
  }
  if (pos < node.to) html += esc(src.slice(pos, node.to))
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

/** Serialize a markdown source string to semantic HTML body content. */
export async function serializeToHtml(src: string): Promise<string> {
  const tree = markdownParser.parse(src)
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
      case 'Blockquote':
        parts.push(`<blockquote>${renderBlocks(node, src).trim()}</blockquote>`)
        break
      case 'FencedCode':
      case 'IndentedCode': {
        const codeNode = child(node, 'CodeText')
        const code = codeNode ? src.slice(codeNode.from, codeNode.to) : ''
        const infoNode = child(node, 'CodeInfo')
        const lang = infoNode ? src.slice(infoNode.from, infoNode.to).trim() : ''
        const codeParser = await resolveCodeParser(lang)
        parts.push(highlightCodeToHtml(code, codeParser))
        break
      }
      case 'HorizontalRule':
        parts.push('<hr>')
        break
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
  return parts.join('\n')
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
