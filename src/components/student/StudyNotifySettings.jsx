import { useState, useEffect } from 'react'
import { Send, ChevronRight, Award, MessageCircle, Clock, Unlock, Flame, Loader } from 'lucide-react'
import { USE_SERVER, api } from '../../backend/api'
import { useLanguage } from '../../contexts/LanguageContext'
import { toast } from '../Toaster'

// Telegram notices about studies (server/src/studyNotices.js): linking the
// bot, and a switch per kind so nobody has to block the bot to stop one of
// them. Payment reminders are a separate thing and are not switched here.

const KINDS = [
  { id: 'grade', icon: Award },
  { id: 'message', icon: MessageCircle },
  { id: 'deadline', icon: Clock },
  { id: 'module', icon: Unlock },
  { id: 'streak', icon: Flame },
]

export default function StudyNotifySettings({ student, botUsername }) {
  const { t } = useLanguage()
  const [prefs, setPrefs] = useState(null)
  const [busy, setBusy] = useState(null)
  const linked = !!student?.telegramChatId

  useEffect(() => {
    if (!USE_SERVER || !linked) return
    let stopped = false
    api('/api/student/notify').then(p => { if (!stopped) setPrefs(p) }).catch(() => {})
    return () => { stopped = true }
  }, [linked])

  if (!USE_SERVER || !student) return null

  if (!linked) {
    if (!botUsername) return null
    return (
      <a href={`https://t.me/${botUsername}?start=st_${student.id}`} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-3 bg-white rounded-2xl border border-blue-200 p-4 hover:bg-blue-50/50 transition-colors">
        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Send size={18} className="text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">{t('snotify.connect')}</p>
          <p className="text-xs text-slate-500">{t('snotify.connect_hint')}</p>
        </div>
        <ChevronRight size={16} className="text-slate-300 shrink-0" />
      </a>
    )
  }

  const toggle = async (kind) => {
    if (!prefs || busy) return
    const value = !prefs.kinds[kind]
    setBusy(kind)
    setPrefs(p => ({ ...p, kinds: { ...p.kinds, [kind]: value } }))
    try {
      setPrefs(await api('/api/student/notify', { method: 'PUT', body: { [kind]: value } }))
    } catch (err) {
      setPrefs(p => ({ ...p, kinds: { ...p.kinds, [kind]: !value } }))
      toast.error(err.message)
    }
    setBusy(null)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
      <h3 className="font-semibold text-slate-800 flex items-center gap-2">
        <Send size={18} className="text-blue-500" /> {t('snotify.title')}
      </h3>
      <p className="text-xs text-slate-500 mt-1">{t('snotify.hint')}</p>
      {!prefs ? (
        <div className="flex justify-center py-6"><Loader size={20} className="animate-spin text-slate-400" /></div>
      ) : (
        <div className="mt-1 divide-y divide-slate-100">
          {KINDS.map(k => {
            const on = prefs.kinds[k.id]
            return (
              <button key={k.id} type="button" role="switch" aria-checked={on} onClick={() => toggle(k.id)} disabled={busy === k.id}
                className="w-full flex items-center gap-3 py-3 min-h-[56px] text-left">
                <span className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${on ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                  <k.icon size={17} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-slate-800">{t(`snotify.${k.id}`)}</span>
                  <span className="block text-xs text-slate-500">{t(`snotify.${k.id}_hint`)}</span>
                </span>
                <span className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                  <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
