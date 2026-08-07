/**
 * Obsidian-Flavored Markdown — Lezer extension.
 *
 * Promotes the Obsidian-specific inline + block constructs to first-class parse
 * nodes so the live-preview decorations and the export serializer can render
 * them identically (Live == Reading == Export), exactly like `mathExtension`.
 *
 * Inline nodes:  Highlight  `==x==`
 *                Comment    `%%x%%`
 *                Tag        `#tag`, `#nested/tag`
 *                WikiLink   `[[note]]`, `[[note|alias]]`, `[[note#head]]`, `[[note#^id]]`
 *                Embed      `![[note]]`
 *                FootnoteRef `[^id]`
 * Block nodes:   Frontmatter  leading `---\n…\n---` YAML block
 *                FootnoteDef  `[^id]: text`
 *
 * Callouts (`> [!note] …`) are detected at render time off blockquote lines —
 * not parsed here — so the standard blockquote parser is left untouched.
 *
 * NOTE: block IDs (`^blockid`) get no dedicated parser. `^` is already claimed
 * by the Subscript/Superscript extension, and block IDs are only meaningful for
 * `[[note#^id]]` transclusion, which we don't resolve. They render literally.
 */

import type { MarkdownConfig } from '@lezer/markdown'
import { tags as t } from '@lezer/highlight'

// ---- char codes ------------------------------------------------------------
const HASH = 35, BANG = 33, LBRACK = 91, RBRACK = 93, CARET = 94
const EQ = 61, PCT = 37, SLASH = 47, SPACE = 32, NEWLINE = 10

const isAlphaNum = (c: number): boolean =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122)
const isWord = (c: number): boolean =>
  isAlphaNum(c) || c === 95 /* _ */ || c === 45 /* - */
const isTagChar = (c: number): boolean => isWord(c) || c === SLASH

// ---- inline parsers --------------------------------------------------------

/** Scan forward for an unescaped `]]` closer; return its relative offset, else -1. */
function findCloseBrackets(cx: InlineCx, from: number): number {
  let i = from
  while (i < cx.end) {
    const c = cx.char(i)
    if (c === RBRACK && cx.char(i + 1) === RBRACK) return i
    if (c === NEWLINE || c === -1) return -1 // never cross a line break
    i++
  }
  return -1
}

interface InlineCx {
  end: number
  char(pos: number): number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elt(name: string, from: number, to: number): any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addElement(el: any): any
}

