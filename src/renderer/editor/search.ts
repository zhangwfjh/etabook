/**
 * Search — find/replace core logic as a TipTap extension.
 *
 * A ProseMirror plugin owns the immutable SearchState (query, replacement,
 * options, matches, activeIndex). The set- and find- commands mutate that state by
 * dispatching meta transactions; `apply` reconciles and mirrors the result into
 * `editor.storage.search.state` so the UI panel (added in a follow-up) can read
 * match counts and the active index reactively.
 *
 * Two flavors of meta flow through `apply`, distinguished by shape:
 *   - Partial patch (`{ query }`, `{ caseSensitive }`, …) — merged into the
 *     current state and matches are recomputed; activeIndex resets to 0.
 *   - Complete state (an object with a `matches` array, dispatched by
 *     findNext/findPrev) — used as-is so the cycle's activeIndex survives
 *     instead of being clobbered by `recomputeMatches`.
 *
 * replaceAll rewrites every match (skipping those inside code blocks) in
 * REVERSE positional order within a single transaction, so it collapses to one
 * undo step.
 */

import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PmNode } from '@tiptap/pm/model'
import { toast } from 'sonner'

const MAX_MATCHES = 1000

const searchKey = new PluginKey<SearchState>('search')

export type SearchMatch = { from: number; to: number }

export type SearchState = {
  query: string
  replacement: string
  caseSensitive: boolean
  wholeWord: boolean
  matches: SearchMatch[]
  activeIndex: number | null
}

function emptyState(): SearchState {
  return {
    query: '',
    replacement: '',
    caseSensitive: false,
    wholeWord: false,
    matches: [],
    activeIndex: null,
  }
}

/**
 * Walk the document text and collect every (case-adjusted) occurrence of the
 * query, optionally restricted to word-boundary matches. Capped at
 * MAX_MATCHES to keep pathological documents responsive. activeIndex resets to
 * the first match (or null when there are none).
 */
function recomputeMatches(state: SearchState, doc: PmNode): SearchState {
  const { query, caseSensitive, wholeWord } = state
  if (!query) return { ...state, matches: [], activeIndex: null }

  const matches: SearchMatch[] = []
  const needle = caseSensitive ? query : query.toLowerCase()
  const len = needle.length

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true // descend into block nodes
    const haystack = caseSensitive ? node.text : node.text.toLowerCase()
    let idx = 0
    while (idx <= haystack.length - len) {
      const found = haystack.indexOf(needle, idx)
      if (found === -1) break
      if (matches.length >= MAX_MATCHES) break
      if (!wholeWord) {
        matches.push({ from: pos + found, to: pos + found + len })
      } else {
        const startOK = found === 0 || !/\w/.test(haystack[found - 1])
        const endOK =
          found + len === haystack.length || !/\w/.test(haystack[found + len])
        if (startOK && endOK) {
          matches.push({ from: pos + found, to: pos + found + len })
        }
      }
      idx = found + len
    }
    return true
  })

  return { ...state, matches, activeIndex: matches.length === 0 ? null : 0 }
}

function isInCodeBlock(doc: PmNode, pos: number): boolean {
  const $pos = doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === 'codeBlock') return true
  }
  return false
}

function getPluginState(state: EditorState): SearchState | null {
  return searchKey.getState(state) ?? null
}

/**
 * Dispatch only the changed fields as meta. The plugin's `apply` merges them
 * into the current state and recomputes matches. We deliberately send a
 * partial (no `matches` array): a meta carrying `matches` is reserved for the
 * complete-state dispatch used by findNext/findPrev, which `apply` treats as
 * final and skips recomputation for.
 */
function patchSearchState(editor: Editor, patch: Partial<SearchState>) {
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, patch))
}

