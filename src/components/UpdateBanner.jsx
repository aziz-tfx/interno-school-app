import { useState } from 'react'
import { RefreshCw, Sparkles, X } from 'lucide-react'
import useAppUpdate from '../hooks/useAppUpdate'

// Floating "new version available" prompt. Appears when a fresh deploy
// is detected and invites the user to refresh the page.
export default function UpdateBanner() {
  const { updateAvailable, reload } = useAppUpdate()
  const [dismissed, setDismissed] = useState(false)
  const [reloading, setReloading] = useState(false)

  if (!updateAvailable || dismissed) return null

  const handleReload = () => {
    setReloading(true)
    reload()
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[210] w-[calc(100vw-2rem)] max-w-md pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white rounded-2xl shadow-2xl shadow-violet-500/30 p-3 pl-4 animate-[toastIn_300ms_cubic-bezier(0.21,1.02,0.73,1)]">
        <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
          <Sparkles size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Доступно обновление</p>
          <p className="text-xs text-white/70 leading-tight">Обновите страницу, чтобы получить новую версию</p>
        </div>
        <button
          onClick={handleReload}
          disabled={reloading}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-white text-violet-700 text-sm font-bold rounded-xl hover:bg-white/90 transition-colors flex-shrink-0 disabled:opacity-70"
        >
          <RefreshCw size={14} className={reloading ? 'animate-spin' : ''} />
          Обновить
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1.5 rounded-lg hover:bg-white/15 text-white/70 flex-shrink-0"
          title="Скрыть"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
