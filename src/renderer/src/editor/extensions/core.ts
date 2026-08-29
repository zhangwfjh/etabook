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
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
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
import { languages } from '@codemirror/language-data'
import { LanguageDescription, type LanguageSupport } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { LANG_ALIASES } from '../../markdown/highlight'
import { EditorState } from '@codemirror/state'
import { markdownKeymapExtension } from './markdownKeymap'

import { mathExtension } from '../../markdown/math'
import { obsidianExtension } from '../../markdown/obsidian'

/** LanguageDescriptions for short aliases (`py`, `rb`, …) that delegate to
 *  the canonical entry — the markdown extension matches names exactly, so
 *  without these `​```py` renders unhighlighted on the editor surface. */
const aliasLanguages: LanguageDescription[] = Object.entries(LANG_ALIASES)
  .map(([alias, target]) => {
    const canonical = languages.find((l) => l.name.toLowerCase() === target)
    if (!canonical) return null
    return LanguageDescription.of({
      name: alias,
      load: (): Promise<LanguageSupport> => canonical.load()
    })
  })
  .filter((l): l is LanguageDescription => l !== null)

const codeLanguagesWithAliases: readonly LanguageDescription[] = [...aliasLanguages, ...languages]

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
    search({ top: true }),
    highlightSelectionMatches(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    EditorView.lineWrapping,
    wrapCompartment.of(opts.lineWrap ? EditorView.lineWrapping : []),
    lineNumberCompartment.of(opts.showLineNumbers ? lineNumbers() : []),
    readonlyCompartment.of(EditorState.readOnly.of(opts.readonly)),
    // Markdown language with nested fenced-code language support.
    markdown({
      base: markdownLanguage,
      codeLanguages: codeLanguagesWithAliases,
      addKeymap: true,
      // First-class $...$ / $$...$$ math nodes, consumed by the live-preview
      extensions: [mathExtension, obsidianExtension]
    }),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab
    ]),
    markdownKeymapExtension()
  ]
}
