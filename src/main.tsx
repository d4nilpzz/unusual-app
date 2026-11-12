import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// A packaged build has nothing to debug in the window, so the context menu and
// the devtools shortcuts only expose the app's internals. Left alone in dev.
if (import.meta.env.PROD) {
  window.addEventListener('contextmenu', (event) => event.preventDefault())
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase()
    const isDevtools =
      key === 'f12' ||
      (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key)) ||
      (event.ctrlKey && key === 'u')
    if (isDevtools) event.preventDefault()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme theme={neutralTheme} mode="dark">
      <App />
    </Theme>
  </StrictMode>,
)
