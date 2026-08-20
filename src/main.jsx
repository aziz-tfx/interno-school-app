import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DataProvider } from './contexts/DataContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { ThemeProvider } from './contexts/ThemeContext'
import Toaster from './components/Toaster'
import UpdateBanner from './components/UpdateBanner'
import SyncBanner from './components/SyncBanner'
import App from './App'
import './index.css'

// Liquid-glass cursor glint (same mechanic as the interno-architecture
// landing): keep --mx/--my in sync with the pointer so the ::after
// radial highlight on glass surfaces follows the cursor.
document.addEventListener('pointermove', (e) => {
  const el = e.target?.closest?.('.glass-card, .glass-strong, .glass-btn')
  if (!el) return
  const r = el.getBoundingClientRect()
  el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%')
  el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%')
})

function DataProviderWithUser({ children }) {
  const { user } = useAuth()
  return <DataProvider currentUser={user}>{children}</DataProvider>
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <DataProviderWithUser>
              <App />
              <Toaster />
              <UpdateBanner />
              <SyncBanner />
            </DataProviderWithUser>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
