import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { applyTheme, loadInitialTheme } from './themes'
import { applyEditorScale, loadInitialEditorScale } from './lib/editor-scale'
import { queryClient } from './queries/client'
import { keys } from './queries/keys'
import { Toaster } from '@/components/ui/sonner'
import './styles/globals.css'

applyTheme(loadInitialTheme())
// Apply persisted editor text scale before first paint so the editor surface
// doesn't flash at the default size. Settings updates this live.
applyEditorScale(loadInitialEditorScale())

// Prefetch settings before first render so startup-sensitive consumers (theme,
// editor scale, and especially keyboard shortcuts) resolve synchronously on
// mount. Without this, `useShortcuts` would bind against DEFAULT_CONFIG for the
// first tick — firing the wrong accelerators for any user who rebound a key.
await queryClient.prefetchQuery({
  queryKey: keys.settings,
  queryFn: () => window.api.settings.get(),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster richColors position="bottom-right" />
    </QueryClientProvider>
  </StrictMode>,
)
