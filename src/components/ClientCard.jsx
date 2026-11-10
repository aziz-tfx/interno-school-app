// The client card: one person seen from every side.
//
// A student's money and contracts were on the student profile, their calls
// and messages — on the deal in the CRM, attendance — on the attendance
// screen and progress — in the LMS. These pieces bring it together:
//   • ClientCrmHistory, ClientAttendance, ClientLearning — tabs of the
//     student profile (components/StudentProfile.jsx);
//   • StudentSnapshot — the student's state inside a CRM deal / contact card,
//     with a button that opens the full profile right there.

import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Loader, GraduationCap, Wallet, ClipboardCheck, Monitor, ExternalLink, Check, X, Clock, Send, CalendarClock,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useData, useLmsData } from '../contexts/DataContext'
import { useLanguage } from '../contexts/LanguageContext'
import { USE_SERVER } from '../backend/api'
import { crm, watchCrm, formatSum, formatDateTime } from '../backend/crm'
import { todayISO } from '../utils/dates'
import ActivityItem from './crm/ActivityItem'
import Modal from './Modal'
import { toast } from './Toaster'

const StudentProfile = lazy(() => import('./StudentProfile'))

const Spinner = () => (
  <div className="flex items-center justify-center py-12"><Loader size={22} className="animate-spin text-slate-400" /></div>
)
const fmtDay = (iso) => {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? String(iso || '') : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}
const fmtDayShort = (iso) => {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? String(iso || '') : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}
const digits = (v) => String(v || '').replace(/\D/g, '')

