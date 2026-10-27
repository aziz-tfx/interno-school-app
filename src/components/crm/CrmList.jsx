// Deals as a table (like amo's list view): sorting, pages, selecting deals
// — on the page or every deal matching the filters — and acting on all of
// them at once: stage, manager, tags, a task, delete; CSV export.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Loader, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Download, Trash2, Tag, UserCheck,
  ArrowRightLeft, ListPlus, X,
} from 'lucide-react'
import Modal from '../Modal'
import { toast } from '../Toaster'
import { crm, watchCrm, sourceMeta, formatPhone, formatSum, formatDateTime } from '../../backend/crm'
import { LossReasonDialog } from './StageDialogs'

const PAGE = 50
const COLUMNS = [
  { key: 'title', label: 'Сделка', sort: 'title' },
  { key: 'stage', label: 'Этап', sort: 'stage' },
  { key: 'responsible', label: 'Ответственный' },
  { key: 'amount', label: 'Сумма', sort: 'amount', right: true },
  { key: 'source', label: 'Источник' },
  { key: 'created', label: 'Создана', sort: 'created' },
  { key: 'task', label: 'Задача' },
]
const inputCls = 'px-3 py-2 bg-white/70 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function CrmList({ pipeline, query, me, staff, people, allStages, isManager, refreshKey, onOpenLead, onChanged }) {
  const [sort, setSort] = useState({ key: 'created', direction: 'desc' })
  const [page, setPage] = useState(0)
  const [data, setData] = useState(null) // { total, items }
  const [selected, setSelected] = useState(() => new Set())
  const [allMatching, setAllMatching] = useState(false) // selection = every deal matching the filters
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState(null) // 'tag-add' | 'tag-remove' | 'task' | { lost: stage }

  const params = useMemo(() => ({ pipelineId: pipeline.id, ...query, sort: sort.key, direction: sort.direction }), [pipeline.id, query, sort])
  const paramsKey = JSON.stringify(params)

  // New filters or sorting: back to page 1, nothing selected
  useEffect(() => { setPage(0); setSelected(new Set()); setAllMatching(false) }, [paramsKey])

  const load = useCallback(async () => {
    try {
      setData(await crm.leads({ ...JSON.parse(paramsKey), limit: PAGE, offset: page * PAGE }))
    } catch (err) {
      toast(err.message, 'error')
      setData(d => d || { total: 0, items: [] })
    }
  }, [paramsKey, page])

  useEffect(() => { load() }, [load, refreshKey])

  const timer = useRef(null)
  useEffect(() => watchCrm(['crm_leads'], () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(load, 500)
  }), [load])
  useEffect(() => () => clearTimeout(timer.current), [])

  const items = data?.items || []
  const total = data?.total || 0
  const pageIds = items.map(l => l.id)
  const pageAllSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id))
  const count = allMatching ? total : selected.size

  const toggle = (id) => {
    setAllMatching(false)
    setSelected(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const togglePage = () => {
    setAllMatching(false)
    setSelected(s => {
      const next = new Set(s)
      pageIds.forEach(id => (pageAllSelected ? next.delete(id) : next.add(id)))
      return next
    })
  }
  const clearSelection = () => { setSelected(new Set()); setAllMatching(false) }

  const sortBy = (key) => setSort(s => ({ key, direction: s.key === key && s.direction === 'desc' ? 'asc' : 'desc' }))

  const run = async (action, value, extra = {}) => {
    setBusy(true)
    try {
      const ids = allMatching ? await crm.leadIds(params) : [...selected]
      const res = await crm.bulk({ ids, action, value, ...extra })
      toast(`Готово: ${res.updated} сделок`, 'success')
      clearSelection()
      onChanged()
      await load()
    } catch (err) {
      toast(err.message, 'error')
    }
    setBusy(false)
    setDialog(null)
  }

  const moveTo = (stageId) => {
    const stage = allStages[stageId]
    if (!stage) return
    if (stage.kind === 'lost') setDialog({ lost: stage })
    else run('stage', stageId)
  }

  const exportCsv = async () => {
    setBusy(true)
    try { await crm.exportLeads(params) } catch (err) { toast(err.message, 'error') }
    setBusy(false)
  }

  if (data === null) {
    return <div className="flex items-center justify-center py-20"><Loader size={24} className="animate-spin text-slate-400" /></div>
  }

  return (
    <div className="space-y-3">
      {/* Bulk bar */}
      {count > 0 ? (
        <div className="glass-card rounded-2xl p-3 flex flex-wrap items-center gap-2 sticky top-0 z-10">
          <span className="text-sm font-medium text-slate-700">Выбрано: {count}</span>
          {!allMatching && pageAllSelected && total > items.length && (
            <button onClick={() => setAllMatching(true)} className="text-xs text-blue-600 hover:underline">Выбрать все {total}</button>
          )}
          <button onClick={clearSelection} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"><X size={12} /> Снять</button>
          <div className="flex flex-wrap gap-2 ml-auto items-center">
            <label className="flex items-center gap-1 text-xs text-slate-500">
              <ArrowRightLeft size={14} />
              <select disabled={busy} value="" onChange={e => moveTo(e.target.value)} className={inputCls + ' py-1.5'}>
                <option value="">Этап…</option>
                {pipeline.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-500">
              <UserCheck size={14} />
              <select disabled={busy} value="" onChange={e => run('responsible', e.target.value === 'none' ? null : e.target.value)} className={inputCls + ' py-1.5'}>
                <option value="">Ответственный…</option>
                <option value="none">— снять —</option>
                {staff.map(e => <option key={e._docId} value={e._docId}>{e.name}</option>)}
              </select>
            </label>
            <button disabled={busy} onClick={() => setDialog('tag-add')} className="px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-200 hover:bg-slate-50 flex items-center gap-1"><Tag size={13} /> + тег</button>
            <button disabled={busy} onClick={() => setDialog('tag-remove')} className="px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-200 hover:bg-slate-50 flex items-center gap-1"><Tag size={13} /> − тег</button>
            <button disabled={busy} onClick={() => setDialog('task')} className="px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-200 hover:bg-slate-50 flex items-center gap-1"><ListPlus size={13} /> Задача</button>
            {isManager && (
              <button disabled={busy} onClick={() => window.confirm(`Удалить ${count} сделок?`) && run('delete')}
                className="px-3 py-1.5 text-xs rounded-lg text-red-600 hover:bg-red-50 flex items-center gap-1"><Trash2 size={13} /> Удалить</button>
            )}
            {busy && <Loader size={16} className="animate-spin text-slate-400" />}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-slate-500">Найдено: {total}</p>
          {isManager && total > 0 && (
            <button onClick={exportCsv} disabled={busy}
              className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-50">
              <Download size={15} /> Excel (CSV)
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="p-3 w-8"><input type="checkbox" checked={pageAllSelected} onChange={togglePage} aria-label="Выбрать страницу" /></th>
              {COLUMNS.map(c => (
                <th key={c.key} className={`p-3 font-medium whitespace-nowrap ${c.right ? 'text-right' : ''}`}>
                  {c.sort ? (
                    <button onClick={() => sortBy(c.sort)} className="inline-flex items-center gap-1 hover:text-slate-800">
                      {c.label}
                      {sort.key === c.sort && (sort.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </button>
                  ) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={COLUMNS.length + 1} className="p-10 text-center text-slate-400">Сделок не найдено</td></tr>
            )}
            {items.map(lead => {
              const stage = allStages[lead.stageId]
              const src = sourceMeta(lead.source)
              const overdue = lead.nextTaskAt && Date.parse(lead.nextTaskAt) < Date.now()
              const checked = allMatching || selected.has(lead.id)
              return (
                <tr key={lead.id} className={`border-b border-slate-50 hover:bg-white/60 ${checked ? 'bg-blue-50/50' : ''}`}>
                  <td className="p-3"><input type="checkbox" checked={checked} onChange={() => toggle(lead.id)} /></td>
                  <td className="p-3 max-w-[280px]">
                    <button onClick={() => onOpenLead(lead.id)} className="text-left">
                      <p className="font-medium text-slate-800 hover:text-blue-700 truncate">{lead.title || lead.contact?.name || 'Без названия'}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {[lead.contact?.name !== lead.title && lead.contact?.name, formatPhone(lead.contact?.phones?.[0])].filter(Boolean).join(' · ')}
                      </p>
                    </button>
                    {lead.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {lead.tags.map(t => <span key={t} className="text-[10px] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{t}</span>)}
                      </div>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full" style={{ background: stage?.color || '#94a3b8' }} />
                      {stage?.name || '—'}
                    </span>
                  </td>
                  <td className="p-3 whitespace-nowrap text-slate-600">{people[lead.responsibleId]?.name || lead.custom?.amoResponsible || '—'}</td>
                  <td className="p-3 whitespace-nowrap text-right font-medium text-slate-700">{lead.amount > 0 ? formatSum(lead.amount) : ''}</td>
                  <td className="p-3"><span className={`text-[10px] font-medium rounded-full px-2 py-0.5 whitespace-nowrap ${src.color}`}>{src.label}</span></td>
                  <td className="p-3 whitespace-nowrap text-xs text-slate-500">{formatDateTime(lead.createdAt)}</td>
                  <td className={`p-3 whitespace-nowrap text-xs ${overdue ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                    {lead.nextTaskAt ? formatDateTime(lead.nextTaskAt) : <span className="text-amber-600">нет задачи</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {total > PAGE && (
        <div className="flex items-center justify-center gap-3 text-sm text-slate-600">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="p-2 rounded-lg hover:bg-white/70 disabled:opacity-30"><ChevronLeft size={16} /></button>
          <span>{page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} из {total}</span>
          <button disabled={(page + 1) * PAGE >= total} onClick={() => setPage(p => p + 1)} className="p-2 rounded-lg hover:bg-white/70 disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      )}

      {(dialog === 'tag-add' || dialog === 'tag-remove') && (
        <TagDialog remove={dialog === 'tag-remove'} count={count} onCancel={() => setDialog(null)}
          onConfirm={(tags) => run(dialog === 'tag-add' ? 'addTags' : 'removeTags', tags)} />
      )}
      {dialog === 'task' && (
        <TaskDialog count={count} me={me} staff={staff} onCancel={() => setDialog(null)} onConfirm={(task) => run('task', task)} />
      )}
      {dialog?.lost && (
        <LossReasonDialog lead={{ title: `${count} сделок` }} onCancel={() => setDialog(null)}
          onConfirm={(reason) => run('stage', dialog.lost.id, { lossReason: reason })} />
      )}
    </div>
  )
}

function TagDialog({ remove, count, onCancel, onConfirm }) {
  const [text, setText] = useState('')
  const tags = text.split(',').map(t => t.trim()).filter(Boolean)
  return (
    <Modal isOpen onClose={onCancel} title={remove ? 'Убрать теги' : 'Добавить теги'} size="sm">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{count} сделок. Несколько тегов — через запятую.</p>
        <input autoFocus value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && tags.length && onConfirm(tags)}
          placeholder="например: весна, пробный" className={inputCls + ' w-full'} />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-2 text-sm rounded-xl text-slate-600 hover:bg-white">Отмена</button>
          <button disabled={!tags.length} onClick={() => onConfirm(tags)} className="px-4 py-2 text-sm rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
            {remove ? 'Убрать' : 'Добавить'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function TaskDialog({ count, me, staff, onCancel, onConfirm }) {
  const tomorrow = new Date(Date.now() + 86400_000)
  tomorrow.setHours(10, 0, 0, 0)
  const [text, setText] = useState('')
  const [dueAt, setDueAt] = useState(new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16))
  const [assigneeId, setAssigneeId] = useState('') // '' = the deal's own manager is not known here → me
  return (
    <Modal isOpen onClose={onCancel} title="Задача для выбранных сделок" size="sm">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Будет создано {count} задач — по одной в каждой сделке.</p>
        <input autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="Например: позвонить и пригласить на день открытых дверей" className={inputCls + ' w-full'} />
        <div className="flex gap-2 flex-wrap">
          <input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} className={inputCls + ' flex-1'} />
          <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={inputCls + ' flex-1'}>
            <option value="">Мне</option>
            {staff.filter(e => e._docId !== me).map(e => <option key={e._docId} value={e._docId}>{e.name}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-2 text-sm rounded-xl text-slate-600 hover:bg-white">Отмена</button>
          <button disabled={!text.trim()} onClick={() => onConfirm({ text: text.trim(), dueAt: new Date(dueAt).toISOString(), assigneeId: assigneeId || me })}
            className="px-4 py-2 text-sm rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">Создать</button>
        </div>
      </div>
    </Modal>
  )
}
