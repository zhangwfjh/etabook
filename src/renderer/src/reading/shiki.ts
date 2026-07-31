import {
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
  type BundledTheme
} from 'shiki'

/**
 * Shiki highlighter singleton.
 * We bundle a small common language set + both themes so the renderer can flip
 * themes without re-creating the highlighter.
 */

const LANGS: BundledLanguage[] = [
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'json',
  'css',
  'html',
  'bash',
  'shell',
  'python',
  'go',
  'rust',
  'java',
  'c',
  'cpp',
  'sql',
  'yaml',
  'markdown',
  'diff'
]

const THEMES: BundledTheme[] = ['github-light', 'github-dark']

let highlighterPromise: Promise<Highlighter> | null = null

export async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: THEMES,
      langs: LANGS
    })
  }
  return highlighterPromise
}

export type ShikiTheme = 'light' | 'dark'

/** Highlight a code string to themed HTML. Resolves the singleton. */
export async function highlightCode(
  code: string,
  lang: string,
  theme: ShikiTheme
): Promise<string> {
  const hl = await getHighlighter()
  const shikiLang = (LANGS.includes(lang as BundledLanguage) ? lang : 'text') as BundledLanguage
  const shikiTheme: BundledTheme = theme === 'dark' ? 'github-dark' : 'github-light'
  try {
    return hl.codeToHtml(code, { lang: shikiLang, theme: shikiTheme })
  } catch {
    // Unknown language or parse failure — fall back to plain text.
    return hl.codeToHtml(code, { lang: 'text', theme: shikiTheme })
  }
}


export { LANGS }
