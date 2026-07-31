import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import DOMPurify from 'dompurify'
import katex from 'katex'
import { highlightCode, type ShikiTheme } from './shiki'

/**
 * Reading-mode + export renderer.
 * Pipeline: markdown-it (GFM, task lists, footnotes) → KaTeX math → Shiki code → DOMPurify.
 *
 * Shiki is async, so `renderMarkdown` is async. We use a placeholder strategy:
 * code blocks are pre-highlighted synchronously-ish via the awaited singleton,
 * then markdown-it assembles the full HTML.
 */

let mdInstance: MarkdownIt | null = null
let currentTheme: ShikiTheme = 'light'

export async function renderMarkdown(src: string, theme: ShikiTheme = 'light'): Promise<string> {
  currentTheme = theme
  if (!mdInstance) {
    mdInstance = new MarkdownIt({
      html: false,
      linkify: true,
      typographer: true,
      breaks: false,
      highlight: (code, lang) => {
        // markdown-it highlight is sync; Shiki is async. We pre-render code
        // via a sync-in-process fallback (escaped <pre>) and post-process
        // asynchronously below for theme-correct Shiki output.
        return `<pre class="shiki-pending" data-lang="${escapeAttr(lang)}"><code>${escapeHtml(code)}</code></pre>`
      }
    })
      .use(taskLists, { enabled: true, label: true })
      .use(footnote)
      // KaTeX math via a lightweight inline/block rule.
      .use(mathPlugin)
  }

  let html = mdInstance.render(src)

  // Async Shiki pass: replace each pending code block with highlighted HTML.
  html = await highlightPendingCodeBlocks(html)

  // Sanitize before injection (plan mandates DOMPurify).
  const clean = DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'data-lang'],
    ADD_TAGS: ['span']
  })
  return clean
}

async function highlightPendingCodeBlocks(html: string): Promise<string> {
  const re = /<pre class="shiki-pending" data-lang="([^"]*)"><code>([\s\S]*?)<\/code><\/pre>/g
  const matches = Array.from(html.matchAll(re))
  if (matches.length === 0) return html
  const highlighted = await Promise.all(
    matches.map(async (m) => {
      const lang = unescapeAttr(m[1])
      const code = unescapeHtml(m[2])
      return highlightCode(code, lang, currentTheme)
    })
  )
  let i = 0
  return html.replace(re, () => highlighted[i++] ?? '')
}

// --- minimal KaTeX math plugin (renders $...$ and $$...$$) -------------------

function mathPlugin(md: MarkdownIt): void {
  // Block math $$...$$
  md.block.ruler.before(
    'fence',
    'math_block',
    (state, startLine, endLine, silent) => {
      const start = state.bMarks[startLine] + state.tShift[startLine]
      if (state.src.slice(start, start + 2) !== '$$') return false
      if (silent) return true
      // find closing $$
      let end = start + 2
      while (end < state.src.length && state.src.slice(end, end + 2) !== '$$') end++
      const content = state.src.slice(start + 2, end)
      const token = state.push('math_block', 'div', 0)
      token.content = content
      token.markup = '$$'
      token.map = [startLine, endLine]
      state.line = endLine + 1
      return true
    }
  )
  md.renderer.rules.math_block = (tokens, idx) =>
    `<div class="math math-display">${katexRender(tokens[idx].content, true)}</div>`

  // Inline math $...$
  md.inline.ruler.before('emphasis', 'math_inline', (state, silent) => {
    if (state.src[state.pos] !== '$') return false
    const start = state.pos + 1
    let end = start
    while (end < state.posMax && state.src[end] !== '$') end++
    if (end >= state.posMax) return false
    if (silent) return true
    const token = state.push('math_inline', 'math', 0)
    token.content = state.src.slice(start, end)
    token.markup = '$'
    state.pos = end + 1
    return true
  })
  md.renderer.rules.math_inline = (tokens, idx) =>
    `<span class="math math-inline">${katexRender(tokens[idx].content, false)}</span>`
}

// KaTeX renders math synchronously; throws are caught and fall back to text.
const katexRender = (tex: string, displayMode: boolean): string => {
  try {
    return katex.renderToString(tex, { displayMode, throwOnError: false })
  } catch {
    return escapeHtml(tex)
  }
}

// --- escape helpers ----------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
function unescapeHtml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;')
}
function unescapeAttr(s: string): string {
  return s.replace(/&quot;/g, '"')
}
