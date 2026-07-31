// Executed inside the renderer via Runtime.evaluate.
// __SAMPLE is injected by the harness before this runs.
const SAMPLE = arguments[0]
const view = window.__editorView
if (!view) throw new Error('no editor view')
view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: SAMPLE } })
// Allow the ViewPlugin to rebuild decorations.
await new Promise((r) => setTimeout(r, 700))
const sel = (c) => document.querySelectorAll('.' + c).length
return {
  hasEditor: !!document.querySelector('.cm-editor'),
  hasHeading: sel('lp-heading') > 0,
  headingCount: sel('lp-heading'),
  hasStrong: sel('lp-strong') > 0,
  hasEm: sel('lp-em') > 0,
  hasStrike: sel('lp-strike') > 0,
  hasCodeChip: sel('lp-code') > 0,
  hasLink: sel('lp-link') > 0,
  hasUrl: sel('lp-url') > 0,
  hasQuote: sel('lp-quote') > 0,
  hasListBullet: sel('lp-list-bullet') > 0,
  taskCheckboxCount: document.querySelectorAll('input.lp-task[type=checkbox]').length,
  hasHr: sel('lp-hr') > 0
}
