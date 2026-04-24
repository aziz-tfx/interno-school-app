import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DollarSign, Plus, CreditCard, FileBarChart, TrendingUp, TrendingDown,
  Users, Target, BarChart3, ArrowUpRight, ArrowDownRight, Eye,
  ChevronLeft, ChevronRight, Filter, ShoppingCart, UserCheck, Phone,
  Percent, CalendarDays, Pencil, Save, X, Trash2,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useLanguage } from '../contexts/LanguageContext'
import { formatCurrency } from '../data/mockData'
import { db } from '../firebase'
import { collection, doc, setDoc, query, where, onSnapshot } from 'firebase/firestore'
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
  const tenantId = user?.tenantId || 'default'
  const { branches, payments, getSalesPlan, getManagerPerf, setSalesPlan, updatePayment, deletePayment, courses } = useData()

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
  // Individual sales records are visible only to the business roles that
  // actually work with sales: owner/admin, ROP (for their branch), branch
  // director (for their branch), and the sales reps themselves (own only).
  // Other finance-adjacent roles (accountant, financier, HR, SMM, …) can
  // still see aggregate finance numbers but never individual transactions.
  const canSeeSalesList = isAdmin || isRop || isBranchDirector || isSales

  // ─── State ──────────────────────────────────────────────────────────────
  const [paymentModal, setPaymentModal] = useState(false)
  const [paymentType, setPaymentType] = useState('new') // 'new' | 'doplata'
  const [branchFilter, setBranchFilter] = useState(user?.branch !== 'all' ? user.branch : 'all')
  const [editingPayment, setEditingPayment] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // ─── Manager KPI editor state ───────────────────────────────────────────
  const [editingKpi, setEditingKpi] = useState(null) // mgr object
  const [kpiForm, setKpiForm] = useState(null)
  const [kpiSaving, setKpiSaving] = useState(false)
  const [mgrTab, setMgrTab] = useState('sales') // 'kpi' | 'sales'

  const canEditKpi = isAdmin || isBranchDirector || isRop

  const openKpiEditor = (mgr) => {
    setEditingKpi(mgr)
    setMgrTab('sales')
    setKpiForm({
      planLeads:         mgr.plan.leads,
      planConversations: mgr.plan.conversations,
      planSignups:       mgr.plan.signups,
      planVisited:       mgr.plan.visited,
      planSales:         mgr.plan.sales,
      planRevenue:       mgr.plan.revenue,
      actLeads:         mgr.actual.leads,
      actConversations: mgr.actual.conversations,
      actSignups:       mgr.actual.signups,
      actVisited:       mgr.actual.visited,
      actSales:         mgr.actual.sales,
      actRevenue:       mgr.actual.revenue,
    })
  }

  const closeKpiEditor = () => {
    setEditingKpi(null)
    setKpiForm(null)
  }

  const saveKpiEditor = async () => {
    if (!editingKpi || !kpiForm) return
    setKpiSaving(true)
    try {
      const mgrName = editingKpi.name
      // 1) Save plan to reportPlans (same doc Reports.jsx uses)
      const plansRef = collection(db, 'reportPlans')
      await setDoc(doc(plansRef, `${monthKey}_${tenantId}_${mgrName}`), {
        monthKey,
        tenantId,
        manager: mgrName,
        leads:         Number(kpiForm.planLeads)         || 0,
        conversations: Number(kpiForm.planConversations) || 0,
        signups:       Number(kpiForm.planSignups)       || 0,
        visited:       Number(kpiForm.planVisited)       || 0,
        sales:         Number(kpiForm.planSales)         || 0,
        revenue:       Number(kpiForm.planRevenue)       || 0,
      })

      // 2) Sync plan revenue → salesPlans (used by Dashboard Sales tab + Leaderboard)
      if (editingKpi.managerId) {
        try {
          await setSalesPlan(editingKpi.managerId, Number(kpiForm.planRevenue) || 0, monthKey)
        } catch (err) {
          console.warn('setSalesPlan failed:', err)
        }
      }

      // 3) Save actuals as an "override" entry in reportDaily
      const dailyRef = collection(db, 'reportDaily')
      await setDoc(doc(dailyRef, `${monthKey}_${tenantId}_${mgrName}_override`), {
        monthKey,
        tenantId,
        manager: mgrName,
        day: 'override',
        leads:         Number(kpiForm.actLeads)         || 0,
        conversations: Number(kpiForm.actConversations) || 0,
        signups:       Number(kpiForm.actSignups)       || 0,
        visited:       Number(kpiForm.actVisited)       || 0,
        sales:         Number(kpiForm.actSales)         || 0,
        revenue:       Number(kpiForm.actRevenue)       || 0,
      })

      closeKpiEditor()
    } catch (err) {
      console.error('Failed to save KPI:', err)
      alert(t('finance.kpi_save_failed') || 'Не удалось сохранить показатели')
    }
    setKpiSaving(false)
  }

  const EDIT_METHODS = ['Наличные', 'Терминал', 'Payme', 'Click', 'Uzum', 'Перечисление', 'Рассрочка (Uzum)', 'Рассрочка (Paylater)', 'Рассрочка (Alif)']

  const openEditPayment = (p) => {
    setEditForm({
      student: p.student || '',
      phone: p.phone || '',
      course: p.course || '',
      amount: p.amount || 0,
      method: p.method || 'Наличные',
      date: p.date || '',
      courseStartDate: p.courseStartDate || '',
      contractNumber: p.contractNumber || '',
      tariff: p.tariff || '',
      discount: p.discount || '',
      learningFormat: p.learningFormat || 'Оффлайн',
      comment: p.comment || '',
      debt: p.debt || 0,
      branch: p.branch || 'tashkent',
      nextPaymentDate: p.nextPaymentDate || '',
      createdBy: p.createdBy || '',
      createdByName: p.createdByName || '',
      managerId: p.managerId || '',
    })
    setEditingPayment(p)
  }

  const saveEditPayment = async () => {
    if (!editingPayment) return
    setEditSaving(true)
    try {
      await updatePayment(editingPayment.id, {
        student: editForm.student,
        phone: editForm.phone,
        course: editForm.course,
        amount: Number(editForm.amount) || 0,
        method: editForm.method,
        date: editForm.date,
        courseStartDate: editForm.courseStartDate,
        contractNumber: editForm.contractNumber,
        tariff: editForm.tariff,
        discount: editForm.discount,
        learningFormat: editForm.learningFormat,
        comment: editForm.comment,
        debt: Number(editForm.debt) || 0,
        branch: editForm.branch,
        nextPaymentDate: editForm.nextPaymentDate,
        createdBy: editForm.createdBy || null,
        createdByName: editForm.createdByName || '',
        managerId: editForm.managerId || null,
      })
      setEditingPayment(null)
    } catch (err) {
      console.error('Failed to update payment:', err)
    }
    setEditSaving(false)
  }

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
    const q = query(collection(db, 'reportPlans'), where('monthKey', '==', monthKey), where('tenantId', '==', tenantId))
    const unsub = onSnapshot(q, (snap) => {
      const p = {}
      snap.docs.forEach(d => {
        const data = d.data()
        p[data.manager] = data
      })
      setReportPlans(p)
    })
    return unsub
  }, [monthKey, tenantId])

  // ─── Firestore: Load reportDaily for this month ─────────────────────────
  // Supports per-manager "override" entries (day='override') that REPLACE
  // the aggregated daily totals for that manager.
  useEffect(() => {
    const q = query(collection(db, 'reportDaily'), where('monthKey', '==', monthKey), where('tenantId', '==', tenantId))
    const unsub = onSnapshot(q, (snap) => {
      const daily = {}
      const overrides = {}
      snap.docs.forEach(docSnap => {
        const data = docSnap.data()
        const mgr = data.manager
        if (data.day === 'override') {
          overrides[mgr] = {
            leads: data.leads || 0,
            conversations: data.conversations || 0,
            signups: data.signups || 0,
            visited: data.visited || 0,
            sales: data.sales || 0,
            revenue: data.revenue || 0,
          }
          return
        }
        if (!daily[mgr]) daily[mgr] = { leads: 0, conversations: 0, signups: 0, visited: 0, sales: 0, revenue: 0 }
        daily[mgr].leads += data.leads || 0
        daily[mgr].conversations += data.conversations || 0
        daily[mgr].signups += data.signups || 0
        daily[mgr].visited += data.visited || 0
        daily[mgr].sales += data.sales || 0
        daily[mgr].revenue += data.revenue || 0
      })
      // Apply overrides: replace aggregated values for managers with override entry
      const merged = { ...daily }
      Object.keys(overrides).forEach(mgr => {
        merged[mgr] = overrides[mgr]
      })
      setReportDaily(merged)
    })
    return unsub
  }, [monthKey, tenantId])

  // ─── Sales staff for current view ────────────────────────────────────────
  const salesStaff = useMemo(() => {
    let staff = employees.filter(e =>
      (e.role === 'sales' || e.role === 'rop' || e.role === 'branch_director') &&
      e.status !== 'pending' &&
      e.status !== 'rejected' &&
      !e.deleted
    )
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

      // External KPI values (manually entered — leads, calls, walk-ins, etc.)
      const actualLeads = actual.leads || 0
      const actualConversations = actual.conversations || 0
      const actualSignups = actual.signups || 0
      const actualVisited = actual.visited || 0

      // Real payments — source of truth for revenue and sales count
      // (reportDaily drifts: not updated on payment edit/delete, and is written
      // under the logged-in user's name, not the payment's assigned manager)
      // Match by managerId when set, otherwise fall back to createdBy / name —
      // legacy branch_director accounts may not yet have a managerId assigned.
      const managerPayments = payments.filter(p => {
        if (p.type !== 'income') return false
        if (!(p.date || '').startsWith(monthKey)) return false
        if (emp.managerId && p.managerId === emp.managerId) return true
        if (p.createdBy && p.createdBy === emp.id) return true
        if (p.createdByName && p.createdByName === emp.name) return true
        return false
      })
      const paymentsRevenue = managerPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
      const actualSales = managerPayments.length
      const actualRevenue = paymentsRevenue

      // Conversions
      const convOpenToSale = actualVisited > 0 ? Math.round((actualSales / actualVisited) * 100) : 0
      const convSignupToVisit = actualSignups > 0 ? Math.round((actualVisited / actualSignups) * 100) : 0

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

  // ─── Real revenue from actual payments (source of truth) ─────────────────
  const realRevenueData = useMemo(() => {
    let filtered = payments.filter(p => p.type === 'income' && (p.date || '').startsWith(monthKey))
    if (branchFilter !== 'all') filtered = filtered.filter(p => p.branch === branchFilter)
    if (isSales && user?.managerId) filtered = filtered.filter(p => p.managerId === user.managerId)
    if ((isRop || isBranchDirector) && user.branch !== 'all') {
      filtered = filtered.filter(p => p.branch === user.branch)
    }
    const revenue = filtered.reduce((sum, p) => sum + (p.amount || 0), 0)
    const salesCount = filtered.length
    const doplata = filtered.filter(p => (p.trancheNumber || 1) > 1).reduce((s, p) => s + p.amount, 0)
    const offlineCount = filtered.filter(p => p.learningFormat === 'Оффлайн').length
    const onlineCount = filtered.filter(p => p.learningFormat === 'Онлайн').length
    return { revenue, salesCount, doplata, offlineCount, onlineCount }
  }, [payments, monthKey, branchFilter, isSales, isRop, isBranchDirector, user])

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
  // Management roles (admin/owner/rop/branch_director) see EVERY sale for
  // their scope; sales-only users still get a short preview.
  const recentTransactions = useMemo(() => {
    if (!canSeeSalesList) return []
    let filtered = payments.filter(p => p.type === 'income' && (p.date || '').startsWith(monthKey))
    if (branchFilter !== 'all') filtered = filtered.filter(p => p.branch === branchFilter)
    if (isSales && user?.managerId) filtered = filtered.filter(p => p.managerId === user.managerId)
    if ((isRop || isBranchDirector) && user.branch !== 'all') {
      filtered = filtered.filter(p => p.branch === user.branch)
    }
    const sorted = filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return isSales ? sorted.slice(0, 10) : sorted
  }, [payments, monthKey, branchFilter, isSales, isRop, isBranchDirector, user, canSeeSalesList])

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
          {canPayments && canSeeSalesList && (
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
            <p className="text-lg font-bold text-emerald-600">{formatRevenue(realRevenueData.revenue)}</p>
            <p className={`text-xs font-semibold ${teamTotals.planRevenue > 0
              ? statusColor(Math.round(realRevenueData.revenue / teamTotals.planRevenue * 100))
              : 'text-slate-400'}`}>
              {teamTotals.planRevenue > 0 ? `${Math.round(realRevenueData.revenue / teamTotals.planRevenue * 100)}%` : '—'}
            </p>
          </div>
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-purple-50 rounded-lg"><ShoppingCart size={16} className="text-purple-600" /></div>
              <span className="text-xs text-slate-500">{t('finance.sales_label')}</span>
            </div>
            <p className="text-lg font-bold text-slate-900">{realRevenueData.salesCount} <span className="text-sm text-slate-400">/ {teamTotals.planSales}</span></p>
          </div>
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-amber-50 rounded-lg"><CreditCard size={16} className="text-amber-600" /></div>
              <span className="text-xs text-slate-500">{t('finance.expected_doplata')}</span>
            </div>
            <p className="text-lg font-bold text-amber-600">{formatRevenue(realRevenueData.doplata)}</p>
          </div>
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-cyan-50 rounded-lg"><Users size={16} className="text-cyan-600" /></div>
              <span className="text-xs text-slate-500">{t('finance.visitors')}</span>
            </div>
            <p className="text-lg font-bold text-slate-900">
              <span className="text-cyan-600">{realRevenueData.offlineCount}</span>
              <span className="text-xs text-slate-400 mx-1">{t('finance.off')}</span>
              <span className="text-blue-600">{realRevenueData.onlineCount}</span>
              <span className="text-xs text-slate-400 ml-1">{t('finance.onl')}</span>
            </p>
          </div>
        </div>
      )}

      {/* ─── Manager KPI Cards ──────────────────────────────────────────── */}
      {canSeeSalesList && (
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
                onClick={() => openKpiEditor(mgr)}
                className={`glass-card rounded-2xl p-5 border transition-all group relative cursor-pointer hover:shadow-md hover:-translate-y-0.5 ${
                  isCurrentUser ? 'border-blue-300 ring-2 ring-blue-100' : 'border-transparent hover:border-slate-200'
                }`}>
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div className="flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg shadow-sm border border-slate-200">
                    <Eye size={10} />
                    Продажи
                  </div>
                </div>
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                      mgr.role === 'rop' ? 'bg-teal-600' : mgr.role === 'branch_director' ? 'bg-indigo-600' : 'bg-emerald-600'
                    }`}>
                      {mgr.avatar || mgr.name?.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-sm">
                        {mgr.name} {isCurrentUser && <span className="text-xs text-blue-500">{t('finance.you')}</span>}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {mgr.role === 'rop' ? t('finance.rop') : mgr.role === 'branch_director' ? 'Руководитель филиала' : t('finance.manager')} · {mgr.branch === 'all' ? t('finance.all_branches') : (branches.find(b => b.id === mgr.branch)?.name || mgr.branch)}
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
      )}

      {/* ─── Recent Transactions ─────────────────────────────────────────── */}
      {canSeeSalesList && (
      <div className="glass-card rounded-2xl p-4 md:p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <ArrowUpRight size={20} className="text-emerald-600" />
          {t('finance.recent_sales')}
          {!isSales && (
            <span className="ml-auto text-xs font-normal text-slate-400">
              {recentTransactions.length}
            </span>
          )}
        </h3>
        {recentTransactions.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">{t('finance.no_sales_period')}</p>
        ) : (
          <div className={`space-y-2 ${!isSales && recentTransactions.length > 10 ? 'max-h-[600px] overflow-y-auto pr-1' : ''}`}>
            {recentTransactions.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5 px-4 bg-emerald-50/60 rounded-xl hover:bg-emerald-50 transition-colors group">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{p.student}</p>
                  <p className="text-xs text-slate-500">
                    {branches.find(b => b.id === p.branch)?.name} · {p.date} · {p.method}
                    {p.course ? ` · ${p.course}` : ''}
                    {p.trancheNumber > 1 ? ` · ${t('finance.tranche_number')}${p.trancheNumber}` : ''}
                  </p>
                  {p.createdByName && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {t('students.created_by')}: <span className="text-slate-600 font-medium">{p.createdByName}</span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <div className="text-right">
                    <span className="text-sm font-bold text-emerald-600">+{formatCurrency(p.amount)}</span>
                    {p.debt > 0 && <p className="text-xs text-red-500">{t('finance.debt_label')} {formatCurrency(p.debt)}</p>}
                  </div>
                  {canPayments && (
                    <button onClick={() => openEditPayment(p)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all"
                      title="Редактировать">
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* ─── Payment Modal ──────────────────────────────────────────────── */}
      <Modal isOpen={paymentModal} onClose={() => setPaymentModal(false)}
        title={paymentType === 'doplata' ? t('finance.modal_doplata') : t('finance.modal_new_sale')} size="lg">
        <PaymentForm onClose={() => setPaymentModal(false)} mode={paymentType} />
      </Modal>

      {/* ─── Edit Payment Modal ────────────────────────────────────────── */}
      <Modal isOpen={!!editingPayment} onClose={() => setEditingPayment(null)} title="Редактирование продажи" size="lg">
        {editingPayment && (
          <div className="space-y-5">
            {/* Student & Contact */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Имя клиента</label>
                <input type="text" value={editForm.student}
                  onChange={e => setEditForm(prev => ({ ...prev, student: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Телефон</label>
                <input type="text" value={editForm.phone}
                  onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Course & Amount */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Курс</label>
                <select value={editForm.course}
                  onChange={e => setEditForm(prev => ({ ...prev, course: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">—</option>
                  {courses.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Сумма</label>
                <input type="number" value={editForm.amount}
                  onChange={e => setEditForm(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Method & Branch */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Способ оплаты</label>
                <select value={editForm.method}
                  onChange={e => setEditForm(prev => ({ ...prev, method: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {EDIT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Филиал</label>
                <select value={editForm.branch}
                  onChange={e => setEditForm(prev => ({ ...prev, branch: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Дата оплаты</label>
                <input type="date" value={editForm.date}
                  onChange={e => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Старт курса</label>
                <input type="date" value={editForm.courseStartDate}
                  onChange={e => setEditForm(prev => ({ ...prev, courseStartDate: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">След. оплата</label>
                <input type="date" value={editForm.nextPaymentDate}
                  onChange={e => setEditForm(prev => ({ ...prev, nextPaymentDate: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Contract, Tariff, Format */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Номер договора</label>
                <input type="text" value={editForm.contractNumber}
                  onChange={e => setEditForm(prev => ({ ...prev, contractNumber: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Тариф</label>
                <input type="text" value={editForm.tariff}
                  onChange={e => setEditForm(prev => ({ ...prev, tariff: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Формат</label>
                <select value={editForm.learningFormat}
                  onChange={e => setEditForm(prev => ({ ...prev, learningFormat: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="Оффлайн">Оффлайн</option>
                  <option value="Онлайн">Онлайн</option>
                </select>
              </div>
            </div>

            {/* Responsible Manager */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ответственный менеджер</label>
              <select
                value={editForm.createdBy || ''}
                onChange={e => {
                  const empId = e.target.value
                  const emp = employees.find(x => String(x.id) === String(empId))
                  setEditForm(prev => ({
                    ...prev,
                    createdBy: empId ? Number(empId) || empId : '',
                    createdByName: emp?.name || '',
                    managerId: emp?.managerId || '',
                  }))
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— не указан —</option>
                {employees
                  .filter(e => e.role === 'sales' || e.role === 'rop' || e.role === 'branch_director')
                  .filter(e => e.status !== 'pending' && e.status !== 'rejected' && !e.deleted)
                  .filter(e => editForm.branch === 'all' || !editForm.branch || !e.branch || e.branch === editForm.branch || e.branch === 'all')
                  .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                  .map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {e.role === 'rop' ? 'РОП' : e.role === 'branch_director' ? 'Руководитель филиала' : 'Менеджер'} · {branches.find(b => b.id === e.branch)?.name || e.branch}
                    </option>
                  ))}
              </select>
              {editForm.createdByName && !editForm.createdBy && (
                <p className="text-[11px] text-amber-600 mt-1">Старая запись: {editForm.createdByName} — выберите из списка для связи с продажами</p>
              )}
            </div>

            {/* Debt & Comment */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Долг</label>
                <input type="number" value={editForm.debt}
                  onChange={e => setEditForm(prev => ({ ...prev, debt: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Комментарий</label>
                <input type="text" value={editForm.comment}
                  onChange={e => setEditForm(prev => ({ ...prev, comment: e.target.value }))}
                  placeholder="Комментарий..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <div>
                {!confirmDelete ? (
                  <button onClick={() => setConfirmDelete(true)}
                    className="px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1.5">
                    <Trash2 size={14} /> Удалить
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-500">Удалить продажу?</span>
                    <button onClick={async () => {
                      await deletePayment(editingPayment.id)
                      setEditingPayment(null)
                      setConfirmDelete(false)
                    }}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">
                      Да, удалить
                    </button>
                    <button onClick={() => setConfirmDelete(false)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                      Отмена
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setEditingPayment(null); setConfirmDelete(false) }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-1.5">
                  <X size={14} /> Отмена
                </button>
                <button onClick={saveEditPayment} disabled={editSaving}
                  className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-blue-500/25">
                  {editSaving ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Save size={14} />
                  )}
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Manager Detail Modal (Sales + KPI) ─────────────────────────── */}
      <Modal
        isOpen={!!editingKpi}
        onClose={closeKpiEditor}
        title={editingKpi ? editingKpi.name : ''}
        size="xl"
      >
        {editingKpi && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-bold ${
                editingKpi.role === 'rop' ? 'bg-teal-600' : 'bg-emerald-600'
              }`}>
                {editingKpi.avatar || editingKpi.name?.charAt(0)}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900 text-sm">{editingKpi.name}</p>
                <p className="text-xs text-slate-500">
                  {editingKpi.role === 'rop' ? t('finance.rop') : t('finance.manager')}
                  {' · '}
                  {branches.find(b => b.id === editingKpi.branch)?.name || editingKpi.branch}
                  {' · '}
                  {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                </p>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm font-bold ${statusBg(editingKpi.achievedPct)} ${statusColor(editingKpi.achievedPct)}`}>
                {editingKpi.achievedPct}%
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setMgrTab('sales')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  mgrTab === 'sales'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <ShoppingCart size={14} />
                Продажи ({(() => {
                  const mgrPayments = payments.filter(p =>
                    p.type === 'income' && p.managerId === editingKpi.managerId && (p.date || '').startsWith(monthKey)
                  )
                  return mgrPayments.length
                })()})
              </button>
              {canEditKpi && (
                <button
                  onClick={() => setMgrTab('kpi')}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-1.5 ${
                    mgrTab === 'kpi'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Target size={14} />
                  Показатели
                </button>
              )}
            </div>

            {/* Tab: Sales */}
            {mgrTab === 'sales' && (() => {
              const mgrPayments = payments
                .filter(p => p.type === 'income' && p.managerId === editingKpi.managerId && (p.date || '').startsWith(monthKey))
                .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
              const totalRevenue = mgrPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)

              return (
                <div className="space-y-3">
                  {/* Summary bar */}
                  <div className="flex items-center justify-between bg-emerald-50 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-[11px] text-emerald-700 uppercase font-medium">Продаж</p>
                        <p className="text-lg font-bold text-emerald-800">{mgrPayments.length}</p>
                      </div>
                      <div className="w-px h-8 bg-emerald-200" />
                      <div>
                        <p className="text-[11px] text-emerald-700 uppercase font-medium">Выручка</p>
                        <p className="text-lg font-bold text-emerald-800">{formatRevenue(totalRevenue)}</p>
                      </div>
                    </div>
                    {editingKpi.plan?.revenue > 0 && (
                      <div className="text-right">
                        <p className="text-[11px] text-slate-500 uppercase font-medium">План</p>
                        <p className="text-sm font-semibold text-slate-600">{formatRevenue(editingKpi.plan.revenue)}</p>
                      </div>
                    )}
                  </div>

                  {/* Sales list */}
                  {mgrPayments.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <ShoppingCart size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Нет продаж за этот период</p>
                    </div>
                  ) : (
                    <div className="max-h-[400px] overflow-y-auto space-y-1.5 pr-1">
                      {mgrPayments.map((p, idx) => (
                        <div key={p.id} className="flex items-center justify-between py-2.5 px-4 bg-white border border-slate-100 rounded-xl hover:border-slate-200 hover:shadow-sm transition-all group">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-slate-400 w-5">{idx + 1}.</span>
                              <p className="text-sm font-medium text-slate-900 truncate">{p.student}</p>
                              {(p.trancheNumber || 1) > 1 && (
                                <span className="text-[10px] font-medium bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                  Транш {p.trancheNumber}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 ml-7">
                              <p className="text-xs text-slate-500">
                                {p.date} · {p.course || '—'} · {p.method}
                                {p.group ? ` · ${p.group}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                            <div className="text-right">
                              <span className="text-sm font-bold text-emerald-600">+{formatCurrency(p.amount)}</span>
                              {p.debt > 0 && <p className="text-[10px] text-red-500">Долг: {formatCurrency(p.debt)}</p>}
                            </div>
                            {canPayments && (
                              <button onClick={(e) => { e.stopPropagation(); closeKpiEditor(); setTimeout(() => openEditPayment(p), 100) }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all"
                                title="Редактировать">
                                <Pencil size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Tab: KPI */}
            {mgrTab === 'kpi' && canEditKpi && kpiForm && (
              <div className="space-y-5">
                {/* Plan section */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                    <Target size={12} className="text-blue-600" />
                    {t('finance.edit_kpi_plan_section')}
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <KpiField label={t('finance.leads')}         value={kpiForm.planLeads}         onChange={v => setKpiForm(p => ({ ...p, planLeads: v }))} />
                    <KpiField label={t('finance.conversations')} value={kpiForm.planConversations} onChange={v => setKpiForm(p => ({ ...p, planConversations: v }))} />
                    <KpiField label={t('finance.signups') || 'Записи'} value={kpiForm.planSignups} onChange={v => setKpiForm(p => ({ ...p, planSignups: v }))} />
                    <KpiField label={t('finance.visited_off')}   value={kpiForm.planVisited}      onChange={v => setKpiForm(p => ({ ...p, planVisited: v }))} />
                    <KpiField label={t('finance.sales_short')}   value={kpiForm.planSales}        onChange={v => setKpiForm(p => ({ ...p, planSales: v }))} />
                    <KpiField label={t('finance.revenue')}       value={kpiForm.planRevenue}      onChange={v => setKpiForm(p => ({ ...p, planRevenue: v }))} isMoney />
                  </div>
                </div>

                {/* Actual section */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                    <TrendingUp size={12} className="text-emerald-600" />
                    {t('finance.edit_kpi_actual_section')}
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <KpiField label={t('finance.leads')}         value={kpiForm.actLeads}         onChange={v => setKpiForm(p => ({ ...p, actLeads: v }))} />
                    <KpiField label={t('finance.conversations')} value={kpiForm.actConversations} onChange={v => setKpiForm(p => ({ ...p, actConversations: v }))} />
                    <KpiField label={t('finance.signups') || 'Записи'} value={kpiForm.actSignups} onChange={v => setKpiForm(p => ({ ...p, actSignups: v }))} />
                    <KpiField label={t('finance.visited_off')}   value={kpiForm.actVisited}      onChange={v => setKpiForm(p => ({ ...p, actVisited: v }))} />
                    <KpiField label={t('finance.sales_short')}   value={kpiForm.actSales}        onChange={v => setKpiForm(p => ({ ...p, actSales: v }))} />
                    <KpiField label={t('finance.revenue')}       value={kpiForm.actRevenue}      onChange={v => setKpiForm(p => ({ ...p, actRevenue: v }))} isMoney />
                  </div>
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 flex items-start gap-1.5">
                    <span className="mt-0.5">⚠</span>
                    <span>{t('finance.edit_kpi_override_note')}</span>
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={closeKpiEditor}
                    disabled={kpiSaving}
                    className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    {t('finance.cancel') || 'Отмена'}
                  </button>
                  <button
                    type="button"
                    onClick={saveKpiEditor}
                    disabled={kpiSaving}
                    className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save size={14} />
                    {kpiSaving ? (t('finance.saving') || 'Сохранение...') : (t('finance.save') || 'Сохранить')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── KPI field input ───────────────────────────────────────────────────────
function KpiField({ label, value, onChange, isMoney }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500 mb-1 uppercase tracking-wide">
        {label}
      </label>
      <input
        type="number"
        min="0"
        value={value}
        onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        className={`w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${isMoney ? 'text-right' : ''}`}
      />
    </div>
  )
}
