import { useState, useEffect } from 'react'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Copy, Check } from 'lucide-react'
import { TextSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'
import { MermaidView } from './mermaid-view'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard may be unavailable; silently ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className="etabook-code-copy"
      aria-label={copied ? 'Copied' : 'Copy code'}
      title={copied ? 'Copied!' : 'Copy'}
      contentEditable={false}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  )
}

const FENCE_RE = /^(`{3,}|~{3,})(.*)$/

/**
 * Replace the code block at `pos` with a blockquote holding its text content
 * (split on newlines into paragraphs). Used when the user removes the fence
 * header — a code block without a fence becomes a blockquote (its content is
 * still wrapped/quoted, just without the code rendering). The closing fence
 * is structural (never stored in text), so it disappears too.
 */
export function unwrapCodeToBlockquote(editor: Editor, pos: number): void {
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return
  const schema = editor.state.schema
  const lines = node.textContent.split('\n')
  const paras = lines.map((line) =>
    schema.nodes.paragraph.create(null, line ? schema.text(line) : null),
  )
  const blockquote = schema.nodes.blockquote.create(null, paras)
  const tr = editor.state.tr.replaceWith(pos, pos + node.nodeSize, blockquote)
  tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 2)))
  editor.view.dispatch(tr)
}

export function CodeBlockNodeView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const language = (node.attrs.language as string | null) ?? null
  const code = node.textContent

  if (language === 'mermaid') {
    return (
      <NodeViewWrapper as="div" className="etabook-code-block etabook-code-block-mermaid">
        <MermaidView source={code} />
      </NodeViewWrapper>
    )
  }
  const fenceChar = (node.attrs.fenceChar as string) === '~' ? '~' : '`'
  const fenceLength =
    typeof node.attrs.fenceLength === 'number' && node.attrs.fenceLength >= 3
      ? node.attrs.fenceLength
      : 3
  const fence = fenceChar.repeat(fenceLength)

  // The header input shows the LITERAL fence line (e.g. ```js) and is the
  // single editable surface for both the fence and the language. We keep a
  // local string so typing is never clobbered by re-renders, and sync it from
  // node attrs when they change externally (undo/redo, AI edits).
  const headerFromAttrs = fence + (language ?? '')
  const [header, setHeader] = useState(headerFromAttrs)
  useEffect(() => {
    setHeader(headerFromAttrs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerFromAttrs])

  // Focus-based toggle (same model as the callout header): in edit mode the
  // header shows the plain language label normally, but switches to the raw
  // editable fence line (```lang) when the header input is focused. View mode
  // always shows the plain label.
  const [focused, setFocused] = useState(false)
  function onHeaderChange(raw: string): void {
    setHeader(raw)
    // Clearing the whole header line removes the fence → convert to blockquote.
    if (raw === '') {
      const pos = getPos()
      if (typeof pos === 'number') unwrapCodeToBlockquote(editor, pos)
      return
    }
    const m = FENCE_RE.exec(raw)
    if (m) {
      updateAttributes({
        fenceChar: m[1][0] === '~' ? '~' : '`',
        fenceLength: m[1].length,
        language: m[2] || null,
      })
    }
    // Non-empty but not (yet) a valid fence (e.g. user typed a single `~`):
    // leave attrs alone and let them keep typing.
  }

  return (
    <NodeViewWrapper as="div" className="etabook-code-block etabook-code-block--edit" dir="ltr">
      <CopyButton text={code} />
      <div
        className={`etabook-code-block-header${focused ? ' is-focused' : ''}${language ? '' : ' etabook-code-block-header--empty'}`}
        contentEditable={false}
      >
        {/* Field: wraps the static label and the raw input. The input is
            always present (never display:none) but invisible (opacity:0,
            position:absolute) when not focused — it overlays the static label
            so clicking the header focuses it. */}
        <div className="etabook-code-block-field">
          {language ? (
            <span className="etabook-code-lang etabook-code-lang--static">{language}</span>
          ) : null}
          <input
            className="etabook-code-lang etabook-code-lang--edit"
            type="text"
            value={header}
            placeholder="```language"
            spellCheck={false}
            onChange={(e) => onHeaderChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      </div>
      <pre className="etabook-code-block-pre">
        <NodeViewContent<"code"> as="code" className={`hljs language-${language ?? 'plain'}`} />
      </pre>
    </NodeViewWrapper>
  )
}
