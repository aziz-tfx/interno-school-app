import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CalendarCheck, Square, ListTodo, UserPlus, Wallet, CalendarDays, ClipboardCheck, AlertTriangle,
  CheckCircle2, XCircle, Clock, ChevronRight, Phone, Plus, Target, PenTool, MessageCircle, Loader, UserX, Coffee,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useData, useLmsData } from '../contexts/DataContext'
import { useLanguage } from '../contexts/LanguageContext'
import { USE_SERVER } from '../backend/api'
import { crm, watchCrm, sourceMeta, formatSum, ago } from '../backend/crm'
import { sameBranch } from '../utils/branchMatch'
import { expectedPayments, shortSum } from '../utils/debts'
import { todayISO, nowHHMM, DAY_KEYS } from '../utils/dates'
import Modal from '../components/Modal'
import { toast } from '../components/Toaster'

// ─── «Мой день» ─────────────────────────────────────────────────────────
// One screen with what this person has to do today, built from the role's
// permissions rather than a hard-coded role list:
//   CRM access        → my tasks (overdue / today), new leads without an
//                       answer, my deals with no next step
//   finance access    → my plan for the month, payments we are waiting for
//   attendance / schedule → today's lessons and whether attendance is marked
//   teacher           → works to review, unread chats, students who stopped coming
// The branch admin's deeper view stays on «Операционка».

const PaymentForm = lazy(() => import('../components/PaymentForm'))

const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d }
const timeOf = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const dayMonth = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

function Section({ icon: Icon, tone = 'text-blue-500', title, count, action, children }) {
  return (
    <section className="glass-card rounded-2xl p-4 md:p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <Icon size={16} className={tone} />
        <span className="min-w-0 truncate">{title}</span>
        {count != null && <span className="text-xs font-bold text-slate-400">{count}</span>}
        {action && <span className="ml-auto shrink-0">{action}</span>}
      </h3>
      {children}
    </section>
  )
}

function MoreLink({ to, children }) {
  return (
    <Link to={to} className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-0.5">
      {children} <ChevronRight size={13} />
    </Link>
  )
}

function Empty({ children }) {
  return <p className="text-sm text-slate-400 text-center py-5">{children}</p>
}

