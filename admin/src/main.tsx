import '@fontsource-variable/inter'
import '@fontsource-variable/sora'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { App } from './App'
import { installErrorReporting } from './lib/error-reporting'
import './theme.css'
import './styles.css'

installErrorReporting()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster position="top-right" theme="light" closeButton />
  </StrictMode>
)
