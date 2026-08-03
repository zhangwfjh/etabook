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

/** Token-color highlighting for raw markdown source + nested code blocks.
 * Combines markdown markup tags (headings, emphasis, links) with code-syntax
 * tags (keyword, string, number) so fenced code blocks get colored by the
 * same HighlightStyle — no separate fallback needed. */
const sourceHighlight = HighlightStyle.define([
  // Markdown markup
  { tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], color: 'var(--text)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--accent)', textDecoration: 'underline' },
  { tag: t.url, color: 'var(--accent)' },
  { tag: t.monospace, fontFamily: 'var(--font-mono)', color: 'var(--text)' },
  { tag: t.quote, color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: t.list, color: 'var(--text)' },
  { tag: t.processingInstruction, color: 'var(--text-muted)' },
  { tag: t.meta, color: 'var(--text-muted)' },
  // Code syntax (nested fenced blocks + inline code)
  { tag: t.keyword, color: 'var(--hl-keyword)' },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: 'var(--hl-variable)' },
  { tag: [t.function(t.variableName), t.labelName], color: 'var(--hl-function)' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: 'var(--hl-atom)' },
  { tag: [t.typeName, t.className, t.number, t.changed], color: 'var(--hl-type)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--hl-string)' },
  { tag: t.regexp, color: 'var(--hl-regexp)' },
  { tag: t.atom, color: 'var(--hl-atom)' },
  { tag: t.comment, color: 'var(--hl-comment)', fontStyle: 'italic' },
  { tag: t.propertyName, color: 'var(--hl-property)' },
  { tag: t.unit, color: 'var(--hl-number)' }
])

/** Compartment-based theme so toggling dark mode reconfigures without remount. */
export const themeCompartment = new Compartment()

export function editorTheme(dark: boolean): Extension {
  return [chromeTheme(dark), syntaxHighlighting(sourceHighlight)]
}