function Tile({ icon: Icon, tone, value, label, to }) {
  const tones = {
    blue: 'text-blue-600 bg-blue-50', red: 'text-red-600 bg-red-50', amber: 'text-amber-600 bg-amber-50',
    emerald: 'text-emerald-600 bg-emerald-50', violet: 'text-violet-600 bg-violet-50',
  }
  const body = (
    <>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${tones[tone] || tones.blue}`}>
        <Icon size={16} />
      </div>
      <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </>
  )
  const cls = 'glass-card rounded-xl p-4 block'
  return to
    ? <Link to={to} className={`${cls} hover:shadow-md hover:-translate-y-0.5 transition-all`}>{body}</Link>
    : <div className={cls}>{body}</div>
}

// ─── CRM: my tasks, unanswered leads, deals without a next step ─────────
function useCrmDay(enabled) {
  const [state, setState] = useState({ tasks: null, newLeads: [], idle: { total: 0, items: [] } })
  const { user } = useAuth()
  const me = user?._docId

  const load = useCallback(async () => {
    if (!enabled) return
    try {
      const [tasks, feed, idle] = await Promise.all([
        crm.tasks({ assigneeId: 'me', status: 'open' }),
        crm.notifications().catch(() => ({ items: [] })),
        me
          ? crm.leads({ responsibleId: me, status: 'open', tasks: 'none', sort: 'activity', direction: 'asc', limit: 6 })
          : { total: 0, items: [] },
      ])
      setState({ tasks, newLeads: (feed.items || []).filter(i => i.type === 'lead_new'), idle })
    } catch (err) {
      toast(err.message, 'error')
      setState(s => ({ ...s, tasks: s.tasks || [] }))
    }
  }, [enabled, me])

  useEffect(() => { load() }, [load])

  const timer = useRef(null)
  useEffect(() => {
    if (!enabled) return
    const stop = watchCrm(['crm_tasks', 'crm_leads'], () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(load, 800)
    })
    return () => { stop(); clearTimeout(timer.current) }
  }, [enabled, load])

  const completeTask = async (task) => {
    setState(s => ({ ...s, tasks: (s.tasks || []).filter(t => t.id !== task.id) }))
    try {
      await crm.updateTask(task.id, { done: true })
    } catch (err) {
      toast(err.message, 'error')
      load()
    }
  }

  return { ...state, completeTask }
}

function TasksBlock({ tasks, onDone, t }) {
  const now = new Date()
  const eod = endOfToday()
  const overdue = tasks.filter(x => new Date(x.dueAt) < now)
  const today = tasks.filter(x => { const d = new Date(x.dueAt); return d >= now && d <= eod })
  const later = tasks.length - overdue.length - today.length
  const row = (task, isOverdue) => (
    <div key={task.id} className="flex items-start gap-3 py-2.5">
      <button type="button" onClick={() => onDone(task)} aria-label={t('myday.task_done')} title={t('myday.task_done')}
        className="mt-0.5 p-1 -m-1 text-slate-400 hover:text-emerald-600 transition-colors">
        <Square size={18} />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800 break-words">{task.text}</p>
        <div className="flex flex-wrap gap-x-3 text-xs text-slate-400 mt-0.5">
          <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
            {isOverdue ? `${dayMonth(task.dueAt)}, ${timeOf(task.dueAt)}` : timeOf(task.dueAt)}
          </span>
          {task.leadId && (
            <Link to={`/crm?lead=${task.leadId}`} className="text-blue-600 hover:underline truncate max-w-[220px]">
              {task.leadTitle || t('myday.deal')}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
  return (
    <Section icon={ListTodo} tone="text-violet-500" title={t('myday.tasks')} count={overdue.length + today.length}
      action={<MoreLink to="/crm?tab=tasks">{t('myday.all_tasks')}</MoreLink>}>
      {overdue.length + today.length === 0 ? (
        <Empty>{later > 0 ? t('myday.tasks_none_today', { n: later }) : t('myday.tasks_none')}</Empty>
      ) : (
        <>
          {overdue.length > 0 && (
            <>
              <p className="text-xs font-semibold text-red-600">{t('myday.overdue')} · {overdue.length}</p>
              <div className="divide-y divide-slate-100 mb-2">{overdue.map(x => row(x, true))}</div>
            </>
          )}
          {today.length > 0 && (
            <>
              <p className="text-xs font-semibold text-slate-600">{t('myday.today')} · {today.length}</p>
              <div className="divide-y divide-slate-100">{today.map(x => row(x, false))}</div>
            </>
          )}
          {later > 0 && <p className="text-xs text-slate-400 mt-2">{t('myday.tasks_later', { n: later })}</p>}
        </>
      )}
    </Section>
  )
}

function LeadsBlock({ newLeads, idle, t }) {
  if (newLeads.length === 0 && idle.total === 0) return null
  return (
    <Section icon={UserPlus} tone="text-blue-500" title={t('myday.leads')} count={newLeads.length + idle.total}
      action={<MoreLink to="/crm">CRM</MoreLink>}>
      {newLeads.length > 0 && (
        <>
          <p className="text-xs font-semibold text-blue-700">{t('myday.leads_new')} · {newLeads.length}</p>
          <div className="divide-y divide-slate-100 mb-2">
            {newLeads.slice(0, 6).map(l => (
              <Link key={l.id} to={`/crm?lead=${l.leadId}`} className="flex items-center gap-3 py-2.5 group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-700">{l.title || t('notif.no_name')}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {sourceMeta(l.source).label}{l.unassigned ? ` · ${t('notif.unassigned')}` : ''}
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{ago(l.at)}</span>
              </Link>
            ))}
          </div>
        </>
      )}
      {idle.total > 0 && (
        <>
          <p className="text-xs font-semibold text-amber-700">{t('myday.leads_idle')} · {idle.total}</p>
          <div className="divide-y divide-slate-100">
            {idle.items.map(l => (
              <Link key={l.id} to={`/crm?lead=${l.id}`} className="flex items-center gap-3 py-2.5 group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-700">
                    {l.contact?.name || l.title || t('notif.no_name')}
                  </p>
                  {Number(l.amount) > 0 && <p className="text-xs text-slate-400">{formatSum(l.amount)}</p>}
                </div>
                <span className="text-xs text-slate-400 shrink-0">{ago(l.lastActivityAt || l.createdAt)}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </Section>
  )
}

// ─── Money: plan and payments we are waiting for ────────────────────────
function PlanBlock({ t }) {
  const { user } = useAuth()
  const { getManagerPerf } = useData()
  if (!user?.managerId) return null
  const perf = getManagerPerf(user.managerId)
  if (!perf.plan) return null
  const day = new Date().getDate()
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const expectedPct = Math.round((day / daysInMonth) * 100)
  const behind = perf.percentage < expectedPct
  return (
    <Section icon={Target} tone="text-emerald-500" title={t('myday.plan')}
      action={<MoreLink to="/finance">{t('myday.sales')}</MoreLink>}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-2xl font-bold text-slate-900">{perf.percentage}%</p>
        <p className="text-xs text-slate-500 text-right">
          {shortSum(perf.achieved)} / {shortSum(perf.plan)} {t('myday.sum')}
        </p>
      </div>
      <div className="relative h-2.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
        <div className={`h-full rounded-full ${perf.percentage >= 100 ? 'bg-emerald-500' : behind ? 'bg-amber-500' : 'bg-blue-500'}`}
          style={{ width: `${Math.min(100, perf.percentage)}%` }} />
      </div>
      <p className="text-xs text-slate-400 mt-2">
        {perf.percentage >= 100
          ? t('myday.plan_done')
          : t(behind ? 'myday.plan_behind' : 'myday.plan_on_track', { left: shortSum(perf.remaining), days: daysInMonth - day })}
      </p>
    </Section>
  )
}

function PaymentsBlock({ expected, canTake, onDoplata, t }) {
  const overdue = expected.filter(e => e.daysUntil !== null && e.daysUntil < 0)
  const today = expected.filter(e => e.daysUntil === 0)
  const week = expected.filter(e => e.daysUntil !== null && e.daysUntil > 0 && e.daysUntil <= 7)
  const [showAllOverdue, setShowAllOverdue] = useState(false)
  // the most recently overdue are the likeliest to pay — show them first
  const overdueShown = showAllOverdue ? [...overdue].reverse() : [...overdue].reverse().slice(0, 5)

  const row = (e) => (
    <div key={e.student.id} className="flex items-center gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <Link to={`/students?q=${encodeURIComponent(e.student.name || '')}`}
          className="text-sm font-medium text-slate-800 hover:text-blue-700 truncate block">
          {e.student.name}
        </Link>
        <p className="text-xs text-slate-400 truncate">
          <span className={e.daysUntil < 0 ? 'text-red-600 font-medium' : ''}>
            {e.daysUntil === 0 ? t('myday.today').toLowerCase() : dayMonth(e.nextPaymentDate)}
          </span>
          {' · '}{formatSum(e.debt)}{e.student.group ? ` · ${e.student.group}` : ''}
        </p>
      </div>
      {e.student.phone && (
        <a href={`tel:${e.student.phone.replace(/[^\d+]/g, '')}`} aria-label={t('myday.call')} title={e.student.phone}
          className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50">
          <Phone size={16} />
        </a>
      )}
      {canTake && (
        <button type="button" onClick={() => onDoplata(e.student)}
          className="shrink-0 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
          {t('myday.take_payment')}
        </button>
      )}
    </div>
  )
  const group = (label, cls, list) => list.length > 0 && (
    <>
      <p className={`text-xs font-semibold ${cls}`}>{label} · {list.length} · {shortSum(list.reduce((s, e) => s + e.debt, 0))} {t('myday.sum')}</p>
      <div className="divide-y divide-slate-100 mb-2">{list.map(row)}</div>
    </>
  )

  return (
    <Section icon={Wallet} tone="text-amber-500" title={t('myday.payments')} count={overdue.length + today.length + week.length}
      action={<MoreLink to="/finance">{t('myday.sales')}</MoreLink>}>
      {overdue.length + today.length + week.length === 0 ? (
        <Empty>{t('myday.payments_none')}</Empty>
      ) : (
        <>
          {group(t('myday.today'), 'text-slate-700', today)}
          {group(t('myday.overdue'), 'text-red-600', overdueShown)}
          {overdue.length > overdueShown.length && (
            <button type="button" onClick={() => setShowAllOverdue(true)} className="text-xs font-medium text-blue-600 hover:text-blue-700 mb-2">
              {t('myday.show_more', { n: overdue.length - overdueShown.length })}
            </button>
          )}
          {group(t('myday.next_7_days'), 'text-slate-500', week)}
        </>
      )}
    </Section>
  )
}

// ─── Lessons today ──────────────────────────────────────────────────────
function useTodayLessons() {
  const { user, hasPermission } = useAuth()
  const { schedule, attendance, students, branches } = useData()
  const isTeacher = user?.role === 'teacher'
  const wholeSchool = !isTeacher && (!user?.branch || user.branch === 'all')
  // Roles that run lessons (the schedule is theirs). A sales manager can look
  // at attendance, but today's lessons are not their to-do list.
  const allowed = isTeacher || hasPermission('schedule')
  // re-evaluate «идёт сейчас / закончилось» once a minute
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick(n => n + 1), 60000)
    return () => clearInterval(timer)
  }, [])
  const now = nowHHMM()
  const lessons = useMemo(() => {
    if (!allowed || !user) return []
    const today = todayISO()
    const todayKey = DAY_KEYS[new Date().getDay()]
    return schedule
      .filter(e => {
        if (e.dayOfWeek !== todayKey) return false
        if (isTeacher) return !!user.teacherId && String(e.teacherId) === String(user.teacherId)
        return wholeSchool || sameBranch(e.branchId, user.branch, branches)
      })
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
      .map(e => {
        const studentsCount = students.filter(s => (s.group === e.groupName || (e.groupId && s.groupId === e.groupId)) && s.status !== 'archived').length
        const markedCount = attendance.filter(a => a.date === today && a.groupName === e.groupName).length
        const over = (e.endTime || '') < now
        return {
          ...e, studentsCount, markedCount, isMarked: markedCount > 0,
          inProgress: (e.startTime || '') <= now && !over, missed: over && markedCount === 0,
        }
      })
  }, [schedule, attendance, students, branches, user, allowed, isTeacher, wholeSchool, now])
  return { lessons, allowed, wholeSchool, isTeacher }
}

function LessonsBlock({ lessons, wholeSchool, isTeacher, canMark, t }) {
  const marked = lessons.filter(l => l.isMarked).length
  const missed = lessons.filter(l => l.missed).length
  const more = wholeSchool
    ? <MoreLink to="/branch-ops">{t('myday.ops')}</MoreLink>
    : <MoreLink to="/schedule">{t('myday.schedule')}</MoreLink>
  // The whole school has too many lessons for a to-do list: a summary and a link
  if (wholeSchool) {
    return (
      <Section icon={CalendarDays} title={t('myday.lessons')} count={lessons.length} action={canMark ? more : null}>
        {lessons.length === 0 ? <Empty>{t('myday.lessons_none')}</Empty> : (
          <p className="text-sm text-slate-600">
            {t('myday.lessons_summary', { marked, total: lessons.length })}
            {missed > 0 && <span className="text-red-600 font-medium"> · {t('myday.lessons_missed', { n: missed })}</span>}
          </p>
        )}
      </Section>
    )
  }
  return (
    <Section icon={CalendarDays} title={t('myday.lessons')} count={lessons.length} action={more}>
      {lessons.length === 0 ? <Empty>{t('myday.lessons_none')}</Empty> : (
        <div className="space-y-1.5">
          {lessons.map(l => (
            <div key={l.id} className={`flex items-center gap-3 py-2.5 px-3 rounded-xl border-l-4 text-sm ${
              l.missed ? 'border-l-red-500 bg-red-50/40'
              : l.isMarked ? 'border-l-emerald-500 bg-emerald-50/30'
              : l.inProgress ? 'border-l-blue-500 bg-blue-50/40'
              : 'border-l-slate-200 bg-slate-50/50'
            }`}>
              <span className="font-mono text-xs font-semibold text-slate-600 w-[5.5rem] shrink-0">{l.startTime}–{l.endTime}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 truncate">{l.groupName}</p>
                <p className="text-[11px] text-slate-400 truncate">
                  {[l.courseName, !isTeacher && l.teacherName, l.roomName, t('myday.students_n', { n: l.studentsCount })].filter(Boolean).join(' · ')}
                </p>
              </div>
              {l.isMarked ? (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 shrink-0">
                  <CheckCircle2 size={14} /> {l.markedCount}/{l.studentsCount}
                </span>
              ) : canMark && (l.missed || l.inProgress) ? (
                <Link to={`/attendance?group=${encodeURIComponent(l.groupName || '')}`}
                  className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                    l.missed ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}>
                  {l.missed ? <XCircle size={13} /> : <Clock size={13} />} {t('myday.mark')}
                </Link>
              ) : l.missed ? (
                <span className="flex items-center gap-1 text-xs font-medium text-red-500 shrink-0"><XCircle size={14} /> {t('myday.not_marked')}</span>
              ) : l.inProgress ? (
                <span className="flex items-center gap-1 text-xs font-medium text-blue-600 shrink-0"><Clock size={14} /> {t('myday.in_progress')}</span>
              ) : (
                <span className="text-xs text-slate-400 shrink-0">{t('myday.upcoming')}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

// ─── Teacher: works to review, unread chats, students who stopped coming ─
// A separate component: only it asks for the LMS collections (see useLmsData).
function TeacherBlocks({ t }) {
  const { user } = useAuth()
  const { groups, students, attendance, lmsSubmissions, lmsAssignments, messages, lmsReady } = useLmsData()

  const data = useMemo(() => {
    const myGroups = groups.filter(g => user?.teacherId && String(g.teacherId) === String(user.teacherId) && g.status !== 'archived')
    const groupIds = new Set(myGroups.map(g => g.id))
    const groupNames = new Set(myGroups.map(g => g.name))
    const groupById = Object.fromEntries(myGroups.map(g => [g.id, g]))
    const assignmentById = Object.fromEntries(lmsAssignments.map(a => [a.id, a]))

    const toReview = lmsSubmissions
      .filter(s => s.status === 'submitted' && groupIds.has(s.groupId))
      .sort((a, b) => (a.updatedAt || a.createdAt || '').localeCompare(b.updatedAt || b.createdAt || ''))
      .map(s => ({ ...s, assignmentTitle: assignmentById[s.assignmentId]?.title || '', groupName: groupById[s.groupId]?.name || '' }))

    const unreadByGroup = {}
    for (const m of messages) {
      if (m.senderRole !== 'student' || !groupIds.has(m.groupId)) continue
      if ((m.readBy || []).includes(String(user?.id))) continue
      unreadByGroup[m.groupId] = (unreadByGroup[m.groupId] || 0) + 1
    }
    const unread = Object.entries(unreadByGroup).map(([groupId, count]) => ({ groupId, count, name: groupById[groupId]?.name || '' }))

    // 2+ absences in a row, latest lessons first
    const bySt = {}
    for (const a of attendance) {
      if (groupNames.has(a.groupName)) (bySt[a.studentId] ||= []).push(a)
    }
    const atRisk = []
    for (const s of students) {
      if (!groupNames.has(s.group) || (s.status !== 'active' && s.status !== 'debtor')) continue
      const recs = (bySt[s.id] || []).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      let streak = 0
      for (const r of recs) { if (r.status === 'absent') streak++; else break }
      if (streak >= 2) atRisk.push({ ...s, streak })
    }
    atRisk.sort((a, b) => b.streak - a.streak)
    return { toReview, unread, atRisk, hasGroups: myGroups.length > 0 }
  }, [groups, students, attendance, lmsSubmissions, lmsAssignments, messages, user])

  if (!data.hasGroups) return null
  return (
    <>
      <Section icon={PenTool} tone="text-violet-500" title={t('myday.to_review')} count={lmsReady ? data.toReview.length : null}
        action={<MoreLink to="/lms">LMS</MoreLink>}>
        {!lmsReady ? (
          <div className="flex justify-center py-5"><Loader size={20} className="animate-spin text-slate-400" /></div>
        ) : data.toReview.length === 0 ? <Empty>{t('myday.to_review_none')}</Empty> : (
          <div className="divide-y divide-slate-100">
            {data.toReview.slice(0, 8).map(s => (
              <Link key={s.id} to={`/lms/group/${s.groupId}?tab=assignments`} className="flex items-center gap-3 py-2.5 group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-700">{s.studentName}</p>
                  <p className="text-xs text-slate-400 truncate">{[s.assignmentTitle, s.groupName].filter(Boolean).join(' · ')}</p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{ago(s.updatedAt || s.createdAt)}</span>
              </Link>
            ))}
            {data.toReview.length > 8 && <p className="text-xs text-slate-400 pt-2">{t('myday.and_more', { n: data.toReview.length - 8 })}</p>}
          </div>
        )}
      </Section>

      {lmsReady && data.unread.length > 0 && (
        <Section icon={MessageCircle} tone="text-sky-500" title={t('myday.chats')} count={data.unread.reduce((s, u) => s + u.count, 0)}>
          <div className="divide-y divide-slate-100">
            {data.unread.map(u => (
              <Link key={u.groupId} to={`/lms/group/${u.groupId}?tab=chat`} className="flex items-center gap-3 py-2.5 group">
                <p className="flex-1 min-w-0 text-sm font-medium text-slate-800 truncate group-hover:text-blue-700">{u.name}</p>
                <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-sky-500 text-white text-xs font-bold flex items-center justify-center">{u.count}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {data.atRisk.length > 0 && (
        <Section icon={UserX} tone="text-red-500" title={t('myday.at_risk')} count={data.atRisk.length}>
          <div className="divide-y divide-slate-100">
            {data.atRisk.slice(0, 8).map(s => (
              <div key={s.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{s.name}</p>
                  <p className="text-xs text-slate-400 truncate">{s.group}</p>
                </div>
                <span className="text-xs font-bold text-red-500 shrink-0">{t('myday.absent_streak', { n: s.streak })}</span>
                {s.phone && (
                  <a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`} aria-label={t('myday.call')} title={s.phone}
                    className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                    <Phone size={16} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────
export default function MyDay() {
  const { user, hasPermission } = useAuth()
  const { students, payments, branches, getStudentIncome } = useData()
  const { t, language } = useLanguage()
  const navigate = useNavigate()

  const canCrm = USE_SERVER && hasPermission('crm')
  const canFinance = hasPermission('finance')
  const canTake = hasPermission('finance', 'payments')
  const canMark = hasPermission('attendance', 'mark')

  const crmDay = useCrmDay(canCrm)
  const { lessons, allowed: lessonsAllowed, wholeSchool, isTeacher } = useTodayLessons()
  const expected = useMemo(
    () => (canFinance ? expectedPayments({ students, getStudentIncome, user, branches }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canFinance, students, payments, user, branches]
  )

  const [payment, setPayment] = useState(null) // { mode, studentId? }

  const dateLabel = new Date().toLocaleDateString(language === 'uz' ? 'uz-UZ' : 'ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
  const hour = new Date().getHours()
  const greeting = t(hour < 5 ? 'myday.hello_night' : hour < 12 ? 'myday.hello_morning' : hour < 18 ? 'myday.hello_day' : 'myday.hello_evening')
  const firstName = (user?.name || '').trim().split(/\s+/).slice(-1)[0] || ''

  // ─── Numbers on top ───
  const now = new Date()
  const eod = endOfToday()
  const tasks = crmDay.tasks || []
  const tasksOverdue = tasks.filter(x => new Date(x.dueAt) < now).length
  const tasksToday = tasks.filter(x => { const d = new Date(x.dueAt); return d >= now && d <= eod }).length
  const payToday = expected.filter(e => e.daysUntil === 0)
  const payOverdue = expected.filter(e => e.daysUntil !== null && e.daysUntil < 0)
  const lessonsMissed = lessons.filter(l => l.missed).length

  const tiles = [
    canCrm && { icon: ListTodo, tone: tasksOverdue ? 'red' : 'violet', value: crmDay.tasks ? tasksOverdue + tasksToday : '…', label: tasksOverdue ? t('myday.tile_tasks_overdue', { n: tasksOverdue }) : t('myday.tile_tasks'), to: '/crm?tab=tasks' },
    canCrm && { icon: UserPlus, tone: crmDay.newLeads.length ? 'blue' : 'emerald', value: crmDay.tasks ? crmDay.newLeads.length : '…', label: t('myday.tile_leads'), to: '/crm' },
    canFinance && { icon: Wallet, tone: payToday.length ? 'amber' : 'emerald', value: payToday.length, label: t('myday.tile_pay_today', { sum: shortSum(payToday.reduce((s, e) => s + e.debt, 0)) }) },
    canFinance && { icon: AlertTriangle, tone: payOverdue.length ? 'red' : 'emerald', value: payOverdue.length, label: t('myday.tile_pay_overdue', { sum: shortSum(payOverdue.reduce((s, e) => s + e.debt, 0)) }) },
    lessonsAllowed && { icon: CalendarDays, tone: lessonsMissed ? 'red' : 'blue', value: lessons.length, label: lessonsMissed ? t('myday.tile_lessons_missed', { n: lessonsMissed }) : t('myday.tile_lessons') },
  ].filter(Boolean)

  const nothing = !canCrm && !canFinance && !lessonsAllowed

  return (
    <div className="space-y-5">
      {/* Header + quick actions */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarCheck size={24} className="text-blue-600" /> {t('myday.title')}
          </h2>
          <p className="text-slate-500 mt-1 text-sm">
            {greeting}{firstName ? `, ${firstName}` : ''} · <span className="capitalize">{dateLabel}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canTake && (
            <>
              <button type="button" onClick={() => setPayment({ mode: 'new' })}
                className="bg-emerald-600 text-white px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1.5">
                <Plus size={16} /> {t('myday.act_sale')}
              </button>
              <button type="button" onClick={() => setPayment({ mode: 'doplata' })}
                className="bg-white/70 border border-slate-200 text-slate-700 px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-white transition-colors flex items-center gap-1.5">
                <Wallet size={16} /> {t('myday.act_doplata')}
              </button>
            </>
          )}
          {canCrm && (
            <button type="button" onClick={() => navigate('/crm')}
              className="bg-white/70 border border-slate-200 text-slate-700 px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-white transition-colors flex items-center gap-1.5">
              <UserPlus size={16} /> CRM
            </button>
          )}
          {canMark && (
            <button type="button" onClick={() => navigate(isTeacher ? '/' : '/attendance')}
              className="bg-white/70 border border-slate-200 text-slate-700 px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-white transition-colors flex items-center gap-1.5">
              <ClipboardCheck size={16} /> {t('myday.act_attendance')}
            </button>
          )}
        </div>
      </div>

      {tiles.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {tiles.map((tile, i) => <Tile key={i} {...tile} />)}
        </div>
      )}

      {nothing && (
        <div className="glass-card rounded-2xl p-10 text-center">
          <Coffee size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-600">{t('myday.nothing')}</p>
          <p className="text-xs text-slate-400 mt-1">{t('myday.nothing_hint')}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {canCrm && (
          crmDay.tasks === null
            ? <Section icon={ListTodo} tone="text-violet-500" title={t('myday.tasks')}><div className="flex justify-center py-5"><Loader size={20} className="animate-spin text-slate-400" /></div></Section>
            : <TasksBlock tasks={tasks} onDone={crmDay.completeTask} t={t} />
        )}
        {lessonsAllowed && <LessonsBlock lessons={lessons} wholeSchool={wholeSchool} isTeacher={isTeacher} canMark={canMark} t={t} />}
        {canCrm && <LeadsBlock newLeads={crmDay.newLeads} idle={crmDay.idle} t={t} />}
        {canFinance && <PlanBlock t={t} />}
        {canFinance && (
          <PaymentsBlock expected={expected} canTake={canTake} t={t}
            onDoplata={(student) => setPayment({ mode: 'doplata', studentId: student.id })} />
        )}
        {isTeacher && <TeacherBlocks t={t} />}
      </div>

      <Modal isOpen={!!payment} onClose={() => setPayment(null)} size="xl"
        title={payment?.mode === 'doplata' ? t('myday.act_doplata') : t('myday.act_sale')}>
        {payment && (
          <Suspense fallback={<div className="flex justify-center py-16"><Loader size={22} className="animate-spin text-slate-400" /></div>}>
            <PaymentForm mode={payment.mode} preselectedStudentId={payment.studentId} onClose={() => setPayment(null)} />
          </Suspense>
        )}
      </Modal>
    </div>
  )
}
