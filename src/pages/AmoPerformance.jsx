import { useEffect, useMemo, useState } from 'react'
import {
  Zap, RefreshCw, TrendingUp, TrendingDown, Users, Trophy,
  DollarSign, Clock, Target, Download, AlertCircle,
} from 'lucide-react'
import { fetchAmoPerformance } from '../utils/amocrm'

// ─── Helpers ────────────────────────────────────────────────────────────────

function toYMD(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getPreset(preset) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (preset === 'today') {
    return { from: toYMD(today), to: toYMD(today) }
  }
  if (preset === 'week') {
    const from = new Date(today); from.setDate(today.getDate() - 6)
    return { from: toYMD(from), to: toYMD(today) }
  }
  if (preset === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1)
    return { from: toYMD(from), to: toYMD(today) }
  }
  if (preset === 'prev_month') {
    const from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const to = new Date(today.getFullYear(), today.getMonth(), 0)
    return { from: toYMD(from), to: toYMD(to) }
  }
  if (preset === 'quarter') {
    const from = new Date(today); from.setDate(today.getDate() - 89)
    return { from: toYMD(from), to: toYMD(today) }
  }
  return { from: toYMD(today), to: toYMD(today) }
}

function fmtMoney(n) {
  if (!n) return '0'
  return new Intl.NumberFormat('ru-RU').format(Math.round(n))
}

function fmtPct(n) {
  return `${(n * 100).toFixed(1)}%`
}

function fmtRelative(iso) {
  if (!iso) return '—'
  const dt = new Date(iso)
  const diff = (Date.now() - dt.getTime()) / 1000
  if (diff < 60) return 'только что'
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} дн назад`
  return dt.toLocaleDateString('ru-RU')
}

function toCSV(rows) {
  const header = ['Менеджер', 'Всего лидов', 'Открытые', 'Выиграно', 'Проиграно', 'Конверсия %', 'Средний цикл (дни)', 'Выручка', 'Последняя активность']
  const lines = [header.join(';')]
  for (const r of rows) {
    lines.push([
      `"${(r.userName || '').replace(/"/g, '""')}"`,
      r.total, r.open, r.won, r.lost,
      (r.conversion * 100).toFixed(1),
      r.avgCycleDays,
      r.wonSum,
      r.lastActivityAt || '',
    ].join(';'))
  }
  return lines.join('\n')
}

// ─── Components ─────────────────────────────────────────────────────────────

