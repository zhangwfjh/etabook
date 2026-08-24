/**
 * Mermaid renderer — shared by the live-preview block widget (on-screen) and
 * the export serializer, so diagrams are identical in Live, Reading, and
 * exported HTML/PDF.
 *
 * `mermaid` is imported lazily so the (large) library is code-split out of the
 * initial bundle and only loaded when a ```mermaid block is actually rendered.
 * Results are cached per (source, theme) so re-renders on every keystroke are
 * cheap once a diagram has been drawn.
 *
 * Two stability measures against viewport jumps:
 *  - `peekMermaid` lets widgets inject an already-cached SVG synchronously, so
 *    a re-mounted diagram never goes through the placeholder stage again.
 *  - `memoDiagramHeight` records each diagram's rendered height so a
 *    not-yet-cached remount reserves approximately the right space while the
 *    async render completes.
 */

type MermaidModule = typeof import('mermaid')

let mermaidMod: Promise<MermaidModule> | null = null
let initializedTheme: string | null = null

const cache = new Map<string, string>()
// (theme, code) → last rendered height in px, for placeholder space reservation.
const heightMemo = new Map<string, number>()

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
    // htmlLabels: false — SVG <text> labels instead of foreignObject HTML.
    // HTML labels must be measured by layout; in this app (and webviews
    // generally) preflight CSS + font timing corrupts that measurement, so
    // dagre lays out edges that never touch the nodes. SVG text needs no
    // HTML measurement and is immune.
    mermaid.default.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme,
      htmlLabels: false
    })
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

/** Synchronously return the cached SVG for (code, theme), or null. Lets a
 *  freshly mounted widget skip the placeholder stage entirely. */
export function peekMermaid(code: string, dark: boolean): string | null {
  return cache.get(`${dark ? 'dark' : 'default'}\u0000${code}`) ?? null
}

/** Record the on-screen height a diagram rendered at (placeholder reservation). */
export function memoDiagramHeight(code: string, dark: boolean, height: number): void {
  heightMemo.set(`${dark ? 'dark' : 'default'}\u0000${code}`, height)
}

/** Last known rendered height for (code, theme), or null. */
export function peekDiagramHeight(code: string, dark: boolean): number | null {
  return heightMemo.get(`${dark ? 'dark' : 'default'}\u0000${code}`) ?? null
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
