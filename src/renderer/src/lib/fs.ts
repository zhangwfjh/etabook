// Tiny, framework-free helper utilities.

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled'
  )
}

let untitledSeq = 0
export function nextUntitledName(): string {
  untitledSeq += 1
  return `Untitled-${untitledSeq}.md`
}

export function basename(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

export function dirname(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return idx === -1 ? '' : path.slice(0, idx)
}

export function extname(path: string): string {
  const base = basename(path)
  const dot = base.lastIndexOf('.')
  return dot === -1 ? '' : base.slice(dot)
}

export function swapExt(path: string, ext: string): string {
  const dir = dirname(path)
  const base = basename(path)
  const dot = base.lastIndexOf('.')
  const stem = dot === -1 ? base : base.slice(0, dot)
  return (dir ? dir + '/' : '') + stem + (ext.startsWith('.') ? ext : '.' + ext)
}

/** Resolve a possibly-relative URL against the open document's directory. */
export function resolveAsset(url: string, docDir: string | undefined): string {
  if (!url) return url
  if (/^(https?:|data:|blob:|file:|mailto:|#)/i.test(url)) return url
  if (!docDir) return url
  const normalized = url.replace(/\\/g, '/')
  if (normalized.startsWith('/')) return 'file://' + normalized
  return 'file://' + docDir.replace(/\\/g, '/') + '/' + normalized
}

export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  ms: number
): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined = undefined
  const wrapped = ((...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T & { cancel: () => void }
  wrapped.cancel = () => {
    clearTimeout(timer)
    timer = undefined
  }
  return wrapped
}

/** Count words in a document string. */
export function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g)
  return m ? m.length : 0
}

/** Estimated reading time in minutes (200 wpm). */
export function readingTime(text: string): number {
  return Math.max(1, Math.round(wordCount(text) / 200))
}

/** Compute line/column from a CodeMirror-style position. */
export function lineColFromPos(text: string, pos: number): { line: number; col: number } {
  let line = 1
  let col = 1
  for (let i = 0; i < pos && i < text.length; i++) {
    if (text[i] === '\n') {
      line++
      col = 1
    } else {
      col++
    }
  }
  return { line, col }
}
