import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'
import ProductPage from './components/ProductPage.jsx'
import './index.css'
import { LanguageProvider } from './i18n.jsx'

const productMatch = window.location.pathname.match(/^\/products\/([^/]+)\/?$/)
const initialSlug = productMatch ? decodeURIComponent(productMatch[1]) : null
const RootComponent = window.location.pathname.startsWith('/admin')
  ? AdminDashboard
  : () => <App initialSlug={initialSlug} />

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider><RootComponent /></LanguageProvider>
  </StrictMode>,
)
