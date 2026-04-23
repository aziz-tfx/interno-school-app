import { useState, useEffect, useRef } from 'react'
import {
  Zap, RefreshCw, Loader, AlertCircle, ChevronDown, ChevronRight,
  Target, TrendingUp, TrendingDown, Download, Trophy, Award, Medal, AlertTriangle, Minus,
} from 'lucide-react'
import { fetchAmoPerformanceV2 } from '../utils/amocrm'
import { db } from '../firebase'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { DEFAULT_TENANT_ID } from '../utils/tenancy'
import AmoPlanEditor from '../components/AmoPlanEditor'

const REFRESH_INTERVAL_MS = 60000

const METRIC_ROWS = [
  { key: 'leadsNew',      label: 'Кол-во заявок "Новая заявка"' },
  { key: 'leadsInWork',   label: 'Кол-во заявок "взято в работу"' },
  { key: 'convNewToWork', label: 'Конверсия из новых во взято в работу', type: 'pct', derived: true },
  { key: 'qualified',     label: 'Кол-во квалифицированных' },
  { key: 'trialAssigned', label: 'Кол-во ПУ назначено' },
  { key: 'convWorkToTrial', label: 'Конверсия из взято в ПУ назначено', type: 'pct', derived: true },
  { key: 'trialAttended', label: 'Кол-во ПУ проведено' },
  { key: 'convAssignedToAttended', label: 'Конверсия из ПУ назн в ПУ провед', type: 'pct', derived: true },
  { key: 'termsAgreed',   label: 'Кол-во "условия согласованы"' },
  { key: 'sales',         label: 'Кол-во продаж' },
  { key: 'convTrialToSale', label: 'Конверсия из ПУ провед в продажу', type: 'pct', derived: true },
  { key: 'convNewToSale', label: 'Конверсия из новых в продажу', type: 'pct', derived: true },
  { key: 'revenue',       label: 'ВЫРУЧКА', type: 'money' },
]

