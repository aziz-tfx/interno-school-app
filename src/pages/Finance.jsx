import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DollarSign, Plus, CreditCard, FileBarChart, TrendingUp, TrendingDown,
  Users, Target, BarChart3, ArrowUpRight, ArrowDownRight, Eye,
  ChevronLeft, ChevronRight, Filter, ShoppingCart, UserCheck, Phone,
  Percent, CalendarDays,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useLanguage } from '../contexts/LanguageContext'
import { formatCurrency } from '../data/mockData'
import { db } from '../firebase'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import Modal from '../components/Modal'
import PaymentForm from '../components/PaymentForm'

// ─── Helpers ──────────────────────────────────────────────────────────────
// formatRevenue is defined inside the component to access t()

function getMonthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`
}

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

// ─── Component ──────────────────────────────────────────────────────────────
export default function Finance() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { user, hasPermission, employees, getSalesStaff } = useAuth()
  const { branches, payments, getSalesPlan, getManagerPerf } = useData()

  function formatRevenue(val) {
    if (val == null || val === 0) return '0'
    if (Math.abs(val) >= 1000000) {
      const m = val / 1000000
      return `${Number.isInteger(m) ? m : m.toFixed(1)} ${t('finance.fmt_million')}`
    }
    if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(0)} ${t('finance.fmt_thousand')}`
    return String(val)
  }

  const canFullPnL = hasPermission('finance', 'fullPnL')
  const canPayments = hasPermission('finance', 'payments')
  const isSales = user?.role === 'sales'
  const isRop = user?.role === 'rop'
  const isBranchDirector = user?.role === 'branch_director'
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'

  // ─── State ──────────────────────────────────────────────────────────────
  const [paymentModal, setPaymentModal] = useState(false)
  const [paymentType, setPaymentType] = useState('new') // 'new' | 'doplata'
  const [branchFilter, setBranchFilter] = useState(user?.branch !== 'all' ? user.branch : 'all')

  // Time filter
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const monthKey = getMonthKey(selectedYear, selectedMonth)

  // Report data from Firestore
  const [reportPlans, setReportPlans] = useState({})
  const [reportDaily, setReportDaily] = useState({})

  // ─── Firestore: Load reportPlans for this month ─────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'reportPlans'), where('monthKey', '==', monthKey))
    const unsub = onSnapshot(q, (snap) => {
      const p = {}
      snap.docs.forEach(d => {
        const data = d.data()
        p[data.manager] = data
      })
      setReportPlans(p)
    })
    return unsub
  }, [monthKey])

  // ─── Firestore: Load reportDaily for this month ─────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'reportDaily'), where('monthKey', '==', monthKey))
    const unsub = onSnapshot(q, (snap) => {
      const d = {}
      snap.docs.forEach(doc => {
        const data = doc.data()
        const mgr = data.manager
        if (!d[mgr]) d[mgr] = { leads: 0, conversations: 0, signups: 0, visited: 0, sales: 0, revenue: 0 }
        d[mgr].leads += data.leads || 0
        d[mgr].conversations += data.conversations || 0
        d[mgr].signups += data.signups || 0
        d[mgr].visited += data.visited || 0
        d[mgr].sales += data.sales || 0
        d[mgr].revenue += data.revenue || 0
      })
      setReportDaily(d)
    })
    return unsub
  }, [monthKey])

  // ─── Sales staff for current view ────────────────────────────────────────
  const salesStaff = useMemo(() => {
    let staff = employees.filter(e => e.role === 'sales' || e.role === 'rop')
    if (branchFilter !== 'all') {
      staff = staff.filter(e => e.branch === branchFilter)
    }
    // If user is sales, only show their own data
    if (isSales) {
      staff = staff.filter(e => e.id === user.id)
    }
    // If user is ROP or branch_director, show only their branch
    if ((isRop || isBranchDirector) && user.branch !== 'all') {
      staff = staff.filter(e => e.branch === user.branch)
    }
    return staff
  }, [employees, branchFilter, isSales, isRop, isBranchDirector, user])

  // ─── Build manager KPI data from reports ─────────────────────────────────
  const managerKPIs = useMemo(() => {
    return salesStaff.map(emp => {
      const plan = reportPlans[emp.name] || {}
      const actual = reportDaily[emp.name] || {}

      // Plan values
      const planLeads = plan.leads || 0
      const planConversations = plan.conversations || 0
      const planSignups = plan.signups || 0
      const planVisited = plan.visited || 0
      const planSales = plan.sales || 0
      const planRevenue = plan.revenue || 0

      // Actual values
      const actualLeads = actual.leads || 0
      const actualConversations = actual.conversations || 0
      const actualSignups = actual.signups || 0
      const actualVisited = actual.visited || 0
      const actualSales = actual.sales || 0
      const actualRevenue = actual.revenue || 0

      // Conversions
      const convOpenToSale = actualVisited > 0 ? Math.round((actualSales / actualVisited) * 100) : 0
      const convSignupToVisit = actualSignups > 0 ? Math.round((actualVisited / actualSignups) * 100) : 0

      // Payments from previously sold students (installments this month)
      // = payments with managerId matching, where student has had a prior payment
      const managerPayments = payments.filter(p =>
        p.type === 'income' && p.managerId === emp.managerId && (p.date || '').startsWith(monthKey)
      )
      // Separate first-time sales vs repeat payments (tranches > 1)
      const doplataPayments = managerPayments.filter(p => (p.trancheNumber || 1) > 1)
      const expectedDoplata = doplataPayments.reduce((s, p) => s + p.amount, 0)

      // Offline/Online counts from payments
      const offlineCount = managerPayments.filter(p => p.learningFormat === 'Оффлайн').length
      const onlineCount = managerPayments.filter(p => p.learningFormat === 'Онлайн').length

      // Plan deviation
      const deviation = actualRevenue - planRevenue

      return {
        ...emp,
        plan: {
          leads: planLeads,
          conversations: planConversations,
          signups: planSignups,
          visited: planVisited,
          sales: planSales,
          revenue: planRevenue,
        },
        actual: {
          leads: actualLeads,
          conversations: actualConversations,
          signups: actualSignups,
          visited: actualVisited,
          sales: actualSales,
          revenue: actualRevenue,
        },
        convOpenToSale,
        convSignupToVisit,
        expectedDoplata,
        offlineCount,
        onlineCount,
        offlineSales: offlineCount,
        onlineSales: onlineCount,
        deviation,
        achievedPct: planRevenue > 0 ? Math.round((actualRevenue / planRevenue) * 100) : 0,
      }
    })
  }, [salesStaff, reportPlans, reportDaily, payments, monthKey])

  // ─── Team totals ─────────────────────────────────────────────────────────
  const teamTotals = useMemo(() => {
    return managerKPIs.reduce((acc, m) => ({
      planRevenue: acc.planRevenue + m.plan.revenue,
      actualRevenue: acc.actualRevenue + m.actual.revenue,
      planSales: acc.planSales + m.plan.sales,
      actualSales: acc.actualSales + m.actual.sales,
      planVisited: acc.planVisited + m.plan.visited,
      actualVisited: acc.actualVisited + m.actual.visited,
      totalDoplata: acc.totalDoplata + m.expectedDoplata,
      offlineCount: acc.offlineCount + m.offlineCount,
      onlineCount: acc.onlineCount + m.onlineCount,
    }), {
      planRevenue: 0, actualRevenue: 0, planSales: 0, actualSales: 0,
      planVisited: 0, actualVisited: 0, totalDoplata: 0, offlineCount: 0, onlineCount: 0,
    })
  }, [managerKPIs])

  // ─── Month navigation ──────────────────────────────────────────────────
  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedYear(y => y - 1); setSelectedMonth(12) }
    else setSelectedMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (selectedMonth === 12) { setSelectedYear(y => y + 1); setSelectedMonth(1) }
    else setSelectedMonth(m => m + 1)
  }

  // ─── Open payment modal ─────────────────────────────────────────────────
  const openNewSale = () => { setPaymentType('new'); setPaymentModal(true) }
  const openDoplata = () => { setPaymentType('doplata'); setPaymentModal(true) }

  // ─── Filtered recent transactions ───────────────────────────────────────
  const recentTransactions = useMemo(() => {
    let filtered = payments.filter(p => p.type === 'income' && (p.date || '').startsWith(monthKey))
    if (branchFilter !== 'all') filtered = filtered.filter(p => p.branch === branchFilter)
    if (isSales && user?.managerId) filtered = filtered.filter(p => p.managerId === user.managerId)
    if ((isRop || isBranchDirector) && user.branch !== 'all') {
      filtered = filtered.filter(p => p.branch === user.branch)
    }
    return filtered.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 10)
  }, [payments, monthKey, branchFilter, isSales, isRop, isBranchDirector, user])

  // Status helpers
  const statusColor = (pct) => {
    if (pct >= 100) return 'text-emerald-600'
    if (pct >= 70) return 'text-amber-600'
    return 'text-red-500'
  }
  const statusBg = (pct) => {
    if (pct >= 100) return 'bg-emerald-50 border-emerald-200'
    if (pct >= 70) return 'bg-amber-50 border-amber-200'
    return 'bg-red-50 border-red-200'
  }
  const progressBg = (pct) => {
    if (pct >= 100) return 'bg-emerald-500'
    if (pct >= 70) return 'bg-amber-500'
    return 'bg-red-500'
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="text-blue-600" size={24} />
            {t('finance.title')}
          </h2>
          <p className="text-slate-500 mt-1">
            {isSales ? t('finance.subtitle_sales') : t('finance.subtitle_admin')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Action buttons */}
          {canPayments && (
            <>
              <button onClick={openNewSale}
                className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/25 flex items-center gap-2">
                <Plus size={16} /> {t('finance.btn_new_sale')}
              </button>
              <button onClick={openDoplata}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25 flex items-center gap-2">
                <CreditCard size={16} /> {t('finance.btn_doplata')}
              </button>
            </>
          )}
          <button onClick={() => navigate('/reports')}
            className="bg-slate-100 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors flex items-center gap-2">
            <FileBarChart size={16} /> {t('finance.btn_reports')}
          </button>
        </div>
      </div>

      {/* ─── Filters Row ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Month Selector */}
        <div className="flex items-center gap-2 glass-card rounded-xl px-3 py-2">
          <CalendarDays size={16} className="text-slate-400" />
          <button onClick={prevMonth} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-slate-700 min-w-[120px] text-center">
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </span>
          <button onClick={nextMonth} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Branch filter (admin/owner only) */}
        {(isAdmin || user?.branch === 'all') && (
          <div className="flex items-center gap-2 glass-card rounded-xl px-3 py-2">
            <Filter size={16} className="text-slate-400" />
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
              className="bg-transparent text-sm font-medium text-slate-700 outline-none cursor-pointer">
              <option value="all">{t('finance.filter_all_branches')}</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ─── Team Summary KPIs ──────────────────────────────────────────── */}
      {!isSales && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-blue-50 rounded-lg"><Target size={16} className="text-blue-600" /></div>
              <span className="text-xs text-slate-500">{t('finance.plan_revenue')}</span>
            </div>
            <p className="text-lg font-bold text-slate-900">{formatRevenue(teamTotals.planRevenue)}</p>
            <p className="text-xs text-slate-400">{t('finance.sum')}</p>
          </div>
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-emerald-50 rounded-lg"><TrendingUp size={16} className="text-emerald-600" /></div>
              <span className="text-xs text-slate-500">{t('finance.fact_revenue')}</span>
            </div>
            <p className="text-lg font-bold text-emerald-600">{formatRevenue(teamTotals.actualRevenue)}</p>
            <p className={`text-xs font-semibold ${teamTotals.planRevenue > 0
              ? statusColor(Math.round(teamTotals.actualRevenue / teamTotals.planRevenue * 100))
              : 'text-slate-400'}`}>
              {teamTotals.planRevenue > 0 ? `${Math.round(teamTotals.actualRevenue / teamTotals.planRevenue * 100)}%` : '—'}
            </p>
          </div>
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-purple-50 rounded-lg"><ShoppingCart size={16} className="text-purple-600" /></div>
              <span className="text-xs text-slate-500">{t('finance.sales_label')}</span>
            </div>
            <p className="text-lg font-bold text-slate-900">{teamTotals.actualSales} <span className="text-sm text-slate-400">/ {teamTotals.planSales}</span></p>
          </div>
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-amber-50 rounded-lg"><CreditCard size={16} className="text-amber-600" /></div>
              <span className="text-xs text-slate-500">{t('finance.expected_doplata')}</span>
            </div>
            <p className="text-lg font-bold text-amber-600">{formatRevenue(teamTotals.totalDoplata)}</p>
          </div>
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-cyan-50 rounded-lg"><Users size={16} className="text-cyan-600" /></div>
              <span className="text-xs text-slate-500">{t('finance.visitors')}</span>
            </div>
            <p className="text-lg font-bold text-slate-900">
              <span className="text-cyan-600">{teamTotals.offlineCount}</span>
              <span className="text-xs text-slate-400 mx-1">{t('finance.off')}</span>
              <span className="text-blue-600">{teamTotals.onlineCount}</span>
              <span className="text-xs text-slate-400 ml-1">{t('finance.onl')}</span>
            </p>
          </div>
        </div>
      )}

      {/* ─── Manager KPI Cards ──────────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <BarChart3 size={20} className="text-blue-600" />
          {isSales ? t('finance.your_metrics') : t('finance.manager_metrics')}
        </h3>

        {managerKPIs.length === 0 && (
          <div className="glass-card rounded-2xl p-8 text-center text-slate-400">
            <Users size={40} className="mx-auto mb-3 opacity-50" />
            <p>{t('finance.no_managers')}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {managerKPIs.map(mgr => {
            const pct = mgr.achievedPct
            const isCurrentUser = mgr.id === user?.id
            return (
              <div key={mgr.id}
                className={`glass-card rounded-2xl p-5 border transition-all ${
                  isCurrentUser ? 'border-blue-300 ring-2 ring-blue-100' : 'border-transparent hover:border-slate-200'
                }`}>
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                      mgr.role === 'rop' ? 'bg-teal-600' : 'bg-emerald-600'
                    }`}>
                      {mgr.avatar || mgr.name?.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-sm">
                        {mgr.name} {isCurrentUser && <span className="text-xs text-blue-500">{t('finance.you')}</span>}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {mgr.role === 'rop' ? t('finance.rop') : t('finance.manager')} · {mgr.branch === 'all' ? t('finance.all_branches') : (branches.find(b => b.id === mgr.branch)?.name || mgr.branch)}
                      </p>
                    </div>
                  </div>
                  <div className={`text-right px-3 py-1 rounded-full text-sm font-bold ${statusBg(pct)} ${statusColor(pct)}`}>
                    {pct}%
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>{t('finance.revenue')} {formatRevenue(mgr.actual.revenue)}</span>
                    <span>{t('finance.plan')} {formatRevenue(mgr.plan.revenue)}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${progressBg(pct)}`}
                      style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className={`font-semibold ${mgr.deviation >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {t('finance.deviation')} {mgr.deviation >= 0 ? '+' : ''}{formatRevenue(mgr.deviation)}
                    </span>
                  </div>
                </div>

                {/* KPI Grid */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  {/* Row 1 */}
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Percent size={12} className="text-purple-500" />
                      <span className="text-[10px] text-slate-500">{t('finance.conv_ou_sale')}</span>
                    </div>
                    <p className="text-sm font-bold text-purple-600">{mgr.convOpenToSale}%</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <CreditCard size={12} className="text-amber-500" />
                      <span className="text-[10px] text-slate-500">{t('finance.expected_doplata_short')}</span>
                    </div>
                    <p className="text-sm font-bold text-amber-600">{formatRevenue(mgr.expectedDoplata)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <ShoppingCart size={12} className="text-emerald-500" />
                      <span className="text-[10px] text-slate-500">{t('finance.sales_short')}</span>
                    </div>
                    <p className="text-sm font-bold text-emerald-600">
                      {mgr.actual.sales} <span className="text-xs text-slate-400">/ {mgr.plan.sales}</span>
                    </p>
                  </div>

                  {/* Row 2 */}
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <UserCheck size={12} className="text-cyan-500" />
                      <span className="text-[10px] text-slate-500">{t('finance.visited_off')}</span>
                    </div>
                    <p className="text-sm font-bold text-cyan-600">{mgr.actual.visited}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Users size={12} className="text-blue-500" />
                      <span className="text-[10px] text-slate-500">{t('finance.sales_off')}</span>
                    </div>
                    <p className="text-sm font-bold text-blue-600">{mgr.offlineSales}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Eye size={12} className="text-indigo-500" />
                      <span className="text-[10px] text-slate-500">{t('finance.visited_onl')}</span>
                    </div>
                    <p className="text-sm font-bold text-indigo-600">{mgr.onlineCount}</p>
                  </div>

                  {/* Row 3 — funnel */}
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Phone size={12} className="text-slate-500" />
                      <span className="text-[10px] text-slate-500">{t('finance.leads')}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-700">
                      {mgr.actual.leads} <span className="text-xs text-slate-400">/ {mgr.plan.leads}</span>
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Phone size={12} className="text-slate-500" />
                      <span className="text-[10px] text-slate-500">{t('finance.conversations')}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-700">
                      {mgr.actual.conversations} <span className="text-xs text-slate-400">/ {mgr.plan.conversations}</span>
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <TrendingUp size={12} className="text-emerald-500" />
                      <span className="text-[10px] text-slate-500">{t('finance.revenue_short')}</span>
                    </div>
                    <p className="text-sm font-bold text-emerald-600">{formatRevenue(mgr.actual.revenue)}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── Recent Transactions ─────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-4 md:p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <ArrowUpRight size={20} className="text-emerald-600" />
          {t('finance.recent_sales')}
        </h3>
        {recentTransactions.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">{t('finance.no_sales_period')}</p>
        ) : (
          <div className="space-y-2">
            {recentTransactions.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5 px-4 bg-emerald-50/60 rounded-xl hover:bg-emerald-50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{p.student}</p>
                  <p className="text-xs text-slate-500">
                    {branches.find(b => b.id === p.branch)?.name} · {p.date} · {p.method}
                    {p.course ? ` · ${p.course}` : ''}
                    {p.trancheNumber > 1 ? ` · ${t('finance.tranche_number')}${p.trancheNumber}` : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <span className="text-sm font-bold text-emerald-600">+{formatCurrency(p.amount)}</span>
                  {p.debt > 0 && <p className="text-xs text-red-500">{t('finance.debt_label')} {formatCurrency(p.debt)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Payment Modal ──────────────────────────────────────────────── */}
      <Modal isOpen={paymentModal} onClose={() => setPaymentModal(false)}
        title={paymentType === 'doplata' ? t('finance.modal_doplata') : t('finance.modal_new_sale')} size="lg">
        <PaymentForm onClose={() => setPaymentModal(false)} mode={paymentType} />
      </Modal>
    </div>
  )
}
