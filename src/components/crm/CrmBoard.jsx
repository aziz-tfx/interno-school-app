// Kanban board of one pipeline: a column per stage, deals as cards. Cards
// are dragged between columns on desktop; on phones the stage is changed
// from the deal card. Updates from other managers arrive live.

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Filter, Loader, Clock, AlertCircle } from 'lucide-react'
import { crm, watchCrm, sourceMeta, formatPhone, formatSum, ago, SOURCES } from '../../backend/crm'
import { toast } from '../Toaster'

const PAGE = 50
const NO_RESPONSE_ALERT_MIN = 15 // a new lead nobody answered for this long gets a red mark

export default function CrmBoard({ pipeline, me, staff, people, refreshKey, onOpenLead, onMove }) {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('') // debounced q
  const [responsible, setResponsible] = useState('')
  const [source, setSource] = useState('')
  const [columns, setColumns] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [loadingMore, setLoadingMore] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const filters = {
    pipelineId: pipeline.id,
    q: search,
    responsibleId: responsible === 'me' ? me : responsible,
    source,
  }
  const filtersKey = JSON.stringify(filters)

  const load = useCallback(async () => {
    try {
      const board = await crm.board({ ...JSON.parse(filtersKey), perStage: PAGE })
      setColumns(board.stages)
    } catch (err) {
      toast(err.message, 'error')
      setColumns(c => c || [])
    }
  }, [filtersKey])

  useEffect(() => { load() }, [load, refreshKey])

  // Someone else moved, created or edited a deal → refresh (debounced:
  // one save can produce several events)
  const timer = useRef(null)
  useEffect(() => watchCrm(['crm_leads'], () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(load, 400)
  }), [load])
  useEffect(() => () => clearTimeout(timer.current), [])

  const loadMore = async (stage) => {
    setLoadingMore(stage.id)
    try {
      const { items } = await crm.leads({ ...filters, stageId: stage.id, offset: stage.leads.length, limit: PAGE })
      setColumns(cols => cols.map(c => (c.id === stage.id ? { ...c, leads: [...c.leads, ...items] } : c)))
    } catch (err) {
      toast(err.message, 'error')
    }
    setLoadingMore(null)
  }

  // Optimistic: move the card now; the parent saves (or asks first) and a
  // refresh puts it back if that fails or is cancelled.
  const drop = (stageId, leadId) => {
    setDragOver(null)
    const from = columns.find(c => c.leads.some(l => l.id === leadId))
    const to = columns.find(c => c.id === stageId)
    if (!from || !to || from.id === to.id) return
    const lead = from.leads.find(l => l.id === leadId)
    setColumns(cols => cols.map(c => {
      if (c.id === from.id) return { ...c, leads: c.leads.filter(l => l.id !== leadId), count: c.count - 1, amount: c.amount - (lead.amount || 0) }
      if (c.id === to.id) return { ...c, leads: [{ ...lead, stageId }, ...c.leads], count: c.count + 1, amount: c.amount + (lead.amount || 0) }
      return c
    }))
    onMove(lead, to)
  }

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-3 md:p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по имени, названию или телефону"
            className="w-full pl-10 pr-4 py-2 bg-white/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={16} className="text-slate-400" />
          <select value={responsible} onChange={e => setResponsible(e.target.value)}
            className="bg-white/50 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Все менеджеры</option>
            <option value="me">Мои сделки</option>
            {staff.map(e => <option key={e._docId} value={e._docId}>{e.name}</option>)}
          </select>
          <select value={source} onChange={e => setSource(e.target.value)}
            className="bg-white/50 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Все источники</option>
            {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      {columns === null ? (
        <div className="flex items-center justify-center py-20"><Loader size={24} className="animate-spin text-slate-400" /></div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1 snap-x" data-testid="crm-board">
          {columns.map(stage => (
            <div key={stage.id}
              data-stage={stage.name}
              onDragOver={e => { e.preventDefault(); setDragOver(stage.id) }}
              onDragLeave={() => setDragOver(d => (d === stage.id ? null : d))}
              onDrop={e => { e.preventDefault(); drop(stage.id, e.dataTransfer.getData('text/lead-id')) }}
              className={`flex-shrink-0 w-[280px] snap-start rounded-2xl flex flex-col max-h-[calc(100dvh-280px)] min-h-[200px] transition-colors ${
                dragOver === stage.id ? 'bg-blue-50/80 ring-2 ring-blue-300' : 'bg-white/40'
              }`}>
              <div className="px-3 pt-3 pb-2 sticky top-0">
                <div className="h-1 rounded-full mb-2" style={{ background: stage.color || '#94a3b8' }} />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800 truncate">{stage.name}</p>
                  <span className="text-xs font-medium text-slate-500 bg-white/80 rounded-full px-2 py-0.5">{stage.count}</span>
                </div>
                {stage.amount > 0 && <p className="text-xs text-slate-500 mt-0.5">{formatSum(stage.amount)}</p>}
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                {stage.leads.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">Нет сделок</p>
                )}
                {stage.leads.map(lead => (
                  <LeadCard key={lead.id} lead={lead} stage={stage} people={people} onOpen={() => onOpenLead(lead.id)} />
                ))}
                {stage.leads.length < stage.count && (
                  <button onClick={() => loadMore(stage)} disabled={loadingMore === stage.id}
                    className="w-full text-xs text-blue-600 hover:text-blue-700 py-2 disabled:opacity-50">
                    {loadingMore === stage.id ? 'Загрузка…' : `Показать ещё (${stage.count - stage.leads.length})`}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LeadCard({ lead, stage, people, onOpen }) {
  const src = sourceMeta(lead.source)
  const owner = people[lead.responsibleId]
  // only inbound leads (landing, channels) — not deals a manager typed in
  const waitingMin = !lead.createdBy && !lead.firstResponseAt && stage.kind === 'open'
    ? Math.round((Date.now() - Date.parse(lead.createdAt)) / 60000)
    : 0
  const phone = lead.contact?.phones?.[0]

  return (
    <div draggable
      onDragStart={e => { e.dataTransfer.setData('text/lead-id', lead.id); e.dataTransfer.effectAllowed = 'move' }}
      onClick={onOpen}
      data-testid="lead-card"
      className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 hover:shadow-md hover:border-slate-200 transition-all cursor-pointer select-none">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2">{lead.title || lead.contact?.name || 'Без названия'}</p>
        {waitingMin >= NO_RESPONSE_ALERT_MIN && (
          <span title="Клиенту ещё никто не ответил" className="flex items-center gap-0.5 text-[10px] font-semibold text-red-600 bg-red-50 rounded-full px-1.5 py-0.5 flex-shrink-0">
            <AlertCircle size={10} /> {ago(lead.createdAt)}
          </span>
        )}
      </div>
      {lead.contact?.name && lead.contact.name !== lead.title && (
        <p className="text-xs text-slate-500 mt-0.5 truncate">{lead.contact.name}</p>
      )}
      {phone && <p className="text-xs text-slate-500 mt-0.5">{formatPhone(phone)}</p>}
      <div className="flex items-center justify-between gap-2 mt-2">
        <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${src.color}`}>{src.label}</span>
        {lead.amount > 0 && <span className="text-xs font-semibold text-slate-700">{formatSum(lead.amount)}</span>}
      </div>
      <div className="flex items-center justify-between gap-2 mt-2 text-[11px] text-slate-400">
        <span className="truncate">{owner?.name || 'Не назначен'}</span>
        <span className="flex items-center gap-1 flex-shrink-0"><Clock size={10} /> {ago(lead.lastActivityAt || lead.createdAt)}</span>
      </div>
    </div>
  )
}
