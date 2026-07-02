import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'

// Shown while some Firestore collections are still serving cache-only data
// (no server-confirmed snapshot yet). Cache can be incomplete — e.g. after
// an outage only part of the payments collection may be cached — so totals
// on screen may be temporarily understated. The banner disappears as soon
// as every subscription has synced with the server.
//
// A short grace delay avoids flashing on every normal page load (the
// cache-first snapshot always arrives before the server one).
const SHOW_AFTER_MS = 2500
// Hard cap: never show longer than this per sync episode. If one listener
// is stuck erroring/retrying, an eternal banner is worse than none — data
// on screen is already the best available and retries continue silently.
const MAX_SHOW_MS = 30000

export default function SyncBanner() {
  const { user } = useAuth()
  const { syncPending } = useData()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!syncPending) {
      setVisible(false)
      return
    }
    const showTimer = setTimeout(() => setVisible(true), SHOW_AFTER_MS)
    const capTimer = setTimeout(() => setVisible(false), SHOW_AFTER_MS + MAX_SHOW_MS)
    return () => { clearTimeout(showTimer); clearTimeout(capTimer) }
  }, [syncPending])

  if (!user || !visible) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-amber-500 text-white shadow-lg shadow-amber-500/30 text-sm font-medium">
      <RefreshCw size={15} className="animate-spin" />
      Синхронизация с базой… цифры могут быть временно неполными
    </div>
  )
}
