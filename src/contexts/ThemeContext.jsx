import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {}, setTheme: () => {} })

const STORAGE_KEY = 'interno_theme'

function readInitialTheme() {
  if (typeof window === 'undefined') return 'light'
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch (_e) { /* ignore */ }
  // System preference fallback
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readInitialTheme)

  // Apply theme to <html> as a class, so Tailwind's `dark:` variant
  // and our index.css overrides activate together.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.dataset.theme = theme
    // Browser / PWA chrome follows the app theme, not just the OS one
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
      m.setAttribute('content', theme === 'dark' ? '#0a0614' : '#f5f6f8')
    })
    try { localStorage.setItem(STORAGE_KEY, theme) } catch (_e) { /* ignore */ }
  }, [theme])

  const setTheme = useCallback((t) => {
    if (t === 'light' || t === 'dark') setThemeState(t)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
