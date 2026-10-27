// Funnel report for leads created in a period: how far they got, conversion,
// how fast managers answered, and the same per manager.

import { useState, useEffect, useMemo } from 'react'
import { Loader, Inbox, Trophy, Percent, Wallet, Timer, AlertCircle } from 'lucide-react'
import { crm, formatSum } from '../../backend/crm'
import { toast } from '../Toaster'

const ymd = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

function presetRange(id) {
  const now = new Date()
  if (id === 'month') return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), ymd(now)]
  if (id === 'prev') return [ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), ymd(new Date(now.getFullYear(), now.getMonth(), 0))]
  const days = id === '7' ? 6 : 29
  return [ymd(new Date(now.getTime() - days * 86400000)), ymd(now)]
}

const PRESETS = [['month', 'Этот месяц'], ['prev', 'Прошлый месяц'], ['7', '7 дней'], ['30', '30 дней']]

const minutes = (m) => {
  if (m === null || m === undefined) return '—'
  if (m < 60) return `${Math.round(m)} мин`
  if (m < 1440) return `${(m / 60).toFixed(1)} ч`
  return `${(m / 1440).toFixed(1)} дн`
}

export default function CrmAnalytics({ pipeline, people }) {
  const [preset, setPreset] = useState('month')
  const [range, setRange] = useState(() => presetRange('month'))
  const [report, setReport] = useState(null)

  useEffect(() => {
    let stop = false
    setReport(null)
    crm.funnel({ pipelineId: pipeline.id, from: range[0], to: range[1] })
      .then(r => { if (!stop) setReport(r) })
      .catch(err => { toast(err.message, 'error'); if (!stop) setReport({ error: true }) })
    return () => { stop = true }
  }, [pipeline.id, range[0], range[1]])

  const choose = (id) => { setPreset(id); setRange(presetRange(id)) }
  const maxReached = useMemo(() => Math.max(1, ...(report?.stages || []).map(s => s.reached)), [report])

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-3 md:p-4 flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 bg-white/50 rounded-xl p-1 flex-wrap">
          {PRESETS.map(([id, label]) => (
            <button key={id} onClick={() => choose(id)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${preset === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input type="date" value={range[0]} onChange={e => { setPreset(''); setRange([e.target.value, range[1]]) }}
            className="bg-white/50 rounded-xl px-3 py-1.5 border border-slate-200" />
          <span className="text-slate-400">—</span>
          <input type="date" value={range[1]} onChange={e => { setPreset(''); setRange([range[0], e.target.value]) }}
            className="bg-white/50 rounded-xl px-3 py-1.5 border border-slate-200" />
        </div>
      </div>

      {!report ? (
        <div className="flex items-center justify-center py-16"><Loader size={22} className="animate-spin text-slate-400" /></div>
      ) : report.error ? null : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Stat icon={Inbox} label="Новых заявок" value={report.totals.created} />
            <Stat icon={Trophy} label="Продаж" value={report.totals.won} tone="emerald" />
            <Stat icon={Percent} label="Конверсия" value={`${report.totals.conversion}%`} tone="indigo" />
            <Stat icon={Wallet} label="Сумма продаж" value={formatSum(report.totals.wonAmount)} tone="emerald" />
            <Stat icon={Timer} label="Медиана ответа" hint="по входящим заявкам" value={minutes(report.totals.medianResponseMin)} />
            <Stat icon={AlertCircle} label="Без ответа" hint="входящие, ещё в работе" value={report.totals.noResponse} tone={report.totals.noResponse ? 'red' : 'slate'} />
          </div>

          <div className="glass-card rounded-2xl p-4 md:p-5">
            <p className="text-sm font-semibold text-slate-800 mb-1">Воронка</p>
            <p className="text-xs text-slate-400 mb-4">Сколько заявок за период дошли до каждого этапа (или дальше)</p>
            <div className="space-y-2.5">
              {report.stages.map(s => (
                <div key={s.id} className="grid grid-cols-[minmax(110px,180px)_1fr_auto] items-center gap-3">
                  <span className="text-sm text-slate-600 truncate">{s.name}</span>
                  <div className="h-7 bg-slate-100/80 rounded-lg overflow-hidden">
                    <div className="h-full rounded-lg transition-all"
                      style={{ width: `${(s.reached / maxReached) * 100}%`, background: s.color || '#6366f1', minWidth: s.reached ? 6 : 0 }} />
                  </div>
                  <span className="text-sm text-slate-700 tabular-nums w-24 text-right">
                    {s.reached} <span className="text-slate-400">· {s.conversion}%</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card rounded-2xl p-4 md:p-5 overflow-x-auto">
            <p className="text-sm font-semibold text-slate-800 mb-3">По менеджерам</p>
            {report.byResponsible.length === 0 ? (
              <p className="text-sm text-slate-400">Заявок за период нет</p>
            ) : (
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-xs text-slate-400 text-left">
                    <th className="font-medium pb-2">Менеджер</th>
                    <th className="font-medium pb-2 text-right">Заявок</th>
                    <th className="font-medium pb-2 text-right">Продаж</th>
                    <th className="font-medium pb-2 text-right">Конверсия</th>
                    <th className="font-medium pb-2 text-right">Сумма</th>
                    <th className="font-medium pb-2 text-right">Медиана ответа</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.byResponsible.map(r => (
                    <tr key={r.responsibleId || 'none'}>
                      <td className="py-2 text-slate-800">{r.name || people[r.responsibleId]?.name || 'Не назначен'}</td>
                      <td className="py-2 text-right tabular-nums">{r.created}</td>
                      <td className="py-2 text-right tabular-nums">{r.won}</td>
                      <td className="py-2 text-right tabular-nums">{r.created ? Math.round((r.won / r.created) * 1000) / 10 : 0}%</td>
                      <td className="py-2 text-right tabular-nums">{formatSum(r.wonAmount)}</td>
                      <td className="py-2 text-right tabular-nums">{minutes(r.medianResponseMin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const TONES = {
  slate: 'bg-slate-100 text-slate-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  indigo: 'bg-indigo-100 text-indigo-600',
  red: 'bg-red-100 text-red-600',
}

function Stat({ icon: Icon, label, hint, value, tone = 'slate' }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${TONES[tone]}`}><Icon size={16} /></div>
      <p className="text-lg font-bold text-slate-900 leading-tight">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}
