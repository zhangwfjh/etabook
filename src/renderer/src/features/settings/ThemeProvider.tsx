import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '@renderer/lib/ipc'
import { DEFAULT_CONFIG, type AppConfig, type ThemeMode } from '@shared/types'

type ThemeContextValue = {
  dark: boolean
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
  config: AppConfig
  setConfig: (patch: Partial<AppConfig>) => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [config, setConfigState] = useState<AppConfig>(DEFAULT_CONFIG)
  const [systemDark, setSystemDark] = useState(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true
    api()
      .getConfig()
      .then((c) => {
        if (mounted) {
          setConfigState({ ...DEFAULT_CONFIG, ...c })
          setReady(true)
        }
      })
      .catch(() => {
        if (mounted) setReady(true)
      })
    const unsub = api().onThemeSysChange((isDark) => setSystemDark(isDark))
    return () => {
      mounted = false
      unsub()
    }
  }, [])

  const dark = config.theme === 'dark' || (config.theme === 'system' && systemDark)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', dark)
  }, [dark])

  const setTheme = (t: ThemeMode): void => {
    const next = { ...config, theme: t }
    setConfigState(next)
    void api().setConfig(next)
  }

  const setConfig = async (patch: Partial<AppConfig>): Promise<void> => {
    const next = { ...config, ...patch }
    setConfigState(next)
    await api().setConfig(next)
  }

  if (!ready) return <div className="h-full w-full bg-[var(--bg)]" />

  return (
    <ThemeContext.Provider value={{ dark, theme: config.theme, setTheme, config, setConfig }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