export const obsidianExtension: MarkdownConfig = {
  defineNodes: [
    { name: 'Highlight', style: t.content },
    { name: 'Comment' },
    { name: 'Tag', style: t.link },
    { name: 'WikiLink', style: t.link },
    { name: 'Embed', style: t.link },
    { name: 'FootnoteRef', style: t.link },
    { name: 'Frontmatter', style: t.monospace },
    { name: 'FootnoteDef' }
  ],
  parseInline: [
    {
      // Embed  ![[target]]
      name: 'Embed',
      before: 'Image',
      parse(cx, next, pos) {
        if (next !== BANG) return -1
        if (cx.char(pos + 1) !== LBRACK || cx.char(pos + 2) !== LBRACK) return -1
        const close = findCloseBrackets(cx as InlineCx, pos + 3)
        if (close < 0) return -1
        if (close === pos + 3) return -1 // empty
        return cx.addElement(cx.elt('Embed', pos, close + 2))
      }
    },
    {
      // WikiLink  [[target|alias]] / [[target#head]] / [[target#^id]]
      name: 'WikiLink',
      before: 'Link',
      parse(cx, next, pos) {
        if (next !== LBRACK) return -1
        if (cx.char(pos + 1) !== LBRACK) return -1
        const close = findCloseBrackets(cx as InlineCx, pos + 2)
        if (close < 0) return -1
        if (close === pos + 2) return -1 // empty
        return cx.addElement(cx.elt('WikiLink', pos, close + 2))
      }
    },
    {
      // Footnote reference  [^id]
      name: 'FootnoteRef',
      before: 'Link',
      parse(cx, next, pos) {
        if (next !== LBRACK) return -1
        if (cx.char(pos + 1) !== CARET) return -1
        let end = pos + 2
        while (end < cx.end) {
          const c = cx.char(end)
          if (c === RBRACK) break
          if (c === SPACE || c === NEWLINE || c === LBRACK || c === -1) return -1
          if (!isWord(c)) return -1
          end++
        }
        if (cx.char(end) !== RBRACK) return -1
        if (end === pos + 2) return -1 // empty
        return cx.addElement(cx.elt('FootnoteRef', pos, end + 1))
      }
    },
    {
      // Highlight  ==text==
      name: 'Highlight',
      before: 'Link',
      parse(cx, next, pos) {
        if (next !== EQ) return -1
        if (cx.char(pos + 1) !== EQ) return -1
        // Not `===` (three or more) — leave for plain text / setext.
        if (cx.char(pos + 2) === EQ) return -1
        // Opening `==` must hug content — no space right after (Obsidian parity).
        if (cx.char(pos + 2) === SPACE || cx.char(pos + 2) === -1) return -1
        let end = pos + 2
        while (end < cx.end) {
          const c = cx.char(end)
          if (c === EQ && cx.char(end + 1) === EQ && cx.char(end + 2) !== EQ) break
          if (c === NEWLINE || c === -1) return -1
          end++
        }
        if (cx.char(end) !== EQ || cx.char(end + 1) !== EQ) return -1
        if (end === pos + 2) return -1 // empty
        return cx.addElement(cx.elt('Highlight', pos, end + 2))
      }
    },
    {
      // Comment  %%text%%
      name: 'Comment',
      before: 'Link',
      parse(cx, next, pos) {
        if (next !== PCT) return -1
        if (cx.char(pos + 1) !== PCT) return -1
        let end = pos + 2
        while (end < cx.end) {
          const c = cx.char(end)
          if (c === PCT && cx.char(end + 1) === PCT) break
          if (c === NEWLINE || c === -1) return -1
          end++
        }
        if (cx.char(end) !== PCT || cx.char(end + 1) !== PCT) return -1
        if (end === pos + 2) return -1 // empty
        return cx.addElement(cx.elt('Comment', pos, end + 2))
      }
    },
    {
      // Tag  #tag / #nested/tag  (only when preceded by start/space/punct)
      name: 'Tag',
      before: 'Link',
      parse(cx, next, pos) {
        if (next !== HASH) return -1
        const c1 = cx.char(pos + 1)
        if (!isAlphaNum(c1) && c1 !== 95) return -1 // alphanumeric or underscore right after #
        const prev = pos > 0 ? cx.char(pos - 1) : -1
        if (isWord(prev) || prev === SLASH) return -1 // not mid-word / mid-path
        let end = pos + 1
        while (end < cx.end) {
          const c = cx.char(end)
          if (!isTagChar(c)) break
          end++
        }
        while (cx.char(end - 1) === SLASH) end-- // never end on `/`
        if (end === pos + 1) return -1
        return cx.addElement(cx.elt('Tag', pos, end))
      }
    }
  ],
  parseBlock: [
    {
      // Frontmatter — YAML delimited by `---`, only at the very start of the doc.
      name: 'Frontmatter',
      before: 'HorizontalRule',
      parse(cx, line) {
        if (cx.lineStart !== 0) return false // must be the first line
        if (line.text !== '---') return false
        // The next line must be non-blank — otherwise this `---` is a thematic
        // break (or a lone `---`), not frontmatter.
        if (cx.peekLine() === '') return false
        const from = 0
        while (cx.nextLine()) {
          if (line.text === '---' || line.text === '...') {
            const to = cx.lineStart + line.text.length
            cx.addElement(cx.elt('Frontmatter', from, to))
            cx.nextLine()
            return true
          }
        }
        // Unterminated (user mid-typing) — take the remainder as frontmatter.
        cx.addElement(cx.elt('Frontmatter', from, cx.prevLineEnd()))
        return true
      }
    },
    {
      // Footnote definition  [^id]: text  (single-line body).
      name: 'FootnoteDef',
      before: 'LinkReference',
      parse(cx, line) {
        const text = line.text
        const base = line.pos
        if (text.charCodeAt(base) !== LBRACK || text.charCodeAt(base + 1) !== CARET) return false
        let i = base + 2
        while (i < text.length && text.charCodeAt(i) !== RBRACK) {
          if (!isWord(text.charCodeAt(i))) return false
          i++
        }
        if (text.charCodeAt(i) !== RBRACK || text.charCodeAt(i + 1) !== 58 /* : */) return false
        const from = cx.lineStart + base
        const to = cx.lineStart + text.length
        cx.addElement(cx.elt('FootnoteDef', from, to))
        cx.nextLine()
        return true
      }
    }
  ]
}
