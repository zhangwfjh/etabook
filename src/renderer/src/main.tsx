import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/geist'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import 'katex/dist/katex.min.css'
import './styles/base.css'
import './styles/theme.css'
import './styles/codemirror.css'
import './styles/reading.css'
import { ThemeProvider } from '@renderer/features/settings/ThemeProvider'
import { StoreProvider } from '@renderer/lib/store'
import { App } from './App'

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </ThemeProvider>
  </StrictMode>
)
