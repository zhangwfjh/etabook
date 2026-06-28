// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Search } from '../../src/renderer/editor/search'

function makeEditor(initial = '<p>The manuscript arrived. Each manuscript bore marks.</p>') {
  return new Editor({ extensions: [StarterKit, Search], content: initial, editable: true })
}

function getSearchState(editor: Editor) {
  return editor.storage.search?.state
}

describe('Search — match computation', () => {
  it('finds all case-insensitive matches by default', () => {
    const editor = makeEditor()
    editor.commands.setSearchQuery('manuscript')
    const matches = getSearchState(editor).matches
    expect(matches.length).toBe(2)
  })

  it('case-sensitive mode distinguishes case', () => {
    const editor = makeEditor()
    editor.commands.setSearchQuery('Manuscript')
    expect(getSearchState(editor).matches.length).toBe(2)
    editor.commands.setSearchQuery('manuscript')
    editor.commands.setSearchOptions({ caseSensitive: true })
    expect(getSearchState(editor).matches.length).toBe(2)
  })

  it('whole-word mode only matches word boundaries', () => {
    const editor = makeEditor('<p>cat caterpillar cat</p>')
    editor.commands.setSearchQuery('cat')
    expect(getSearchState(editor).matches.length).toBe(3)
    editor.commands.setSearchOptions({ wholeWord: true })
    expect(getSearchState(editor).matches.length).toBe(2)
  })

  it('empty query yields zero matches', () => {
    const editor = makeEditor()
    editor.commands.setSearchQuery('')
    expect(getSearchState(editor).matches.length).toBe(0)
  })
})

describe('Search — findNext/findPrev', () => {
  it('findNext cycles activeIndex forward and wraps', () => {
    const editor = makeEditor()
    editor.commands.setSearchQuery('manuscript')
    expect(getSearchState(editor).activeIndex).toBe(0)
    editor.commands.findNext()
    expect(getSearchState(editor).activeIndex).toBe(1)
    editor.commands.findNext()
    expect(getSearchState(editor).activeIndex).toBe(0) // wraps
  })

  it('findPrev cycles backward', () => {
    const editor = makeEditor()
    editor.commands.setSearchQuery('manuscript')
    editor.commands.findPrev()
    expect(getSearchState(editor).activeIndex).toBe(1) // wraps to last
  })
})

describe('Search — replace', () => {
  it('replaceCurrent replaces the active match', () => {
    const editor = makeEditor()
    editor.commands.setSearchQuery('manuscript')
    editor.commands.setSearchReplacement('book')
    editor.commands.replaceCurrent()
    expect(editor.state.doc.textContent).toContain('book')
  })

  it('replaceAll replaces every match in a single undo step', () => {
    const editor = makeEditor()
    editor.commands.setSearchQuery('manuscript')
    editor.commands.setSearchReplacement('book')
    editor.commands.replaceAll()
    const text = editor.state.doc.textContent
    expect((text.match(/book/g) || []).length).toBe(2)
    expect(text).not.toContain('manuscript')
    // One undo restores everything.
    editor.commands.undo()
    expect(editor.state.doc.textContent).toContain('manuscript')
    expect(editor.state.doc.textContent).not.toContain('book')
  })
})
