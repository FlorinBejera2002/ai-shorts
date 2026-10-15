import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { RouteError } from './routing/route-error'

// Nested routes replace only dashboard content, preserving the shared layout.
const router = createBrowserRouter([{ path: '*', element: <App />, errorElement: <RouteError /> }])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
