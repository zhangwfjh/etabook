import { useState } from 'react'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Copy, Check } from 'lucide-react'
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

export function CodeBlockNodeView({ node }: NodeViewProps) {
  const language = (node.attrs.language as string | null) ?? null
  const code = node.textContent

  if (language === 'mermaid') {
    return (
      <NodeViewWrapper as="div" className="etabook-code-block etabook-code-block-mermaid">
        <MermaidView source={code} />
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper as="pre" className="etabook-code-block" dir="ltr">
      <CopyButton text={code} />
      <NodeViewContent<"code"> as="code" className={`hljs language-${language ?? 'plain'}`} />
    </NodeViewWrapper>
  )
}
