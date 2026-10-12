import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import IndiaApp from './IndiaApp.tsx'
import type { IndiaPage } from './IndiaApp.tsx'
import './themes.css'

const path = window.location.pathname.replace(/\/+$/, '') || '/'
const indiaRoutes: Record<string, IndiaPage> = {
  '/india': 'buyer', '/india/market': 'market', '/india/builders': 'builders',
}
const page = indiaRoutes[path]

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {page ? <IndiaApp page={page} /> : path === '/' ? <App /> : <main><h1>Page not found</h1><p><a href="/">US calculator</a> · <a href="/india">India calculators</a></p></main>}
  </StrictMode>,
)
