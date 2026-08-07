/**
 * Mermaid renderer — shared by the live-preview block widget (on-screen) and
 * the export serializer, so diagrams are identical in Live, Reading, and
 * exported HTML/PDF.
 *
 * `mermaid` is imported lazily so the (large) library is code-split out of the
 * initial bundle and only loaded when a ```mermaid block is actually rendered.
 * Results are cached per (source, theme) so re-renders on every keystroke are
 * cheap once a diagram has been drawn.
 */

type MermaidModule = typeof import('mermaid')

let mermaidMod: Promise<MermaidModule> | null = null
let initializedTheme: string | null = null

const cache = new Map<string, string>()

async function loadMermaid(): Promise<MermaidModule> {
  if (!mermaidMod) mermaidMod = import('mermaid')
  return mermaidMod
}

let seq = 0
const uniqueId = (): string => `mmd-${Date.now().toString(36)}-${(seq++).toString(36)}`

/**
 * Render Mermaid `code` to an SVG string. Returns markup safe to inject as the
 * inner HTML of a container. On parse failure returns a visible error element.
 */
export async function renderMermaid(code: string, dark: boolean): Promise<string> {
  const theme = dark ? 'dark' : 'default'
  const key = `${theme}\u0000${code}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  const mermaid = await loadMermaid()
  if (initializedTheme !== theme) {
    // securityLevel 'loose' so diagram labels may contain inline markup, matching
    // Obsidian. Content is the user's own local notes.
    mermaid.default.initialize({ startOnLoad: false, securityLevel: 'loose', theme })
    initializedTheme = theme
  }

  try {
    const { svg } = await mermaid.default.render(uniqueId(), code)
    cache.set(key, svg)
    return svg
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const fallback = `<span class="mermaid-error">Invalid diagram: ${escapeHtml(msg)}</span>`
    cache.set(key, fallback)
    return fallback
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
