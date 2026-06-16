import { useState, useEffect, useRef, useCallback } from 'react'

// Detects when a new app version has been deployed.
// Each Vite build emits a hashed main bundle (e.g. /assets/index-AbC123.js)
// referenced in index.html. We fetch index.html periodically (no-store),
// extract that hash, and compare it to the hash seen on first load.
// When it changes → a new deploy is live → prompt the user to refresh.

const CHECK_INTERVAL_MS = 60_000 // 1 minute

async function fetchCurrentHash() {
  try {
    const res = await fetch(`/?_v=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const html = await res.text()
    // Match the main module bundle hash
    const m = html.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export default function useAppUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const baselineHash = useRef(null)

  const check = useCallback(async () => {
    if (updateAvailable) return
    const hash = await fetchCurrentHash()
    if (!hash) return
    if (baselineHash.current == null) {
      baselineHash.current = hash
      return
    }
    if (hash !== baselineHash.current) {
      setUpdateAvailable(true)
    }
  }, [updateAvailable])

  useEffect(() => {
    // Only meaningful in production (dev uses HMR, no hashed bundles)
    if (!import.meta.env.PROD) return

    check() // establish baseline on mount
    const interval = setInterval(check, CHECK_INTERVAL_MS)

    // Re-check when the user returns to the tab
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [check])

  const reload = () => {
    // Force a hard reload to fetch the new bundle
    window.location.reload()
  }

  return { updateAvailable, reload }
}
