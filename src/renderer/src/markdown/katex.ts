import katex from 'katex'

/**
 * Shared KaTeX render primitive. Used by BOTH the live-preview decoration
 * widgets (on-screen) and the export HTML serializer, so a formula renders
 * identically in Live, Reading, and exported HTML/PDF. `throwOnError: false`
 * keeps malformed TeX visible as-is instead of crashing the editor.
 */
export function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode, throwOnError: false })
  } catch {
    return escapeHtml(tex)
  }
}

/** Extract the inner TeX from an InlineMath/BlockMath node's raw source. */
export function extractTex(raw: string): string {
  // InlineMath raw: `$...$` ; BlockMath raw: `$$...$$` (possibly multi-line).
  if (raw.startsWith('$$')) return raw.slice(2, raw.endsWith('$$') ? -2 : undefined).trim()
  if (raw.startsWith('$')) return raw.slice(1, raw.endsWith('$') ? -1 : undefined)
  return raw
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
