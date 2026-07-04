import { useState, useEffect, useMemo } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import {
  TrendingUp, Target, Receipt, Percent, AlertTriangle, Flame, Trophy,
  Filter, Moon, CreditCard, ArrowUpRight, ArrowDownRight, Building2,
  Users, BookOpen, Phone,
} from 'lucide-react'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'

// ─── Role-aware sales analytics for the Finance page ────────────────────
// Always computed for the CURRENT month (run-rate metrics don't make sense
// for past months). Three tiers:
//   sales            → personal panel (plan forecast, avg check, conversion,
//                      overdue, streak, rank)
//   rop / director   → branch panel (funnel, branch forecast, silent
//                      managers, top debtors, installment share)
//   owner / admin    → everything: branch panel across all branches + MoM,
//                      per-branch margin, student snapshot, revenue by course

function fmtMoney(n) {
  const v = Number(n) || 0
  if (Math.abs(v) >= 1000000) {
    const m = v / 1000000
    return `${Number.isInteger(m) ? m : m.toFixed(1)} млн`
  }
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)} тыс`
  return String(Math.round(v))
}
const fmtFull = (n) => (Number(n) || 0).toLocaleString('ru-RU').replace(/,/g, ' ')

const todayISO = () => new Date().toISOString().split('T')[0]
const monthKeyOf = (d) => d.toISOString().slice(0, 7)

// Manager's share of a payment (splits are credited per share)
function shareOf(p, managerId) {
  if (Array.isArray(p.splits) && p.splits.length >= 2) {
    const s = p.splits.find(sp => sp.managerId === managerId)
    return s ? Number(s.amount) || 0 : 0
  }
  return p.managerId === managerId ? (Number(p.amount) || 0) : 0
}

function StatCard({ icon: Icon, tone = 'blue', label, value, sub }) {
  const tones = {
    blue: 'text-blue-600 bg-blue-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    amber: 'text-amber-600 bg-amber-50',
    red: 'text-red-600 bg-red-50',
    violet: 'text-violet-600 bg-violet-50',
    cyan: 'text-cyan-600 bg-cyan-50',
  }
  return (
    <div className="bg-white/70 border border-slate-200/60 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${tones[tone]}`}>
          <Icon size={14} />
        </span>
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className="text-lg font-bold text-slate-900 leading-tight">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function SalesInsights() {
  const { user, employees } = useAuth()
  const { payments, students, branches, getSalesPlan, tenantId } = useData()

  const role = user?.role
  const isSales = role === 'sales'
  const isRop = role === 'rop' || role === 'branch_director'
  const isOwner = role === 'owner' || role === 'admin'
  // NOTE: no early return here — hooks below must run on every render
  // (Rules of Hooks). The role check happens right before the JSX return.

  const now = new Date()
  const curKey = monthKeyOf(now)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth = now.getDate()
  const today = todayISO()

  // Branch scope: rop/director → own branch; owner → everything
  const scopeBranch = isRop && user?.branch !== 'all' ? user.branch : null

  // ─── reportDaily for the current month (funnel + silent managers) ───
  const [daily, setDaily] = useState({ byMgr: {}, todayByMgr: {} })
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const q = query(
          collection(db, 'reportDaily'),
          where('monthKey', '==', curKey),
          where('tenantId', '==', tenantId),
        )
        const snap = await getDocs(q)
        if (cancelled) return
        const byMgr = {}
        const todayByMgr = {}
        const overrides = {}
        snap.docs.forEach(d => {
          const r = d.data()
          const mgr = r.manager
          if (!mgr) return
          if (r.day === 'override') {
            overrides[mgr] = r
            return
          }
          if (!byMgr[mgr]) byMgr[mgr] = { leads: 0, conversations: 0, signups: 0, visited: 0, sales: 0 }
          byMgr[mgr].leads += r.leads || 0
          byMgr[mgr].conversations += r.conversations || 0
          byMgr[mgr].signups += r.signups || 0
          byMgr[mgr].visited += r.visited || 0
          byMgr[mgr].sales += r.sales || 0
          if (Number(r.day) === dayOfMonth) {
            if (!todayByMgr[mgr]) todayByMgr[mgr] = { conversations: 0, sales: 0 }
            todayByMgr[mgr].conversations += r.conversations || 0
            todayByMgr[mgr].sales += r.sales || 0
          }
        })
        Object.entries(overrides).forEach(([mgr, r]) => {
          byMgr[mgr] = {
            leads: r.leads || 0, conversations: r.conversations || 0,
            signups: r.signups || 0, visited: r.visited || 0, sales: r.sales || 0,
          }
        })
        setDaily({ byMgr, todayByMgr })
      } catch (e) {
        console.warn('SalesInsights reportDaily load failed:', e.message)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curKey, tenantId])

  // ─── Sales staff in scope ───
  const salesStaff = useMemo(() => {
    let staff = (employees || []).filter(e =>
      e.role === 'sales' && e.status !== 'pending' && e.status !== 'rejected' && !e.deleted &&
      (e.tenantId || 'default') === (user?.tenantId || 'default')
    )
    if (scopeBranch) staff = staff.filter(e => e.branch === scopeBranch)
    return staff
  }, [employees, scopeBranch, user])

  // ─── Current-month income payments in scope ───
  const monthPays = useMemo(() => {
    let list = payments.filter(p => p.type === 'income' && !p.cancelled && (p.date || '').startsWith(curKey))
    if (scopeBranch) list = list.filter(p => p.branch === scopeBranch)
    return list
  }, [payments, curKey, scopeBranch])

  // ─── Debtors in scope (debt + overdue) ───
  const debtors = useMemo(() => {
    let list = students.filter(s => s.status !== 'archived' && s.status !== 'frozen')
    if (scopeBranch) list = list.filter(s => s.branch === scopeBranch)
    return list.map(s => {
      const price = Number(s.totalCoursePrice) || 0
      if (price <= 0) return null
      const paid = payments
        .filter(p => p.type === 'income' && !p.cancelled && String(p.studentId) === String(s.id))
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
      const debt = price - paid
      if (debt <= 0) return null
      const overdue = s.nextPaymentDate && s.nextPaymentDate < today
      return { ...s, debt, overdue }
    }).filter(Boolean)
  }, [students, payments, scopeBranch, today])

  // ═══════════════ MANAGER PANEL ═══════════════
  const managerPanel = useMemo(() => {
    if (!isSales || !user?.managerId) return null
    const mid = user.managerId

    const myPays = payments.filter(p =>
      p.type === 'income' && !p.cancelled && (p.date || '').startsWith(curKey) &&
      (p.managerId === mid || (Array.isArray(p.splits) && p.splits.some(sp => sp.managerId === mid)))
    )
    const fact = myPays.reduce((s, p) => s + shareOf(p, mid), 0)
    const count = myPays.length
    const plan = getSalesPlan(mid, curKey)
    const forecast = dayOfMonth > 0 ? Math.round((fact / dayOfMonth) * daysInMonth) : 0
    const avgCheck = count > 0 ? fact / count : 0

    // Conversion visited→sale from reportDaily (manager row is keyed by name)
    const myDaily = daily.byMgr[user.name] || {}
    const conv = myDaily.visited > 0 ? Math.round((count / myDaily.visited) * 100) : null

    // Overdue among MY students (responsible = managerId on latest payment)
    let overdueSum = 0, overdueCount = 0
    for (const s of debtors) {
      if (!s.overdue) continue
      const lastPay = payments
        .filter(p => p.type === 'income' && String(p.studentId) === String(s.id))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
      if (lastPay && (lastPay.managerId === mid || lastPay.createdBy === user.id)) {
        overdueSum += s.debt
        overdueCount++
      }
    }

    // Streak: consecutive days (ending today or yesterday) with ≥1 sale
    const saleDays = new Set(myPays.concat(
      payments.filter(p => p.type === 'income' && !p.cancelled && p.managerId === mid)
    ).map(p => p.date))
    let streak = 0
    const cursor = new Date()
    if (!saleDays.has(todayISO())) cursor.setDate(cursor.getDate() - 1)
    while (saleDays.has(cursor.toISOString().split('T')[0])) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    }

    // Rank among branch colleagues
    const colleagues = (employees || []).filter(e =>
      e.role === 'sales' && !e.deleted && e.branch === user.branch && e.managerId
    )
    const ranked = colleagues.map(e => ({
      id: e.managerId,
      name: e.name,
      revenue: payments
        .filter(p => p.type === 'income' && !p.cancelled && (p.date || '').startsWith(curKey))
        .reduce((s, p) => s + shareOf(p, e.managerId), 0),
    })).sort((a, b) => b.revenue - a.revenue)
    const myIdx = ranked.findIndex(r => r.id === mid)
    const gapToNext = myIdx > 0 ? ranked[myIdx - 1].revenue - fact : 0

    return { fact, plan, forecast, avgCheck, count, conv, overdueSum, overdueCount, streak, rank: myIdx + 1, total: ranked.length, gapToNext }
  }, [isSales, user, payments, curKey, getSalesPlan, daily, debtors, employees, dayOfMonth, daysInMonth])

  // ═══════════════ ROP / OWNER PANEL ═══════════════
  const teamPanel = useMemo(() => {
    if (!isRop && !isOwner) return null

    // Funnel: sum reportDaily across scope managers
    const scopeNames = new Set(salesStaff.map(e => e.name))
    const funnel = { leads: 0, conversations: 0, signups: 0, visited: 0, sales: 0 }
    Object.entries(daily.byMgr).forEach(([mgr, r]) => {
      if (scopeNames.size > 0 && !scopeNames.has(mgr)) return
      funnel.leads += r.leads; funnel.conversations += r.conversations
      funnel.signups += r.signups; funnel.visited += r.visited; funnel.sales += r.sales
    })

    // Scope plan/fact/forecast
    const plan = salesStaff.reduce((s, e) => s + (e.managerId ? getSalesPlan(e.managerId, curKey) : 0), 0)
    const fact = monthPays.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const forecast = dayOfMonth > 0 ? Math.round((fact / dayOfMonth) * daysInMonth) : 0

    // Silent managers today: 0 conversations AND 0 sales
    const silent = salesStaff.filter(e => {
      const t = daily.todayByMgr[e.name]
      const soldToday = monthPays.some(p => p.date === today &&
        (p.managerId === e.managerId || (Array.isArray(p.splits) && p.splits.some(sp => sp.managerId === e.managerId))))
      return !soldToday && (!t || (t.conversations === 0 && t.sales === 0))
    })

    // Top overdue debtors
    const topDebtors = debtors.filter(d => d.overdue).sort((a, b) => b.debt - a.debt).slice(0, 5)
    const overdueTotal = debtors.filter(d => d.overdue).reduce((s, d) => s + d.debt, 0)

    // Installment share
    const instSum = monthPays.filter(p => (p.method || '').includes('Рассрочка')).reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const instShare = fact > 0 ? Math.round((instSum / fact) * 100) : 0

    return { funnel, plan, fact, forecast, silent, topDebtors, overdueTotal, instShare, instSum }
  }, [isRop, isOwner, salesStaff, daily, monthPays, getSalesPlan, curKey, debtors, today, dayOfMonth, daysInMonth])

  // ═══════════════ OWNER EXTRAS ═══════════════
  const ownerPanel = useMemo(() => {
    if (!isOwner) return null

    // MoM: this month up to today vs previous month up to the same day
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevKey = monthKeyOf(prevDate)
    const cutDay = String(dayOfMonth).padStart(2, '0')
    const sumRange = (key) => payments
      .filter(p => p.type === 'income' && !p.cancelled && (p.date || '').startsWith(key) && (p.date || '').slice(8, 10) <= cutDay)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const curMTD = sumRange(curKey)
    const prevMTD = sumRange(prevKey)
    const momPct = prevMTD > 0 ? Math.round(((curMTD - prevMTD) / prevMTD) * 100) : null

    // Per-branch margin (income − expense, current month)
    const branchMargin = branches.map(b => {
      const inBranch = payments.filter(p => (p.date || '').startsWith(curKey) && p.branch === b.id && !p.cancelled)
      const income = inBranch.filter(p => p.type === 'income').reduce((s, p) => s + (Number(p.amount) || 0), 0)
      const expense = inBranch.filter(p => p.type === 'expense').reduce((s, p) => s + (Number(p.amount) || 0), 0)
      return { id: b.id, name: b.name, income, expense, margin: income - expense }
    }).filter(b => b.income > 0 || b.expense > 0).sort((a, b) => b.margin - a.margin)

    // Student snapshot
    const snapshot = {
      active: students.filter(s => s.status === 'active').length,
      debtor: students.filter(s => s.status === 'debtor').length,
      frozen: students.filter(s => s.status === 'frozen').length,
    }
    const totalDebt = debtors.reduce((s, d) => s + d.debt, 0)

    // Revenue by course (top 5, current month)
    const byCourse = {}
    monthPays.forEach(p => {
      const c = p.course || '—'
      byCourse[c] = (byCourse[c] || 0) + (Number(p.amount) || 0)
    })
    const topCourses = Object.entries(byCourse).sort(([, a], [, b]) => b - a).slice(0, 5)

    return { curMTD, prevMTD, momPct, branchMargin, snapshot, totalDebt, topCourses }
  }, [isOwner, payments, curKey, branches, students, debtors, monthPays, dayOfMonth]) // eslint-disable-line react-hooks/exhaustive-deps

  // Role gate — after all hooks so the hook order never changes
  if (!isSales && !isRop && !isOwner) return null

  const funnelSteps = teamPanel ? [
    ['Заявки', teamPanel.funnel.leads],
    ['Разговоры', teamPanel.funnel.conversations],
    ['Записи', teamPanel.funnel.signups],
    ['Пришли', teamPanel.funnel.visited],
    ['Купили', teamPanel.funnel.sales],
  ] : []
  const funnelMax = Math.max(1, ...funnelSteps.map(([, v]) => v))

  return (
    <div className="space-y-4">
      {/* ═══ Manager personal panel ═══ */}
      {managerPanel && (
        <div className="glass-card rounded-2xl p-4 md:p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Target size={20} className="text-violet-600" />
            Мой месяц
            {managerPanel.streak >= 2 && (
              <span className="ml-2 text-sm font-medium text-orange-500 flex items-center gap-1">
                <Flame size={15} /> {managerPanel.streak} дн. подряд с продажей
              </span>
            )}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard icon={TrendingUp} tone={managerPanel.plan > 0 && managerPanel.forecast >= managerPanel.plan ? 'emerald' : 'amber'}
              label="Прогноз на месяц"
              value={`${fmtMoney(managerPanel.forecast)} сум`}
              sub={managerPanel.plan > 0 ? `план ${fmtMoney(managerPanel.plan)} · идёшь на ${Math.round((managerPanel.forecast / managerPanel.plan) * 100)}%` : 'план не задан'} />
            <StatCard icon={Receipt} tone="blue"
              label="Средний чек"
              value={`${fmtMoney(managerPanel.avgCheck)} сум`}
              sub={`${managerPanel.count} продаж`} />
            <StatCard icon={Percent} tone="violet"
              label="Конверсия пришёл→купил"
              value={managerPanel.conv !== null ? `${managerPanel.conv}%` : '—'}
              sub={managerPanel.conv === null ? 'нет данных о пришедших' : null} />
            <StatCard icon={AlertTriangle} tone={managerPanel.overdueCount > 0 ? 'red' : 'emerald'}
              label="Просрочено у моих"
              value={managerPanel.overdueCount > 0 ? `${fmtMoney(managerPanel.overdueSum)} сум` : 'нет 🎉'}
              sub={managerPanel.overdueCount > 0 ? `${managerPanel.overdueCount} студ. — позвони сегодня` : null} />
            <StatCard icon={Trophy} tone="amber"
              label="Рейтинг филиала"
              value={`#${managerPanel.rank} из ${managerPanel.total}`}
              sub={managerPanel.rank > 1 ? `до #${managerPanel.rank - 1} — ${fmtMoney(managerPanel.gapToNext)}` : 'ты лидер 👑'} />
            <StatCard icon={Flame} tone="cyan"
              label="Серия продаж"
              value={managerPanel.streak > 0 ? `${managerPanel.streak} дн.` : '—'}
              sub={managerPanel.streak === 0 ? 'продай сегодня — начни серию' : null} />
          </div>
        </div>
      )}

      {/* ═══ ROP / Owner team panel ═══ */}
      {teamPanel && (
        <div className="glass-card rounded-2xl p-4 md:p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Filter size={20} className="text-blue-600" />
            Команда — текущий месяц {scopeBranch ? `· ${branches.find(b => b.id === scopeBranch)?.name || scopeBranch}` : ''}
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Funnel */}
            <div>
              <p className="text-sm font-medium text-slate-600 mb-2">Воронка продаж</p>
              <div className="space-y-1.5">
                {funnelSteps.map(([label, val], i) => {
                  const prev = i > 0 ? funnelSteps[i - 1][1] : null
                  const convPct = prev > 0 ? Math.round((val / prev) * 100) : null
                  return (
                    <div key={label} className="flex items-center gap-2">
                      <span className="w-24 text-xs text-slate-500 text-right flex-shrink-0">{label}</span>
                      <div className="flex-1 h-7 bg-slate-100 rounded-lg overflow-hidden relative">
                        <div className="h-full bg-gradient-to-r from-blue-400 to-violet-500 rounded-lg"
                          style={{ width: `${Math.max(4, (val / funnelMax) * 100)}%` }} />
                        <span className="absolute inset-y-0 left-2 flex items-center text-xs font-bold text-white drop-shadow">{val}</span>
                      </div>
                      <span className="w-12 text-xs text-slate-400 tabular-nums flex-shrink-0">
                        {convPct !== null ? `${convPct}%` : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Team stats */}
            <div className="grid grid-cols-2 gap-3 content-start">
              <StatCard icon={TrendingUp} tone={teamPanel.plan > 0 && teamPanel.forecast >= teamPanel.plan ? 'emerald' : 'amber'}
                label="Прогноз на месяц"
                value={`${fmtMoney(teamPanel.forecast)} сум`}
                sub={teamPanel.plan > 0 ? `план ${fmtMoney(teamPanel.plan)}` : 'план не задан'} />
              <StatCard icon={CreditCard} tone={teamPanel.instShare > 40 ? 'red' : 'blue'}
                label="Доля рассрочек"
                value={`${teamPanel.instShare}%`}
                sub={teamPanel.instShare > 40 ? 'высокий риск кассового разрыва' : `${fmtMoney(teamPanel.instSum)} сум`} />
              <StatCard icon={Moon} tone={teamPanel.silent.length > 0 ? 'amber' : 'emerald'}
                label="Тихие менеджеры сегодня"
                value={teamPanel.silent.length > 0 ? `${teamPanel.silent.length}` : 'все активны ✅'}
                sub={teamPanel.silent.slice(0, 3).map(e => e.name.split(' ')[0]).join(', ') || null} />
              <StatCard icon={AlertTriangle} tone={teamPanel.overdueTotal > 0 ? 'red' : 'emerald'}
                label="Просроченные доплаты"
                value={`${fmtMoney(teamPanel.overdueTotal)} сум`} />
            </div>
          </div>

          {/* Top overdue debtors */}
          {teamPanel.topDebtors.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-medium text-slate-600 mb-2">Топ просроченных должников</p>
              <div className="space-y-1.5">
                {teamPanel.topDebtors.map(d => (
                  <div key={d.id} className="flex items-center justify-between py-2 px-3 bg-red-50/60 border border-red-100 rounded-xl text-sm">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="font-medium text-slate-800 truncate">{d.name}</span>
                      {d.phone && (
                        <a href={`tel:${d.phone}`} className="text-xs text-blue-600 flex items-center gap-1 flex-shrink-0">
                          <Phone size={11} /> {d.phone}
                        </a>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <span className="font-bold text-red-600">{fmtFull(d.debt)} сум</span>
                      {d.nextPaymentDate && <span className="text-xs text-slate-400 ml-2">срок {d.nextPaymentDate}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Owner extras ═══ */}
      {ownerPanel && (
        <div className="glass-card rounded-2xl p-4 md:p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Building2 size={20} className="text-emerald-600" />
            Бизнес — сводка руководителя
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatCard
              icon={ownerPanel.momPct === null || ownerPanel.momPct >= 0 ? ArrowUpRight : ArrowDownRight}
              tone={ownerPanel.momPct === null ? 'blue' : ownerPanel.momPct >= 0 ? 'emerald' : 'red'}
              label={`Выручка на ${dayOfMonth}-е число`}
              value={`${fmtMoney(ownerPanel.curMTD)} сум`}
              sub={ownerPanel.momPct !== null
                ? `${ownerPanel.momPct >= 0 ? '+' : ''}${ownerPanel.momPct}% к прошлому месяцу (${fmtMoney(ownerPanel.prevMTD)})`
                : 'нет данных за прошлый месяц'} />
            <StatCard icon={AlertTriangle} tone="amber"
              label="Общая задолженность"
              value={`${fmtMoney(ownerPanel.totalDebt)} сум`} />
            <StatCard icon={Users} tone="blue"
              label="Студенты"
              value={`${ownerPanel.snapshot.active} актив`}
              sub={`${ownerPanel.snapshot.debtor} должн. · ${ownerPanel.snapshot.frozen} замор.`} />
            <StatCard icon={BookOpen} tone="violet"
              label="Курс-лидер месяца"
              value={ownerPanel.topCourses[0]?.[0] || '—'}
              sub={ownerPanel.topCourses[0] ? `${fmtMoney(ownerPanel.topCourses[0][1])} сум` : null} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Branch margin */}
            {ownerPanel.branchMargin.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-600 mb-2">Филиалы: доход − расход (месяц)</p>
                <div className="space-y-1.5">
                  {ownerPanel.branchMargin.map(b => (
                    <div key={b.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-xl text-sm">
                      <span className="font-medium text-slate-700">{b.name}</span>
                      <div className="text-right">
                        <span className={`font-bold ${b.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {b.margin >= 0 ? '+' : ''}{fmtMoney(b.margin)} сум
                        </span>
                        <span className="text-xs text-slate-400 ml-2">{fmtMoney(b.income)} − {fmtMoney(b.expense)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Revenue by course */}
            {ownerPanel.topCourses.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-600 mb-2">Выручка по курсам (месяц)</p>
                <div className="space-y-1.5">
                  {(() => {
                    const max = Math.max(1, ...ownerPanel.topCourses.map(([, v]) => v))
                    return ownerPanel.topCourses.map(([course, val]) => (
                      <div key={course} className="flex items-center gap-2">
                        <span className="w-28 text-xs text-slate-500 text-right truncate flex-shrink-0">{course}</span>
                        <div className="flex-1 h-6 bg-slate-100 rounded-lg overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-lg"
                            style={{ width: `${Math.max(4, (val / max) * 100)}%` }} />
                        </div>
                        <span className="w-20 text-xs font-semibold text-slate-700 tabular-nums flex-shrink-0">{fmtMoney(val)}</span>
                      </div>
                    ))
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
