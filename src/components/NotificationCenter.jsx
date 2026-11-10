import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Bell, UserPlus, ListTodo, AlarmClock, Bot, Wallet, FileSignature, CreditCard, ClipboardCheck, CheckCheck, X,
} from 'lucide-react'
import useNotifications from '../hooks/useNotifications'
import { useLanguage } from '../contexts/LanguageContext'

// The bell in the header: everything that waits for this person, newest
// first, with read marks. What goes in — see hooks/useNotifications.

const KINDS = {
  lead:         { icon: UserPlus,       cls: 'bg-blue-100 text-blue-600' },
  task:         { icon: ListTodo,       cls: 'bg-violet-100 text-violet-600' },
  task_overdue: { icon: AlarmClock,     cls: 'bg-red-100 text-red-600' },
  ai:           { icon: Bot,            cls: 'bg-fuchsia-100 text-fuchsia-600' },
  pay_today:    { icon: Wallet,         cls: 'bg-amber-100 text-amber-600' },
  pay_overdue:  { icon: Wallet,         cls: 'bg-red-100 text-red-600' },
  contract:     { icon: FileSignature,  cls: 'bg-emerald-100 text-emerald-600' },
  payment:      { icon: CreditCard,     cls: 'bg-emerald-100 text-emerald-600' },
  attendance:   { icon: ClipboardCheck, cls: 'bg-orange-100 text-orange-600' },
}

function useRelativeTime() {
  const { t, language } = useLanguage()
  return (iso) => {
    const ts = Date.parse(iso)
    if (Number.isNaN(ts)) return ''
    const min = Math.round((Date.now() - ts) / 60000)
    if (min < 1) return t('notif.just_now')
    if (min < 60) return t('notif.min_ago', { n: min })
    const h = Math.round(min / 60)
    if (h < 24) return t('notif.h_ago', { n: h })
    const d = Math.round(h / 24)
    if (d < 7) return t('notif.d_ago', { n: d })
    return new Date(ts).toLocaleDateString(language === 'uz' ? 'uz-UZ' : 'ru-RU', { day: 'numeric', month: 'short' })
  }
}

export default function NotificationCenter() {
  const { items, unreadCount, markRead, markAllRead, reload } = useNotifications()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const ago = useRelativeTime()
  const [open, setOpen] = useState(false)
  const [onlyUnread, setOnlyUnread] = useState(false)
  const buttonRef = useRef(null)

  // Any navigation closes the panel; Escape too
  useEffect(() => { setOpen(false) }, [location.pathname, location.search])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const shown = useMemo(() => (onlyUnread ? items.filter(i => i.unread) : items), [items, onlyUnread])

  const toggle = () => {
    if (!open) { reload(); setOnlyUnread(false) }
    setOpen(o => !o)
  }
  const openItem = (item) => {
    markRead([item.id])
    setOpen(false)
    if (item.to) navigate(item.to)
  }

  const label = unreadCount > 0 ? t('notif.aria_unread', { n: unreadCount }) : t('notif.title')

  return (
    <>
      <button ref={buttonRef} type="button" onClick={toggle} aria-label={label} title={label}
        aria-haspopup="dialog" aria-expanded={open}
        className="relative p-2 md:p-2.5 glass-btn rounded-xl transition-all">
        <Bell size={18} className="text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-lg shadow-red-200">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* In a portal: the header has backdrop-filter, which would trap a fixed panel inside it */}
      {open && createPortal(
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/10 md:bg-transparent" onClick={() => setOpen(false)} />
          <div role="dialog" aria-label={t('notif.title')}
            className="absolute right-2 left-2 top-[calc(env(safe-area-inset-top)+3.75rem)] md:left-auto md:right-6 md:top-[4.25rem] md:w-[420px] glass-strong rounded-2xl shadow-2xl shadow-black/15 flex flex-col max-h-[min(34rem,calc(100dvh-9rem))] animate-[scaleIn_150ms_ease-out] origin-top-right">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200/60">
              <h3 className="text-sm font-bold text-slate-900 flex-1 min-w-0 truncate">
                {t('notif.title')}
                {unreadCount > 0 && <span className="ml-2 text-xs font-semibold text-red-500">{unreadCount}</span>}
              </h3>
              {unreadCount > 0 && (
                <button type="button" onClick={markAllRead}
                  className="shrink-0 flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1.5 rounded-lg hover:bg-blue-50">
                  <CheckCheck size={14} /> {t('notif.mark_all')}
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label={t('notif.close')}
                className="shrink-0 p-1.5 -mr-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/60">
                <X size={16} />
              </button>
            </div>

            {items.length > 0 && (
              <div className="flex gap-1 px-3 pt-2">
                {[[false, t('notif.tab_all')], [true, t('notif.tab_unread')]].map(([value, text]) => (
                  <button key={String(value)} type="button" onClick={() => setOnlyUnread(value)}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                      onlyUnread === value ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-white/60'
                    }`}>
                    {text}
                  </button>
                ))}
              </div>
            )}

            <div className="overflow-y-auto overscroll-contain p-2 flex-1">
              {shown.length === 0 ? (
                <div className="py-10 px-4 text-center">
                  <Bell size={28} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-medium text-slate-600">
                    {items.length === 0 ? t('notif.empty') : t('notif.empty_unread')}
                  </p>
                  {items.length === 0 && <p className="text-xs text-slate-400 mt-1">{t('notif.empty_hint')}</p>}
                </div>
              ) : shown.map(item => {
                const kind = KINDS[item.kind] || KINDS.task
                const Icon = kind.icon
                return (
                  <button key={item.id} type="button" onClick={() => openItem(item)}
                    className={`w-full text-left flex items-start gap-3 px-2.5 py-2.5 rounded-xl transition-colors hover:bg-white/70 ${item.unread ? 'bg-blue-50/60' : ''}`}>
                    <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${kind.cls}`}>
                      <Icon size={16} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm leading-snug break-words ${item.unread ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                        {item.title}
                      </span>
                      {item.text && <span className="block text-xs text-slate-500 truncate mt-0.5">{item.text}</span>}
                      <span className="block text-[11px] text-slate-400 mt-0.5">{ago(item.at)}</span>
                    </span>
                    {item.unread && <span className="shrink-0 mt-1.5 w-2 h-2 rounded-full bg-blue-500" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
