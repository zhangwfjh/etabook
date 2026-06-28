import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Sparkles, Square, RefreshCw } from 'lucide-react'
import { useAIPlanStream } from '@/state/ai-plan-store'
import { useStreamAIPlan } from '@/llm/stream-ai-plan'
import { useCreateSnapshot } from '@/queries/snapshots'
import { useWorkspace } from '@/state/store'
import { getMarkdownManager } from '@/editor/markdown-manager'
import { toast } from 'sonner'
import type { JSONContent } from '@tiptap/core'

export function AIPlanNodeView({ node, editor }: NodeViewProps) {
  const id = node.attrs.id as string
  const model = node.attrs.model as string
  const progress = useAIPlanStream((s) => s.progress[id])
  const start = useAIPlanStream((s) => s.startStream)
  const end = useAIPlanStream((s) => s.endStream)
  const setError = useAIPlanStream((s) => s.setError)
  const setProgress = useAIPlanStream((s) => s.setProgress)
  const running = !!progress?.running
  const streamAIPlan = useStreamAIPlan()
  const createSnap = useCreateSnapshot()
  const active = useWorkspace((s) => s.activeFilePath)

  async function run() {
    const prompt = (node.textContent || '').trim()
    if (!prompt) {
      toast.error('Add a prompt inside the callout first.')
      return
    }

    const mgr = getMarkdownManager()
    const md = editor ? mgr.serialize(editor.state.doc.toJSON() as JSONContent) : null
    if (active && md) {
      createSnap.mutate({ filePath: active, content: md, trigger: 'pre-ai', isAutosave: false })
    }

    start(`aiplan-${id}-${Date.now()}`)
    setProgress(id, '', true)
    try {
      const full = await streamAIPlan({
        prompt,
        onDelta: (d) => {
          setProgress(id, d, true)
        },
      })
      setProgress(id, full, false)

      if (active) {
        const postMd = editor ? mgr.serialize(editor.state.doc.toJSON() as JSONContent) : null
        if (postMd) createSnap.mutate({ filePath: active, content: postMd, trigger: 'post-ai', model, isAutosave: false })
      }
    } catch (e: any) {
      setError(e.message ?? 'Stream failed')
      toast.error(`AI plan failed: ${e.message}`)
    } finally {
      end()
    }
  }

  function cancel() {
    const key = useAIPlanStream.getState().abortKey
    if (key) window.api?.llm?.streamCancel?.({ abortKey: key })
  }

  return (
    <NodeViewWrapper
      as="aside"
      data-ai-plan
      className="my-4 rounded-default border border-ai-plan-border bg-ai-plan-bg p-3"
    >
      <div className="flex items-center gap-2 text-xs text-fg-muted mb-2">
        <Sparkles className="size-3.5" />
        <span>AI plan · {model}</span>
        <span className="ml-auto" />
        {running ? (
          <button
            onClick={cancel}
            className="px-2 py-0.5 rounded border border-border hover:bg-bg-subtle inline-flex items-center gap-1"
          >
            <Square className="size-3" /> Stop
          </button>
        ) : (
          <button
            onClick={run}
            className="px-2 py-0.5 rounded border border-border hover:bg-bg-subtle inline-flex items-center gap-1"
          >
            <RefreshCw className="size-3" /> Run
          </button>
        )}
      </div>
      {running && progress?.partial ? (
        <div className="text-sm text-fg-muted px-2 py-1">{progress.partial}</div>
      ) : null}
      <NodeViewContent className="text-sm text-fg-primary" />
    </NodeViewWrapper>
  )
}
