import { useState, useMemo } from 'react'
import { ThumbsUp, HelpCircle, Frown, Check, MessageSquare } from 'lucide-react'
import { useData } from '../../contexts/DataContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { toast } from '../Toaster'

// «Как вам урок?» — one tap after a lesson, an optional line of text.
// The student sees their own mark; teachers and admins see everyone's on the
// lesson page and in LMS analytics, so a lesson that most people found hard
// stands out instead of hiding behind "watched 100%".

export const RATINGS = [
  { id: 'clear', icon: ThumbsUp, tKey: 'lessonfb.clear', on: 'bg-emerald-600 border-emerald-600 text-white', tone: 'text-emerald-600', bar: 'bg-emerald-500' },
  { id: 'questions', icon: HelpCircle, tKey: 'lessonfb.questions', on: 'bg-amber-500 border-amber-500 text-white', tone: 'text-amber-600', bar: 'bg-amber-400' },
  { id: 'hard', icon: Frown, tKey: 'lessonfb.hard', on: 'bg-red-500 border-red-500 text-white', tone: 'text-red-600', bar: 'bg-red-400' },
]

/** The student's block under a lesson. */
export function LessonFeedbackForm({ studentId, studentName, lesson, groupId }) {
  const { t } = useLanguage()
  const { lmsLessonFeedback, saveLessonFeedback } = useData()
  const mine = useMemo(
    () => (lmsLessonFeedback || []).find(f => String(f.studentId) === String(studentId) && f.lessonId === lesson.id) || null,
    [lmsLessonFeedback, studentId, lesson.id]
  )
  const [comment, setComment] = useState(null) // null = untouched → shows the saved text
  const [saving, setSaving] = useState(false)
  const commentValue = comment ?? mine?.comment ?? ''

  const save = async (patch) => {
    if (saving) return
    setSaving(true)
    try {
      await saveLessonFeedback({
        studentId, lessonId: lesson.id, courseId: lesson.courseId || '', groupId: groupId || '',
        studentName: studentName || '', rating: mine?.rating || null, comment: mine?.comment || '',
        createdAt: mine?.createdAt || new Date().toISOString(), ...patch,
      })
      if (patch.comment !== undefined) { setComment(null); toast.success(t('lessonfb.thanks')) }
    } catch (err) {
      console.error(err)
      toast.error(t('lessonfb.error'))
    }
    setSaving(false)
  }

  return (
    <div className="glass-card rounded-2xl p-5">
      <h3 className="font-semibold text-slate-900 flex items-center gap-2">
        <MessageSquare size={16} className="text-blue-500" /> {t('lessonfb.title')}
      </h3>
      <p className="text-xs text-slate-500 mt-1 mb-3">{t('lessonfb.hint')}</p>
      <div className="grid grid-cols-3 gap-2">
        {RATINGS.map(r => {
          const active = mine?.rating === r.id
          return (
            <button key={r.id} type="button" onClick={() => save({ rating: r.id })} disabled={saving} aria-pressed={active}
              className={`flex flex-col items-center justify-center gap-1.5 min-h-[72px] px-2 py-3 rounded-xl border text-xs font-medium leading-tight text-center transition-colors disabled:opacity-60 ${
                active ? r.on : 'bg-white/70 border-slate-200 text-slate-600 hover:bg-white'
              }`}>
              <r.icon size={20} />
              {t(r.tKey)}
            </button>
          )
        })}
      </div>
      {mine?.rating && (
        <div className="mt-3 space-y-2">
          <textarea value={commentValue} onChange={e => setComment(e.target.value)} rows={2} maxLength={1000}
            placeholder={t(mine.rating === 'clear' ? 'lessonfb.comment_ph_clear' : 'lessonfb.comment_ph')}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-emerald-600 flex items-center gap-1 min-w-0"><Check size={14} className="shrink-0" /> <span className="truncate">{t('lessonfb.saved')}</span></p>
            <button type="button" onClick={() => save({ comment: commentValue.trim() })}
              disabled={saving || commentValue.trim() === (mine.comment || '')}
              className="shrink-0 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors">
              {t('lessonfb.send')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Counts per rating for a list of feedback documents. */
export function countRatings(list) {
  const counts = { clear: 0, questions: 0, hard: 0 }
  for (const f of list) if (counts[f.rating] !== undefined) counts[f.rating]++
  return { ...counts, total: counts.clear + counts.questions + counts.hard }
}

/** One stacked bar: green / amber / red shares. */
export function RatingBar({ counts }) {
  if (!counts.total) return null
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
      {RATINGS.map(r => counts[r.id] > 0 && (
        <div key={r.id} className={r.bar} style={{ width: `${(counts[r.id] / counts.total) * 100}%` }} />
      ))}
    </div>
  )
}

/** Teacher / admin: how students rated this lesson, with their comments. */
export function LessonFeedbackSummary({ lessonId }) {
  const { t } = useLanguage()
  const { lmsLessonFeedback } = useData()
  const list = useMemo(
    () => (lmsLessonFeedback || []).filter(f => f.lessonId === lessonId && f.rating)
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))),
    [lmsLessonFeedback, lessonId]
  )
  if (list.length === 0) return null
  const counts = countRatings(list)
  const comments = list.filter(f => f.comment)
  return (
    <div className="glass-card rounded-2xl p-5">
      <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <MessageSquare size={16} className="text-blue-500" /> {t('lessonfb.summary_title')} ({counts.total})
      </h3>
      <RatingBar counts={counts} />
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
        {RATINGS.map(r => (
          <span key={r.id} className={`flex items-center gap-1 font-medium ${r.tone}`}>
            <r.icon size={13} /> {t(r.tKey)}: {counts[r.id]}
          </span>
        ))}
      </div>
      {comments.length > 0 && (
        <div className="mt-4 space-y-2">
          {comments.slice(0, 20).map(f => {
            const r = RATINGS.find(x => x.id === f.rating)
            return (
              <div key={f.id} className="rounded-xl bg-white/60 border border-slate-100 p-3">
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  {r && <r.icon size={13} className={r.tone} />}
                  <span className="font-medium text-slate-700">{f.studentName || '—'}</span>
                </p>
                <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{f.comment}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