/** Money, attendance and status of a student in a few numbers. */
export function useStudentFacts(student) {
  const { getStudentIncome, attendance } = useData()
  return useMemo(() => {
    if (!student) return null
    const pays = getStudentIncome(student.id).filter(p => !p.cancelled)
    const paid = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const price = Number(student.totalCoursePrice) || 0
    const debt = price > 0 ? Math.max(0, price - paid) : 0
    const last = [...pays].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
    const nextPaymentDate = student.nextPaymentDate || last?.nextPaymentDate || ''
    const records = attendance.filter(a => String(a.studentId) === String(student.id))
    const came = records.filter(a => a.status === 'present' || a.status === 'late').length
    return {
      paid, price, debt, payments: pays.length, lastPayment: last, nextPaymentDate,
      overdue: debt > 0 && !!nextPaymentDate && nextPaymentDate.slice(0, 10) < todayISO(),
      contractSigned: pays.some(p => p.contractSigned === true || !!p.signatureData),
      contractNumber: student.contractNumber || pays.find(p => p.contractNumber)?.contractNumber || '',
      attendance: { total: records.length, came, rate: records.length ? Math.round((came / records.length) * 100) : null },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student, attendance, getStudentIncome(student?.id)])
}

// ─── Tab: CRM history (calls, messages, notes, deals) ───────────────────
export function ClientCrmHistory({ student }) {
  const { t } = useLanguage()
  const { employees } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [stages, setStages] = useState({})
  const [error, setError] = useState(null)
  const [note, setNote] = useState('')
  const [posting, setPosting] = useState(false)
  const people = useMemo(() => Object.fromEntries(employees.map(e => [e._docId, e])), [employees])

  const load = useCallback(async () => {
    try {
      setData(await crm.studentHistory(student.id))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [student.id])

  useEffect(() => { setData(null); load() }, [load])
  // names of the funnel stages for «Этап А → Этап Б» lines
  useEffect(() => {
    crm.pipelines()
      .then(pipes => setStages(Object.fromEntries(pipes.flatMap(p => p.stages.map(s => [s.id, s])))))
      .catch(() => {})
  }, [])
  // a note or a call logged elsewhere shows up without reopening the card
  useEffect(() => {
    let timer
    const stop = watchCrm(['crm_activities', 'crm_leads'], () => {
      clearTimeout(timer)
      timer = setTimeout(load, 1200)
    })
    return () => { stop(); clearTimeout(timer) }
  }, [load])

  const addNote = async () => {
    const body = note.trim()
    const lead = data?.leads?.[0]
    if (!body || !lead || posting) return
    setPosting(true)
    try {
      await crm.addNote(lead.id, body)
      setNote('')
      await load()
    } catch (err) {
      toast(err.message, 'error')
    }
    setPosting(false)
  }

  if (error) return <p className="text-sm text-slate-500 text-center py-10">{t('client.crm_error')}: {error}</p>
  if (!data) return <Spinner />
  if (data.leads.length === 0 && data.activities.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-sm font-medium text-slate-600">{t('client.crm_empty')}</p>
        <p className="text-xs text-slate-400 mt-1">{t('client.crm_empty_hint')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-800">{t('client.deals')} · {data.leads.length}</p>
        {data.leads.map(l => (
          <button key={l.id} type="button" onClick={() => navigate(`/crm?lead=${l.id}`)}
            className="w-full text-left rounded-xl bg-white/60 border border-slate-100 hover:border-blue-200 p-3 group">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-700">{l.title || t('client.deal_untitled')}</p>
              <span className="flex items-center gap-2 shrink-0">
                {Number(l.amount) > 0 && <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">{formatSum(l.amount)}</span>}
                <ExternalLink size={13} className="text-slate-300 group-hover:text-blue-500" />
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: l.stage?.color || '#94a3b8' }} />
              {l.stage?.name || '—'}
              <span>· {formatDateTime(l.createdAt)}</span>
              {people[l.responsibleId]?.name && <span>· {people[l.responsibleId].name}</span>}
              {l.lossReason && <span>· {l.lossReason}</span>}
            </p>
          </button>
        ))}
      </div>

      {data.leads.length > 0 && (
        <div className="flex gap-2">
          <input value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote()}
            placeholder={t('client.note_placeholder')} disabled={posting}
            className="flex-1 min-w-0 px-3 py-2 bg-white/70 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button type="button" onClick={addNote} disabled={posting || !note.trim()} aria-label={t('client.note_add')} title={t('client.note_add')}
            className="shrink-0 px-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
            {posting ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-800">{t('client.timeline')}</p>
        {data.activities.length === 0
          ? <p className="text-xs text-slate-400">{t('client.timeline_empty')}</p>
          : data.activities.map(a => (
            <ActivityItem key={a.id} a={a} allStages={stages} people={people}
              showLead={data.leads.length > 1} onOpenLead={(id) => navigate(`/crm?lead=${id}`)} />
          ))}
      </div>
    </div>
  )
}

// ─── Tab: attendance ────────────────────────────────────────────────────
const ATT = {
  present: { icon: Check, cls: 'bg-emerald-100 text-emerald-700', key: 'client.att_present' },
  late: { icon: Clock, cls: 'bg-yellow-100 text-yellow-700', key: 'client.att_late' },
  absent: { icon: X, cls: 'bg-red-100 text-red-700', key: 'client.att_absent' },
}

export function ClientAttendance({ student }) {
  const { t } = useLanguage()
  const { attendance } = useData()
  const records = useMemo(
    () => attendance.filter(a => String(a.studentId) === String(student.id)).sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [attendance, student.id]
  )
  const [showAll, setShowAll] = useState(false)
  if (records.length === 0) return <p className="text-sm text-slate-400 text-center py-10">{t('client.att_empty')}</p>

  const count = (s) => records.filter(r => r.status === s).length
  const present = count('present'), late = count('late'), absent = count('absent')
  const rate = Math.round(((present + late) / records.length) * 100)
  let streak = 0
  for (const r of records) { if (r.status === 'absent') streak++; else break }
  const shown = showAll ? records : records.slice(0, 20)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          [`${rate}%`, t('client.att_rate'), rate >= 80 ? 'text-emerald-600' : rate >= 60 ? 'text-amber-600' : 'text-red-600'],
          [present, t('client.att_present'), 'text-slate-900'],
          [late, t('client.att_late'), 'text-slate-900'],
          [absent, t('client.att_absent'), absent ? 'text-red-600' : 'text-slate-900'],
        ].map(([value, label, cls]) => (
          <div key={label} className="rounded-xl bg-white/60 border border-slate-100 p-3">
            <p className={`text-xl font-bold leading-none ${cls}`}>{value}</p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>
      {streak >= 2 && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{t('client.att_streak', { n: streak })}</p>
      )}
      <div className="divide-y divide-slate-100">
        {shown.map((r, i) => {
          const s = ATT[r.status] || ATT.absent
          const Icon = s.icon
          return (
            <div key={`${r.date}-${r.groupName}-${i}`} className="flex items-center gap-3 py-2">
              <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${s.cls}`}><Icon size={14} /></span>
              <span className="text-sm text-slate-800 w-32 shrink-0">{fmtDay(r.date)}</span>
              <span className="text-xs text-slate-500 truncate flex-1">{r.groupName}</span>
              <span className="text-xs text-slate-500 shrink-0">{t(s.key)}</span>
            </div>
          )
        })}
      </div>
      {records.length > shown.length && (
        <button type="button" onClick={() => setShowAll(true)} className="text-xs font-medium text-blue-600 hover:text-blue-700">
          {t('client.show_all', { n: records.length })}
        </button>
      )}
    </div>
  )
}

// ─── Tab: learning (LMS progress, homework, activity) ───────────────────
export function ClientLearning({ student }) {
  const { t } = useLanguage()
  const {
    courses, lmsLessons, lmsProgress, lmsVideoProgress, lmsSubmissions, lmsAssignments, studentGameData, lmsReady,
  } = useLmsData()

  const data = useMemo(() => {
    const sid = String(student.id)
    const lessonById = Object.fromEntries(lmsLessons.map(l => [l.id, l]))
    const done = lmsProgress.filter(p => String(p.studentId) === sid)
    const doneIds = new Set(done.map(p => p.lessonId))
    const names = [student.course, ...(student.bonusCourses || [])].filter(Boolean)
    const byCourse = names.map(name => {
      const course = courses.find(c => c.name === name)
      const lessons = course ? lmsLessons.filter(l => l.courseId === course.id) : []
      const completed = lessons.filter(l => doneIds.has(l.id)).length
      return { name, total: lessons.length, completed, pct: lessons.length ? Math.round((completed / lessons.length) * 100) : 0, bonus: name !== student.course }
    })
    const assignmentById = Object.fromEntries(lmsAssignments.map(a => [a.id, a]))
    const submissions = lmsSubmissions
      .filter(s => String(s.studentId) === sid)
      .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
      .map(s => ({ ...s, title: assignmentById[s.assignmentId]?.title || '' }))
    const graded = submissions.filter(s => s.grade !== undefined && s.grade !== null && s.grade !== '')
    const videos = lmsVideoProgress.filter(v => String(v.studentId) === sid)
    const recent = [...done]
      .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')))
      .slice(0, 6)
      .map(p => ({ ...p, title: lessonById[p.lessonId]?.title || '' }))
    const lastActive = [
      ...done.map(p => p.completedAt), ...videos.map(v => v.updatedAt), ...submissions.map(s => s.updatedAt || s.createdAt),
    ].filter(Boolean).map(String).sort().pop()
    const game = studentGameData.find(g => String(g.id) === sid)
    return {
      byCourse, submissions, recent, lastActive, game,
      avgGrade: graded.length ? Math.round((graded.reduce((s, x) => s + Number(x.grade || 0), 0) / graded.length) * 10) / 10 : null,
      toReview: submissions.filter(s => s.status === 'submitted').length,
    }
  }, [student, courses, lmsLessons, lmsProgress, lmsVideoProgress, lmsSubmissions, lmsAssignments, studentGameData])

  if (!lmsReady) return <Spinner />
  const nothing = data.byCourse.every(c => c.total === 0) && data.submissions.length === 0 && !data.lastActive

  return (
    <div className="space-y-5">
      <div className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${student.lmsAccess ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
        <Monitor size={16} />
        <span className="flex-1">{student.lmsAccess ? t('client.lms_on') : t('client.lms_off')}</span>
        {data.lastActive && <span className="text-xs opacity-80">{t('client.last_active', { date: fmtDay(data.lastActive) })}</span>}
      </div>

      {nothing ? <p className="text-sm text-slate-400 text-center py-8">{t('client.learning_empty')}</p> : (
        <>
          <div className="space-y-3">
            {data.byCourse.filter(c => c.total > 0).map(c => (
              <div key={c.name}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-800 truncate">{c.bonus ? '🎁 ' : ''}{c.name}</span>
                  <span className="text-xs text-slate-500 shrink-0">{t('client.lessons_done', { done: c.completed, total: c.total })} · {c.pct}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500" style={{ width: `${c.pct}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              [data.submissions.length, t('client.hw_sent')],
              [data.toReview, t('client.hw_to_review')],
              [data.avgGrade ?? '—', t('client.hw_avg')],
              [data.game?.currentStreak ?? data.game?.streak ?? '—', t('client.streak')],
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl bg-white/60 border border-slate-100 p-3">
                <p className="text-xl font-bold leading-none text-slate-900">{value}</p>
                <p className="text-xs text-slate-500 mt-1">{label}</p>
              </div>
            ))}
          </div>

          {data.submissions.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-800 mb-1">{t('client.homework')}</p>
              <div className="divide-y divide-slate-100">
                {data.submissions.slice(0, 8).map(s => (
                  <div key={s.id} className="flex items-center gap-3 py-2">
                    <span className="text-sm text-slate-800 truncate flex-1">{s.title || t('client.hw_untitled')}</span>
                    <span className="text-xs text-slate-400 shrink-0">{fmtDay(s.updatedAt || s.createdAt)}</span>
                    <span className={`text-xs font-medium shrink-0 px-2 py-0.5 rounded-full ${
                      s.status === 'submitted' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {s.status === 'submitted' ? t('client.hw_waiting') : (s.grade !== undefined && s.grade !== null && s.grade !== '' ? t('client.hw_grade', { grade: s.grade }) : t('client.hw_checked'))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.recent.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-800 mb-1">{t('client.recent_lessons')}</p>
              <div className="divide-y divide-slate-100">
                {data.recent.map(p => (
                  <div key={p.id || p.lessonId} className="flex items-center gap-3 py-2">
                    <span className="text-sm text-slate-800 truncate flex-1">{p.title || p.lessonId}</span>
                    {p.completedAt && <span className="text-xs text-slate-400 shrink-0">{fmtDay(p.completedAt)}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── The student inside a CRM deal / contact card ───────────────────────
// studentId — the link made at the sale; phones — the contact's numbers, to
// find a student whose deal was never linked.
export function StudentSnapshot({ studentId, phones = [] }) {
  const { t } = useLanguage()
  const { hasPermission } = useAuth()
  const { students, getStudentById, branches } = useData()
  const [open, setOpen] = useState(false)

  const { student, byPhone } = useMemo(() => {
    const linked = getStudentById(studentId)
    if (linked) return { student: linked, byPhone: false }
    // the last 9 digits: the number without the country code, however it was typed
    const tails = new Set(phones.map(p => digits(p).slice(-9)).filter(p => p.length === 9))
    if (!tails.size) return { student: null, byPhone: false }
    const found = students.find(s => s.status !== 'archived' && tails.has(digits(s.phone).slice(-9)))
    return { student: found || null, byPhone: !!found }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, phones.join(','), students])
  const facts = useStudentFacts(student)

  if (!student || !facts || !hasPermission('students')) return null
  const status = student.status === 'active' ? ['bg-emerald-100 text-emerald-700', t('client.st_active')]
    : student.status === 'debtor' ? ['bg-red-100 text-red-700', t('client.st_debtor')]
    : student.status === 'frozen' ? ['bg-slate-100 text-slate-600', t('client.st_frozen')]
    : ['bg-slate-100 text-slate-600', student.status || '']
  const branchName = branches.find(b => b.id === student.branch)?.name

  return (
    <div className="rounded-2xl bg-emerald-50/60 border border-emerald-100 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <GraduationCap size={16} className="text-emerald-600 shrink-0" />
        <p className="text-sm font-semibold text-slate-800 flex-1 min-w-0 truncate">
          {t('client.student')}: {student.name}
        </p>
        {status[1] && <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 shrink-0 ${status[0]}`}>{status[1]}</span>}
      </div>
      {byPhone && <p className="text-[11px] text-amber-700">{t('client.found_by_phone')}</p>}
      <p className="text-xs text-slate-500">
        {[student.course, student.group, branchName, student.learningFormat].filter(Boolean).join(' · ')}
      </p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-white/70 p-2">
          <Wallet size={14} className="mx-auto text-emerald-600 mb-1" />
          <p className="text-xs font-bold text-slate-900">{formatSum(facts.paid)}</p>
          <p className="text-[10px] text-slate-500">{facts.price > 0 ? t('client.paid_of', { total: formatSum(facts.price) }) : t('client.paid')}</p>
        </div>
        <div className="rounded-xl bg-white/70 p-2">
          <CalendarClock size={14} className={`mx-auto mb-1 ${facts.overdue ? 'text-red-500' : 'text-slate-400'}`} />
          <p className={`text-xs font-bold ${facts.debt > 0 ? (facts.overdue ? 'text-red-600' : 'text-amber-600') : 'text-emerald-600'}`}>
            {facts.debt > 0 ? formatSum(facts.debt) : t('client.no_debt')}
          </p>
          <p className="text-[10px] text-slate-500">
            {facts.debt > 0 && facts.nextPaymentDate ? t(facts.overdue ? 'client.due_was' : 'client.due_on', { date: fmtDayShort(facts.nextPaymentDate) }) : t('client.debt')}
          </p>
        </div>
        <div className="rounded-xl bg-white/70 p-2">
          <ClipboardCheck size={14} className="mx-auto text-blue-500 mb-1" />
          <p className="text-xs font-bold text-slate-900">{facts.attendance.rate === null ? '—' : `${facts.attendance.rate}%`}</p>
          <p className="text-[10px] text-slate-500">{t('client.attendance')}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {facts.contractNumber && <span>{t('client.contract')} № {facts.contractNumber}{facts.contractSigned ? ` · ${t('client.signed')}` : ` · ${t('client.not_signed')}`}</span>}
        <span>{student.lmsAccess ? t('client.lms_on') : t('client.lms_off')}</span>
      </div>
      <button type="button" onClick={() => setOpen(true)}
        className="w-full px-3 py-2 rounded-xl bg-white border border-emerald-200 text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors">
        {t('client.open_profile')}
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={t('client.profile_title')} size="xl">
        {open && (
          <Suspense fallback={<Spinner />}>
            <StudentProfile student={student} onClose={() => setOpen(false)} />
          </Suspense>
        )}
      </Modal>
    </div>
  )
}

/** Which extra tabs the student profile shows for this user. */
export function useClientTabs() {
  const { hasPermission } = useAuth()
  return {
    crm: USE_SERVER && hasPermission('crm'),
    attendance: hasPermission('attendance'),
    learning: hasPermission('lms'),
  }
}
