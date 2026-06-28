/**
 * AutoPair — auto-pair brackets and quotes in the editor.
 *
 * Four behaviors, all edit-mode gated (no-op when `editor.isEditable` is false):
 *   1. Auto-close: typing an opener inserts the matching closer and places
 *      the caret between them.
 *   2. Selection wrapping: when text is selected, typing an opener wraps the
 *      selection in opener+closer and lands the caret after the closer.
 *   3. Skip-over: typing a closer while the caret sits immediately before an
 *      identical character just moves the caret past it instead of inserting.
 *   4. Backspace-delete-pair: pressing Backspace with the caret between an
 *      empty pair (opener+closer, nothing inside) deletes both.
 *
 * Suppression rules:
 *   - Disabled entirely inside AI-plan (`aiPlan`) and inline-math
 *     (`mathInline` mark) contexts — those nodes manage their own input.
 *   - In fenced code blocks, quote auto-close is suppressed (quotes are
 *     load-bearing in code); bracket auto-close is allowed.
 */

import { Extension } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { Node as PmNode } from '@tiptap/pm/model'

const PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  "'": "'",
  '"': '"',
  '`': '`',
}

const QUOTE_OPENS: Record<string, true> = { "'": true, '"': true, '`': true }

export const AutoPair = Extension.create({
  name: 'autoPair',
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('autoPair'),
        props: {
          handleTextInput(view: EditorView, from: number, to: number, text: string): boolean {
            if (!editor.isEditable) return false
            const { state } = view

            // Disabled inside AI-plan and math nodes.
            if (isInNode(state.doc, from, 'aiPlan') || hasMathMark(state.doc, from)) return false

            // In a fenced code block, suppress quotes (load-bearing in code).
            const inCodeBlock = isInNode(state.doc, from, 'codeBlock')
            if (inCodeBlock && QUOTE_OPENS[text]) return false

            const closer = PAIRS[text]

            // Case 1: selection wrapping (non-empty selection).
            if (from !== to) {
              if (!closer) return false
              const selectedText = state.doc.textBetween(from, to, '')
              const tr = state.tr.delete(from, to).insertText(text + selectedText + closer, from)
              tr.setSelection(
                TextSelection.near(tr.doc.resolve(from + selectedText.length + 1)),
              )
              view.dispatch(tr)
              return true
            }

            // Case 2: skip-over — caret right before an identical character.
            // Checked before the opener guard so closers (e.g. `)`) also skip.
            const charAfter = state.doc.textBetween(from, from + 1, '')
            if (charAfter === text) {
              view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(from + 1))))
              return true
            }

            // Case 3: auto-close.
            if (!closer) return false
            const tr = state.tr.insertText(text + closer, from)
            tr.setSelection(TextSelection.near(tr.doc.resolve(from + 1)))
            view.dispatch(tr)
            return true
          },

          handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
            if (!editor.isEditable) return false
            if (event.key !== 'Backspace') return false
            const { state } = view
            const { selection } = state
            if (!selection.empty) return false
            const { from } = selection
            if (from < 2) return false

            const before = state.doc.textBetween(from - 1, from, '')
            const after = state.doc.textBetween(from, from + 1, '')
            const expected = before ? PAIRS[before] : undefined
            if (!expected || expected !== after) return false

            view.dispatch(state.tr.delete(from - 1, from + 1))
            return true
          },
        },
      }),
    ]
  },
})

function isInNode(doc: PmNode, pos: number, typeName: string): boolean {
  const $pos = doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === typeName) return true
  }
  return false
}

function hasMathMark(doc: PmNode, pos: number): boolean {
  return doc.resolve(pos).marks().some((m: { type: { name: string } }) => m.type.name === 'mathInline')
}
