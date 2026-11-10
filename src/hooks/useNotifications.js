import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useLanguage } from '../contexts/LanguageContext'
import { USE_SERVER } from '../backend/api'
import { crm, watchCrm, sourceMeta, formatSum } from '../backend/crm'
import { sameBranch } from '../utils/branchMatch'
import { expectedPayments, shortSum } from '../utils/debts'
import { todayISO, isoDaysFromNow, nowHHMM, DAY_KEYS } from '../utils/dates'

// The notification centre behind the bell.
//
// Nothing is stored as a "notification": every item is derived from current
// data, so it disappears by itself once the thing is dealt with (the lead is
// answered, the task is done, the debt is paid, attendance is marked).
//   • payments due / overdue, signed contracts, online payments, unmarked
//     attendance — from the data the app has already loaded (both backends);
//   • new leads, tasks, AI-agent handoffs — from the server (/api/notifications).
//
// "Read" is remembered per person in this browser (localStorage): a list of
// item ids. A phone and a laptop therefore keep separate read marks.

const RECENT_DAYS = 7       // how far back payments / contracts count as news
const MAX_DUE_ITEMS = 15    // individual «ждём оплату» rows; the rest go into one summary row
const REFRESH_MS = 2 * 60 * 1000
const READ_CAP = 1500

const storeKey = (user) => `interno_notif_read:${user?.tenantId || 'default'}:${user?._docId || user?.id || ''}`

function loadRead(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]')
    return new Set(Array.isArray(raw) ? raw : [])
  } catch {
    return new Set()
  }
}
function saveRead(key, set) {
  try {
    // newest ids are at the end — when the list outgrows the cap drop the oldest
    localStorage.setItem(key, JSON.stringify([...set].slice(-READ_CAP)))
  } catch { /* private mode: read marks last until reload */ }
}

