import { useState, useEffect, useMemo, useRef } from 'react'
import { Briefcase, Link2, Copy, Share2, ExternalLink, Eye, EyeOff, Award, Check, Loader } from 'lucide-react'
import { db } from '../../firebase'
import { doc, getDoc, setDoc } from '../../backend/firestore'
import { USE_SERVER } from '../../backend/api'
import { useLanguage } from '../../contexts/LanguageContext'
import { toast } from '../Toaster'

// Portfolio: the student picks checked works and gets a page to show —
// to a client, an employer, in a résumé. Nothing is public until they turn
// it on; the page shows only the picked works (see /api/public/portfolio).
//
// Stored as one document per student: portfolios/<studentId>
//   { studentId, token, published, title, about, showGrades, showFeedback,
//     items: [{ submissionId, hidden, caption }] }

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return Array.from(bytes, b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]).join('')
}

export const portfolioUrl = (token) => `${window.location.origin}/p/${token}`

/** Text with links made tappable; image links are shown as pictures. */
export function RichAnswer({ text, className = '' }) {
  const parts = String(text || '').split(/(https?:\/\/[^\s]+)/g)
  const images = parts.filter(p => /^https?:\/\/\S+\.(png|jpe?g|webp|gif)(\?\S*)?$/i.test(p))
  return (
    <div className={className}>
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
        {parts.map((p, i) => /^https?:\/\//.test(p)
          ? <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="text-blue-600 underline underline-offset-2">{p.replace(/^https?:\/\//, '').slice(0, 60)}{p.length > 68 ? '…' : ''}</a>
          : <span key={i}>{p}</span>)}
      </p>
      {images.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          {images.slice(0, 6).map(src => (
            <a key={src} href={src} target="_blank" rel="noopener noreferrer nofollow">
              <img src={src} alt="" loading="lazy" className="w-full rounded-xl border border-slate-100 object-cover max-h-80" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default function StudentPortfolio({ student, submissions, assignments }) {
  const { t } = useLanguage()
  const [saved, setSaved] = useState(undefined) // undefined = loading, null = none yet
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const ref = useMemo(() => doc(db, 'portfolios', String(student.id)), [student.id])

  useEffect(() => {
    let stopped = false
    getDoc(ref)
      .then(snap => { if (!stopped) setSaved(snap.exists() ? snap.data() : null) })
      .catch(() => { if (!stopped) setSaved(null) })
    return () => { stopped = true }
  }, [ref])

  const assignmentById = useMemo(() => Object.fromEntries((assignments || []).map(a => [a.id, a])), [assignments])
  // only works the teacher has checked can be shown
  const works = useMemo(
    () => (submissions || [])
      .filter(s => s.status === 'reviewed' || (s.grade !== undefined && s.grade !== null))
      .sort((a, b) => String(b.gradedAt || b.createdAt || '').localeCompare(String(a.gradedAt || a.createdAt || ''))),
    [submissions]
  )

  const state = draft || saved || { published: false, title: '', about: '', showGrades: true, showFeedback: false, items: [] }
  const itemOf = (id) => (state.items || []).find(i => i.submissionId === id)
  const isShown = (id) => { const i = itemOf(id); return !!i && !i.hidden }
  const shownCount = works.filter(w => isShown(w.id)).length

  // Everything is saved as it changes; text fields — a moment after typing stops
  const timer = useRef(null)
  const persist = async (next) => {
    setSaving(true)
    try {
      const data = { ...next, studentId: String(student.id), token: next.token || newToken(), updatedAt: new Date().toISOString() }
      await setDoc(ref, data)
      setSaved(data)
      // typed on while it was saving → keep that, its own save is on the way
      setDraft(d => (d === next ? null : d))
    } catch (err) {
      console.error(err)
      toast.error(t('pf.save_error'))
    }
    setSaving(false)
  }
  const change = (patch, { debounce = false } = {}) => {
    const next = { ...state, ...patch }
    setDraft(next)
    clearTimeout(timer.current)
    if (debounce) timer.current = setTimeout(() => persist(next), 900)
    else persist(next)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  const toggleWork = (id) => {
    const items = [...(state.items || [])]
    const i = items.findIndex(x => x.submissionId === id)
    if (i === -1) items.push({ submissionId: id, caption: '' })
    else items[i] = { ...items[i], hidden: !items[i].hidden }
    change({ items })
  }
  const setCaption = (id, caption) => {
    change({ items: (state.items || []).map(x => (x.submissionId === id ? { ...x, caption } : x)) }, { debounce: true })
  }

  const url = state.token ? portfolioUrl(state.token) : ''
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success(t('pf.copied')) }
    catch { toast.error(url) }
  }
  const share = async () => {
    try { await navigator.share({ title: state.title || t('pf.title'), url }) } catch { /* closed the sheet */ }
  }

  if (saved === undefined) {
    return <div className="flex justify-center py-16"><Loader size={22} className="animate-spin text-slate-400" /></div>
  }

  const Toggle = ({ on, onChange, label, hint }) => (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className="w-full flex items-center gap-3 py-3 min-h-[52px] text-left">
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {hint && <span className="block text-xs text-slate-500 mt-0.5">{hint}</span>}
      </span>
      <span className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  )

  return (
    <div className="space-y-5">
      {/* Publish + link */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <Briefcase size={18} className="text-violet-500" /> {t('pf.title')}
          {saving && <Loader size={14} className="animate-spin text-slate-400" />}
        </h3>
        <p className="text-sm text-slate-500 mt-1">{t('pf.intro')}</p>

        {USE_SERVER ? (
          <>
            <div className="mt-2 divide-y divide-slate-100">
              <Toggle on={!!state.published} onChange={(v) => change({ published: v })}
                label={t('pf.publish')} hint={t(state.published ? 'pf.publish_on' : 'pf.publish_off')} />
            </div>
            {state.published && url && (
              <div className="mt-3 rounded-xl bg-violet-50 border border-violet-100 p-3">
                <p className="flex items-center gap-2 text-xs text-violet-700 font-medium"><Link2 size={14} /> {t('pf.link')}</p>
                <p className="text-sm text-slate-700 mt-1 break-all select-all">{url}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button type="button" onClick={copy}
                    className="flex-1 min-w-[7rem] flex items-center justify-center gap-2 min-h-[44px] px-3 bg-white border border-violet-200 rounded-xl text-sm font-medium text-violet-700 hover:bg-violet-50">
                    <Copy size={16} /> {t('pf.copy')}
                  </button>
                  {typeof navigator !== 'undefined' && navigator.share && (
                    <button type="button" onClick={share}
                      className="flex-1 min-w-[7rem] flex items-center justify-center gap-2 min-h-[44px] px-3 bg-violet-600 rounded-xl text-sm font-medium text-white hover:bg-violet-700">
                      <Share2 size={16} /> {t('pf.share')}
                    </button>
                  )}
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="flex-1 min-w-[7rem] flex items-center justify-center gap-2 min-h-[44px] px-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <ExternalLink size={16} /> {t('pf.open')}
                  </a>
                </div>
              </div>
            )}
            {state.published && shownCount === 0 && (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">{t('pf.empty_published')}</p>
            )}
          </>
        ) : (
          <p className="mt-3 text-xs text-slate-500">{t('pf.no_public')}</p>
        )}
      </div>

      {/* About */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">{t('pf.field_title')}</span>
          <input type="text" value={state.title || ''} maxLength={200} placeholder={t('pf.field_title_ph')}
            onChange={e => change({ title: e.target.value }, { debounce: true })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">{t('pf.field_about')}</span>
          <textarea value={state.about || ''} rows={3} maxLength={2000} placeholder={t('pf.field_about_ph')}
            onChange={e => change({ about: e.target.value }, { debounce: true })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-300" />
        </label>
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          <Toggle on={state.showGrades !== false} onChange={(v) => change({ showGrades: v })} label={t('pf.show_grades')} />
          <Toggle on={!!state.showFeedback} onChange={(v) => change({ showFeedback: v })} label={t('pf.show_feedback')} hint={t('pf.show_feedback_hint')} />
        </div>
      </div>

      {/* Works */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
        <h3 className="font-semibold text-slate-800 flex items-center justify-between gap-2">
          <span>{t('pf.works')}</span>
          <span className="text-xs font-medium text-slate-400">{t('pf.works_count', { shown: shownCount, total: works.length })}</span>
        </h3>
        {works.length === 0 ? (
          <div className="text-center py-8">
            <Award size={28} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-500">{t('pf.no_works')}</p>
            <p className="text-xs text-slate-400 mt-1">{t('pf.no_works_hint')}</p>
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            {works.map(w => {
              const a = assignmentById[w.assignmentId]
              const shown = isShown(w.id)
              return (
                <div key={w.id} className={`rounded-xl border p-3 transition-colors ${shown ? 'border-violet-200 bg-violet-50/40' : 'border-slate-200'}`}>
                  <button type="button" onClick={() => toggleWork(w.id)} aria-pressed={shown}
                    className="w-full flex items-start gap-3 text-left min-h-[44px]">
                    <span className={`shrink-0 mt-0.5 w-6 h-6 rounded-lg border flex items-center justify-center ${shown ? 'bg-violet-600 border-violet-600 text-white' : 'border-slate-300 bg-white'}`}>
                      {shown && <Check size={15} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-slate-800 [overflow-wrap:anywhere]">{a?.title || t('pf.work_untitled')}</span>
                      <span className="block text-xs text-slate-500 mt-0.5">
                        {w.grade !== undefined && w.grade !== null && `${t('pf.grade')}: ${w.grade}${a?.maxScore ? `/${a.maxScore}` : ''}`}
                      </span>
                    </span>
                    {shown ? <Eye size={16} className="shrink-0 mt-1 text-violet-500" /> : <EyeOff size={16} className="shrink-0 mt-1 text-slate-300" />}
                  </button>
                  <RichAnswer text={w.answer} className="text-xs text-slate-600 mt-2 pl-9" />
                  {shown && (
                    <input type="text" value={itemOf(w.id)?.caption || ''} maxLength={500} placeholder={t('pf.caption_ph')}
                      onChange={e => setCaption(w.id, e.target.value)}
                      className="w-full mt-3 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
