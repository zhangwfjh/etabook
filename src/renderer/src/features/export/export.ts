import { api } from '@renderer/lib/ipc'
import { renderMarkdown } from '@renderer/reading/render'
import { getHighlighter } from '@renderer/reading/shiki'
import { basename } from '@renderer/lib/fs'
import type { Doc } from '@renderer/lib/store'

// Ensure the shiki singleton is warm before exporting (faster first export).
export async function warmShiki(): Promise<void> {
  await getHighlighter()
}

export async function exportMarkdown(doc: Doc): Promise<void> {
  const defaultName = doc.path ? basename(doc.path) : doc.name
  const savePath = await api().pickSavePath(defaultName.endsWith('.md') ? defaultName : defaultName + '.md')
  if (!savePath) return
  await api().writeFile(savePath, doc.content)
}

export async function exportHtml(doc: Doc, dark: boolean): Promise<string | null> {
  await warmShiki()
  const body = await renderMarkdown(doc.content, dark ? 'dark' : 'light')
  const html = wrapHtmlDocument(body, dark)
  const defaultName = (doc.path ? basename(doc.path) : doc.name).replace(/\.[^.]+$/, '') + '.html'
  const savePath = await api().pickSavePath(defaultName)
  if (!savePath) return null
  await api().exportHtml(html, savePath)
  return savePath
}

export async function exportPdf(doc: Doc, dark: boolean): Promise<string | null> {
  await warmShiki()
  const body = await renderMarkdown(doc.content, dark ? 'dark' : 'light')
  const html = wrapHtmlDocument(body, dark)
  return api().exportPdf(html)
}

/** Build a self-contained HTML document with inlined theme CSS for export. */
function wrapHtmlDocument(bodyHtml: string, dark: boolean): string {
  return `<!doctype html>
<html lang="en" class="${dark ? 'dark' : ''}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Document</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>${INLINE_CSS}</style>
</head>
<body>
<div class="prose">${bodyHtml}</div>
</body>
</html>`
}

const INLINE_CSS = `
:root{--bg:#FBFAF6;--surface:#fff;--surface-2:#F4F2EC;--text:#1F1D1A;--text-muted:#6B665C;--border:#E5E1D6;--accent:#0F6E64;--accent-contrast:#fff;--measure:70ch}
.dark{--bg:#15161A;--surface:#1C1E24;--surface-2:#131419;--text:#E8E6E1;--text-muted:#9AA0A8;--border:#2A2D35;--accent:#3DD9C6;--accent-contrast:#0C1413}
html,body{margin:0;background:var(--bg);color:var(--text);font-family:Fraunces,Georgia,serif}
${/* reading prose styles would be inlined here from reading.css */ ''}
`