export default function useNotifications() {
  const { user, hasPermission, employees } = useAuth()
  const { students, payments, schedule, attendance, branches, getStudentIncome } = useData()
  const { t } = useLanguage()

  const canFinance = hasPermission('finance')
  const canMark = hasPermission('attendance', 'mark')
  const canCrm = USE_SERVER && hasPermission('crm')
  const isStaff = !!user && user.role !== 'student'

  // ─── Server side: leads, tasks, AI handoffs ───
  const [serverItems, setServerItems] = useState([])
  const wantsServer = USE_SERVER && isStaff && (canCrm || user.role === 'owner' || user.role === 'admin')
  const load = useCallback(async () => {
    if (!wantsServer) return
    try {
      const { items } = await crm.notifications()
      setServerItems(Array.isArray(items) ? items : [])
    } catch { /* an older server or no network — the bell just shows what it has */ }
  }, [wantsServer])

  useEffect(() => {
    if (!wantsServer) { setServerItems([]); return }
    load()
    const timer = setInterval(load, REFRESH_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [wantsServer, load])

  // A lead or task changed somewhere → refresh, at most once every few seconds
  const liveTimer = useRef(null)
  useEffect(() => {
    if (!canCrm) return
    const stop = watchCrm(['crm_leads', 'crm_tasks'], () => {
      if (liveTimer.current) return
      liveTimer.current = setTimeout(() => { liveTimer.current = null; load() }, 4000)
    })
    return () => { stop(); clearTimeout(liveTimer.current); liveTimer.current = null }
  }, [canCrm, load])

  // Re-evaluate time-based items (a lesson has just ended) every few minutes
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick(n => n + 1), 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  const items = useMemo(() => {
    if (!isStaff) return []
    const out = []
    const today = todayISO()
    const since = isoDaysFromNow(-RECENT_DAYS)
    const people = Object.fromEntries((employees || []).map(e => [e._docId, e]))

    // ── CRM (server) ──
    for (const n of serverItems) {
      if (n.type === 'lead_new') {
        out.push({
          id: n.id, kind: 'lead', at: n.at, to: `/crm?lead=${n.leadId}`,
          title: t('notif.lead_new', { name: n.title || t('notif.no_name') }),
          text: [sourceMeta(n.source).label, n.unassigned ? t('notif.unassigned') : ''].filter(Boolean).join(' · '),
        })
      } else if (n.type === 'task_overdue') {
        out.push({
          id: n.id, kind: 'task_overdue', at: n.at, to: n.leadId ? `/crm?lead=${n.leadId}` : '/crm?tab=tasks',
          title: t('notif.task_overdue', { text: n.title }), text: n.leadTitle || '',
        })
      } else if (n.type === 'task_new') {
        const due = n.dueAt ? new Date(n.dueAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
        out.push({
          id: n.id, kind: 'task', at: n.at, to: n.leadId ? `/crm?lead=${n.leadId}` : '/crm?tab=tasks',
          title: t('notif.task_new', { text: n.title }),
          text: [people[n.authorId]?.name, due && t('notif.due', { date: due }), n.leadTitle].filter(Boolean).join(' · '),
        })
      } else if (n.type === 'ai_handoff') {
        out.push({
          id: n.id, kind: 'ai', at: n.at, to: '/ai-agent',
          title: t('notif.ai_handoff', { name: n.title || t('notif.no_name') }), text: n.reason || '',
        })
      }
    }

    // ── Payments (roles that work with money) ──
    if (canFinance) {
      const isSales = user.role === 'sales'
      const branchScoped = user.branch && user.branch !== 'all'
      const myMgr = user.managerId || null
      const myId = user.id != null ? String(user.id) : null
      const isMinePayment = (p) => {
        if (isSales) {
          return (myMgr && p.managerId === myMgr) || (myId && String(p.createdBy) === myId) ||
            (myMgr && Array.isArray(p.splits) && p.splits.some(s => s?.managerId === myMgr))
        }
        if (branchScoped) return sameBranch(p.branch, user.branch, branches)
        return true
      }

      // Money we are waiting for: due today or recently overdue — one row
      // each; everything older — a single summary row.
      const expected = expectedPayments({ students, getStudentIncome, user, branches, today })
      const recent = [], old = []
      for (const e of expected) {
        if (e.daysUntil === null || e.daysUntil > 0) continue
        ;(e.daysUntil >= -RECENT_DAYS ? recent : old).push(e)
      }
      const overflow = recent.slice(MAX_DUE_ITEMS)
      for (const e of recent.slice(0, MAX_DUE_ITEMS)) {
        out.push({
          id: `pay_due:${e.student.id}:${e.nextPaymentDate}`, kind: e.daysUntil === 0 ? 'pay_today' : 'pay_overdue',
          at: `${e.nextPaymentDate.slice(0, 10)}T09:00:00`, to: `/students?q=${encodeURIComponent(e.student.name || '')}`,
          title: t(e.daysUntil === 0 ? 'notif.pay_today' : 'notif.pay_overdue', { name: e.student.name || '' }),
          text: [formatSum(e.debt), e.student.group].filter(Boolean).join(' · '),
        })
      }
      const rest = [...overflow, ...old]
      if (rest.length) {
        out.push({
          id: `pay_overdue_sum:${today}`, kind: 'pay_overdue', at: `${today}T08:00:00`, to: '/finance',
          title: t('notif.pay_overdue_sum', { count: rest.length }),
          text: t('notif.total_sum', { sum: shortSum(rest.reduce((s, e) => s + e.debt, 0)) }),
        })
      }

      // Contracts signed by clients and online payments
      for (const p of payments) {
        if (p.type !== 'income' || p.cancelled) continue
        if (p.contractSigned && p.signedAt && p.signedAt.slice(0, 10) >= since && isMinePayment(p)) {
          out.push({
            id: `signed:${p.id}`, kind: 'contract', at: p.signedAt, to: `/students?q=${encodeURIComponent(p.student || '')}`,
            title: t('notif.contract_signed', { name: p.student || '' }),
            text: [p.contractNumber && `№ ${p.contractNumber}`, p.course].filter(Boolean).join(' · '),
          })
        }
        if (p.paymeTransactionId && (p.createdAt || '').slice(0, 10) >= since) {
          // Online payments have no manager: a sales manager sees the ones of
          // clients they took payments from before
          const mine = isSales
            ? getStudentIncome(p.studentId).some(x => x !== p && isMinePayment(x))
            : isMinePayment(p)
          if (mine) {
            out.push({
              id: `payme:${p.id}`, kind: 'payment', at: p.createdAt, to: `/students?q=${encodeURIComponent(p.student || '')}`,
              title: t('notif.payme', { name: p.student || '' }),
              text: [formatSum(p.amount), p.course].filter(Boolean).join(' · '),
            })
          }
        }
      }
    }

    // ── Attendance not marked after a lesson that has ended today ──
    // Teachers: their own lessons. Branch staff: their branch. People who
    // see the whole school get this on «Операционка», not in the bell.
    if (canMark && (user.role === 'teacher' || (user.branch && user.branch !== 'all'))) {
      const todayKey = DAY_KEYS[new Date().getDay()]
      const now = nowHHMM()
      const marked = new Set(attendance.filter(a => a.date === today).map(a => a.groupName))
      for (const e of schedule) {
        if (e.dayOfWeek !== todayKey || !e.endTime || e.endTime >= now) continue
        if (user.role === 'teacher') {
          if (!user.teacherId || String(e.teacherId) !== String(user.teacherId)) continue
        } else if (!sameBranch(e.branchId, user.branch, branches)) {
          continue
        }
        if (marked.has(e.groupName)) continue
        out.push({
          id: `unmarked:${e.id}:${today}`, kind: 'attendance', at: `${today}T${e.endTime}:00`,
          to: user.role === 'teacher' ? '/' : '/attendance',
          title: t('notif.attendance_unmarked', { group: e.groupName || '' }),
          text: [`${e.startTime}–${e.endTime}`, e.teacherName].filter(Boolean).join(' · '),
        })
      }
    }

    return out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverItems, students, payments, schedule, attendance, branches, employees, user, canFinance, canMark, isStaff, t, tick])

  // ─── Read marks ───
  const key = storeKey(user)
  const [read, setRead] = useState(() => loadRead(key))
  useEffect(() => { setRead(loadRead(key)) }, [key])
  // another tab marked something as read
  useEffect(() => {
    const onStorage = (e) => { if (e.key === key) setRead(loadRead(key)) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key])

  const markRead = useCallback((ids) => {
    setRead(prev => {
      const next = new Set(prev)
      for (const id of ids) { next.delete(id); next.add(id) }
      saveRead(key, next)
      return next
    })
  }, [key])
  const markAllRead = useCallback(() => markRead(items.map(i => i.id)), [markRead, items])

  const withState = useMemo(() => items.map(i => ({ ...i, unread: !read.has(i.id) })), [items, read])
  const unreadCount = withState.reduce((n, i) => n + (i.unread ? 1 : 0), 0)

  return { items: withState, unreadCount, markRead, markAllRead, reload: load }
}
