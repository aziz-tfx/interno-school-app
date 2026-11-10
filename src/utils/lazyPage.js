import { lazy } from 'react'

// Pages are loaded on demand (one chunk per page) instead of in one bundle.
//
// After a deploy the chunks of the previous build are gone, so a tab that
// was open before it fails to load the next page it visits. That failure
// means "there is a new version" — reload once to pick it up. The flag
// keeps a genuinely broken chunk (or no network) from reloading forever:
// the second failure is thrown and the error is shown.

const RELOAD_FLAG = 'interno_chunk_reload'

export function lazyPage(load) {
  return lazy(async () => {
    try {
      const mod = await load()
      try { sessionStorage.removeItem(RELOAD_FLAG) } catch { /* private mode */ }
      return mod
    } catch (err) {
      let reloaded = true
      try {
        reloaded = sessionStorage.getItem(RELOAD_FLAG) === '1'
        if (!reloaded) sessionStorage.setItem(RELOAD_FLAG, '1')
      } catch { /* without storage we can't guard against a reload loop */ }
      if (!reloaded && navigator.onLine !== false) {
        window.location.reload()
        // Keep the spinner up until the reload happens
        return new Promise(() => {})
      }
      throw err
    }
  })
}

// Warm a page's chunk before it is opened (hover on a menu item, idle time).
export function preload(load) {
  load().catch(() => { /* the real navigation reports the failure */ })
}
