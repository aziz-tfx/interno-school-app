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
import TelegramBridge from './components/TelegramBridge'
import App from './App'
import { isTelegramLaunch, loadTelegramSdk, initWebApp } from './utils/telegramWebApp'
import './index.css'

function DataProviderWithUser({ children }) {
  const { user } = useAuth()
  return <DataProvider currentUser={user}>{children}</DataProvider>
}

function render() {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <DataProviderWithUser>
                <TelegramBridge />
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
}

// Opened from a Telegram bot: wait for the WebApp SDK so auth can sign in
// with Telegram's initData on the very first render (no login-page flash).
if (isTelegramLaunch()) {
  loadTelegramSdk().then(() => { initWebApp(); render() })
} else {
  render()
}
