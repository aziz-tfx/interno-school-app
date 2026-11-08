// Glue between the app and the Telegram Mini App shell. Renders nothing.
//   - Telegram's native «Назад» button follows the in-app history;
//   - the app theme follows Telegram's, and Telegram's header/background
//     follow the app theme;
//   - external links open via Telegram instead of replacing the mini app;
//   - after a password login inside Telegram, the Telegram account is linked
//     so the next launch signs in automatically.
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { USE_SERVER, api } from '../backend/api'
import { toast } from './Toaster'
import { getWebApp, getInitData, applyTelegramChrome, openExternalLink } from '../utils/telegramWebApp'

export default function TelegramBridge() {
  const tg = getWebApp()
  if (!tg) return null
  return <Bridge tg={tg} />
}

function Bridge({ tg }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const { user, patchUser } = useAuth()

  // ─── Back button ──────────────────────────────────────────────────
  // react-router keeps the history index in history.state.idx: go back
  // while there is in-app history, otherwise up to the home screen.
  const isHome = location.pathname === '/' && !new URLSearchParams(location.search).get('tab')
  useEffect(() => {
    const back = tg.BackButton
    if (!back) return
    // /tg — the older student-only mini app has its own navigation
    if (location.pathname.startsWith('/tg')) { back.hide(); return }
    const onBack = () => {
      if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
      else navigate('/', { replace: true })
    }
    if (isHome || location.pathname === '/login') back.hide()
    else back.show()
    back.onClick(onBack)
    return () => back.offClick(onBack)
  }, [tg, isHome, location.pathname, navigate])

  // ─── Theme ────────────────────────────────────────────────────────
  useEffect(() => {
    if (tg.colorScheme) setTheme(tg.colorScheme)
    const onThemeChanged = () => setTheme(tg.colorScheme)
    tg.onEvent?.('themeChanged', onThemeChanged)
    return () => tg.offEvent?.('themeChanged', onThemeChanged)
  }, [tg, setTheme])

  useEffect(() => { applyTelegramChrome(theme) }, [theme])

  // ─── External links ───────────────────────────────────────────────
  useEffect(() => {
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0) return
      const a = e.target.closest?.('a[href]')
      if (!a || a.hasAttribute('download')) return
      const href = a.getAttribute('href')
      let url
      try { url = new URL(href, window.location.href) } catch { return }
      const external = url.origin !== window.location.origin || a.target === '_blank'
      if (!external) return
      if (openExternalLink(url.href)) e.preventDefault()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  // ─── Link this Telegram to the account after a password login ─────
  const linkTried = useRef(null)
  useEffect(() => {
    if (!USE_SERVER || !user || user.telegramLinked) return
    const key = user._docId || user.id
    if (linkTried.current === key) return
    linkTried.current = key
    const initData = getInitData()
    if (!initData) return
    api('/api/auth/telegram-link', { method: 'POST', body: { initData } })
      .then(() => {
        patchUser({ telegramLinked: true })
        toast.success('Telegram привязан — дальше вход будет автоматическим')
      })
      .catch(() => { /* other bot / old server: password login keeps working */ })
  }, [user, patchUser])

  return null
}
