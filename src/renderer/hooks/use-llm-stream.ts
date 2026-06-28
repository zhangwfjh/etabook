import { useRef } from 'react'
import type { StreamChunkEvt, StreamEndEvt, StreamErrorEvt } from '../../shared/ipc'

export type StreamInput = {
  prompt: string
  model: string
  providerId: string
  onDelta: (delta: string) => void
  onComplete: (full: string) => void
  onError: (msg: string) => void
}

export function useLlmStream() {
  const collectedRef = useRef('')
  const abortKeyRef = useRef<string | null>(null)

  return {
    stream: (input: StreamInput) =>
      new Promise<string>((resolve, reject) => {
        abortKeyRef.current = `stream-${Date.now()}`
        collectedRef.current = ''

        const offChunk = window.api.llm.onStreamChunk(
          (e: StreamChunkEvt) => {
            if (e.abortKey !== abortKeyRef.current) return
            collectedRef.current += e.delta
            input.onDelta(e.delta)
          },
        )

        const offEnd = window.api.llm.onStreamEnd((e: StreamEndEvt) => {
          if (e.abortKey !== abortKeyRef.current) return
          cleanup()
          input.onComplete(collectedRef.current)
          resolve(collectedRef.current)
        })

        const offErr = window.api.llm.onStreamError((e: StreamErrorEvt) => {
          if (e.abortKey !== abortKeyRef.current) return
          cleanup()
          input.onError(e.message)
          reject(new Error(e.message))
        })

        function cleanup() {
          offChunk()
          offEnd()
          offErr()
        }

        window.api.llm
          .streamStart({
            provider: input.providerId,
            model: input.model,
            prompt: input.prompt,
            abortKey: abortKeyRef.current,
          })
          .catch((err: unknown) => {
            cleanup()
            reject(err)
          })
      }),
    cancel: () => {
      if (abortKeyRef.current)
        window.api.llm.streamCancel({ abortKey: abortKeyRef.current })
    },
  }
}
