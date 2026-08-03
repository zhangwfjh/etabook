import type { MarkdownConfig } from '@lezer/markdown'
import { tags as t } from '@lezer/highlight'

/**
 * Lezer-markdown extension that promotes `$...$` (inline) and `$$...$$`
 * (display) math to first-class parse-tree nodes (`InlineMath`, `BlockMath`).
 *
 * Both the live-preview decorations and the export serializer consume these
 * nodes and render them through the shared KaTeX primitive, so math looks
 * identical whether you are editing, reading, or exporting. Mirrors the
 * `$`/`$$` rules the previous markdown-it math plugin used.
 */

const DOLLAR = 36

/** Index of the next `$$` in `text` at or after `from`, else -1. */
function findDD(text: string, from: number): number {
  for (let i = from; i + 1 < text.length; i++) {
    if (text.charCodeAt(i) === DOLLAR && text.charCodeAt(i + 1) === DOLLAR) return i
  }
  return -1
}

export const mathExtension: MarkdownConfig = {
  defineNodes: [
    { name: 'InlineMath', style: t.monospace },
    { name: 'BlockMath', style: t.monospace }
  ],
  parseInline: [
    {
      name: 'InlineMath',
      before: 'Emphasis',
      parse(cx, next, pos) {
        // Trigger only on a lone `$` (not `$$`, which is display math).
        if (next !== DOLLAR) return -1
        if (cx.char(pos + 1) === DOLLAR) return -1
        // No space immediately after the opening `$` (avoids "$5 and $10").
        const afterOpen = cx.char(pos + 1)
        if (afterOpen === 32 /* space */ || afterOpen === -1) return -1

        let end = pos + 1
        while (end < cx.end) {
          const c = cx.char(end)
          if (c === DOLLAR) break
          // Inline math must not cross a line break.
          if (c === 10 /* \n */ || c === -1) return -1
          end++
        }
        if (cx.char(end) !== DOLLAR) return -1
        if (end === pos + 1) return -1 // empty — leave for block parser
        // Closing `$` must not be preceded by a space.
        if (cx.char(end - 1) === 32) return -1
        return cx.addElement(cx.elt('InlineMath', pos, end + 1))
      }
    }
  ],
  parseBlock: [
    {
      name: 'BlockMath',
      before: 'FencedCode',
      // Let `$$` interrupt a paragraph (like a fenced code block).
      endLeaf(_cx, line) {
        return line.text.charCodeAt(line.pos) === DOLLAR &&
          line.text.charCodeAt(line.pos + 1) === DOLLAR
      },
      parse(cx, line) {
        if (line.text.charCodeAt(line.pos) !== DOLLAR ||
            line.text.charCodeAt(line.pos + 1) !== DOLLAR) {
          return false
        }
        const from = cx.lineStart + line.pos

        // Single-line display math: `$$ ... $$`
        const sameClose = findDD(line.text, line.pos + 2)
        if (sameClose >= 0) {
          cx.addElement(cx.elt('BlockMath', from, cx.lineStart + sameClose + 2))
          cx.nextLine()
          return true
        }

        // Multi-line: consume until a line that contains `$$`, or EOF.
        for (;;) {
          if (!cx.nextLine()) {
            // Unterminated — treat the remainder as math (markdown-it parity).
            cx.addElement(cx.elt('BlockMath', from, cx.prevLineEnd()))
            return true
          }
          const idx = findDD(line.text, 0)
          if (idx >= 0) {
            // Close at the first `$$` on this line; advance past it so the
            // parser doesn't re-enter the closing line and spawn a dupe node.
            cx.addElement(cx.elt('BlockMath', from, cx.lineStart + idx + 2))
            cx.nextLine()
            return true
          }
        }
      }
    }
  ]
}
