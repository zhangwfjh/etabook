import { useState, useEffect, useRef, useId } from 'react'
import mermaid from 'mermaid'

let initialized = false
const mountedViews = new Set<() => void>()

function currentTheme(): 'default' | 'dark' {
  return document.documentElement.dataset.theme === 'paper-dark' ? 'dark' : 'default'
}

function initMermaid() {
  if (initialized) return
  initialized = true
  mermaid.initialize({
    startOnLoad: false,
    theme: currentTheme(),
    securityLevel: 'strict',
  })
}

if (typeof window !== 'undefined') {
  const observer = new MutationObserver(() => {
    if (!initialized) return
    mermaid.initialize({ startOnLoad: false, theme: currentTheme(), securityLevel: 'strict' })
    mountedViews.forEach((rerender) => rerender())
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
}

type Props = {
  source: string
}

export function MermaidView({ source }: Props) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    initMermaid()

    const render = async () => {
      const id = `mermaid-${reactId}`
      try {
        const stale = document.getElementById(id)
        if (stale) stale.remove()
        const { svg: rendered } = await mermaid.render(id, source || 'graph TD\n  A --> B')
        setSvg(rendered)
        setError(null)
      } catch (e: any) {
        setError(e?.message ?? String(e))
        setSvg(null)
      }
    }

    if (renderTimer.current) clearTimeout(renderTimer.current)
    renderTimer.current = setTimeout(render, 300)

    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current)
    }
  }, [source, reactId])

  useEffect(() => {
    const rerender = () => {
      const id = `mermaid-${reactId}`
      mermaid.render(id, source || 'graph TD\n  A --> B')
        .then(({ svg: rendered }) => { setSvg(rendered); setError(null) })
        .catch((e: any) => { setError(e?.message ?? String(e)); setSvg(null) })
    }
    mountedViews.add(rerender)
    return () => { mountedViews.delete(rerender) }
  }, [source, reactId])

  if (error) {
    return (
      <div className="etabook-mermaid etabook-mermaid-error">
        <div className="etabook-mermaid-error-banner">Mermaid render error: {error}</div>
        <pre className="etabook-mermaid-source">{source}</pre>
      </div>
    )
  }

  return (
    <div
      className="etabook-mermaid"
      dangerouslySetInnerHTML={{ __html: svg ?? '<div class="etabook-mermaid-loading">Rendering diagram…</div>' }}
    />
  )
}
