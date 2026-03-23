import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  FileBarChart, Filter, Calendar, TrendingUp, TrendingDown, Users, Phone,
  UserCheck, ShoppingCart, DollarSign, Settings, ChevronLeft, ChevronRight,
  Download, Edit3, Save, X,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useLanguage } from '../contexts/LanguageContext'
import { db } from '../firebase'
import {
  collection, doc, addDoc, setDoc, getDocs, onSnapshot, query, where, deleteDoc,
} from 'firebase/firestore'

// ─── Constants ──────────────────────────────────────────────────────────────

const METRICS_KEYS = [
  { key: 'leads',       labelKey: 'reports.metric_leads',          editable: true },
  { key: 'conversations', labelKey: 'reports.metric_conversations',    editable: true },
  { key: 'signups',     labelKey: 'reports.metric_signups',         editable: true },
  { key: 'convSignups', labelKey: 'reports.metric_conv_signups',   editable: false },
  { key: 'visited',     labelKey: 'reports.metric_visited',       editable: true },
  { key: 'convVisited', labelKey: 'reports.metric_conv_visited',   editable: false },
  { key: 'sales',       labelKey: 'reports.metric_sales',          editable: true },
  { key: 'convSales',   labelKey: 'reports.metric_conv_sales',   editable: false },
  { key: 'revenue',     labelKey: 'reports.metric_revenue',                editable: true },
]

const WEEK_RANGES = [
  { label: '1-7',   start: 1,  end: 7 },
  { label: '8-13',  start: 8,  end: 13 },
  { label: '14-19', start: 14, end: 19 },
  { label: '20-25', start: 20, end: 25 },
  { label: '26-31', start: 26, end: 31 },
]

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const SEED_PLANS = {
  'Асад':   { leads: 260, conversations: 1300, signups: 130, visited: 104, sales: 35, revenue: 150000000 },
  'Шахло':  { leads: 260, conversations: 1300, signups: 130, visited: 104, sales: 20, revenue: 100000000 },
  'Дурбек': { leads: 260, conversations: 1300, signups: 130, visited: 104, sales: 35, revenue: 150000000 },
  'Нурзод': { leads: 150, conversations: 1300, signups: 50,  visited: 20,  sales: 10, revenue: 75000000 },
}

const SEED_TOTALS = {
  'Асад':   { leads: 107, conversations: 427, signups: 50, visited: 34, sales: 24, revenue: 155520000 },
  'Шахло':  { leads: 75,  conversations: 163, signups: 49, visited: 24, sales: 14, revenue: 55951000 },
  'Дурбек': { leads: 138, conversations: 157, signups: 38, visited: 31, sales: 17, revenue: 154700000 },
  'Нурзод': { leads: 0,   conversations: 0,   signups: 0,  visited: 0,  sales: 0,  revenue: 4500000 },
}

const OVERALL_PLAN = 400000000

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatRevenue(val) {
  if (val == null || val === 0) return '0'
  if (Math.abs(val) >= 1000000) {
    const m = val / 1000000
    return `${Number.isInteger(m) ? m : m.toFixed(1)} млн`
  }
  if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(0)} тыс`
  return String(val)
}

function formatRevenueFullNumber(val) {
  if (val == null) return '0'
  return val.toLocaleString('ru-RU')
}

function pctColor(pct) {
  if (pct >= 100) return 'text-emerald-600 bg-emerald-50'
  if (pct >= 70) return 'text-amber-600 bg-amber-50'
  return 'text-red-600 bg-red-50'
}

function pctBadge(pct) {
  const col = pct >= 100 ? 'bg-emerald-100 text-emerald-700' : pct >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${col}`}>{pct.toFixed(0)}%</span>
}

function getMonthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function getDayOfWeek(year, month, day) {
  const d = new Date(year, month - 1, day)
  const dow = d.getDay()
  return dow === 0 ? 6 : dow - 1 // 0=Mon, 6=Sun
}

