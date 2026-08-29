/**
 * etabook interactive test harness — reusable runner.
 *
 * Drives the live Electron renderer over CDP via the `browser` tool.
 * Prerequisites:
 *   1. Start the dev server:  bun run dev -- --remote-debugging-port=9223
 *   2. Attach via:           browser open { cdp_url: "http://127.0.0.1:9223" }
 *
 * Then run each probe via tab.evaluate(). This file documents every test
 * case executed during the interactive session with expected results.
 */

export const TESTS = [
  {
    id: 'live-preview-decorations',
    description: 'Live Preview renders headings, bold, italic, strike, code, links, quote, bullets, task checkboxes, HR',
    probe: async (tab) => {
      const sample = SAMPLE_DOC
      await page.reload({ waitUntil: 'load' })
      await new Promise((r) => setTimeout(r, 3000))
      const r = await tab.evaluate(async (doc) => {
        const view = window.__editorView
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } })
        await new Promise((r) => setTimeout(r, 800))
        const sel = (c) => document.querySelectorAll('.' + c).length
        return {
          hasHeading: sel('lp-heading') > 0,
          hasStrong: sel('lp-strong') > 0,
          hasEm: sel('lp-em') > 0,
          hasStrike: sel('lp-strike') > 0,
          hasCodeChip: sel('lp-code') > 0,
          hasLink: sel('lp-link') > 0,
          hasQuote: sel('lp-quote') > 0,
          hasListBullet: sel('lp-list-bullet') > 0,
          taskCheckboxCount: document.querySelectorAll('input.lp-task[type=checkbox]').length,
          hasHr: sel('lp-hr') > 0
        }
      }, sample)
      return r
    },
    expect: (r) =>
      r.hasHeading && r.hasStrong && r.hasEm && r.hasStrike && r.hasCodeChip &&
      r.hasLink && r.hasQuote && r.hasListBullet && r.taskCheckboxCount === 2 && r.hasHr
  },
  {
    id: 'task-toggle',
    description: 'Clicking a task checkbox toggles [ ] to [x] in source',
    probe: async (tab) => {
      const before = await tab.evaluate(() => window.__editorView.state.doc.toString())
      await tab.evaluate(() => {
        const cb = document.querySelectorAll('input.lp-task[type=checkbox]')[0]
        cb.checked = true
        cb.dispatchEvent(new Event('change', { bubbles: true }))
      })
      await new Promise((r) => setTimeout(r, 300))
      const after = await tab.evaluate(() => window.__editorView.state.doc.toString())
      return { beforeHasUnchecked: before.includes('[ ] task one'), afterHasChecked: after.includes('[x] task one') }
    },
    expect: (r) => r.beforeHasUnchecked && r.afterHasChecked
  },
  {
    id: 'source-mode',
    description: 'Source mode shows raw markdown (no lp- decoration classes)',
    probe: async (tab) => {
      await tab.evaluate((label) => {
        const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === label)
        if (b) b.click()
      }, 'Source')
      await new Promise((r) => setTimeout(r, 500))
      return await tab.evaluate(() => ({
        hasHashes: document.querySelector('.cm-content').innerText.includes('# Heading'),
        noLpClasses: document.querySelectorAll('.lp-heading').length === 0
      }))
    },
    expect: (r) => r.hasHashes && r.noLpClasses
  },
  {
    id: 'reading-mode',
    description: 'Reading mode renders prose with Shiki code highlighting',
    probe: async (tab) => {
      await tab.evaluate((label) => {
        const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === label)
        if (b) b.click()
      }, 'Read')
      await new Promise((r) => setTimeout(r, 5000))
      return await tab.evaluate(() => ({
        hasProse: !!document.querySelector('.prose'),
        hasShiki: !!document.querySelector('.shiki'),
        hasH1: !!document.querySelector('.prose h1'),
        hasBq: !!document.querySelector('.prose blockquote'),
        hasCode: !!document.querySelector('.prose pre code'),
        taskInputs: document.querySelectorAll('.prose input[type=checkbox]').length
      }))
    },
    expect: (r) => r.hasProse && r.hasShiki && r.hasH1 && r.hasBq && r.hasCode && r.taskInputs === 2
  },
  {
    id: 'theme-toggle',
    description: 'Theme toggle button flips .dark class on <html>',
    probe: async (tab) => {
      const before = await tab.evaluate(() => document.documentElement.classList.contains('dark'))
      await tab.evaluate(() => document.querySelector('button[aria-label="Toggle theme"]').click())
      await new Promise((r) => setTimeout(r, 400))
      const after = await tab.evaluate(() => document.documentElement.classList.contains('dark'))
      return { darkBefore: before, darkAfter: after, toggled: before !== after }
    },
    expect: (r) => r.toggled
  },
  {
    id: 'command-palette',
    description: 'Command palette opens and filters by query',
    probe: async (tab) => {
      await tab.evaluate(() => document.querySelector('button[aria-label="Command palette"]').click())
      await new Promise((r) => setTimeout(r, 400))
      const opened = await tab.evaluate(() => !!document.querySelector('input[placeholder="Type a command\u2026"]'))
      await tab.evaluate((q) => {
        const i = document.querySelector('input[placeholder="Type a command\u2026"]')
        const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        s.call(i, q)
        i.dispatchEvent(new Event('input', { bubbles: true }))
      }, 'theme')
      await new Promise((r) => setTimeout(r, 300))
      const filtered = await tab.evaluate(() =>
        [...document.querySelectorAll('button')].filter((b) => /theme/i.test(b.textContent)).length
      )
      return { opened, filteredCount: filtered }
    },
    expect: (r) => r.opened && r.filteredCount >= 1
  },
  {
    id: 'find-panel',
    description: 'Find panel opens via openSearchPanel',
    probe: async (tab) => {
      await tab.evaluate(async () => {
        const mod = await import('/src/features/findReplace/findReplace.ts')
        mod.openFind(window.__editorView)
      })
      await new Promise((r) => setTimeout(r, 500))
      return await tab.evaluate(() => ({
        hasPanel: !!document.querySelector('.cm-panels'),
        hasSearchInput: !!document.querySelector('.cm-textfield')
      }))
    },
    expect: (r) => r.hasPanel && r.hasSearchInput
  },
  {
    id: 'slash-commands',
    description: 'Slash command autocomplete shows block options',
    probe: async (tab) => {
      await tab.evaluate(() => {
        const v = window.__editorView
        v.dispatch({ changes: { from: 0, to: 0, insert: '/' }, selection: { anchor: 1 }, userEvent: 'input.type' })
      })
      await new Promise((r) => setTimeout(r, 1000))
      const result = await tab.evaluate(() => {
        const t = document.querySelector('.cm-tooltip-autocomplete')
        return { hasAutocomplete: !!t, items: t ? t.innerText.slice(0, 200) : '' }
      })
      await tab.evaluate(() => {
        const v = window.__editorView
        v.dispatch({ changes: { from: 0, to: 1, insert: '' } })
      })
      return result
    },
    expect: (r) => r.hasAutocomplete && r.items.includes('H1') && r.items.includes('Code block')
  },
  {
    id: 'ipc-roundtrip',
    description: 'IPC writeFile then readFile returns identical content',
    probe: async (tab) => {
      const content = '# IPC Test\n\nRound-trip at ' + new Date().toISOString()
      return await tab.evaluate(
        async (p, c) => {
          await window.api.writeFile(p, c)
          const read = await window.api.readFile(p)
          return { pass: read.content === c }
        },
        'D:/etabook-test/harness-roundtrip.md',
        content
      )
    },
    expect: (r) => r.pass
  },
  {
    id: 'read-dir-tree',
    description: 'readDirTree returns workspace files and folders',
    probe: async (tab) => {
      return await tab.evaluate(async (ws) => {
        const nodes = await window.api.readDirTree(ws)
        const names = []
        const walk = (arr) => {
          for (const n of arr) {
            names.push(n.name)
            if (n.children) walk(n.children)
          }
        }
        walk(nodes)
        return { count: names.length, hasNotes: names.includes('getting-started.md') }
      }, 'D:/etabook-test/workspace')
    },
    expect: (r) => r.count > 0 && r.hasNotes
  },
  {
    id: 'export-html',
    description: 'Export HTML renders markdown and writes to disk',
    probe: async (tab) => {
      return await tab.evaluate(async () => {
        const mod = await import('/src/reading/render.ts')
        const html = await mod.renderMarkdown('# Export\n\n**Bold**\n\n```js\nconst x = 1\n```', 'light')
        await window.api.exportHtml(html, 'D:/etabook-test/exported.html')
        const read = await window.api.readFile('D:/etabook-test/exported.html')
        return { pass: read.content.includes('<h1>') && read.content.includes('<strong>') }
      })
    },
    expect: (r) => r.pass
  },
  {
    id: 'slash-menu',
    description:
      'Slash menu: opens on empty line with sections + full catalog, keyword filter, callout template insert, heading transforms a text line, code block inserts below, suppressed inside fenced code, off in Source mode',
    probe: async (tab) => {
      return await tab.evaluate(async () => {
        const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))
        const view = window.__editorView
        const type = (pos: number, text: string) =>
          view.dispatch({
            changes: { from: pos, insert: text },
            selection: { anchor: pos + text.length },
            userEvent: 'input.type'
          })
        const clickMode = (label: string) => {
          const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === label)
          if (b) b.click()
        }
        const tip = () => document.querySelector<HTMLElement>('.cm-tooltip-autocomplete')
        const labels = () =>
          tip()
            ? [...tip()!.querySelectorAll<HTMLElement>('.cm-completionLabel')].map((s) => s.textContent)
            : []
        const pick = (label: string) => {
          const li = [...tip()!.querySelectorAll<HTMLElement>('li')].find(
            (el) => el.querySelector('.cm-completionLabel')?.textContent === label
          )
          li?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        }
        const lineEnd = (n: number) => view.state.doc.line(n).to
        const doc = () => view.state.doc.toString()
        const doc0 = view.state.doc.toString()
        const out: Record<string, unknown> = {}

        clickMode('Live')
        await sleep(400)
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: 'para text\n\n```js\ncode here\n```\n' },
          selection: { anchor: 0 }
        })
        await sleep(200)

        // A: opens on an empty line — sections, full catalog, new entries.
        type(10, '/')
        await sleep(350)
        out.menuOpens = !!tip()
        out.sections = tip()
          ? [...tip()!.querySelectorAll('completion-section')].map((s) => s.textContent)
          : []
        const all = labels()
        out.catalog = {
          count: all.length,
          hasCallout: all.includes('Callout'),
          hasMermaid: all.includes('Mermaid diagram'),
          hasEmbed: all.includes('Note embed'),
          hasFootnote: all.includes('Footnote')
        }

        // B: keyword filter ("cal" → Callout only), then insert template in place.
        type(11, 'cal')
        await sleep(350)
        out.filterKeyword = labels().length === 1 && labels()[0] === 'Callout'
        pick('Callout')
        await sleep(250)
        out.calloutInserted = doc().includes('> [!note] Title')

        // C: text block transforms a content line ("para text /h" → "# para text").
        view.dispatch({ selection: { anchor: lineEnd(1) } })
        type(lineEnd(1), ' /h')
        await sleep(350)
        out.transformMenuOpen = labels().includes('Heading 1')
        pick('Heading 1')
        await sleep(250)
        out.headingTransformed = doc().split('\n')[0] === '# para text'

        // D: container inserts a fresh block below the content line.
        view.dispatch({ selection: { anchor: lineEnd(1) } })
        type(lineEnd(1), ' /cod')
        await sleep(350)
        pick('Code block')
        await sleep(250)
        out.codeBelow = doc().split('\n').slice(0, 3).join('\n') === '# para text\n```js\n'

        // E: suppressed inside a fenced code block.
        const codePos = doc().indexOf('code here') + 'code here'.length
        view.dispatch({ selection: { anchor: codePos } })
        type(codePos, '/')
        await sleep(350)
        out.suppressedInCode = !tip()

        // F: off in Source mode.
        clickMode('Source')
        await sleep(400)
        view.dispatch({ selection: { anchor: lineEnd(2) } })
        type(lineEnd(2), '/')
        await sleep(350)
        out.offInSource = !tip()
        clickMode('Live')
        await sleep(300)
        // Restore the original content so autosave doesn't persist probe edits.
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: doc0 },
          selection: { anchor: 0 }
        })
        return out
      })
    },
    expect: (r) =>
      r.menuOpens &&
      r.sections.length === 3 &&
      r.sections[0] === 'Basic blocks' &&
      r.catalog.count === 20 &&
      r.catalog.hasCallout && r.catalog.hasMermaid && r.catalog.hasEmbed && r.catalog.hasFootnote &&
      r.filterKeyword && r.calloutInserted && r.transformMenuOpen && r.headingTransformed &&
      r.codeBelow && r.suppressedInCode && r.offInSource
  }
]

const SAMPLE_DOC = [
  '# Heading One', '',
  'A paragraph with **bold**, *italic*, ~~strike~~ and `code`.', '',
  '- [ ] task one', '- [x] task two', '- a bullet', '',
  '> a blockquote', '',
  '```js', 'const x = 41 + 1', '```', '',
  '[link text](https://example.com)', '',
  '---', ''
].join('\n')

export { SAMPLE_DOC }
