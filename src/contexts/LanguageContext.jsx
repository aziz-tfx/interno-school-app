import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import ru from '../locales/ru'
import uz from '../locales/uz'

const LanguageContext = createContext(null)

const locales = { ru, uz }

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    return localStorage.getItem('interno_lang') || 'ru'
  })

  useEffect(() => {
    localStorage.setItem('interno_lang', language)
  }, [language])

  const setLanguage = useCallback((lang) => {
    if (lang === 'ru' || lang === 'uz') setLanguageState(lang)
  }, [])

  const t = useCallback((key, params) => {
    const val = locales[language]?.[key] ?? locales.ru?.[key] ?? key
    if (!params) return val
    return val.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`)
  }, [language])

  return (
    <LanguageContext.Provider value={{ t, language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