// Distribute monthly totals across weeks for seed data
function distributeSeedData(totals, year, month) {
  const dailyData = {}
  const daysInMonth = getDaysInMonth(year, month)
  const editableKeys = ['leads', 'conversations', 'signups', 'visited', 'sales', 'revenue']

  editableKeys.forEach(key => {
    const total = totals[key] || 0
    if (total === 0) return
    // Spread evenly across working days (Mon-Sat)
    const workDays = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = getDayOfWeek(year, month, d)
      if (dow < 6) workDays.push(d) // Mon-Sat
    }
    if (workDays.length === 0) return
    const perDay = Math.floor(total / workDays.length)
    let remainder = total - perDay * workDays.length
    workDays.forEach(d => {
      if (!dailyData[d]) dailyData[d] = {}
      dailyData[d][key] = perDay + (remainder > 0 ? 1 : 0)
      if (remainder > 0) remainder--
    })
  })
  return dailyData
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function Reports() {
  const { t } = useLanguage()
  const { user, employees } = useAuth()
  const { setSalesPlan } = useData()
  const METRICS = useMemo(() => METRICS_KEYS.map(m => ({ ...m, label: t(m.labelKey) })), [t])
  const isAdmin = user?.role === 'owner' || user?.role === 'admin' || user?.role === 'rop'
  const isSales = user?.role === 'sales'

  const salesStaff = useMemo(() => {
    return employees.filter(e => e.role === 'sales' || e.role === 'rop')
  }, [employees])

  const managers = useMemo(() => {
    return salesStaff.map(e => e.name)
  }, [salesStaff])

  // Month selector
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [managerFilter, setManagerFilter] = useState('all')
  const [periodMode, setPeriodMode] = useState('month') // day | week | month

  // Data
  const [plans, setPlans] = useState({}) // { manager: { leads, conversations, ... } }
  const [dailyData, setDailyData] = useState({}) // { manager: { day: { leads, conversations, ... } } }
  const [overallPlan, setOverallPlan] = useState(OVERALL_PLAN)
  const [loading, setLoading] = useState(true)
  const [planModalOpen, setPlanModalOpen] = useState(false)

  // Editing
  const [editingCell, setEditingCell] = useState(null) // { manager, metric, day }
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef(null)

  const monthKey = getMonthKey(selectedYear, selectedMonth)
  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth)

  const MONTH_NAMES = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
  ]

  // ─── Firestore sync ──────────────────────────────────────────────────────

  // Load plans
  useEffect(() => {
    const plansRef = collection(db, 'reportPlans')
    const q = query(plansRef, where('monthKey', '==', monthKey))
    const unsub = onSnapshot(q, async (snapshot) => {
      if (snapshot.empty) {
        // Seed with March 2026 data if it matches, otherwise empty
        if (selectedYear === 2026 && selectedMonth === 3) {
          await seedPlans()
        } else {
          setPlans({})
          setOverallPlan(0)
        }
      } else {
        const p = {}
        let op = 0
        snapshot.docs.forEach(d => {
          const data = d.data()
          if (data.manager === '__overall__') {
            op = data.revenue || 0
          } else {
            p[data.manager] = {
              leads: data.leads || 0,
              conversations: data.conversations || 0,
              signups: data.signups || 0,
              visited: data.visited || 0,
              sales: data.sales || 0,
              revenue: data.revenue || 0,
            }
          }
        })
        setPlans(p)
        setOverallPlan(op)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [monthKey])

  // Load daily data
  useEffect(() => {
    const dailyRef = collection(db, 'reportDaily')
    const q = query(dailyRef, where('monthKey', '==', monthKey))
    const unsub = onSnapshot(q, async (snapshot) => {
      if (snapshot.empty && selectedYear === 2026 && selectedMonth === 3) {
        await seedDailyData()
      } else {
        const dd = {}
        snapshot.docs.forEach(d => {
          const data = d.data()
          const mgr = data.manager
          const day = data.day
          if (!dd[mgr]) dd[mgr] = {}
          dd[mgr][day] = {
            leads: data.leads || 0,
            conversations: data.conversations || 0,
            signups: data.signups || 0,
            visited: data.visited || 0,
            sales: data.sales || 0,
            revenue: data.revenue || 0,
          }
        })
        setDailyData(dd)
      }
    })
    return () => unsub()
  }, [monthKey])

  // Seed functions
  async function seedPlans() {
    const plansRef = collection(db, 'reportPlans')
    for (const mgr of managers) {
      const plan = SEED_PLANS[mgr]
      if (plan) {
        await setDoc(doc(plansRef, `${monthKey}_${mgr}`), {
          monthKey, manager: mgr, ...plan,
        })
      }
    }
    await setDoc(doc(plansRef, `${monthKey}___overall__`), {
      monthKey, manager: '__overall__', revenue: OVERALL_PLAN,
    })
  }

  async function seedDailyData() {
    const dailyRef = collection(db, 'reportDaily')
    for (const mgr of managers) {
      const totals = SEED_TOTALS[mgr]
      if (!totals) continue
      const distributed = distributeSeedData(totals, 2026, 3)
      for (const [day, values] of Object.entries(distributed)) {
        await setDoc(doc(dailyRef, `${monthKey}_${mgr}_${day}`), {
          monthKey, manager: mgr, day: Number(day), ...values,
        })
      }
    }
  }

  // ─── Computed data ────────────────────────────────────────────────────────

  const visibleManagers = useMemo(() => {
    if (isSales && !isAdmin) {
      // Sales users only see their own name if it matches a manager
      const match = managers.find(m => m === user?.name)
      return match ? [match] : managers
    }
    if (managerFilter !== 'all') return [managerFilter]
    return managers
  }, [managerFilter, isAdmin, isSales, user, managers])

  // Compute monthly fact for a manager + metric
  const getMonthlyFact = useCallback((manager, metricKey) => {
    const mgrDays = dailyData[manager]
    if (!mgrDays) return 0
    return Object.values(mgrDays).reduce((sum, d) => sum + (d[metricKey] || 0), 0)
  }, [dailyData])

  // Get value for a specific day
  const getDayValue = useCallback((manager, metricKey, day) => {
    return dailyData[manager]?.[day]?.[metricKey] || 0
  }, [dailyData])

  // Week total
  const getWeekTotal = useCallback((manager, metricKey, weekStart, weekEnd) => {
    const mgrDays = dailyData[manager]
    if (!mgrDays) return 0
    let sum = 0
    const maxDay = Math.min(weekEnd, daysInMonth)
    for (let d = weekStart; d <= maxDay; d++) {
      sum += mgrDays[d]?.[metricKey] || 0
    }
    return sum
  }, [dailyData, daysInMonth])

  // Conversion calculations
  const calcConversion = useCallback((numerator, denominator) => {
    if (!denominator || denominator === 0) return 0
    return (numerator / denominator * 100)
  }, [])

  const getMetricValue = useCallback((manager, metric, day) => {
    if (metric.key === 'convSignups') {
      if (day !== undefined) {
        const conv = getDayValue(manager, 'conversations', day)
        const sign = getDayValue(manager, 'signups', day)
        return calcConversion(sign, conv)
      }
      return null // handled separately
    }
    if (metric.key === 'convVisited') {
      if (day !== undefined) {
        const sign = getDayValue(manager, 'signups', day)
        const vis = getDayValue(manager, 'visited', day)
        return calcConversion(vis, sign)
      }
      return null
    }
    if (metric.key === 'convSales') {
      if (day !== undefined) {
        const vis = getDayValue(manager, 'visited', day)
        const sal = getDayValue(manager, 'sales', day)
        return calcConversion(sal, vis)
      }
      return null
    }
    if (day !== undefined) return getDayValue(manager, metric.key, day)
    return getMonthlyFact(manager, metric.key)
  }, [getDayValue, getMonthlyFact, calcConversion])

  // Week conversion
  const getWeekConversion = useCallback((manager, metricKey, weekStart, weekEnd) => {
    if (metricKey === 'convSignups') {
      const conv = getWeekTotal(manager, 'conversations', weekStart, weekEnd)
      const sign = getWeekTotal(manager, 'signups', weekStart, weekEnd)
      return calcConversion(sign, conv)
    }
    if (metricKey === 'convVisited') {
      const sign = getWeekTotal(manager, 'signups', weekStart, weekEnd)
      const vis = getWeekTotal(manager, 'visited', weekStart, weekEnd)
      return calcConversion(vis, sign)
    }
    if (metricKey === 'convSales') {
      const vis = getWeekTotal(manager, 'visited', weekStart, weekEnd)
      const sal = getWeekTotal(manager, 'sales', weekStart, weekEnd)
      return calcConversion(sal, vis)
    }
    return getWeekTotal(manager, metricKey, weekStart, weekEnd)
  }, [getWeekTotal, calcConversion])

  // Monthly conversion
  const getMonthlyConversion = useCallback((manager, metricKey) => {
    if (metricKey === 'convSignups') {
      const conv = getMonthlyFact(manager, 'conversations')
      const sign = getMonthlyFact(manager, 'signups')
      return calcConversion(sign, conv)
    }
    if (metricKey === 'convVisited') {
      const sign = getMonthlyFact(manager, 'signups')
      const vis = getMonthlyFact(manager, 'visited')
      return calcConversion(vis, sign)
    }
    if (metricKey === 'convSales') {
      const vis = getMonthlyFact(manager, 'visited')
      const sal = getMonthlyFact(manager, 'sales')
      return calcConversion(sal, vis)
    }
    return getMonthlyFact(manager, metricKey)
  }, [getMonthlyFact, calcConversion])

  // Week plan (monthly plan / number of weeks that have days)
  const getWeekPlan = useCallback((manager, metricKey, weekStart, weekEnd) => {
    if (['convSignups', 'convVisited', 'convSales'].includes(metricKey)) return null
    const plan = plans[manager]?.[metricKey] || 0
    const activeWeeks = WEEK_RANGES.filter(w => w.start <= daysInMonth).length
    return activeWeeks > 0 ? Math.round(plan / activeWeeks) : 0
  }, [plans, daysInMonth])

  // ─── Inline editing ───────────────────────────────────────────────────────

  const startEdit = (manager, metricKey, day) => {
    const val = getDayValue(manager, metricKey, day)
    setEditingCell({ manager, metric: metricKey, day })
    setEditValue(val === 0 ? '' : String(val))
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const saveEdit = async () => {
    if (!editingCell) return
    const { manager, metric, day } = editingCell
    const numVal = Number(editValue) || 0
    const dailyRef = collection(db, 'reportDaily')
    const docId = `${monthKey}_${manager}_${day}`
    const existing = dailyData[manager]?.[day] || {}
    await setDoc(doc(dailyRef, docId), {
      monthKey, manager, day,
      leads: existing.leads || 0,
      conversations: existing.conversations || 0,
      signups: existing.signups || 0,
      visited: existing.visited || 0,
      sales: existing.sales || 0,
      revenue: existing.revenue || 0,
      [metric]: numVal,
    })
    setEditingCell(null)
    setEditValue('')
  }

  const cancelEdit = () => {
    setEditingCell(null)
    setEditValue('')
  }

  // ─── KPI summary ─────────────────────────────────────────────────────────

  const kpiData = useMemo(() => {
    const metrics = ['leads', 'conversations', 'signups', 'sales', 'revenue']
    const labelKeys = ['reports.kpi_leads', 'reports.kpi_conversations', 'reports.kpi_signups', 'reports.kpi_sales', 'reports.kpi_revenue']
    const labels = labelKeys.map(k => t(k))
    const icons = [Phone, Users, UserCheck, ShoppingCart, DollarSign]
    return metrics.map((key, i) => {
      let fact = 0, plan = 0
      visibleManagers.forEach(mgr => {
        fact += getMonthlyFact(mgr, key)
        plan += plans[mgr]?.[key] || 0
      })
      const pct = plan > 0 ? (fact / plan * 100) : 0
      return {
        label: labels[i], key, fact, plan, pct,
        Icon: icons[i],
        factDisplay: key === 'revenue' ? formatRevenue(fact) : fact.toLocaleString('ru-RU'),
        planDisplay: key === 'revenue' ? formatRevenue(plan) : plan.toLocaleString('ru-RU'),
      }
    })
  }, [visibleManagers, plans, getMonthlyFact])

  // ─── Overall totals (ИТОГО row) ──────────────────────────────────────────

  const overallFact = useMemo(() => {
    return managers.reduce((sum, mgr) => sum + getMonthlyFact(mgr, 'revenue'), 0)
  }, [getMonthlyFact, managers])

  const overallDeviation = overallPlan - overallFact

  // ─── Charts data ──────────────────────────────────────────────────────────

  const funnelData = useMemo(() => {
    const keys = ['leads', 'conversations', 'signups', 'visited', 'sales']
    const labels = [t('reports.funnel_leads'), t('reports.funnel_conversations'), t('reports.funnel_signups'), t('reports.funnel_visited'), t('reports.funnel_sales')]
    const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981']
    return keys.map((key, i) => {
      let total = 0
      visibleManagers.forEach(mgr => { total += getMonthlyFact(mgr, key) })
      return { name: labels[i], value: total, fill: colors[i] }
    })
  }, [visibleManagers, getMonthlyFact])

  const managerComparisonData = useMemo(() => {
    return visibleManagers.map(mgr => ({
      name: mgr,
      [t('reports.funnel_leads')]: getMonthlyFact(mgr, 'leads'),
      [t('reports.funnel_conversations')]: getMonthlyFact(mgr, 'conversations'),
      [t('reports.funnel_signups')]: getMonthlyFact(mgr, 'signups'),
      [t('reports.funnel_visited')]: getMonthlyFact(mgr, 'visited'),
      [t('reports.funnel_sales')]: getMonthlyFact(mgr, 'sales'),
    }))
  }, [visibleManagers, getMonthlyFact])

  // ─── Plan modal ───────────────────────────────────────────────────────────

  const [planForm, setPlanForm] = useState({})

  const openPlanModal = () => {
    const form = {}
    managers.forEach(mgr => {
      form[mgr] = { ...(plans[mgr] || { leads: 0, conversations: 0, signups: 0, visited: 0, sales: 0, revenue: 0 }) }
    })
    form.__overall__ = overallPlan
    setPlanForm(form)
    setPlanModalOpen(true)
  }

  const savePlans = async () => {
    const plansRef = collection(db, 'reportPlans')
    for (const mgr of managers) {
      await setDoc(doc(plansRef, `${monthKey}_${mgr}`), {
        monthKey, manager: mgr, ...planForm[mgr],
      })

      // Sync revenue to salesPlans (used by Dashboard Sales tab)
      const emp = salesStaff.find(e => e.name === mgr)
      if (emp?.managerId && planForm[mgr]?.revenue != null) {
        setSalesPlan(emp.managerId, planForm[mgr].revenue, monthKey)
      }
    }
    await setDoc(doc(plansRef, `${monthKey}___overall__`), {
      monthKey, manager: '__overall__', revenue: planForm.__overall__ || 0,
    })
    setPlanModalOpen(false)
  }

  // ─── Navigate months ─────────────────────────────────────────────────────

  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1) }
    else setSelectedMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1) }
    else setSelectedMonth(m => m + 1)
  }

  // ─── Cell renderer ────────────────────────────────────────────────────────

  const renderDayCell = (manager, metric, day) => {
    const isConversion = !metric.editable
    const isEditing = editingCell?.manager === manager && editingCell?.metric === metric.key && editingCell?.day === day

    if (day > daysInMonth) return <td key={day} className="px-1 py-1 text-center text-xs border-r border-slate-100 bg-slate-50" />

    if (isConversion) {
      let val = 0
      if (metric.key === 'convSignups') {
        const conv = getDayValue(manager, 'conversations', day)
        const sign = getDayValue(manager, 'signups', day)
        val = calcConversion(sign, conv)
      } else if (metric.key === 'convVisited') {
        const sign = getDayValue(manager, 'signups', day)
        const vis = getDayValue(manager, 'visited', day)
        val = calcConversion(vis, sign)
      } else if (metric.key === 'convSales') {
        const vis = getDayValue(manager, 'visited', day)
        const sal = getDayValue(manager, 'sales', day)
        val = calcConversion(sal, vis)
      }
      return (
        <td key={day} className="px-1 py-1 text-center text-xs border-r border-slate-100 bg-slate-100/50 text-slate-500 font-mono">
          {val > 0 ? `${val.toFixed(0)}%` : '—'}
        </td>
      )
    }

    if (isEditing) {
      return (
        <td key={day} className="px-0 py-0 border-r border-slate-100">
          <input
            ref={inputRef}
            type="number"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
            className="w-full h-full px-1 py-1 text-xs text-center border-2 border-blue-500 outline-none bg-blue-50 rounded-none"
            style={{ minWidth: 40 }}
          />
        </td>
      )
    }

    const rawVal = getDayValue(manager, metric.key, day)
    const display = rawVal > 0
      ? (metric.key === 'revenue' ? formatRevenue(rawVal) : rawVal)
      : '—'

    return (
      <td
        key={day}
        className="px-1 py-1 text-center text-xs border-r border-slate-100 cursor-pointer hover:bg-blue-50 transition-colors"
        onClick={() => metric.editable && startEdit(manager, metric.key, day)}
      >
        <span className={rawVal > 0 ? 'text-slate-700' : 'text-slate-300'}>{display}</span>
      </td>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <span className="ml-3 text-slate-500">{t('reports.loading')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileBarChart size={24} className="text-blue-600" />
            {t('reports.heading')}
          </h2>
          <p className="text-slate-500 mt-1">{t('reports.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isAdmin && (
            <button
              onClick={openPlanModal}
              className="bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors flex items-center gap-2"
            >
              <Settings size={16} /> {t('reports.btn_setup_plans')}
            </button>
          )}
        </div>
      </div>

      {/* ─── Filter Bar ──────────────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center gap-4">
        {/* Month navigation */}
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-slate-400" />
          <button onClick={prevMonth} className="p-1 hover:bg-slate-100 rounded"><ChevronLeft size={18} /></button>
          <span className="font-semibold text-slate-700 min-w-[140px] text-center">
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </span>
          <button onClick={nextMonth} className="p-1 hover:bg-slate-100 rounded"><ChevronRight size={18} /></button>
        </div>

        {/* Manager filter */}
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-slate-400" />
          <select
            value={managerFilter}
            onChange={e => setManagerFilter(e.target.value)}
            className="glass-input text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">{t('reports.filter_all_managers')}</option>
            {managers.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* Period toggle */}
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          {[
            { key: 'day', label: t('reports.period_day') },
            { key: 'week', label: t('reports.period_week') },
            { key: 'month', label: t('reports.period_month') },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => setPeriodMode(p.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                periodMode === p.key ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── KPI Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpiData.map(kpi => (
          <div key={kpi.key} className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-lg ${kpi.pct >= 100 ? 'bg-emerald-50' : kpi.pct >= 70 ? 'bg-amber-50' : 'bg-red-50'}`}>
                <kpi.Icon size={16} className={kpi.pct >= 100 ? 'text-emerald-600' : kpi.pct >= 70 ? 'text-amber-600' : 'text-red-600'} />
              </div>
              <span className="text-xs text-slate-500 font-medium">{kpi.label}</span>
            </div>
            <p className="text-lg font-bold text-slate-900">{kpi.factDisplay}</p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-slate-400">{t('reports.plan_label')} {kpi.planDisplay}</span>
              {kpi.plan > 0 && pctBadge(kpi.pct)}
            </div>
            {kpi.plan > 0 && (
              <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    kpi.pct >= 100 ? 'bg-emerald-500' : kpi.pct >= 70 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(kpi.pct, 100)}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ─── Overall Summary ─────────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-600 font-medium mb-1">{t('reports.overall_plan')}</p>
            <p className="text-xl font-bold text-blue-700">{formatRevenue(overallPlan)}</p>
          </div>
          <div className="text-center p-3 bg-emerald-50 rounded-lg">
            <p className="text-xs text-emerald-600 font-medium mb-1">{t('reports.fact')}</p>
            <p className="text-xl font-bold text-emerald-700">{formatRevenue(overallFact)}</p>
          </div>
          <div className={`text-center p-3 rounded-lg ${overallDeviation > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
            <p className={`text-xs font-medium mb-1 ${overallDeviation > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{t('reports.deviation')}</p>
            <p className={`text-xl font-bold ${overallDeviation > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
              {overallDeviation > 0 ? '-' : '+'}{formatRevenue(Math.abs(overallDeviation))}
            </p>
          </div>
        </div>
      </div>

      {/* ─── Main Report Table ───────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '1400px' }}>
            <thead>
              {/* Header row 1: Week groups */}
              <tr className="bg-white/40 border-b border-white/30">
                <th className="sticky left-0 z-20 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-600 border-r border-slate-200" style={{ minWidth: 100 }}>
                  {t('reports.th_manager')}
                </th>
                <th className="sticky left-[100px] z-20 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-600 border-r border-slate-200" style={{ minWidth: 160 }}>
                  {t('reports.th_metric')}
                </th>
                <th className="px-2 py-2 text-center text-xs font-semibold text-slate-600 border-r border-slate-200 bg-blue-50" colSpan={3}>
                  {t('reports.period_month')}
                </th>
                {WEEK_RANGES.map((week, wi) => {
                  const maxDay = Math.min(week.end, daysInMonth)
                  if (week.start > daysInMonth) return null
                  const numDays = maxDay - week.start + 1
                  return (
                    <th
                      key={wi}
                      className="px-2 py-2 text-center text-xs font-semibold text-slate-600 border-r border-slate-200 bg-slate-100"
                      colSpan={numDays + 2} // weekPlan + days + weekTotal
                    >
                      {t('reports.th_week')} {week.label}
                    </th>
                  )
                })}
              </tr>
              {/* Header row 2: Individual columns */}
              <tr className="bg-white/40 border-b border-white/30">
                <th className="sticky left-0 z-20 bg-slate-50 px-3 py-1 border-r border-slate-200" />
                <th className="sticky left-[100px] z-20 bg-slate-50 px-3 py-1 border-r border-slate-200" />
                {/* Month columns */}
                <th className="px-2 py-1 text-center text-[10px] font-medium text-blue-600 border-r border-slate-100 bg-blue-50">{t('reports.th_month_plan')}</th>
                <th className="px-2 py-1 text-center text-[10px] font-medium text-blue-600 border-r border-slate-100 bg-blue-50">{t('reports.th_month_fact')}</th>
                <th className="px-2 py-1 text-center text-[10px] font-medium text-blue-600 border-r border-slate-200 bg-blue-50">%</th>
                {/* Week columns */}
                {WEEK_RANGES.map((week, wi) => {
                  const maxDay = Math.min(week.end, daysInMonth)
                  if (week.start > daysInMonth) return null
                  const cells = []
                  cells.push(
                    <th key={`wp_${wi}`} className="px-1 py-1 text-center text-[10px] font-medium text-slate-500 border-r border-slate-100 bg-slate-100">
                      {t('reports.th_week_plan')}
                    </th>
                  )
                  for (let d = week.start; d <= maxDay; d++) {
                    const dow = getDayOfWeek(selectedYear, selectedMonth, d)
                    const dayName = DAY_NAMES[dow]
                    cells.push(
                      <th key={`d_${d}`} className={`px-1 py-1 text-center text-[10px] font-medium border-r border-slate-100 ${dow >= 5 ? 'text-red-400 bg-red-50/30' : 'text-slate-500'}`}>
                        <div>{d}</div>
                        <div className="text-[9px]">{dayName}</div>
                      </th>
                    )
                  }
                  cells.push(
                    <th key={`wt_${wi}`} className="px-1 py-1 text-center text-[10px] font-medium text-slate-600 border-r border-slate-200 bg-slate-100">
                      {t('reports.th_total')}
                    </th>
                  )
                  return cells
                })}
              </tr>
            </thead>
            <tbody>
              {visibleManagers.map((manager, mi) => (
                METRICS.map((metric, mIdx) => {
                  const isConversion = !metric.editable
                  const isFirstRow = mIdx === 0
                  const isLastRow = mIdx === METRICS.length - 1
                  const rowBg = isConversion ? 'bg-slate-50/70' : 'bg-white'

                  // Monthly plan/fact/pct
                  let monthPlan = plans[manager]?.[metric.key] || 0
                  let monthFact, monthPct

                  if (isConversion) {
                    monthFact = getMonthlyConversion(manager, metric.key)
                    monthPlan = 0
                    monthPct = null
                  } else {
                    monthFact = getMonthlyFact(manager, metric.key)
                    monthPct = monthPlan > 0 ? (monthFact / monthPlan * 100) : 0
                  }

                  return (
                    <tr
                      key={`${manager}_${metric.key}`}
                      className={`${rowBg} ${isLastRow ? 'border-b-2 border-slate-300' : 'border-b border-slate-100'} hover:bg-slate-50/50`}
                    >
                      {/* Manager name (merged visually) */}
                      {isFirstRow ? (
                        <td
                          className="sticky left-0 z-10 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 border-r border-slate-200 align-top"
                          rowSpan={METRICS.length}
                          style={{ minWidth: 100 }}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                              {manager[0]}
                            </div>
                            {manager}
                          </div>
                        </td>
                      ) : null}

                      {/* Metric label */}
                      <td
                        className={`sticky left-[100px] z-10 px-3 py-1.5 text-xs border-r border-slate-200 ${
                          isConversion ? 'bg-slate-50 text-slate-500 italic' : 'bg-white text-slate-700 font-medium'
                        }`}
                        style={{ minWidth: 160 }}
                      >
                        {metric.label}
                      </td>

                      {/* Monthly Plan */}
                      <td className="px-2 py-1.5 text-center text-xs border-r border-slate-100 bg-blue-50/30 font-medium text-slate-600">
                        {isConversion ? '—' : (metric.key === 'revenue' ? formatRevenue(monthPlan) : monthPlan.toLocaleString('ru-RU'))}
                      </td>

                      {/* Monthly Fact */}
                      <td className="px-2 py-1.5 text-center text-xs border-r border-slate-100 bg-blue-50/30 font-semibold text-slate-800">
                        {isConversion
                          ? `${monthFact.toFixed(1)}%`
                          : (metric.key === 'revenue' ? formatRevenue(monthFact) : monthFact.toLocaleString('ru-RU'))
                        }
                      </td>

                      {/* Monthly % */}
                      <td className={`px-2 py-1.5 text-center text-xs border-r border-slate-200 font-semibold ${
                        isConversion ? 'bg-slate-50 text-slate-400' :
                        monthPct !== null && monthPct > 0 ? pctColor(monthPct) : 'bg-blue-50/30'
                      }`}>
                        {isConversion ? '—' : (monthPlan > 0 ? `${monthPct.toFixed(0)}%` : '—')}
                      </td>

                      {/* Week columns */}
                      {WEEK_RANGES.map((week, wi) => {
                        const maxDay = Math.min(week.end, daysInMonth)
                        if (week.start > daysInMonth) return null
                        const cells = []

                        // Week plan
                        const wp = getWeekPlan(manager, metric.key, week.start, week.end)
                        cells.push(
                          <td key={`wp_${wi}`} className="px-1 py-1.5 text-center text-xs border-r border-slate-100 bg-slate-50 text-slate-500 font-mono">
                            {isConversion ? '—' : (wp ? (metric.key === 'revenue' ? formatRevenue(wp) : wp) : '—')}
                          </td>
                        )

                        // Individual days
                        for (let d = week.start; d <= maxDay; d++) {
                          cells.push(renderDayCell(manager, metric, d))
                        }

                        // Week total
                        const wt = getWeekConversion(manager, metric.key, week.start, week.end)
                        cells.push(
                          <td key={`wt_${wi}`} className="px-1 py-1.5 text-center text-xs border-r border-slate-200 bg-slate-100 font-semibold text-slate-700">
                            {isConversion
                              ? (wt > 0 ? `${wt.toFixed(1)}%` : '—')
                              : (wt > 0 ? (metric.key === 'revenue' ? formatRevenue(wt) : wt.toLocaleString('ru-RU')) : '—')
                            }
                          </td>
                        )

                        return cells
                      })}
                    </tr>
                  )
                })
              ))}

              {/* ─── ИТОГО row ────────────────────────────────────────────── */}
              <tr className="bg-slate-800 text-white font-semibold">
                <td className="sticky left-0 z-10 bg-slate-800 px-3 py-3 text-sm border-r border-slate-600" colSpan={2}>
                  {t('reports.row_total')}
                </td>
                <td className="px-2 py-3 text-center text-sm border-r border-slate-600">
                  {formatRevenue(overallPlan)}
                </td>
                <td className="px-2 py-3 text-center text-sm border-r border-slate-600">
                  {formatRevenue(overallFact)}
                </td>
                <td className={`px-2 py-3 text-center text-sm border-r border-slate-600 ${
                  overallPlan > 0 && (overallFact / overallPlan * 100) >= 100 ? 'text-emerald-300' :
                  overallPlan > 0 && (overallFact / overallPlan * 100) >= 70 ? 'text-amber-300' : 'text-red-300'
                }`}>
                  {overallPlan > 0 ? `${(overallFact / overallPlan * 100).toFixed(0)}%` : '—'}
                </td>
                {WEEK_RANGES.map((week, wi) => {
                  const maxDay = Math.min(week.end, daysInMonth)
                  if (week.start > daysInMonth) return null
                  const cells = []

                  // Week plan (overall / weeks)
                  const activeWeeks = WEEK_RANGES.filter(w => w.start <= daysInMonth).length
                  const weekPlanRev = activeWeeks > 0 ? Math.round(overallPlan / activeWeeks) : 0
                  cells.push(
                    <td key={`owp_${wi}`} className="px-1 py-3 text-center text-xs border-r border-slate-600 text-slate-300">
                      {formatRevenue(weekPlanRev)}
                    </td>
                  )

                  for (let d = week.start; d <= maxDay; d++) {
                    let dayTotal = 0
                    managers.forEach(mgr => { dayTotal += getDayValue(mgr, 'revenue', d) })
                    cells.push(
                      <td key={`od_${d}`} className="px-1 py-3 text-center text-xs border-r border-slate-600 text-slate-300">
                        {dayTotal > 0 ? formatRevenue(dayTotal) : '—'}
                      </td>
                    )
                  }

                  let weekTotalRev = 0
                  managers.forEach(mgr => { weekTotalRev += getWeekTotal(mgr, 'revenue', week.start, week.end) })
                  cells.push(
                    <td key={`owt_${wi}`} className="px-1 py-3 text-center text-xs border-r border-slate-600 font-bold text-white">
                      {weekTotalRev > 0 ? formatRevenue(weekTotalRev) : '—'}
                    </td>
                  )
                  return cells
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Charts Section ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Sales Funnel */}
        <div className="glass-card rounded-2xl p-4 md:p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-600" />
            {t('reports.funnel_title')}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={funnelData} layout="vertical" margin={{ left: 20, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={90} />
              <Tooltip
                formatter={(val) => [val.toLocaleString('ru-RU'), '']}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {funnelData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Manager Comparison */}
        <div className="glass-card rounded-2xl p-4 md:p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Users size={16} className="text-blue-600" />
            {t('reports.manager_comparison')}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={managerComparisonData} margin={{ left: 0, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(val) => [val.toLocaleString('ru-RU'), '']}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey={t('reports.funnel_leads')} fill="#3b82f6" radius={[2, 2, 0, 0]} />
              <Bar dataKey={t('reports.funnel_conversations')} fill="#8b5cf6" radius={[2, 2, 0, 0]} />
              <Bar dataKey={t('reports.funnel_signups')} fill="#06b6d4" radius={[2, 2, 0, 0]} />
              <Bar dataKey={t('reports.funnel_visited')} fill="#f59e0b" radius={[2, 2, 0, 0]} />
              <Bar dataKey={t('reports.funnel_sales')} fill="#10b981" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Revenue by manager chart */}
      <div className="glass-card rounded-2xl p-4 md:p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <DollarSign size={16} className="text-blue-600" />
          {t('reports.revenue_by_manager')}
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart
            data={visibleManagers.map(mgr => ({
              name: mgr,
              'План': plans[mgr]?.revenue || 0,
              'Факт': getMonthlyFact(mgr, 'revenue'),
            }))}
            margin={{ left: 20, right: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatRevenue(v)} />
            <Tooltip
              formatter={(val) => [formatRevenueFullNumber(val) + ' ' + t('reports.sum'), '']}
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="План" fill="#93c5fd" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Факт" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ─── Plan Setup Modal ────────────────────────────────────────────── */}
      {planModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] md:max-w-3xl max-h-[90vh] overflow-y-auto m-4">
            <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Settings size={20} className="text-blue-600" />
                {t('reports.modal_plans_title')} — {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
              </h3>
              <button onClick={() => setPlanModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Overall plan */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">{t('reports.overall_revenue_plan')}</label>
                <input
                  type="number"
                  value={planForm.__overall__ || ''}
                  onChange={e => setPlanForm(f => ({ ...f, __overall__: Number(e.target.value) || 0 }))}
                  className="w-full border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="400000000"
                />
                <p className="text-xs text-slate-400 mt-1">{t('reports.current_label')} {formatRevenue(planForm.__overall__ || 0)}</p>
              </div>

              {/* Per-manager plans */}
              {managers.map(mgr => (
                <div key={mgr} className="border border-slate-200 rounded-xl p-4">
                  <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                      {mgr[0]}
                    </div>
                    {mgr}
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { key: 'leads', label: 'Заявки' },
                      { key: 'conversations', label: 'Разговоры' },
                      { key: 'signups', label: 'Записи' },
                      { key: 'visited', label: 'Пришедшие' },
                      { key: 'sales', label: 'Продажи' },
                      { key: 'revenue', label: 'Выручка' },
                    ].map(field => (
                      <div key={field.key}>
                        <label className="block text-xs text-slate-500 mb-1">{field.label}</label>
                        <input
                          type="number"
                          value={planForm[mgr]?.[field.key] ?? ''}
                          onChange={e => {
                            const val = Number(e.target.value) || 0
                            setPlanForm(f => ({
                              ...f,
                              [mgr]: { ...(f[mgr] || {}), [field.key]: val }
                            }))
                          }}
                          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {field.key === 'revenue' && planForm[mgr]?.[field.key] > 0 && (
                          <p className="text-xs text-slate-400 mt-0.5">{formatRevenue(planForm[mgr][field.key])}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-slate-100">
              <button
                onClick={() => setPlanModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                {t('reports.btn_cancel')}
              </button>
              <button
                onClick={savePlans}
                className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <Save size={16} /> {t('reports.btn_save_plans')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
