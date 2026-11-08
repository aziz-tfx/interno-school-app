// Telegram Mini App support: the whole app (staff and students) opens from
// the school bot's menu button (Интеграции → Telegram → «Подключить бота»).
//
// Telegram opens  https://<app>/?tenantId=<school>#tgWebAppData=…&tgWebAppPlatform=…
// The SDK (telegram-web-app.js) is only loaded on such launches, so the plain
// web version doesn't pay for it. main.jsx waits for it before the first render.

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js'
const LAUNCH_KEY = 'interno_tg_launch'
const TENANT_KEY = 'interno_tg_tenant'
const SKIP_AUTOLOGIN_KEY = 'interno_tg_skip_autologin'

const session = {
  get(key) { try { return sessionStorage.getItem(key) } catch { return null } },
  set(key, value) { try { sessionStorage.setItem(key, value) } catch { /* private mode */ } },
  remove(key) { try { sessionStorage.removeItem(key) } catch { /* private mode */ } },
}

/**
 * Was this page opened by Telegram? Launch params live in the URL hash only
 * on the first load — react-router redirects drop it — so remember it for
 * the tab's lifetime (sessionStorage survives reloads inside the webview).
 */
export function isTelegramLaunch() {
  if (typeof window === 'undefined') return false
  const { hash, search } = window.location
  if (/[#&?]tgWebApp(Data|Platform|Version)=/.test(hash + search)) {
    session.set(LAUNCH_KEY, '1')
    const tenantId = new URLSearchParams(search).get('tenantId')
    if (tenantId) session.set(TENANT_KEY, tenantId)
    return true
  }
  return session.get(LAUNCH_KEY) === '1'
}

/** Load telegram-web-app.js; resolves either way (a blocked CDN must not block the app). */
export function loadTelegramSdk(timeoutMs = 5000) {
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp)
  return new Promise((resolve) => {
    const done = () => resolve(window.Telegram?.WebApp || null)
    const script = document.createElement('script')
    script.src = SDK_URL
    script.async = true
    script.onload = done
    script.onerror = done
    document.head.appendChild(script)
    setTimeout(done, timeoutMs)
  })
}

/** The WebApp object — only when actually running inside Telegram. */
export function getWebApp() {
  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null
  return tg && tg.initData ? tg : null
}

export const isInTelegram = () => Boolean(getWebApp())

/** Signed launch data for the server (empty outside Telegram). */
export const getInitData = () => getWebApp()?.initData || ''

/** School the bot belongs to (?tenantId= of the mini app URL). */
export function getLaunchTenantId() {
  const fromUrl = new URLSearchParams(window.location.search).get('tenantId')
  return fromUrl || session.get(TENANT_KEY) || 'default'
}

const versionAtLeast = (tg, v) => {
  try { return tg.isVersionAtLeast(v) } catch { return false }
}

/** Call a WebApp method that may be missing in old Telegram clients. */
function safe(fn) {
  try { fn() } catch { /* unsupported by this Telegram version */ }
}

/**
 * First-launch setup: tell Telegram we're ready, take the full height, keep
 * vertical swipes for scrolling (not for closing the app), mark <html> so
 * CSS can adapt (.tg-webapp).
 */
export function initWebApp() {
  const tg = getWebApp()
  if (!tg) return null
  document.documentElement.classList.add('tg-webapp')
  document.documentElement.dataset.tgPlatform = tg.platform || 'unknown'
  safe(() => tg.ready())
  safe(() => tg.expand())
  if (versionAtLeast(tg, '7.7')) safe(() => tg.disableVerticalSwipes())
  return tg
}

/** Match Telegram's header / background to the app theme. */
export function applyTelegramChrome(theme) {
  const tg = getWebApp()
  if (!tg || !versionAtLeast(tg, '6.1')) return
  const bg = theme === 'dark' ? '#0a0614' : '#f5f6f8'
  const header = theme === 'dark' ? '#0d0b1a' : '#ffffff'
  safe(() => tg.setHeaderColor(header))
  safe(() => tg.setBackgroundColor(bg))
  if (versionAtLeast(tg, '7.10')) safe(() => tg.setBottomBarColor(header))
}

/** Light tap feedback on navigation; no-op outside Telegram. */
export function haptic(kind = 'light') {
  const tg = getWebApp()
  if (!tg?.HapticFeedback || !versionAtLeast(tg, '6.1')) return
  safe(() => {
    if (kind === 'success' || kind === 'error' || kind === 'warning') tg.HapticFeedback.notificationOccurred(kind)
    else if (kind === 'select') tg.HapticFeedback.selectionChanged()
    else tg.HapticFeedback.impactOccurred(kind)
  })
}

/**
 * Open an external link the Telegram way: t.me links stay inside Telegram,
 * everything else opens in the in-app / system browser instead of replacing
 * the mini app. Returns false when not in Telegram (caller handles it).
 */
export function openExternalLink(href) {
  const tg = getWebApp()
  if (!tg) return false
  let url
  try { url = new URL(href, window.location.href) } catch { return false }
  if (!/^https?:$/.test(url.protocol)) return false
  if (url.hostname === 't.me' && versionAtLeast(tg, '6.1')) {
    safe(() => tg.openTelegramLink(url.href))
    return true
  }
  safe(() => tg.openLink(url.href))
  return true
}

// After «Выйти» inside Telegram, don't sign straight back in on the next
// render; the flag lives until the mini app is closed.
export const skipAutoLogin = () => session.set(SKIP_AUTOLOGIN_KEY, '1')
export const autoLoginAllowed = () => session.get(SKIP_AUTOLOGIN_KEY) !== '1'
export const allowAutoLogin = () => session.remove(SKIP_AUTOLOGIN_KEY)
