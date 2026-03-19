import { useState, useMemo, useCallback } from 'react'
import {
  GraduationCap, Users, Building2, DollarSign, TrendingUp, TrendingDown,
  BookOpen, UserMinus, Wallet, ArrowUpRight, ArrowDownRight, Activity,
  Target, Percent, CreditCard, PiggyBank, BarChart3, Clock, AlertTriangle,
  CheckCircle2, XCircle, Pause, UserCheck, Calendar, ChevronDown, Filter,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar, RadialBarChart, RadialBar,
  ComposedChart, Line,
} from 'recharts'
import SalesDashboard from '../components/SalesDashboard'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useLanguage } from '../contexts/LanguageContext'
import { formatCurrency } from '../data/mockData'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtShort = (n, t) => {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + ' ' + t('format.billion')
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' ' + t('format.million')
  if (n >= 1e3) return (n / 1e3).toFixed(0) + ' ' + t('format.thousand')
  return String(n)
}

const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']
const STATUS_COLORS = { active: '#10b981', debtor: '#ef4444', frozen: '#94a3b8' }

function getDateRange(periodId, customFrom, customTo) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let from, to

  switch (periodId) {
    case 'today':
      from = today
      to = new Date(today.getTime() + 86400000 - 1)
      break
    case 'yesterday':
      from = new Date(today.getTime() - 86400000)
      to = new Date(today.getTime() - 1)
      break
    case 'week': {
      const dayOfWeek = today.getDay() || 7
      from = new Date(today.getTime() - (dayOfWeek - 1) * 86400000)
      to = new Date(today.getTime() + 86400000 - 1)
      break
    }
    case 'month':
      from = new Date(now.getFullYear(), now.getMonth(), 1)
      to = new Date(today.getTime() + 86400000 - 1)
      break
    case 'quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3
      from = new Date(now.getFullYear(), qMonth, 1)
      to = new Date(today.getTime() + 86400000 - 1)
      break
    }
    case 'year':
      from = new Date(now.getFullYear(), 0, 1)
      to = new Date(today.getTime() + 86400000 - 1)
      break
    case 'custom':
      from = customFrom ? new Date(customFrom) : new Date(2020, 0, 1)
      to = customTo ? new Date(customTo + 'T23:59:59') : new Date(today.getTime() + 86400000 - 1)
      break
    case 'all':
    default:
      return null // no filter
  }
  return { from, to }
}

