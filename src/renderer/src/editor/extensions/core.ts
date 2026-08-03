import { Compartment, type Extension } from '@codemirror/state'
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  rectangularSelection,
  crosshairCursor,
  dropCursor,
  lineNumbers
} from '@codemirror/view'
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting
} from '@codemirror/language'
import { highlightSelectionMatches } from '@codemirror/search'
import {
  closeBrackets,
  closeBracketsKeymap
} from '@codemirror/autocomplete'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab
} from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { EditorState } from '@codemirror/state'
import { markdownKeymapExtension } from './markdownKeymap'
import { mathExtension } from '../../markdown/math'

/** Compartments for options that change at runtime. */
export const wrapCompartment = new Compartment()
export const lineNumberCompartment = new Compartment()
export const readonlyCompartment = new Compartment()

/** Hand-picked basicSetup equivalent (per plan) + markdown language. */
export function coreExtensions(opts: {
  lineWrap: boolean
  showLineNumbers: boolean
  readonly: boolean
}): Extension[] {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    highlightSelectionMatches(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    EditorView.lineWrapping,
    wrapCompartment.of(opts.lineWrap ? EditorView.lineWrapping : []),
    lineNumberCompartment.of(opts.showLineNumbers ? lineNumbers() : []),
    readonlyCompartment.of(EditorState.readOnly.of(opts.readonly)),
    // Markdown language with nested fenced-code language support.
    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
      addKeymap: true,
      // First-class $...$ / $$...$$ math nodes, consumed by the live-preview
      // decorations and the export serializer (single-renderer unification).
      extensions: [mathExtension]
    }),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab
    ]),
    markdownKeymapExtension()
  ]
}
