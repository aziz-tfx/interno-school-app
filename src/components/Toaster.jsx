import { useState, useEffect } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

// Lightweight toast system. Call toast('Сообщение', 'success'|'error'|'info')
// from anywhere (components, utils). <Toaster /> is mounted once in main.jsx.

let listeners = []
let idCounter = 0

export function toast(message, type = 'info', duration = 4000) {
  const t = { id: ++idCounter, message, type, duration }
  listeners.forEach(fn => fn(t))
}

toast.success = (msg, d) => toast(msg, 'success', d)
toast.error = (msg, d) => toast(msg, 'error', d)
toast.info = (msg, d) => toast(msg, 'info', d)

const STYLES = {
  success: { icon: CheckCircle2, bar: 'bg-emerald-500', iconColor: 'text-emerald-500' },
  error:   { icon: AlertCircle,  bar: 'bg-red-500',     iconColor: 'text-red-500' },
  info:    { icon: Info,         bar: 'bg-blue-500',    iconColor: 'text-blue-500' },
}

export default function Toaster() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const onToast = (t) => {
      setToasts(prev => [...prev, t])
      setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== t.id))
      }, t.duration)
    }
    listeners.push(onToast)
    return () => { listeners = listeners.filter(fn => fn !== onToast) }
  }, [])

  const dismiss = (id) => setToasts(prev => prev.filter(x => x.id !== id))

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-md pointer-events-none">
      {toasts.map(t => {
        const s = STYLES[t.type] || STYLES.info
        const Icon = s.icon
        return (
          <div key={t.id}
            className="pointer-events-auto flex items-start gap-3 bg-white rounded-2xl shadow-2xl shadow-black/15 border border-slate-100 p-4 pr-3 animate-[toastIn_250ms_cubic-bezier(0.21,1.02,0.73,1)] overflow-hidden relative">
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${s.bar}`} />
            <Icon size={20} className={`${s.iconColor} flex-shrink-0 mt-0.5`} />
            <p className="flex-1 text-sm text-slate-700 leading-snug">{t.message}</p>
            <button onClick={() => dismiss(t.id)}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 flex-shrink-0">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