// ─── Mini KPI Card ────────────────────────────────────────────────────────────
function KpiCard({ title, value, subtitle, icon: Icon, color, trend, trendLabel }) {
  const bg = {
    blue: 'from-blue-500 to-blue-600', green: 'from-emerald-500 to-emerald-600',
    purple: 'from-purple-500 to-purple-600', orange: 'from-orange-500 to-orange-600',
    red: 'from-red-500 to-red-600', cyan: 'from-cyan-500 to-cyan-600',
    teal: 'from-teal-500 to-teal-600', pink: 'from-pink-500 to-pink-600',
  }
  return (
    <div className="glass-card rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2.5 rounded-xl bg-gradient-to-br ${bg[color] || bg.blue} text-white shadow-lg`}>
            <Icon size={20} />
          </div>
          {trend !== undefined && (
            <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
              trend >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
            }`}>
              {trend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {Math.abs(trend)}%
            </div>
          )}
        </div>
        <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
        <p className="text-xs text-slate-500 mt-1 font-medium">{title}</p>
        {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {trendLabel && (
        <div className="px-5 py-2 bg-slate-50 border-t border-slate-100">
          <p className="text-[11px] text-slate-400">{trendLabel}</p>
        </div>
      )}
    </div>
  )
}

// ─── Branch Scorecard Row ─────────────────────────────────────────────────────
function BranchScoreRow({ branch, students, teachers, payments, rank, fmt }) {
  const branchStudents = students.filter(s => s.branch === branch.id)
  const branchTeachers = teachers.filter(t => t.branch === branch.id)
  const branchIncome = payments.filter(p => p.branch === branch.id && p.type === 'income').reduce((s, p) => s + p.amount, 0)
  const actualStudents = branchStudents.length || branch.students
  const occupancy = branch.capacity > 0 ? pct(actualStudents, branch.capacity) : 0
  const profit = (branch.monthlyRevenue || branchIncome) - (branch.monthlyExpenses || 0)
  const margin = (branch.monthlyRevenue || branchIncome) > 0 ? pct(profit, branch.monthlyRevenue || branchIncome) : 0
  const debtors = branchStudents.filter(s => s.status === 'debtor').length
  const avgPerStudent = actualStudents > 0 ? Math.round(branchIncome / actualStudents) : 0

  const occColor = occupancy > 85 ? 'text-red-600 bg-red-50' : occupancy > 60 ? 'text-amber-600 bg-amber-50' : 'text-emerald-600 bg-emerald-50'
  const marginColor = margin > 30 ? 'text-emerald-600' : margin > 15 ? 'text-amber-600' : 'text-red-600'

  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
      <td className="py-4 px-4">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${
            rank === 0 ? 'from-amber-400 to-amber-500' : rank === 1 ? 'from-slate-300 to-slate-400' : 'from-orange-300 to-orange-400'
          } text-white flex items-center justify-center text-xs font-bold shadow-sm`}>
            #{rank + 1}
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">{branch.name}</p>
            <p className="text-xs text-slate-400">{branch.director || ''}</p>
          </div>
        </div>
      </td>
      <td className="py-4 px-3 text-center">
        <p className="text-sm font-bold text-slate-800">{actualStudents}</p>
        <p className="text-[10px] text-slate-400">{branch.capacity}</p>
      </td>
      <td className="py-4 px-3 text-center hidden md:table-cell">
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${occColor}`}>{occupancy}%</span>
      </td>
      <td className="py-4 px-3 text-right">
        <p className="text-sm font-bold text-emerald-600">{fmt(branch.monthlyRevenue || branchIncome)}</p>
      </td>
      <td className="py-4 px-3 text-right hidden md:table-cell">
        <p className={`text-sm font-bold ${marginColor}`}>{margin}%</p>
      </td>
      <td className="py-4 px-3 text-center hidden lg:table-cell">
        <p className="text-sm font-semibold text-slate-700">{branchTeachers.length || branch.teachers}</p>
      </td>
      <td className="py-4 px-3 text-center hidden lg:table-cell">
        {debtors > 0
          ? <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-50 text-red-600">{debtors}</span>
          : <span className="text-xs text-emerald-500 font-medium">0</span>
        }
      </td>
      <td className="py-4 px-3 text-right hidden lg:table-cell">
        <p className="text-xs font-medium text-slate-600">{fmt(avgPerStudent)}</p>
      </td>
      <td className="py-4 px-3 hidden lg:table-cell">
        <div className="flex items-center gap-1">
          <span className="text-yellow-400 text-xs">&#9733;</span>
          <span className="text-xs font-semibold text-slate-700">{branch.rating > 0 ? branch.rating : '—'}</span>
        </div>
      </td>
    </tr>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const { user, hasPermission, employees } = useAuth()
  const { branches, students, teachers, payments, getDebtors, getBranchName } = useData()
  const { t } = useLanguage()

  const fmt = (n) => fmtShort(n, t)

  const TABS = [
    { id: 'executive', label: t('dashboard.tabs.executive') },
    { id: 'branches',  label: t('dashboard.tabs.branches') },
    { id: 'sales',     label: t('dashboard.tabs.sales') },
  ]

  const TIME_PERIODS = [
    { id: 'today',     label: t('dashboard.period.today') },
    { id: 'yesterday', label: t('dashboard.period.yesterday') },
    { id: 'week',      label: t('dashboard.period.week') },
    { id: 'month',     label: t('dashboard.period.month') },
    { id: 'quarter',   label: t('dashboard.period.quarter') },
    { id: 'year',      label: t('dashboard.period.year') },
    { id: 'all',       label: t('dashboard.period.all') },
    { id: 'custom',    label: t('dashboard.period.custom') },
  ]

  function formatPeriodLabel(periodId, customFrom, customTo) {
    if (periodId === 'custom' && customFrom && customTo) {
      const f = new Date(customFrom).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
      const tDate = new Date(customTo).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
      return `${f} — ${tDate}`
    }
    return TIME_PERIODS.find(p => p.id === periodId)?.label || t('dashboard.period.all')
  }

  const isSales = user.role === 'sales'
  const [activeTab, setActiveTab] = useState(isSales ? 'sales' : 'executive')
  const canSeeSales = hasPermission('finance', 'payments')
  const canFullPnL = hasPermission('finance', 'fullPnL')

  // ── Time filter state ──────────────────────────────────────────────
  const [timePeriod, setTimePeriod] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showTimePicker, setShowTimePicker] = useState(false)

  const dateRange = useMemo(() => getDateRange(timePeriod, customFrom, customTo), [timePeriod, customFrom, customTo])

  const filterByDate = useCallback((items, dateField = 'date') => {
    if (!dateRange) return items
    return items.filter(item => {
      const d = item[dateField]
      if (!d) return false
      const itemDate = new Date(d)
      return itemDate >= dateRange.from && itemDate <= dateRange.to
    })
  }, [dateRange])

  // ── Scoped data ──────────────────────────────────────────────────────
  const scopedStudents  = user.branch === 'all' ? students  : students.filter(s => s.branch === user.branch)
  const scopedTeachers  = user.branch === 'all' ? teachers  : teachers.filter(t => t.branch === user.branch)
  const allScopedPayments  = user.branch === 'all' ? payments  : payments.filter(p => p.branch === user.branch)
  const scopedPayments = filterByDate(allScopedPayments)
  const debtors = getDebtors(user.branch)

  // ── Computed metrics ─────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const incomePayments  = scopedPayments.filter(p => p.type === 'income')
    const expensePayments = scopedPayments.filter(p => p.type === 'expense')
    const totalIncome   = incomePayments.reduce((s, p) => s + p.amount, 0)
    const totalExpense  = expensePayments.reduce((s, p) => s + p.amount, 0)
    const profit        = totalIncome - totalExpense
    const margin        = totalIncome > 0 ? pct(profit, totalIncome) : 0

    const activeStudents  = scopedStudents.filter(s => s.status === 'active').length
    const frozenStudents  = scopedStudents.filter(s => s.status === 'frozen').length
    const debtorStudents  = scopedStudents.filter(s => s.status === 'debtor').length
    const totalStudents   = scopedStudents.length

    const arpu = totalStudents > 0 ? Math.round(totalIncome / totalStudents) : 0
    const teacherLoad = scopedTeachers.length > 0 ? Math.round(totalStudents / scopedTeachers.length) : 0
    const revenuePerTeacher = scopedTeachers.length > 0 ? Math.round(totalIncome / scopedTeachers.length) : 0
    const salaryCost = scopedTeachers.reduce((s, t) => s + (t.salary || 0), 0)
    const salaryToRevenue = totalIncome > 0 ? pct(salaryCost, totalIncome) : 0

    const retentionRate = totalStudents > 0 ? pct(activeStudents, totalStudents) : 0
    const churnRate     = totalStudents > 0 ? pct(frozenStudents + debtorStudents, totalStudents) : 0

    const totalCapacity = user.branch === 'all'
      ? branches.reduce((s, b) => s + (b.capacity || 0), 0)
      : (branches.find(b => b.id === user.branch)?.capacity || 0)
    const utilization = totalCapacity > 0 ? pct(totalStudents, totalCapacity) : 0

    // Debt analysis
    const totalDebt = scopedStudents.filter(s => s.balance < 0).reduce((s, st) => s + Math.abs(st.balance), 0)
    const collectionRate = (totalIncome + totalDebt) > 0 ? pct(totalIncome, totalIncome + totalDebt) : 100

    // Payment method breakdown
    const methodBreakdown = {}
    incomePayments.forEach(p => {
      methodBreakdown[p.method] = (methodBreakdown[p.method] || 0) + p.amount
    })
    const methodData = Object.entries(methodBreakdown).map(([name, value], i) => ({
      name, value, color: CHART_COLORS[i % CHART_COLORS.length],
    }))

    // Student status distribution
    const statusData = [
      { name: t('dashboard.status.active'), value: activeStudents, color: STATUS_COLORS.active },
      { name: t('dashboard.status.debtors'), value: debtorStudents, color: STATUS_COLORS.debtor },
      { name: t('dashboard.status.frozen'), value: frozenStudents, color: STATUS_COLORS.frozen },
    ].filter(d => d.value > 0)

    // Course distribution from actual data
    const courseMap = {}
    scopedStudents.forEach(s => {
      courseMap[s.course] = (courseMap[s.course] || 0) + 1
    })
    const courseData = Object.entries(courseMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: CHART_COLORS[i % CHART_COLORS.length] }))

    // Revenue by month from actual payment data
    const monthlyData = {}
    scopedPayments.forEach(p => {
      const m = (p.date || '').slice(0, 7)
      if (!m) return
      if (!monthlyData[m]) monthlyData[m] = { month: m, income: 0, expense: 0, profit: 0, count: 0 }
      if (p.type === 'income') {
        monthlyData[m].income += p.amount
        monthlyData[m].count++
      } else {
        monthlyData[m].expense += p.amount
      }
    })
    Object.values(monthlyData).forEach(d => { d.profit = d.income - d.expense })
    const monthlyTrend = Object.values(monthlyData)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(d => ({
        ...d,
        label: new Date(d.month + '-01').toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }),
        incomeM: Math.round(d.income / 1e6),
        expenseM: Math.round(d.expense / 1e6),
        profitM: Math.round(d.profit / 1e6),
      }))

    // Revenue by branch (for stacked chart)
    const branchRevenue = {}
    if (user.branch === 'all') {
      filterByDate(payments).forEach(p => {
        if (p.type !== 'income') return
        const m = (p.date || '').slice(0, 7)
        if (!m) return
        if (!branchRevenue[m]) branchRevenue[m] = { month: m }
        branchRevenue[m][p.branch] = (branchRevenue[m][p.branch] || 0) + p.amount
      })
    }
    const branchRevenueData = Object.values(branchRevenue)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(d => {
        const row = { label: new Date(d.month + '-01').toLocaleDateString('ru-RU', { month: 'short' }) }
        branches.forEach(b => { row[b.id] = Math.round((d[b.id] || 0) / 1e6) })
        return row
      })

    // Today's activity
    const today = new Date().toISOString().split('T')[0]
    const todayPayments = scopedPayments.filter(p => p.date === today)
    const todayIncome = todayPayments.filter(p => p.type === 'income').reduce((s, p) => s + p.amount, 0)
    const todayCount  = todayPayments.filter(p => p.type === 'income').length

    // Employee stats
    const totalEmployees = employees?.length || 0

    return {
      totalIncome, totalExpense, profit, margin,
      activeStudents, frozenStudents, debtorStudents, totalStudents,
      arpu, teacherLoad, revenuePerTeacher, salaryCost, salaryToRevenue,
      retentionRate, churnRate, utilization, totalCapacity,
      totalDebt, collectionRate,
      methodData, statusData, courseData,
      monthlyTrend, branchRevenueData,
      todayIncome, todayCount, totalEmployees,
    }
  }, [scopedStudents, scopedTeachers, scopedPayments, branches, payments, employees, user.branch, filterByDate, t])

  // ── Visible tabs ─────────────────────────────────────────────────────
  const visibleTabs = TABS.filter(tab => {
    if (tab.id === 'sales') return canSeeSales
    if (tab.id === 'branches') return canFullPnL
    return true
  })

  // ── Custom tooltip ───────────────────────────────────────────────────
  const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="glass-strong rounded-xl shadow-lg p-3 text-xs">
        <p className="font-semibold text-slate-900 mb-1">{label}</p>
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-slate-600">{p.name}:</span>
            <span className="font-semibold">{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">
            {user.branch === 'all' ? t('dashboard.title') : `${t('dashboard.titleBranch')} — ${getBranchName(user.branch)}`}
          </h2>
          <p className="text-slate-500 mt-1 text-sm">
            {user.branch === 'all' ? t('dashboard.subtitle') : t('dashboard.subtitleBranch')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400 glass rounded-full px-3 py-1.5">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            {t('dashboard.realtime')}
          </div>
        </div>
      </div>

      {/* ── Time Filter Bar ── */}
      <div className="glass-card rounded-2xl p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-slate-500 mr-1">
            <Calendar size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide hidden sm:inline">{t('dashboard.periodLabel')}:</span>
          </div>
          {TIME_PERIODS.filter(p => p.id !== 'custom').map(period => (
            <button
              key={period.id}
              onClick={() => { setTimePeriod(period.id); setShowTimePicker(false) }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                timePeriod === period.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {period.label}
            </button>
          ))}
          <div className="relative">
            <button
              onClick={() => { setShowTimePicker(!showTimePicker); if (timePeriod !== 'custom') setTimePeriod('custom') }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                timePeriod === 'custom'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Filter size={12} />
              {timePeriod === 'custom' && customFrom && customTo
                ? formatPeriodLabel('custom', customFrom, customTo)
                : t('dashboard.period.custom')}
              <ChevronDown size={12} className={`transition-transform ${showTimePicker ? 'rotate-180' : ''}`} />
            </button>
            {showTimePicker && (
              <div className="absolute right-0 top-full mt-2 glass-strong rounded-xl shadow-xl p-4 z-50 min-w-[280px]">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{t('dashboard.customPeriod')}</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">{t('dashboard.dateFrom')}</label>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={e => { setCustomFrom(e.target.value); setTimePeriod('custom') }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">{t('dashboard.dateTo')}</label>
                    <input
                      type="date"
                      value={customTo}
                      onChange={e => { setCustomTo(e.target.value); setTimePeriod('custom') }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <button
                    onClick={() => setShowTimePicker(false)}
                    className="w-full bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {t('dashboard.apply')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Active filter indicator */}
          {timePeriod !== 'all' && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-blue-600 font-medium bg-blue-50 px-2.5 py-1 rounded-full">
                {timePeriod === 'custom' && customFrom && customTo
                  ? formatPeriodLabel('custom', customFrom, customTo)
                  : `${t('dashboard.filter')}: ${TIME_PERIODS.find(p => p.id === timePeriod)?.label}`
                }
                {' '}({scopedPayments.length} {t('dashboard.operations')})
              </span>
              <button
                onClick={() => { setTimePeriod('all'); setCustomFrom(''); setCustomTo(''); setShowTimePicker(false) }}
                className="text-slate-400 hover:text-red-500 transition-colors"
                title={t('dashboard.resetFilter')}
              >
                <XCircle size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 glass rounded-xl p-1">
        {visibleTabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════ SALES TAB ═══════ */}
      {activeTab === 'sales' && <SalesDashboard />}

      {/* ═══════ EXECUTIVE TAB ═══════ */}
      {activeTab === 'executive' && (
        <>
          {/* Row 1: Primary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <KpiCard title={t('dashboard.kpi.totalRevenue')} value={fmt(metrics.totalIncome)} icon={DollarSign} color="green"
              subtitle={`${metrics.todayCount} ${t('dashboard.kpi.paymentsToday')}`}
              trendLabel={`${t('dashboard.kpi.today')}: ${fmt(metrics.todayIncome)}`} />

            {canFullPnL && (
              <KpiCard title={t('dashboard.kpi.netProfit')} value={fmt(metrics.profit)} icon={PiggyBank}
                color={metrics.profit >= 0 ? 'teal' : 'red'}
                subtitle={`${t('dashboard.kpi.margin')}: ${metrics.margin}%`} />
            )}

            <KpiCard title={t('dashboard.kpi.totalStudents')} value={metrics.totalStudents} icon={GraduationCap} color="blue"
              subtitle={`${t('dashboard.kpi.activeStudents')}: ${metrics.activeStudents}`}
              trendLabel={`${t('dashboard.kpi.retention')}: ${metrics.retentionRate}%`} />

            <KpiCard title={t('dashboard.kpi.arpu')} value={fmt(metrics.arpu)} icon={Target} color="purple"
              subtitle={t('dashboard.kpi.arpuSubtitle')} />

            <KpiCard title={t('dashboard.kpi.debtors')} value={debtors.length} icon={UserMinus} color="red"
              subtitle={metrics.totalDebt > 0 ? `${t('dashboard.kpi.debt')}: ${fmt(metrics.totalDebt)}` : t('dashboard.kpi.noDebts')}
              trendLabel={`${t('dashboard.kpi.collection')}: ${metrics.collectionRate}%`} />

            <KpiCard title={t('dashboard.kpi.utilization')} value={`${metrics.utilization}%`} icon={Activity} color="orange"
              subtitle={`${metrics.totalStudents} / ${metrics.totalCapacity}`} />
          </div>

          {/* Row 2: Key Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Revenue Trend */}
            <div className="lg:col-span-2 glass-card rounded-2xl p-4 md:p-6">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{t('dashboard.charts.cashFlow')}</h3>
                  <p className="text-xs text-slate-400">{t('dashboard.charts.cashFlowDesc')}</p>
                </div>
                <div className="flex items-center gap-4 text-xs hidden md:flex">
                  <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded bg-emerald-500" /> {t('dashboard.charts.income')}</span>
                  {canFullPnL && <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded bg-red-400" /> {t('dashboard.charts.expense')}</span>}
                  {canFullPnL && <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded bg-blue-500" /> {t('dashboard.charts.profit')}</span>}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={metrics.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="incomeM" fill="#10b981" name={t('dashboard.charts.income')} radius={[4, 4, 0, 0]} barSize={24} fillOpacity={0.85} />
                  {canFullPnL && <Bar dataKey="expenseM" fill="#fca5a5" name={t('dashboard.charts.expense')} radius={[4, 4, 0, 0]} barSize={24} fillOpacity={0.7} />}
                  {canFullPnL && <Line type="monotone" dataKey="profitM" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: '#3b82f6' }} name={t('dashboard.charts.profit')} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Student Status Donut */}
            <div className="glass-card rounded-2xl p-4 md:p-6">
              <h3 className="text-base font-semibold text-slate-900 mb-1">{t('dashboard.charts.studentStatus')}</h3>
              <p className="text-xs text-slate-400 mb-3">{t('dashboard.charts.studentStatusDesc')}</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={metrics.statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value" strokeWidth={0}>
                    {metrics.statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-2">
                {metrics.statusData.map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                    <span className="text-slate-600">{d.name}</span>
                    <span className="font-bold text-slate-800">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 3: Operational Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Users size={16} className="text-purple-500" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('dashboard.ops.teachers')}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{scopedTeachers.length}</p>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">{t('dashboard.ops.studentsPerTeacher')}</span>
                  <span className="font-semibold text-slate-700">{metrics.teacherLoad}</span>
                </div>
                {canFullPnL && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">{t('dashboard.ops.revenuePerTeacher')}</span>
                    <span className="font-semibold text-slate-700">{fmt(metrics.revenuePerTeacher)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <UserCheck size={16} className="text-emerald-500" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('dashboard.ops.retention')}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{metrics.retentionRate}%</p>
              <div className="mt-2">
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${metrics.retentionRate}%` }} />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">{t('dashboard.ops.churn')}: {metrics.churnRate}%</p>
              </div>
            </div>

            {canFullPnL && (
              <div className="glass-card rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Percent size={16} className="text-cyan-500" />
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('dashboard.ops.margin')}</span>
                </div>
                <p className={`text-2xl font-bold ${metrics.margin >= 20 ? 'text-emerald-600' : metrics.margin >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                  {metrics.margin}%
                </p>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">{t('dashboard.ops.salaryToRevenue')}</span>
                    <span className="font-semibold text-slate-700">{metrics.salaryToRevenue}%</span>
                  </div>
                </div>
              </div>
            )}

            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={16} className="text-orange-500" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('dashboard.ops.infra')}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{user.branch === 'all' ? branches.length : 1}</p>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">{t('dashboard.ops.employees')}</span>
                  <span className="font-semibold text-slate-700">{metrics.totalEmployees}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">{t('dashboard.ops.load')}</span>
                  <span className="font-semibold text-slate-700">{metrics.utilization}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Row 4: Course breakdown + Payment methods */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {/* Course distribution */}
            <div className="glass-card rounded-2xl p-4 md:p-6">
              <h3 className="text-base font-semibold text-slate-900 mb-1">{t('dashboard.charts.courseDistribution')}</h3>
              <p className="text-xs text-slate-400 mb-4">{t('dashboard.charts.courseDistributionDesc')}</p>
              {metrics.courseData.length > 0 ? (
                <div className="space-y-3">
                  {metrics.courseData.map((course, i) => {
                    const maxVal = metrics.courseData[0]?.value || 1
                    const width = pct(course.value, maxVal)
                    return (
                      <div key={i}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-slate-700">{course.name}</span>
                          <span className="font-bold text-slate-900">{course.value}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5">
                          <div className="h-2.5 rounded-full transition-all" style={{ width: `${width}%`, background: course.color }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-8">{t('dashboard.noData')}</p>
              )}
            </div>

            {/* Payment methods + Recent activity */}
            <div className="space-y-6">
              {metrics.methodData.length > 0 && (
                <div className="glass-card rounded-2xl p-6">
                  <h3 className="text-base font-semibold text-slate-900 mb-1">{t('dashboard.charts.paymentMethods')}</h3>
                  <p className="text-xs text-slate-400 mb-3">{t('dashboard.charts.paymentMethodsDesc')}</p>
                  <div className="flex items-center gap-6">
                    <div className="w-32 h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={metrics.methodData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value" strokeWidth={0}>
                            {metrics.methodData.map((e, i) => <Cell key={i} fill={e.color} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2 flex-1">
                      {metrics.methodData.map((d, i) => {
                        const total = metrics.methodData.reduce((s, m) => s + m.value, 0)
                        return (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-sm" style={{ background: d.color }} />
                              <span className="text-sm text-slate-600">{d.name}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-bold text-slate-800">{pct(d.value, total)}%</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Recent payments feed */}
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-base font-semibold text-slate-900 mb-3">{t('dashboard.charts.recentOps')}</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {scopedPayments.slice(0, 8).map((p) => (
                    <div key={p.id} className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                      p.type === 'income' ? 'bg-emerald-50' : 'bg-red-50'
                    }`}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.student}</p>
                        <p className="text-[10px] text-slate-400">{getBranchName(p.branch)} &middot; {p.date}</p>
                      </div>
                      <span className={`text-sm font-bold whitespace-nowrap ml-2 ${
                        p.type === 'income' ? 'text-emerald-600' : 'text-red-500'
                      }`}>
                        {p.type === 'income' ? '+' : '-'}{fmt(p.amount)}
                      </span>
                    </div>
                  ))}
                  {scopedPayments.length === 0 && <p className="text-sm text-slate-400 text-center py-4">{t('dashboard.noOperations')}</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Row 5: Revenue by branch (admin only) */}
          {canFullPnL && user.branch === 'all' && metrics.branchRevenueData.length > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{t('dashboard.charts.revenueByBranch')}</h3>
                  <p className="text-xs text-slate-400">{t('dashboard.charts.revenueByBranchDesc')}</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={metrics.branchRevenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  {branches.map((b, i) => (
                    <Bar key={b.id} dataKey={b.id} stackId="rev" fill={b.color || CHART_COLORS[i % CHART_COLORS.length]} name={b.name} radius={i === branches.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* ═══════ BRANCHES TAB ═══════ */}
      {activeTab === 'branches' && canFullPnL && (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard title={t('dashboard.branches.count')} value={branches.length} icon={Building2} color="blue" />
            <KpiCard title={t('dashboard.branches.totalCapacity')} value={branches.reduce((s, b) => s + (b.capacity || 0), 0)} icon={Users} color="purple"
              subtitle={`${t('dashboard.ops.load')}: ${metrics.utilization}%`} />
            <KpiCard title={t('dashboard.branches.totalRevenue')} value={fmt(branches.reduce((s, b) => s + (b.monthlyRevenue || 0), 0))} icon={DollarSign} color="green" />
            <KpiCard title={t('dashboard.branches.totalProfit')} value={fmt(branches.reduce((s, b) => s + ((b.monthlyRevenue || 0) - (b.monthlyExpenses || 0)), 0))} icon={TrendingUp} color="teal" />
          </div>

          {/* Branch Scoreboard */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-4 md:px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="text-base font-semibold text-slate-900">{t('dashboard.branches.scoreboard')}</h3>
              <p className="text-xs text-slate-400">{t('dashboard.branches.scoreboardDesc')}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('dashboard.branches.branch')}</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('dashboard.branches.students')}</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">{t('dashboard.branches.occupancy')}</th>
                    <th className="text-right py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('dashboard.branches.revenue')}</th>
                    <th className="text-right py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">{t('dashboard.branches.marginCol')}</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">{t('dashboard.branches.teachersCol')}</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">{t('dashboard.branches.debts')}</th>
                    <th className="text-right py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">{t('dashboard.branches.arpuCol')}</th>
                    <th className="py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">{t('dashboard.branches.rating')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...branches]
                    .sort((a, b) => (b.monthlyRevenue || 0) - (a.monthlyRevenue || 0))
                    .map((branch, i) => (
                      <BranchScoreRow key={branch.id} branch={branch} students={students} teachers={teachers} payments={payments} rank={i} fmt={fmt} />
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Branch capacity + Profitability */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-base font-semibold text-slate-900 mb-1">{t('dashboard.branches.capacityTitle')}</h3>
              <p className="text-xs text-slate-400 mb-4">{t('dashboard.branches.capacityDesc')}</p>
              <div className="space-y-4">
                {branches.map((b) => {
                  const actual = students.filter(s => s.branch === b.id).length || b.students
                  const occ = b.capacity > 0 ? pct(actual, b.capacity) : 0
                  return (
                    <div key={b.id}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="font-medium text-slate-700">{b.name}</span>
                        <span className="text-xs text-slate-500">{actual} / {b.capacity} <span className="font-bold ml-1">{occ}%</span></span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden">
                        <div className={`h-4 rounded-full transition-all flex items-center justify-end pr-2 ${
                          occ > 85 ? 'bg-gradient-to-r from-red-400 to-red-500' : occ > 60 ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                        }`} style={{ width: `${Math.min(occ, 100)}%` }}>
                          {occ > 20 && <span className="text-[10px] text-white font-bold">{occ}%</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-base font-semibold text-slate-900 mb-1">{t('dashboard.branches.profitability')}</h3>
              <p className="text-xs text-slate-400 mb-4">{t('dashboard.branches.profitabilityDesc')}</p>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={branches.map(b => ({
                  name: b.name,
                  income: Math.round((b.monthlyRevenue || 0) / 1e6),
                  expense: Math.round((b.monthlyExpenses || 0) / 1e6),
                  profit: Math.round(((b.monthlyRevenue || 0) - (b.monthlyExpenses || 0)) / 1e6),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  <Bar dataKey="income" fill="#10b981" name={t('dashboard.charts.income')} radius={[4, 4, 0, 0]} barSize={28} />
                  <Bar dataKey="expense" fill="#fca5a5" name={t('dashboard.charts.expense')} radius={[4, 4, 0, 0]} barSize={28} />
                  <Bar dataKey="profit" fill="#3b82f6" name={t('dashboard.charts.profit')} radius={[4, 4, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Debt analysis by branch */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-base font-semibold text-slate-900 mb-1">{t('dashboard.branches.debtAnalysis')}</h3>
            <p className="text-xs text-slate-400 mb-4">{t('dashboard.branches.debtAnalysisDesc')}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {branches.map(b => {
                const brDebtors = students.filter(s => s.branch === b.id && s.status === 'debtor')
                const brDebt = brDebtors.reduce((s, st) => s + Math.abs(st.balance), 0)
                const brAll = students.filter(s => s.branch === b.id).length
                const debtPct = brAll > 0 ? pct(brDebtors.length, brAll) : 0
                return (
                  <div key={b.id} className={`rounded-xl p-4 border ${
                    debtPct > 30 ? 'bg-red-50 border-red-200' : debtPct > 10 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-slate-900 text-sm">{b.name}</h4>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        debtPct > 30 ? 'bg-red-100 text-red-700' : debtPct > 10 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {debtPct}% {t('dashboard.branches.debtLabel')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-slate-500">{t('dashboard.branches.debtorsCount')}</p>
                        <p className="font-bold text-lg text-slate-900">{brDebtors.length}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">{t('dashboard.branches.debtAmount')}</p>
                        <p className="font-bold text-lg text-red-600">{fmt(brDebt)}</p>
                      </div>
                    </div>
                    {brDebtors.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {brDebtors.slice(0, 3).map(d => (
                          <div key={d.id} className="flex items-center justify-between text-xs bg-white rounded-lg px-2 py-1.5">
                            <span className="text-slate-700 truncate">{d.name}</span>
                            <span className="text-red-600 font-semibold">{fmt(Math.abs(d.balance))}</span>
                          </div>
                        ))}
                        {brDebtors.length > 3 && (
                          <p className="text-[10px] text-slate-400 text-center">+{brDebtors.length - 3} {t('dashboard.branches.more')}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
