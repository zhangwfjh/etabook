import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, type Extension } from '@codemirror/state'
import { tags as t } from '@lezer/highlight'

/** Editor chrome theme (gutter, cursor, selection, active line) driven by tokens. */
function chromeTheme(dark: boolean): Extension {
  return EditorView.theme(
    {
      '&': {
        color: 'var(--text)',
        backgroundColor: 'transparent'
      },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'var(--text-muted)',
        border: 'none'
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--surface-2)'
      },
      '.cm-activeLine': { backgroundColor: 'var(--accent-soft)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'var(--accent-soft) !important'
      },
      '.cm-cursor, .cm-cursor-primary': {
        borderLeftColor: 'var(--accent)',
        borderLeftWidth: '2px'
      },
      '.cm-content': { caretColor: 'var(--accent)' },
      '&.cm-focused': { outline: 'none' },
      '.cm-matchingBracket, .cm-nonmatchingBracket': {
        backgroundColor: 'var(--accent-soft)',
        color: 'var(--text)'
      }
    },
    { dark }
  )
}

/** Token-color highlighting for the raw markdown source (Source mode + raw markup). */
const sourceHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.4em', fontWeight: '700', color: 'var(--text)' },
  { tag: t.heading2, fontSize: '1.25em', fontWeight: '700', color: 'var(--text)' },
  { tag: t.heading3, fontSize: '1.12em', fontWeight: '600', color: 'var(--text)' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '600', color: 'var(--text)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--accent)', textDecoration: 'underline' },
  { tag: t.url, color: 'var(--accent)' },
  { tag: t.monospace, fontFamily: 'var(--font-mono)', color: 'var(--text)' },
  { tag: t.quote, color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: t.list, color: 'var(--accent)' },
  { tag: t.processingInstruction, color: 'var(--text-muted)' },
  { tag: t.meta, color: 'var(--text-muted)' }
])

/** Compartment-based theme so toggling dark mode reconfigures without remount. */
export const themeCompartment = new Compartment()

export function editorTheme(dark: boolean): Extension {
  return [chromeTheme(dark), syntaxHighlighting(sourceHighlight)]
}