/** Cycle the active match by `delta` (±1) with wraparound, then scroll to it. */
function cycleActive(editor: Editor, delta: number) {
  const s = getPluginState(editor.state)
  if (!s || s.matches.length === 0) return
  const len = s.matches.length
  const base = s.activeIndex ?? 0
  const next = ((base + delta) % len + len) % len
  const updated: SearchState = { ...s, activeIndex: next }
  const m = s.matches[next]
  if (!m) return
  // Dispatch meta + selection + scroll in one transaction.
  const tr = editor.state.tr.setMeta(searchKey, updated)
  tr.setSelection(TextSelection.create(editor.state.doc, m.from, m.to))
  tr.scrollIntoView()
  editor.view.dispatch(tr)
  // Belt-and-suspenders: manually scroll the scroll container too,
  // because the editor is nested inside a div.overflow-y-auto that
  // ProseMirror's own scrollIntoView may not reach.
  requestAnimationFrame(() => {
    try {
      const coords = editor.view.coordsAtPos(m.from)
      const scroller = editor.view.dom.closest('.overflow-y-auto') as HTMLElement | null
      if (scroller) {
        const rect = scroller.getBoundingClientRect()
        if (coords.top < rect.top || coords.bottom > rect.bottom) {
          scroller.scrollTop += coords.top - rect.top - 40
        }
      }
    } catch { /* pos may be stale after reflow */ }
  })
}

export const Search = Extension.create({
  name: 'search',

  addStorage() {
    return { state: null as SearchState | null }
  },

  addCommands() {
    return {
      setSearchQuery:
        (query: string) =>
        ({ editor }) => {
          patchSearchState(editor, { query })
          return true
        },
      setSearchReplacement:
        (replacement: string) =>
        ({ editor }) => {
          patchSearchState(editor, { replacement })
          return true
        },
      setSearchOptions:
        (options: { caseSensitive?: boolean; wholeWord?: boolean }) =>
        ({ editor }) => {
          patchSearchState(editor, options)
          return true
        },
      findNext:
        () =>
        ({ editor }) => {
          cycleActive(editor, 1)
          return true
        },
      findPrev:
        () =>
        ({ editor }) => {
          cycleActive(editor, -1)
          return true
        },
      replaceCurrent:
        () =>
        ({ editor, state, dispatch }) => {
          if (!editor.isEditable) return false
          const s = getPluginState(state)
          if (!s || s.activeIndex === null || s.matches.length === 0) return false
          const m = s.matches[s.activeIndex]
          const tr = state.tr.insertText(s.replacement, m.from, m.to)
          if (dispatch) dispatch(tr)
          return true
        },
      replaceAll:
        () =>
        ({ editor, state, dispatch }) => {
          if (!editor.isEditable) return false
          const s = getPluginState(state)
          if (!s || s.matches.length === 0) return false
          const tr = state.tr
          let count = 0
          for (let i = s.matches.length - 1; i >= 0; i--) {
            const m = s.matches[i]
            if (isInCodeBlock(state.doc, m.from)) continue
            tr.insertText(s.replacement, m.from, m.to)
            count++
          }
          if (dispatch) dispatch(tr)
          if (count > 0) {
            toast.message(`Replaced ${count} match${count === 1 ? '' : 'es'}`)
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: () => emptyState(),
          apply(tr, value, _oldState, newState) {
            const meta = tr.getMeta(searchKey) as SearchState | undefined
            if (meta) {
              // A complete state (carries a matches array, from findNext/
              // findPrev) is taken as-is; a partial patch is merged and
              // matches are recomputed.
              const next = Array.isArray(meta.matches)
                ? meta
                : recomputeMatches({ ...value, ...meta }, newState.doc)
              editor.storage.search.state = next
              return next
            }
            if (tr.docChanged) {
              const next = recomputeMatches(value, newState.doc)
              editor.storage.search.state = next
              return next
            }
            editor.storage.search.state = value
            return value
          },
        },
        props: {
          decorations(state) {
            const s = getPluginState(state)
            if (!s || s.matches.length === 0) return DecorationSet.empty
            const decos: Decoration[] = []
            for (let i = 0; i < s.matches.length; i++) {
              const m = s.matches[i]
              decos.push(
                Decoration.inline(m.from, m.to, {
                  class:
                    i === s.activeIndex
                      ? 'search-match-current'
                      : 'search-match',
                }),
              )
            }
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})

declare module '@tiptap/core' {
  interface Storage {
    search: { state: SearchState | null }
  }

  interface Commands<ReturnType> {
    search: {
      setSearchQuery: (query: string) => ReturnType
      setSearchReplacement: (replacement: string) => ReturnType
      setSearchOptions: (options: {
        caseSensitive?: boolean
        wholeWord?: boolean
      }) => ReturnType
      findNext: () => ReturnType
      findPrev: () => ReturnType
      replaceCurrent: () => ReturnType
      replaceAll: () => ReturnType
    }
  }
}
