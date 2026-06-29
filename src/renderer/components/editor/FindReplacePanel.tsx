import { useEffect, useState, type FormEvent } from 'react'
import { ArrowUp, ArrowDown, X } from 'lucide-react'
import { useFindReplace } from '@/state/find-replace-store'
import type { Editor as TiptapEditor } from '@tiptap/react'

type Props = { editor: TiptapEditor | null }

export function FindReplacePanel({ editor }: Props) {
  const open = useFindReplace((s) => s.open)
  const closePanel = useFindReplace((s) => s.closePanel)
  const query = useFindReplace((s) => s.query)
  const replacement = useFindReplace((s) => s.replacement)
  const caseSensitive = useFindReplace((s) => s.caseSensitive)
  const wholeWord = useFindReplace((s) => s.wholeWord)
  const setQuery = useFindReplace((s) => s.setQuery)
  const setReplacement = useFindReplace((s) => s.setReplacement)
  const setCaseSensitive = useFindReplace((s) => s.setCaseSensitive)
  const setWholeWord = useFindReplace((s) => s.setWholeWord)
  const [count, setCount] = useState<{ active: number | null; total: number }>({
    active: null,
    total: 0,
  })

  const canReplace = !!editor && editor.isEditable && count.total > 0

  useEffect(() => {
    if (!editor || !open) return
    editor.commands.setSearchQuery(query)
  }, [editor, open, query])

  useEffect(() => {
    if (!editor || !open) return
    editor.commands.setSearchReplacement(replacement)
  }, [editor, open, replacement])

  useEffect(() => {
    if (!editor || !open) return
    editor.commands.setSearchOptions({ caseSensitive, wholeWord })
  }, [editor, open, caseSensitive, wholeWord])

  useEffect(() => {
    if (!editor || !open) return
    const read = () => {
      const s = editor.storage.search?.state
      if (!s) return
      setCount({ active: s.activeIndex, total: s.matches.length })
    }
    read()
    editor.on('transaction', read)
    return () => { editor.off('transaction', read) }
  }, [editor, open])

  useEffect(() => {
    if (!editor || !open) return
    const { selection } = editor.state
    if (!selection.empty) {
      const text = editor.state.doc.textBetween(selection.from, selection.to, ' ')
      if (text) setQuery(text)
    }
  }, [editor, open])

  // Esc closes the panel and moves cursor to the start of the active match
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        // Capture the active match position BEFORE closing
        // (closing clears the query which clears matches).
        let matchPos: number | null = null
        if (editor) {
          const s = editor.storage.search?.state
          if (s && s.matches.length > 0 && s.activeIndex !== null) {
            matchPos = s.matches[s.activeIndex].from
          }
        }
        closePanel()
        // Move cursor AFTER the panel state settles, so the search-clear
        // effect doesn't overwrite our selection.
        if (editor && matchPos !== null) {
          requestAnimationFrame(() => {
            editor.chain().focus().setTextSelection(matchPos!).run()
          })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closePanel, editor])

  // Clear search highlights when the panel closes
  useEffect(() => {
    if (open) return
    if (!editor) return
    editor.commands.setSearchQuery('')
  }, [open, editor])

  if (!open) return null

  function next(e?: FormEvent) {
    e?.preventDefault()
    editor?.commands.findNext()
  }
  function prev() {
    editor?.commands.findPrev()
  }
  function replace() {
    editor?.chain().focus().replaceCurrent().run()
  }
  function replaceAll() {
    editor?.chain().focus().replaceAll().run()
  }

  const active = count.active ?? 0
  const counter = count.total > 1000 ? '>1000' : `${count.total > 0 ? active + 1 : 0}/${count.total}`

  return (
    <div
      className="absolute top-2 right-3 z-20 w-[320px] rounded-md border border-amber-300/60 bg-bg-elevated shadow-lg p-2 flex flex-col gap-2"
      style={{ fontFamily: 'Figtree, sans-serif' }}
    >
      <form onSubmit={next} className="flex items-center gap-1">
        <input
          className="flex-1 px-2 py-1 text-xs rounded border border-border bg-bg-primary focus:outline-none focus:border-amber-400"
          placeholder="Find"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <span className="text-[10px] text-fg-subtle tabular-nums w-12 text-center">{counter}</span>
        <button type="button" onClick={prev} className="p-1 rounded hover:bg-bg-subtle text-fg-muted" aria-label="Previous match">
          <ArrowUp size={14} />
        </button>
        <button type="submit" className="p-1 rounded hover:bg-bg-subtle text-fg-muted" aria-label="Next match">
          <ArrowDown size={14} />
        </button>
        <button type="button" onClick={closePanel} className="p-1 rounded hover:bg-bg-subtle text-fg-muted" aria-label="Close">
          <X size={14} />
        </button>
      </form>
      {editor?.isEditable && (
        <div className="flex items-center gap-1">
          <input
            className="flex-1 px-2 py-1 text-xs rounded border border-border bg-bg-primary focus:outline-none focus:border-amber-400"
            placeholder="Replace"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          />
          <button type="button" onClick={replace} disabled={!canReplace} className="px-2 py-1 text-[10px] rounded border border-border hover:bg-bg-subtle text-fg-muted disabled:opacity-30" title="Replace">
            Replace
          </button>
          <button type="button" onClick={replaceAll} disabled={!canReplace} className="px-2 py-1 text-[10px] rounded border border-border hover:bg-bg-subtle text-fg-muted disabled:opacity-30" title="Replace all">
            All
          </button>
        </div>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setCaseSensitive(!caseSensitive)}
          className={`px-2 py-0.5 text-[10px] rounded border ${
            caseSensitive ? 'border-amber-400 bg-amber-100/40 text-fg-primary' : 'border-border text-fg-muted'
          }`}
          aria-pressed={caseSensitive}
          title="Case sensitive"
        >
          Aa
        </button>
        <button
          type="button"
          onClick={() => setWholeWord(!wholeWord)}
          className={`px-2 py-0.5 text-[10px] rounded border ${
            wholeWord ? 'border-amber-400 bg-amber-100/40 text-fg-primary' : 'border-border text-fg-muted'
          }`}
          aria-pressed={wholeWord}
          title="Whole word"
        >
          W
        </button>
      </div>
    </div>
  )
}
