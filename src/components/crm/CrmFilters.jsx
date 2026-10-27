// Deal filters shared by the board and the list: search, manager, source,
// status, tags, creation period and task state. `toQuery` turns them into
// the API's query parameters (see server/src/crm/leadQuery.js).

import { useState, useEffect, useRef } from 'react'
import { Search, Filter, X, Tag, ChevronDown } from 'lucide-react'
import { SOURCES } from '../../backend/crm'

export const EMPTY_FILTERS = { q: '', responsibleId: '', source: '', status: '', tags: [], period: '', from: '', to: '', tasks: '' }

const PERIODS = [
  ['', 'За всё время'], ['today', 'Сегодня'], ['yesterday', 'Вчера'], ['7d', '7 дней'],
  ['30d', '30 дней'], ['month', 'Этот месяц'], ['custom', 'Период…'],
]

// Dates are school days in Tashkent (UTC+5), like the server's filters.
const tashkentDay = (offsetDays = 0) =>
  new Date(Date.now() + 5 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10)

function periodRange(f) {
  switch (f.period) {
    case 'today': return [tashkentDay(), tashkentDay()]
    case 'yesterday': return [tashkentDay(-1), tashkentDay(-1)]
    case '7d': return [tashkentDay(-6), tashkentDay()]
    case '30d': return [tashkentDay(-29), tashkentDay()]
    case 'month': return [tashkentDay().slice(0, 8) + '01', tashkentDay()]
    case 'custom': return [f.from, f.to]
    default: return ['', '']
  }
}

/** Filters → API query params. */
export function toQuery(f, me) {
  const [createdFrom, createdTo] = periodRange(f)
  return {
    q: f.q.trim(),
    responsibleId: f.responsibleId === 'me' ? me : f.responsibleId,
    source: f.source,
    status: f.status,
    tags: f.tags.join(','),
    createdFrom, createdTo,
    tasks: f.tasks,
  }
}

export const activeCount = (f) =>
  ['responsibleId', 'source', 'status', 'period', 'tasks'].filter(k => f[k]).length + (f.tags.length ? 1 : 0)

const selectCls = 'bg-white/50 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function CrmFilters({ value, onChange, staff, tags = [] }) {
  const [q, setQ] = useState(value.q)
  const [tagsOpen, setTagsOpen] = useState(false)
  const tagsRef = useRef(null)
  const set = (patch) => onChange({ ...value, ...patch })

  // Search is debounced; the rest applies at once
  useEffect(() => { setQ(value.q) }, [value.q])
  useEffect(() => {
    if (q === value.q) return
    const t = setTimeout(() => onChange({ ...value, q }), 300)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!tagsOpen) return
    const close = (e) => { if (!tagsRef.current?.contains(e.target)) setTagsOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [tagsOpen])

  const toggleTag = (name) => set({ tags: value.tags.includes(name) ? value.tags.filter(t => t !== name) : [...value.tags, name] })

  return (
    <div className="glass-card rounded-2xl p-3 md:p-4 space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по имени, названию или телефону"
            className="w-full pl-10 pr-4 py-2 bg-white/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={16} className="text-slate-400" />
          <select value={value.responsibleId} onChange={e => set({ responsibleId: e.target.value })} className={selectCls}>
            <option value="">Все менеджеры</option>
            <option value="me">Мои сделки</option>
            <option value="none">Без ответственного</option>
            {staff.map(e => <option key={e._docId} value={e._docId}>{e.name}</option>)}
          </select>
          <select value={value.status} onChange={e => set({ status: e.target.value })} className={selectCls}>
            <option value="">Все статусы</option>
            <option value="open">В работе</option>
            <option value="won">Успешные</option>
            <option value="lost">Отказы</option>
          </select>
          <select value={value.period} onChange={e => set({ period: e.target.value })} className={selectCls} title="Дата создания">
            {PERIODS.map(([k, label]) => <option key={k} value={k}>{k ? `Созданы: ${label.toLowerCase()}` : label}</option>)}
          </select>
          {value.period === 'custom' && (
            <>
              <input type="date" value={value.from} onChange={e => set({ from: e.target.value })} className={selectCls} />
              <span className="text-slate-400">—</span>
              <input type="date" value={value.to} onChange={e => set({ to: e.target.value })} className={selectCls} />
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <select value={value.source} onChange={e => set({ source: e.target.value })} className={selectCls}>
          <option value="">Все источники</option>
          {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={value.tasks} onChange={e => set({ tasks: e.target.value })} className={selectCls}>
          <option value="">Задачи: любые</option>
          <option value="none">Без задач</option>
          <option value="overdue">С просроченной задачей</option>
        </select>
        <div className="relative" ref={tagsRef}>
          <button onClick={() => setTagsOpen(o => !o)}
            className={`${selectCls} flex items-center gap-1.5 ${value.tags.length ? 'text-blue-700' : 'text-slate-700'}`}>
            <Tag size={14} /> {value.tags.length ? `Теги: ${value.tags.length}` : 'Теги'} <ChevronDown size={14} />
          </button>
          {tagsOpen && (
            <div className="absolute z-20 mt-1 w-64 max-h-72 overflow-y-auto rounded-xl bg-white shadow-xl border border-slate-100 p-2">
              {tags.length === 0 && <p className="text-xs text-slate-400 p-2">Тегов пока нет</p>}
              {tags.map(t => (
                <label key={t.name} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-sm cursor-pointer">
                  <input type="checkbox" checked={value.tags.includes(t.name)} onChange={() => toggleTag(t.name)} />
                  <span className="flex-1 truncate">{t.name}</span>
                  <span className="text-xs text-slate-400">{t.count}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        {value.tags.map(t => (
          <span key={t} className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 rounded-full pl-2.5 pr-1.5 py-1">
            {t} <button onClick={() => toggleTag(t)} className="hover:text-blue-900"><X size={12} /></button>
          </span>
        ))}
        {activeCount(value) > 0 && (
          <button onClick={() => onChange({ ...EMPTY_FILTERS, q: value.q })} className="text-xs text-slate-500 hover:text-slate-700 ml-auto">
            Сбросить фильтры
          </button>
        )}
      </div>
    </div>
  )
}
