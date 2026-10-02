import { Fragment, useMemo, useState } from 'react'
import { Layers, ChevronDown, ChevronRight, ArrowUpRight, ArrowDownRight, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { branchKey } from '../utils/branchMatch'

// ─── Выручка по направлениям (курсам) ──────────────────────────────────────
// Admin-only breakdown of income payments by course for the selected month
// or the whole selected year, compared with the previous period. Respects
// the Finance page branch filter through the same attribution helpers the
// revenue card uses (manager's branch, split shares), so the total here
// always equals the "Факт выручки" card for the same period.

const NO_COURSE = 'Без направления'

const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/,/g, ' ')

function periodKeys(mode, year, month) {
  if (mode === 'year') return { cur: `${year}`, prev: `${year - 1}` }
  const pm = month === 1 ? 12 : month - 1
  const py = month === 1 ? year - 1 : year
  return {
    cur: `${year}-${String(month).padStart(2, '0')}`,
    prev: `${py}-${String(pm).padStart(2, '0')}`,
  }
}

export default function RevenueByCourse({
  payments, courses, branches, year, month, monthNames,
  countedSaleIds, branchFilter, matchesBranch, amountForBranch,
}) {
  const [mode, setMode] = useState('month') // 'month' | 'year'
  const [expanded, setExpanded] = useState(null)

  const { cur, prev } = periodKeys(mode, year, month)
  const periodLabel = mode === 'year' ? `${year} год` : `${monthNames[month - 1]} ${year}`
  const prevLabel = mode === 'year' ? `${year - 1}` : `${monthNames[(month + 10) % 12]}`

  const data = useMemo(() => {
    const iconByName = {}
    for (const c of courses || []) if (c?.name) iconByName[c.name.trim()] = c.icon || '📚'

    const inPeriod = (p, key) => p.type === 'income' && (p.date || '').startsWith(key)
      && (branchFilter === 'all' || matchesBranch(p, branchFilter))
    const amountOf = (p) => (branchFilter === 'all' ? Number(p.amount) || 0 : amountForBranch(p, branchFilter))
    const courseOf = (p) => (p.course || '').trim() || NO_COURSE
    const branchLabel = (ref) => {
      if (!ref) return '—'
      const doc = (branches || []).find(b => b.id === ref)
      if (doc?.name) return doc.name
      const key = branchKey(ref, branches)
      const byKey = (branches || []).find(b => branchKey(b.id, branches) === key)
      return byKey?.name || ref
    }

    const rows = {}
    const row = (name) => (rows[name] ||= {
      name, icon: iconByName[name] || (name === NO_COURSE ? '❔' : '📚'),
      revenue: 0, prevRevenue: 0, sales: 0, doplata: 0, payments: 0,
      students: new Set(), offline: 0, online: 0, byBranch: {},
    })

    for (const p of payments || []) {
      if (inPeriod(p, cur)) {
        const amt = amountOf(p)
        if (!amt) continue
        const r = row(courseOf(p))
        r.revenue += amt
        r.payments += 1
        if (countedSaleIds?.has(p.id)) r.sales += 1
        else r.doplata += amt
        if (p.studentId != null && p.studentId !== '') r.students.add(String(p.studentId))
        else if (p.student) r.students.add(`n:${p.student}`)
        if (p.learningFormat === 'Онлайн') r.online += amt
        else r.offline += amt
        const bl = branchLabel(p.branch)
        r.byBranch[bl] = (r.byBranch[bl] || 0) + amt
      } else if (inPeriod(p, prev)) {
        const amt = amountOf(p)
        if (amt) row(courseOf(p)).prevRevenue += amt
      }
    }

    const list = Object.values(rows)
      .filter(r => r.revenue > 0 || r.prevRevenue > 0)
      .map(r => ({ ...r, students: r.students.size }))
      .sort((a, b) => b.revenue - a.revenue || b.prevRevenue - a.prevRevenue)
    const total = list.reduce((s, r) => s + r.revenue, 0)
    const prevTotal = list.reduce((s, r) => s + r.prevRevenue, 0)
    return { list, total, prevTotal }
  }, [payments, courses, branches, cur, prev, branchFilter, matchesBranch, amountForBranch, countedSaleIds])

  const delta = (now, before) => (before > 0 ? Math.round((now - before) / before * 100) : null)
  const maxRevenue = Math.max(1, ...data.list.map(r => r.revenue))
  const totalDelta = delta(data.total, data.prevTotal)

  const exportXlsx = () => {
    const header = ['Направление', `Выручка (${periodLabel})`, 'Доля, %', 'Продаж', 'Доплаты/брони', 'Платежей', 'Учеников', 'Оффлайн', 'Онлайн', `Выручка (${prevLabel})`, 'Изменение, %']
    const body = data.list.map(r => [
      r.name, r.revenue, data.total ? +(r.revenue / data.total * 100).toFixed(1) : 0, r.sales, r.doplata,
      r.payments, r.students, r.offline, r.online, r.prevRevenue, delta(r.revenue, r.prevRevenue) ?? '',
    ])
    body.push(['Итого', data.total, 100, data.list.reduce((s, r) => s + r.sales, 0), data.list.reduce((s, r) => s + r.doplata, 0),
      data.list.reduce((s, r) => s + r.payments, 0), '', data.list.reduce((s, r) => s + r.offline, 0),
      data.list.reduce((s, r) => s + r.online, 0), data.prevTotal, totalDelta ?? ''])
    const ws = XLSX.utils.aoa_to_sheet([header, ...body])
    ws['!cols'] = header.map((h, i) => ({ wch: i === 0 ? 32 : 16 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'По направлениям')
    XLSX.writeFile(wb, `vyruchka_po_napravleniyam_${cur}.xlsx`)
  }

  return (
    <div className="glass-card rounded-2xl p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Layers size={20} className="text-indigo-600" />
          Выручка по направлениям
          <span className="text-sm font-normal text-slate-400">· {periodLabel}</span>
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {[['month', 'Месяц'], ['year', 'Год']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMode(k)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${mode === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {l}
              </button>
            ))}
          </div>
          <button type="button" onClick={exportXlsx} disabled={!data.list.length}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 flex items-center gap-1.5">
            <Download size={14} /> Excel
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-4">
        <span className="text-2xl font-extrabold text-slate-900">{fmt(data.total)} <span className="text-sm font-medium text-slate-400">сум</span></span>
        <span className="text-xs text-slate-500">
          {(() => { const n = data.list.filter(r => r.revenue > 0).length; return `${n} ${plural(n, 'направление', 'направления', 'направлений')}` })()} · {prevLabel}: {fmt(data.prevTotal)} сум
          {totalDelta !== null && (
            <span className={`ml-1 font-semibold ${totalDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {totalDelta >= 0 ? '+' : ''}{totalDelta}%
            </span>
          )}
        </span>
      </div>

      {data.list.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">За этот период оплат нет</p>
      ) : (
        <div className="overflow-x-auto -mx-4 md:mx-0">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-100">
                <th className="text-left font-medium py-2 px-3">Направление</th>
                <th className="text-right font-medium py-2 px-3">Выручка</th>
                <th className="text-left font-medium py-2 px-3 w-40">Доля</th>
                <th className="text-right font-medium py-2 px-3">Продаж</th>
                <th className="text-right font-medium py-2 px-3">Доплаты</th>
                <th className="text-right font-medium py-2 px-3">Учеников</th>
                <th className="text-right font-medium py-2 px-3" title={`Изменение к периоду: ${prevLabel}`}>Динамика</th>
              </tr>
            </thead>
            <tbody>
              {data.list.map(r => {
                const d = delta(r.revenue, r.prevRevenue)
                const share = data.total ? r.revenue / data.total * 100 : 0
                const open = expanded === r.name
                return (
                  <Fragment key={r.name}>
                    <tr onClick={() => setExpanded(open ? null : r.name)}
                      className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {open ? <ChevronDown size={14} className="text-slate-400 flex-shrink-0" /> : <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />}
                          <span className="flex-shrink-0">{r.icon}</span>
                          <span className="font-medium text-slate-800 truncate">{r.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-900 whitespace-nowrap">{fmt(r.revenue)}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${r.revenue / maxRevenue * 100}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 w-10 text-right">{share.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-700">{r.sales}</td>
                      <td className="py-2.5 px-3 text-right text-slate-500 whitespace-nowrap">{fmt(r.doplata)}</td>
                      <td className="py-2.5 px-3 text-right text-slate-700">{r.students}</td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {d === null
                          ? <span className="text-xs text-slate-400">{r.revenue > 0 ? 'новое' : '—'}</span>
                          : (
                            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${d >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {d >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                              {d >= 0 ? '+' : ''}{d}%
                            </span>
                          )}
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={7} className="px-3 py-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pl-6">
                            <div>
                              <p className="text-slate-500 font-medium mb-1.5">По филиалам</p>
                              {Object.entries(r.byBranch).sort(([, a], [, b]) => b - a).map(([b, v]) => (
                                <div key={b} className="flex justify-between gap-3 py-0.5">
                                  <span className="text-slate-600">{b}</span>
                                  <span className="font-medium text-slate-800">{fmt(v)}</span>
                                </div>
                              ))}
                            </div>
                            <div>
                              <p className="text-slate-500 font-medium mb-1.5">Формат</p>
                              <div className="flex justify-between gap-3 py-0.5"><span className="text-slate-600">Оффлайн</span><span className="font-medium text-slate-800">{fmt(r.offline)}</span></div>
                              <div className="flex justify-between gap-3 py-0.5"><span className="text-slate-600">Онлайн</span><span className="font-medium text-slate-800">{fmt(r.online)}</span></div>
                            </div>
                            <div>
                              <p className="text-slate-500 font-medium mb-1.5">Платежи</p>
                              <div className="flex justify-between gap-3 py-0.5"><span className="text-slate-600">Всего платежей</span><span className="font-medium text-slate-800">{r.payments}</span></div>
                              <div className="flex justify-between gap-3 py-0.5"><span className="text-slate-600">Средний платёж</span><span className="font-medium text-slate-800">{fmt(r.payments ? r.revenue / r.payments : 0)}</span></div>
                              <div className="flex justify-between gap-3 py-0.5"><span className="text-slate-600">{prevLabel}</span><span className="font-medium text-slate-800">{fmt(r.prevRevenue)}</span></div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