function currentMonthString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function prevMonthString(month) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function prevMonthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  const names = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  return names[d.getMonth()]
}
function delta(cur, prev) {
  if (!prev || prev === 0) return null
  return (cur - prev) / prev
}
function formatMoney(n) {
  if (!n) return '0'
  return new Intl.NumberFormat('ru-RU').format(Math.round(n))
}
function formatPct(v) {
  if (v == null || !isFinite(v)) return '—'
  return `${(v * 100).toFixed(1)}%`
}
function pctClass(v) {
  if (v == null || !isFinite(v)) return 'text-slate-400'
  if (v >= 0.9) return 'text-emerald-600 font-semibold'
  if (v >= 0.6) return 'text-amber-600'
  return 'text-red-600'
}
function DeltaPill({ value, inverse = false }) {
  if (value == null || !isFinite(value)) {
    return <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400"><Minus size={10} /> —</span>
  }
  const pct = Math.round(value * 100)
  const isZero = pct === 0
  const positive = inverse ? pct < 0 : pct > 0
  const color = isZero ? 'text-slate-400 bg-slate-100'
    : positive ? 'text-emerald-700 bg-emerald-50'
    : 'text-red-700 bg-red-50'
  const Icon = isZero ? Minus : (pct > 0 ? TrendingUp : TrendingDown)
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${color}`}>
      <Icon size={10} />
      {pct > 0 ? '+' : ''}{pct}%
    </span>
  )
}

function calcDerived(metrics) {
  const safe = (num, den) => (den > 0 ? num / den : null)
  return {
    ...metrics,
    convNewToWork: safe(metrics.leadsInWork, metrics.leadsNew),
    convWorkToTrial: safe(metrics.trialAssigned, metrics.leadsInWork),
    convAssignedToAttended: safe(metrics.trialAttended, metrics.trialAssigned),
    convTrialToSale: safe(metrics.sales, metrics.trialAttended),
    convNewToSale: safe(metrics.sales, metrics.leadsNew),
  }
}

export default function AmoPerformance() {
  const { user } = useAuth()
  const tenantId = user?.tenantId || DEFAULT_TENANT_ID

  const [month, setMonth] = useState(currentMonthString())
  const [data, setData] = useState(null)
  const [prevData, setPrevData] = useState(null)
  const [plan, setPlan] = useState({ managers: {}, workingDays: 26 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastFetched, setLastFetched] = useState(null)
  const [nowTick, setNowTick] = useState(Date.now())
  const [expanded, setExpanded] = useState({})
  const [showPlanEditor, setShowPlanEditor] = useState(false)
  const refreshRef = useRef(null)

  const loadPlan = async () => {
    try {
      const snap = await getDoc(doc(db, 'amoPlans', `${tenantId}_${month}`))
      if (snap.exists()) {
        const d = snap.data()
        setPlan({ managers: d.managers || {}, workingDays: d.workingDays || 26 })
      } else {
        setPlan({ managers: {}, workingDays: 26 })
      }
    } catch (e) {
      console.warn('plan load failed:', e)
    }
  }

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    const [res, prevRes] = await Promise.all([
      fetchAmoPerformanceV2({ month }),
      fetchAmoPerformanceV2({ month: prevMonthString(month) }),
    ])
    if (res.success) {
      setData(res)
      setLastFetched(new Date())
    } else {
      setError(res.error || 'Ошибка')
    }
    if (prevRes?.success) setPrevData(prevRes)
    else setPrevData(null)
    setLoading(false)
  }

  useEffect(() => {
    loadPlan()
    loadData()
    if (refreshRef.current) clearInterval(refreshRef.current)
    refreshRef.current = setInterval(() => loadData(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(refreshRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const toggleExpand = (uid) => setExpanded(prev => ({ ...prev, [uid]: !prev[uid] }))

  const forecast = (fact) => {
    const passed = data?.meta?.workingDaysPassed || 1
    const total = plan.workingDays || data?.meta?.workingDaysTotal || 26
    return Math.round((fact / passed) * total)
  }

  const currentWeekNumber = () => {
    const d = new Date()
    const [y, m] = month.split('-').map(Number)
    if (d.getFullYear() !== y || d.getMonth() !== m - 1) return 1
    return Math.min(5, Math.ceil(d.getDate() / 7))
  }

  const weekDays = (weekNum, daysInMonth) => {
    const start = (weekNum - 1) * 7 + 1
    const end = Math.min(weekNum * 7, daysInMonth)
    return { start, end }
  }

  const sumDaily = (daily, startDay, endDay) => {
    const sum = { leadsNew: 0, leadsInWork: 0, qualified: 0, trialAssigned: 0, trialAttended: 0, termsAgreed: 0, sales: 0, revenue: 0, salesMainWon: 0, revenueMainWon: 0, salesPostpayment: 0, revenuePostpayment: 0 }
    for (let d = startDay; d <= endDay; d++) {
      const day = daily?.[d]
      if (!day) continue
      for (const k of Object.keys(sum)) sum[k] += day[k] || 0
    }
    return sum
  }

  const exportCsv = () => {
    if (!data) return
    const daysInMonth = data.meta.daysInMonth
    const headers = ['Менеджер', 'Показатель', 'План', 'Факт', '% вып', 'Прогноз', 'План недели', 'Факт недели', '% недели', 'На день']
    for (let d = 1; d <= daysInMonth; d++) headers.push(`${String(d).padStart(2, '0')}.${month.split('-')[1]}`)
    const lines = [headers.join(';')]
    const usersSorted = Object.values(data.byUser).sort((a, b) => b.metrics.revenue - a.metrics.revenue)
    for (const u of usersSorted) {
      const fact = calcDerived(u.metrics)
      const managerPlan = plan.managers[u.userId] || {}
      const wkNum = currentWeekNumber()
      const { start, end } = weekDays(wkNum, daysInMonth)
      const weekFact = calcDerived(sumDaily(u.daily, start, end))
      for (const row of METRIC_ROWS) {
        if (row.derived) continue
        const planVal = managerPlan[row.key] || 0
        const factVal = fact[row.key] || 0
        const completion = planVal > 0 ? factVal / planVal : 0
        const forecastVal = forecast(factVal)
        const weekPlan = Math.round(planVal / 4)
        const weekFactVal = weekFact[row.key] || 0
        const weekCompletion = weekPlan > 0 ? weekFactVal / weekPlan : 0
        const perDay = Math.round(planVal / (plan.workingDays || 26))
        const line = [
          u.userName, row.label, planVal, factVal,
          `${(completion * 100).toFixed(1)}%`, forecastVal,
          weekPlan, weekFactVal, `${(weekCompletion * 100).toFixed(1)}%`, perDay,
        ]
        for (let d = 1; d <= daysInMonth; d++) line.push(u.daily?.[d]?.[row.key] || 0)
        lines.push(line.join(';'))
      }
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `amo-performance-${month}.csv`
    link.click()
  }

  const lastFetchedAgo = lastFetched ? Math.floor((nowTick - lastFetched.getTime()) / 1000) : null
  const usersSorted = data ? Object.values(data.byUser).sort((a, b) => b.metrics.revenue - a.metrics.revenue) : []

  // Для MoM — снапшот прошлого месяца по userId
  const prevByUser = prevData?.byUser || {}
  const prevTotals = prevData?.totals?.metrics || null

  // Строим leaderboard: rank по % выполнения плана выручки (или по выручке, если плана нет)
  const leaderboardEntries = usersSorted.map(u => {
    const managerPlan = plan.managers[u.userId] || {}
    const revPlan = managerPlan.revenue || 0
    const revFact = u.metrics.revenue || 0
    const completion = revPlan > 0 ? revFact / revPlan : null
    const prevRev = prevByUser[u.userId]?.metrics?.revenue || 0
    const revDelta = delta(revFact, prevRev)
    const salesFact = u.metrics.sales || 0
    const salesPlan = managerPlan.sales || 0
    const salesCompletion = salesPlan > 0 ? salesFact / salesPlan : null
    return {
      user: u,
      completion,
      revFact,
      revPlan,
      revDelta,
      salesFact,
      salesPlan,
      salesCompletion,
    }
  })
  // Сортировка: с планом — по %выполнения, без плана — по выручке
  const sortedByCompletion = [...leaderboardEntries].sort((a, b) => {
    const av = a.completion ?? -1
    const bv = b.completion ?? -1
    if (av !== bv) return bv - av
    return b.revFact - a.revFact
  })
  const top3 = sortedByCompletion.slice(0, 3)
  const laggards = sortedByCompletion.filter(e => e.completion != null && e.completion < 0.6).slice(-3)

  const totalDeltaRev = prevTotals ? delta(data?.totals?.metrics?.revenue || 0, prevTotals.revenue) : null
  const totalDeltaSales = prevTotals ? delta(data?.totals?.metrics?.sales || 0, prevTotals.sales) : null
  const totalDeltaLeads = prevTotals ? delta(data?.totals?.metrics?.leadsNew || 0, prevTotals.leadsNew) : null
  const totalDeltaTrial = prevTotals ? delta(data?.totals?.metrics?.trialAttended || 0, prevTotals.trialAttended) : null
  const stages = data?.stages || {}
  const unmappedStages = []
  for (const [k, label] of [
    ['new_lead', '"Новая заявка"'],
    ['in_work', '"Взяли в работу"'],
    ['trial_assigned', '"Назначен открытый урок"'],
    ['trial_attended', '"Посетил открытый урок"'],
    ['terms_agreed', '"Условия согласованы"'],
  ]) {
    if (data && !stages[k]) unmappedStages.push(label)
  }

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center">
            <Zap size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">amoCRM эффективность</h1>
            <p className="text-xs text-slate-500">Воронка отдела продаж · {data?.pipeline?.name || '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={() => setShowPlanEditor(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            <Target size={14} /> План
          </button>
          <button onClick={() => loadData()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Обновить
          </button>
          <button onClick={exportCsv} disabled={!data}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3 text-xs flex-wrap">
        <span className="flex items-center gap-1.5 text-emerald-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Live · автообновление каждые 60 сек
        </span>
        {lastFetchedAgo != null && <span className="text-slate-500">обновлено {lastFetchedAgo} сек назад</span>}
        {data?.meta && (
          <span className="text-slate-500">· {data.meta.fetchedLeads} сделок · раб. день {data.meta.workingDaysPassed}/{plan.workingDays || data.meta.workingDaysTotal}</span>
        )}
      </div>

      {data && unmappedStages.length > 0 && (
        <div className="mb-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Не удалось автоопределить этапы:</p>
            <p className="mt-0.5">{unmappedStages.join(', ')}. Проверьте названия в amoCRM — они должны содержать ключевые слова: «Новая заявка», «Взяли в работу», «Назначен урок», «Посетил урок», «Условия согласованы».</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <p className="font-medium">Ошибка загрузки</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {loading && !data && (
        <div className="py-16 flex items-center justify-center text-slate-400">
          <Loader size={24} className="animate-spin" />
        </div>
      )}

      {data && usersSorted.length === 0 && (
        <div className="py-12 text-center text-slate-400 text-sm">Нет сделок за выбранный период</div>
      )}

      {/* ── Leaderboard: топ-3 + отстающие ────────────────────────────── */}
      {data && usersSorted.length > 0 && (
        <div className="mb-5 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Топ-3 */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={16} className="text-amber-600" />
              <h3 className="text-sm font-bold text-amber-900">Топ-3 по выполнению плана</h3>
            </div>
            <div className="space-y-2">
              {top3.length === 0 && (
                <p className="text-xs text-slate-500 py-2">Нет данных</p>
              )}
              {top3.map((e, idx) => {
                const ranks = [
                  { icon: Trophy, color: 'text-amber-500', bg: 'bg-amber-100', emoji: '🥇' },
                  { icon: Award, color: 'text-slate-500', bg: 'bg-slate-100', emoji: '🥈' },
                  { icon: Medal, color: 'text-orange-500', bg: 'bg-orange-100', emoji: '🥉' },
                ][idx]
                return (
                  <div key={e.user.userId} className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-amber-100">
                    <div className={`w-8 h-8 rounded-lg ${ranks.bg} flex items-center justify-center text-lg flex-shrink-0`}>
                      {ranks.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{e.user.userName}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="text-[11px] text-slate-500">
                          {formatMoney(e.revFact)} ₽
                        </span>
                        <DeltaPill value={e.revDelta} />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {e.completion != null ? (
                        <>
                          <p className={`text-sm font-bold ${pctClass(e.completion)}`}>{formatPct(e.completion)}</p>
                          <p className="text-[10px] text-slate-400">{e.salesFact}/{e.salesPlan} продаж</p>
                        </>
                      ) : (
                        <p className="text-[10px] text-slate-400">план не задан</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Отстающие */}
          <div className={`rounded-2xl p-4 border ${laggards.length > 0 ? 'bg-red-50/50 border-red-200' : 'bg-emerald-50/50 border-emerald-200'}`}>
            <div className="flex items-center gap-2 mb-3">
              {laggards.length > 0 ? (
                <>
                  <AlertTriangle size={16} className="text-red-600" />
                  <h3 className="text-sm font-bold text-red-900">Требуют внимания (&lt;60% плана)</h3>
                </>
              ) : (
                <>
                  <Trophy size={16} className="text-emerald-600" />
                  <h3 className="text-sm font-bold text-emerald-900">Все менеджеры в графике 🎉</h3>
                </>
              )}
            </div>
            <div className="space-y-2">
              {laggards.length === 0 ? (
                <p className="text-xs text-emerald-700 py-2">Никто не отстаёт ниже 60% — отличный темп!</p>
              ) : laggards.map(e => (
                <div key={e.user.userId} className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-red-100">
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle size={14} className="text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{e.user.userName}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="text-[11px] text-slate-500">{formatMoney(e.revFact)} / {formatMoney(e.revPlan)} ₽</span>
                      <DeltaPill value={e.revDelta} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${pctClass(e.completion)}`}>{formatPct(e.completion)}</p>
                    <p className="text-[10px] text-slate-400">{e.salesFact}/{e.salesPlan} продаж</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {data && usersSorted.map(u => {
        const fact = calcDerived(u.metrics)
        const managerPlan = plan.managers[u.userId] || {}
        const planDerived = calcDerived(managerPlan)
        const wkNum = currentWeekNumber()
        const { start: weekStart, end: weekEnd } = weekDays(wkNum, data.meta.daysInMonth)
        const weekFact = calcDerived(sumDaily(u.daily, weekStart, weekEnd))
        const isOpen = expanded[u.userId] ?? true

        return (
          <div key={u.userId} className="mb-4 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <button onClick={() => toggleExpand(u.userId)}
              className="w-full flex items-center justify-between px-5 py-3 bg-gradient-to-r from-slate-50 to-white hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                {isOpen ? <ChevronDown size={18} className="text-slate-500" /> : <ChevronRight size={18} className="text-slate-500" />}
                <div className="text-left">
                  <p className="font-semibold text-slate-900">{u.userName}</p>
                  <p className="text-xs text-slate-500">{u.email || ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right">
                  <p className="text-xs text-slate-500">Продажи</p>
                  <div className="flex items-center justify-end gap-1.5">
                    <p className="font-semibold text-slate-900">{fact.sales} / {managerPlan.sales || 0}</p>
                    <DeltaPill value={delta(fact.sales, prevByUser[u.userId]?.metrics?.sales || 0)} />
                  </div>
                  {(fact.salesPostpayment > 0) && (
                    <p className="text-[10px] text-slate-400">осн {fact.salesMainWon} + постопл {fact.salesPostpayment}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Выручка</p>
                  <div className="flex items-center justify-end gap-1.5">
                    <p className="font-semibold text-slate-900">{formatMoney(fact.revenue)}</p>
                    <DeltaPill value={delta(fact.revenue, prevByUser[u.userId]?.metrics?.revenue || 0)} />
                  </div>
                  {(fact.revenuePostpayment > 0) && (
                    <p className="text-[10px] text-slate-400">осн {formatMoney(fact.revenueMainWon)} + постопл {formatMoney(fact.revenuePostpayment)}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Конв. в продажу</p>
                  <p className={`font-semibold ${pctClass(fact.convNewToSale)}`}>{formatPct(fact.convNewToSale)}</p>
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-100">
                        <th className="text-left px-2 py-2 font-medium sticky left-0 bg-white min-w-[260px]">Показатель</th>
                        <th className="text-right px-2 py-2 font-medium">План</th>
                        <th className="text-right px-2 py-2 font-medium">Факт</th>
                        <th className="text-right px-2 py-2 font-medium">% вып</th>
                        <th className="text-right px-2 py-2 font-medium">Прогноз</th>
                        <th className="text-right px-2 py-2 font-medium border-l border-slate-100 pl-3">План недели</th>
                        <th className="text-right px-2 py-2 font-medium">Факт недели</th>
                        <th className="text-right px-2 py-2 font-medium">% недели</th>
                        <th className="text-right px-2 py-2 font-medium">На день</th>
                      </tr>
                    </thead>
                    <tbody>
                      {METRIC_ROWS.map(row => {
                        const planVal = row.derived ? planDerived[row.key] : (managerPlan[row.key] || 0)
                        const factVal = fact[row.key]
                        const weekFactVal = weekFact[row.key]
                        const isPercent = row.type === 'pct'
                        const isMoney = row.type === 'money'
                        const completion = !row.derived && planVal > 0 ? factVal / planVal : null
                        const weekPlan = !row.derived ? Math.round((managerPlan[row.key] || 0) / 4) : null
                        const weekCompletion = weekPlan > 0 ? weekFactVal / weekPlan : null
                        const perDay = !row.derived ? ((managerPlan[row.key] || 0) / (plan.workingDays || 26)) : null
                        const fv = (v) => isPercent ? formatPct(v) : isMoney ? formatMoney(v) : (v == null ? '—' : new Intl.NumberFormat('ru-RU').format(v))

                        return (
                          <tr key={row.key} className={`border-b border-slate-50 ${row.derived ? 'bg-slate-50/40' : 'hover:bg-slate-50/40'}`}>
                            <td className={`text-left px-2 py-2 sticky left-0 bg-white ${row.derived ? 'text-slate-500 italic pl-4' : 'text-slate-700 font-medium'}`}>
                              {row.label}
                            </td>
                            <td className="text-right px-2 py-2 text-slate-500">{fv(planVal)}</td>
                            <td className="text-right px-2 py-2 font-semibold text-slate-900">{fv(factVal)}</td>
                            <td className={`text-right px-2 py-2 ${completion != null ? pctClass(completion) : 'text-slate-400'}`}>
                              {row.derived ? '—' : completion != null ? formatPct(completion) : '—'}
                            </td>
                            <td className="text-right px-2 py-2 text-blue-600">
                              {row.derived ? '—' : fv(forecast(factVal))}
                            </td>
                            <td className="text-right px-2 py-2 text-slate-500 border-l border-slate-100 pl-3">
                              {row.derived ? '—' : weekPlan != null ? new Intl.NumberFormat('ru-RU').format(weekPlan) : '—'}
                            </td>
                            <td className="text-right px-2 py-2 font-medium text-slate-800">{fv(weekFactVal)}</td>
                            <td className={`text-right px-2 py-2 ${weekCompletion != null ? pctClass(weekCompletion) : 'text-slate-400'}`}>
                              {row.derived ? '—' : weekCompletion != null ? formatPct(weekCompletion) : '—'}
                            </td>
                            <td className="text-right px-2 py-2 text-slate-500">
                              {row.derived ? '—' : perDay != null ? (isMoney ? formatMoney(perDay) : Math.round(perDay)) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <details className="mt-4 border-t border-slate-100 pt-3">
                  <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
                    <TrendingUp size={12} /> Разбивка по дням
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="text-xs">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="sticky left-0 bg-slate-50 text-left px-2 py-1.5 font-medium text-slate-500 min-w-[200px]">Показатель</th>
                          {Array.from({ length: data.meta.daysInMonth }, (_, i) => i + 1).map(d => {
                            const today = new Date()
                            const [yr, mo] = month.split('-').map(Number)
                            const isToday = today.getDate() === d && today.getFullYear() === yr && today.getMonth() === mo - 1
                            const dow = new Date(yr, mo - 1, d).getDay()
                            const isWeekend = dow === 0
                            return (
                              <th key={d} className={`px-1.5 py-1.5 text-center font-medium min-w-[32px] ${
                                isToday ? 'bg-blue-100 text-blue-900' : isWeekend ? 'text-slate-300' : 'text-slate-500'
                              }`}>{d}</th>
                            )
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {METRIC_ROWS.filter(r => !r.derived).map(row => (
                          <tr key={row.key} className="border-b border-slate-50">
                            <td className="sticky left-0 bg-white text-left px-2 py-1.5 text-slate-700 font-medium">{row.label}</td>
                            {Array.from({ length: data.meta.daysInMonth }, (_, i) => i + 1).map(d => {
                              const val = u.daily?.[d]?.[row.key] || 0
                              return (
                                <td key={d} className={`px-1.5 py-1.5 text-center ${val > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                                  {val > 0 ? (row.type === 'money' ? formatMoney(val) : val) : '·'}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            )}
          </div>
        )
      })}

      {data && usersSorted.length > 0 && (
        <div className="mt-6 p-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-400 uppercase tracking-wider">Итоги команды</p>
            {prevData && (
              <p className="text-[10px] text-slate-500">vs {prevMonthLabel(month)}</p>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-slate-400">Всего заявок</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-2xl font-bold">{data.totals.metrics.leadsNew}</p>
                <DeltaPill value={totalDeltaLeads} />
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-400">ПУ проведено</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-2xl font-bold">{data.totals.metrics.trialAttended}</p>
                <DeltaPill value={totalDeltaTrial} />
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-400">Продаж</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-2xl font-bold">{data.totals.metrics.sales}</p>
                <DeltaPill value={totalDeltaSales} />
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-400">Выручка</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-2xl font-bold">{formatMoney(data.totals.metrics.revenue)}</p>
                <DeltaPill value={totalDeltaRev} />
              </div>
            </div>
          </div>
        </div>
      )}

      <AmoPlanEditor
        isOpen={showPlanEditor}
        onClose={() => setShowPlanEditor(false)}
        month={month}
        users={data?.users || []}
        onSaved={(managers, workingDays) => setPlan({ managers, workingDays })}
      />
    </div>
  )
}
