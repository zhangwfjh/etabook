// etabook probe helpers — injected into the page via tab.evaluate, then driven.
// Drives the live Electron renderer over CDP (dev server must expose port 9223,
// see src/main/index.ts dev-only switch).
//
// Usage from a browser-tool `run` cell:
//   await tab.evaluate(HELPERS)            // install window.__t
//   await tab.evaluate((t) => window.__t.setDoc(t), '# Hi\n')
//   const s = await tab.evaluate(() => window.__t.snapshot())
//
// All functions are no-ops-safe: they throw descriptive errors if the editor
// or a selector is missing, so test subagents get actionable failures.
;(function install() {
  if (window.__t) return
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  function view() {
    const v = window.__editorView
    if (!v) throw new Error('window.__editorView not set — editor not mounted')
    return v
  }

  async function setDoc(text) {
    const v = view()
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } })
    // Let decorations + async parse settle.
    await sleep(250)
    return v.state.doc.toString()
  }

  async function setMode(mode) {
    const label = { source: 'Source', live: 'Live', reading: 'Read' }[mode]
    if (!label) throw new Error('unknown mode ' + mode)
    const ok = [...document.querySelectorAll('button')].some((b) => {
      if (b.textContent.trim() === label) { b.click(); return true }
      return false
    })
    if (!ok) throw new Error('mode button ' + label + ' not found')
    await sleep(450) // reconfigure + decoration rebuild
  }

  async function clickText(text) {
    const el = [...document.querySelectorAll('button,a,*')].find((b) => b.textContent.trim() === text)
    if (!el) throw new Error('no element with text ' + text)
    el.click()
    await sleep(150)
  }

  // Place the caret at a document offset and let decorations rebuild.
  async function setCursor(pos) {
    const v = view()
    v.dispatch({ selection: { anchor: pos }, userEvent: 'select' })
    v.focus()
    await sleep(200)
  }

  // Count elements by CSS class/id; tolerant of missing.
  function counts(map) {
    const out = {}
    for (const k of Object.keys(map)) out[k] = document.querySelectorAll(map[k]).length
    return out
  }

  function snapshot() {
    const v = view()
    const content = document.querySelector('.cm-content')
    return {
      hasEditor: !!document.querySelector('.cm-editor'),
      hasView: !!v,
      docLen: v ? v.state.doc.length : -1,
      readonly: v ? v.state.readOnly : null,
      contentText: content ? content.innerText : '',
      modeButtons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean)
    }
  }

  // Wait until a predicate (sync, evaluated in page) is true or timeout.
  async function waitFor(fn, timeoutMs = 3000) {
    const t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
      try { if (fn()) return true } catch {}
      await sleep(100)
    }
    return false
  }

  window.__t = { setDoc, setMode, clickText, setCursor, counts, snapshot, waitFor, sleep, view }
})()
