import type { RendererApi } from '../../preload/api'

declare global {
  interface Window {
    api: RendererApi
  }
}

export {}
