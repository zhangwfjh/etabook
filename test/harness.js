// Interactive test harness for etabook.
// Drives the live Electron renderer over CDP via the `browser` tool's
// `tab` object (puppeteer). Run cells execute against this via eval.
//
// Usage from a JS eval cell:
//   const h = await harness()       // attaches/refreshes
//   await h.openWorkspace('D:/etabook-test/workspace')
//   await h.openFile('notes/getting-started.md')
//   const r = await h.livePreviewState()
//   h.assert(r.hasHeading, 'heading rendered')

// Resolved lazily — the `tab` global is injected by the browser tool's
// run scope. We expose helpers that operate on it.
let _tab = null
async function getTab() {
  // The browser tool run scope provides a global `tab`; when invoked from
  // a different eval context, fall back to the shared state object.
  if (_tab) return _tab
  throw new Error('harness not bound — call bindTab(tab) first')
}

function bindTab(t) {
  _tab = t
}

async function shot(name) {
  const t = await getTab()
  const path = await t.screenshot({ silent: true })
  return { name, path }
}

async function evalIn(fn) {
  const t = await getTab()
  return t.evaluate(fn)
}

// --- Editor helpers ---------------------------------------------------------

/** Replace the active document's content via the store dispatch. */
async function setDoc(text) {
  await evalIn((txt) => {
    // The store isn't exported on window; drive via the EditorView directly.
    const view = window.__editorView
    if (!view) throw new Error('no editor view')
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: txt } })
  }, text)
}

/** Set the editor mode by dispatching a menu action through the app's command bus. */
async function setMode(mode) {
  // Click the mode button in the title bar.
  const t = await getTab()
  const labelMap = { source: 'Source', live: 'Live', reading: 'Read' }
  const clicked = await t.evaluate((label) => {
    const btns = Array.from(document.querySelectorAll('button'))
    const b = btns.find((x) => x.textContent.trim() === label)
    if (b) { b.click(); return true }
    return false
  }, labelMap[mode])
  if (!clicked) throw new Error(`mode button ${mode} not found`)
  await sleep(400)
}

/** Click the theme toggle button. */
async function toggleTheme() {
  const t = await getTab()
  await t.evaluate(() => {
    const b = document.querySelector('button[aria-label="Toggle theme"]')
    if (b) b.click()
  })
  await sleep(300)
}

/** Open the command palette (Ctrl+K). */
async function openPalette() {
  const t = await getTab()
  await t.evaluate(() => {
    const b = document.querySelector('button[aria-label="Command palette"]')
    if (b) b.click()
  })
  await sleep(300)
}

/** Type into the palette input. */
async function typePalette(text) {
  const t = await getTab()
  await t.evaluate((q) => {
    const input = document.querySelector('input[placeholder="Type a command…"]')
    if (!input) throw new Error('palette input not found')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, q)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, text)
  await sleep(250)
}

// --- Inspection -------------------------------------------------------------

/** Snapshot the live-preview decoration state for verification. */
async function livePreviewState() {
  return evalIn(() => {
    const sel = (c) => document.querySelectorAll(`.${c}`).length
    const editorText = document.querySelector('.cm-content')
      ? document.querySelector('.cm-content').innerText
      : ''
    return {
      hasEditor: !!document.querySelector('.cm-editor'),
      hasHeading: sel('lp-heading') > 0,
      headingCount: sel('lp-heading'),
      hasStrong: sel('lp-strong') > 0,
      hasEm: sel('lp-em') > 0,
      hasStrike: sel('lp-strike') > 0,
      hasCodeChip: sel('lp-code') > 0,
      hasLink: sel('lp-link') > 0,
      hasQuote: sel('lp-quote') > 0,
      hasListBullet: sel('lp-list-bullet') > 0,
      taskCheckboxCount: document.querySelectorAll('input.lp-task[type=checkbox]').length,
      hasHr: sel('lp-hr') > 0,
      hasImage: sel('lp-image') > 0,
      editorTextHead: editorText.slice(0, 100)
    }
  })
}

/** Snapshot reading-mode rendered HTML state. */
async function readingState() {
  return evalIn(() => {
    const prose = document.querySelector('.prose')
    return {
      hasProse: !!prose,
      hasShiki: !!document.querySelector('.shiki'),
      hasHeading: !!document.querySelector('.prose h1'),
      hasBlockquote: !!document.querySelector('.prose blockquote'),
      hasCode: !!document.querySelector('.prose pre code'),
      hasTable: !!document.querySelector('.prose table'),
      hasMath: document.querySelectorAll('.math').length,
      hasKatex: document.querySelectorAll('.katex').length,
      hasTaskInput: document.querySelectorAll('.prose input[type=checkbox]').length,
      innerTextHead: prose ? prose.innerText.slice(0, 120) : ''
    }
  })
}

/** Read the raw source text (what the editor holds, markup visible). */
async function sourceText() {
  return evalIn(() => {
    const view = window.__editorView
    return view ? view.state.doc.toString() : null
  })
}

// --- Assertions -------------------------------------------------------------

let _results = []
function record(name, pass, detail = {}) {
  _results.push({ name, pass, detail })
  return pass
}

function results() {
  return _results
}
function reset() {
  _results = []
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// Export the harness API to be consumed by eval cells.
globalThis.__harness = {
  bindTab,
  shot,
  evalIn,
  setDoc,
  setMode,
  toggleTheme,
  openPalette,
  typePalette,
  livePreviewState,
  readingState,
  sourceText,
  record,
  results,
  reset,
  sleep,
  assert: (name, cond, detail) => record(name, !!cond, detail)
}