function KPICard({ icon: Icon, label, value, sub, tone = 'blue' }) {
  const tones = {
    blue: 'from-blue-500/15 to-blue-600/10 text-blue-700 border-blue-200',
    green: 'from-emerald-500/15 to-emerald-600/10 text-emerald-700 border-emerald-200',
    red: 'from-rose-500/15 to-rose-600/10 text-rose-700 border-rose-200',
    amber: 'from-amber-500/15 to-amber-600/10 text-amber-700 border-amber-200',
    violet: 'from-violet-500/15 to-violet-600/10 text-violet-700 border-violet-200',
    slate: 'from-slate-500/15 to-slate-600/10 text-slate-700 border-slate-200',
  }
  return (
    <div className={`rounded-2xl p-4 border bg-gradient-to-br ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-xs font-medium opacity-80">
        <Icon size={14} /> {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function AmoPerformance() {
  const [preset, setPreset] = useState('month')
  const [range, setRange] = useState(() => getPreset('month'))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [sortBy, setSortBy] = useState('wonSum')
  const [sortDir, setSortDir] = useState('desc')

  const load = async (r = range) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchAmoPerformance(r)
      if (!res.success) {
        setError(res.error + (res.details ? ` — ${res.details}` : ''))
        setData(null)
      } else {
        setData(res)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyPreset = (p) => {
    setPreset(p)
    const r = getPreset(p)
    setRange(r)
    load(r)
  }

  const applyCustom = () => {
    setPreset('custom')
    load(range)
  }

  const rows = useMemo(() => {
    if (!data?.byUser) return []
    const arr = Object.values(data.byUser)
    arr.sort((a, b) => {
      const av = a[sortBy] ?? 0
      const bv = b[sortBy] ?? 0
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return arr
  }, [data, sortBy, sortDir])

  const toggleSort = (key) => {
    if (sortBy === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(key)
      setSortDir('desc')
    }
  }

  const exportCSV = () => {
    if (!rows.length) return
    const csv = toCSV(rows)
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `amo-performance-${range.from}_${range.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totals = data?.totals
  const leaders = useMemo(() => {
    if (!rows.length) return null
    const byRev = [...rows].filter(r => r.wonSum > 0).sort((a, b) => b.wonSum - a.wonSum)[0]
    const byConv = [...rows].filter(r => (r.won + r.lost) >= 3).sort((a, b) => b.conversion - a.conversion)[0]
    const byVol = [...rows].sort((a, b) => b.total - a.total)[0]
    return { byRev, byConv, byVol }
  }, [rows])

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-white shadow-lg">
            <Zap size={22} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Эффективность менеджеров · amoCRM</h1>
            <p className="text-xs md:text-sm text-slate-500">Сводка по сделкам, конверсии и выручке за период</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(range)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Обновить
          </button>
          <button
            onClick={exportCSV}
            disabled={!rows.length}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50"
          >
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200">
        <div className="flex flex-wrap gap-2 items-center">
          {[
            { k: 'today', l: 'Сегодня' },
            { k: 'week', l: 'Неделя' },
            { k: 'month', l: 'Месяц' },
            { k: 'prev_month', l: 'Прошлый месяц' },
            { k: 'quarter', l: '90 дней' },
          ].map(p => (
            <button
              key={p.k}
              onClick={() => applyPreset(p.k)}
              className={`px-3 py-1.5 text-sm rounded-xl border transition ${
                preset === p.k
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {p.l}
            </button>
          ))}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={range.from}
              onChange={e => setRange({ ...range, from: e.target.value })}
              className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
            />
            <span className="text-slate-400">—</span>
            <input
              type="date"
              value={range.to}
              onChange={e => setRange({ ...range, to: e.target.value })}
              className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
            />
            <button
              onClick={applyCustom}
              className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              Применить
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl">
          <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />
          <div>
            <div className="text-sm font-semibold text-rose-900">Не удалось загрузить данные из amoCRM</div>
            <div className="text-xs text-rose-700 mt-1 break-all">{error}</div>
            <div className="text-xs text-slate-500 mt-2">
              Проверьте переменные <code className="px-1 bg-white rounded">AMO_SUBDOMAIN</code> и{' '}
              <code className="px-1 bg-white rounded">AMO_ACCESS_TOKEN</code> в настройках Vercel.
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KPICard icon={Users} tone="blue" label="Всего лидов" value={totals.total} sub={`фетч: ${data.meta.fetchedLeads}`} />
          <KPICard icon={Clock} tone="slate" label="В работе" value={totals.open} />
          <KPICard icon={TrendingUp} tone="green" label="Выиграно" value={totals.won} />
          <KPICard icon={TrendingDown} tone="red" label="Проиграно" value={totals.lost} />
          <KPICard icon={Target} tone="violet" label="Конверсия" value={fmtPct(totals.conversion)} sub={`цикл ~${totals.avgCycleDays} дн`} />
          <KPICard icon={DollarSign} tone="amber" label="Выручка" value={fmtMoney(totals.wonSum)} sub="сум выигранных" />
        </div>
      )}

      {/* Leaders */}
      {leaders && (leaders.byRev || leaders.byConv || leaders.byVol) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {leaders.byRev && (
            <div className="bg-white rounded-2xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 text-xs font-medium text-amber-600"><Trophy size={14} /> Лидер по выручке</div>
              <div className="mt-2 text-lg font-bold text-slate-900 truncate">{leaders.byRev.userName}</div>
              <div className="text-sm text-slate-500">{fmtMoney(leaders.byRev.wonSum)} · {leaders.byRev.won} сделок</div>
            </div>
          )}
          {leaders.byConv && (
            <div className="bg-white rounded-2xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 text-xs font-medium text-violet-600"><Target size={14} /> Лучшая конверсия</div>
              <div className="mt-2 text-lg font-bold text-slate-900 truncate">{leaders.byConv.userName}</div>
              <div className="text-sm text-slate-500">{fmtPct(leaders.byConv.conversion)} · {leaders.byConv.won}/{leaders.byConv.won + leaders.byConv.lost}</div>
            </div>
          )}
          {leaders.byVol && (
            <div className="bg-white rounded-2xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 text-xs font-medium text-blue-600"><Users size={14} /> Больше всего лидов</div>
              <div className="mt-2 text-lg font-bold text-slate-900 truncate">{leaders.byVol.userName}</div>
              <div className="text-sm text-slate-500">{leaders.byVol.total} лидов в работе</div>
            </div>
          )}
        </div>
      )}

      {/* Managers table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Менеджеры</h2>
          <span className="text-xs text-slate-500">{rows.length} пользователей</span>
        </div>

        {loading && !data && (
          <div className="p-10 text-center text-sm text-slate-500">Загрузка из amoCRM…</div>
        )}

        {!loading && !rows.length && !error && (
          <div className="p-10 text-center text-sm text-slate-500">Нет данных за выбранный период</div>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {[
                    ['userName', 'Менеджер', 'left'],
                    ['total', 'Лиды', 'right'],
                    ['open', 'В работе', 'right'],
                    ['won', 'Выигр.', 'right'],
                    ['lost', 'Проигр.', 'right'],
                    ['conversion', 'Конв.', 'right'],
                    ['avgCycleDays', 'Ср. цикл', 'right'],
                    ['wonSum', 'Выручка', 'right'],
                    ['lastActivityAt', 'Активность', 'right'],
                  ].map(([key, label, align]) => (
                    <th
                      key={key}
                      onClick={() => toggleSort(key)}
                      className={`px-3 py-2.5 text-xs font-medium cursor-pointer hover:bg-slate-100 select-none text-${align}`}
                    >
                      {label}{sortBy === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(r => (
                  <tr key={r.userId} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 font-medium text-slate-900">{r.userName}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.total}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{r.open}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 font-medium">{r.won}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-rose-700">{r.lost}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${
                        r.conversion >= 0.4 ? 'bg-emerald-100 text-emerald-800' :
                        r.conversion >= 0.2 ? 'bg-amber-100 text-amber-800' :
                        (r.won + r.lost) > 0 ? 'bg-rose-100 text-rose-800' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {(r.won + r.lost) > 0 ? fmtPct(r.conversion) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{r.avgCycleDays || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-900">{fmtMoney(r.wonSum)}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-slate-500">{fmtRelative(r.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data?.meta && (
        <div className="text-xs text-slate-400 text-center">
          Период: {data.meta.from} — {data.meta.to} · лидов получено: {data.meta.fetchedLeads}
        </div>
      )}
    </div>
  )
}
