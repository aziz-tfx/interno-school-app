// Deal card: details, stage, contact, timeline (notes, calls, stage moves)
// and tasks. Opened from the board or a task, closed by the back button too
// (the deal id is in the URL — see pages/Crm.jsx).

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Phone, PhoneIncoming, PhoneOutgoing, MessageCircle, StickyNote, ArrowRight, CheckSquare, Square,
  DollarSign, Info, Trash2, CreditCard, Loader, Plus, User, GraduationCap, Copy,
} from 'lucide-react'
import Modal from '../Modal'
import { toast } from '../Toaster'
import { crm, watchCrm, sourceMeta, formatPhone, formatSum, formatDateTime } from '../../backend/crm'

const inputCls = 'w-full px-3 py-2 bg-white/70 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function tomorrowAt10() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  // value for <input type="datetime-local"> in local time
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function LeadModal({ leadId, me, isManager, pipelines, allStages, staff, people, courses, onClose, onMove, onSale, onChanged }) {
  const [lead, setLead] = useState(null)
  const [activities, setActivities] = useState([])
  const [missing, setMissing] = useState(false)
  const [draft, setDraft] = useState({ title: '', amount: '' })
  const [note, setNote] = useState('')
  const [posting, setPosting] = useState(false)
  const [taskForm, setTaskForm] = useState(null) // { text, dueAt, assigneeId }

  const load = useCallback(async () => {
    try {
      const [l, acts] = await Promise.all([crm.lead(leadId), crm.activities(leadId)])
      setLead(l)
      setActivities(acts)
      // A live reload must not overwrite the field being typed in
      const editing = document.activeElement?.dataset?.leadDraft
      setDraft(d => ({
        title: editing === 'title' ? d.title : (l.title || ''),
        amount: editing === 'amount' ? d.amount : (l.amount ? String(l.amount) : ''),
      }))
    } catch (err) {
      if (err.status === 404) setMissing(true)
      else toast(err.message, 'error')
    }
  }, [leadId])

  useEffect(() => { setLead(null); setMissing(false); load() }, [load])

  // Other managers' notes, moves and tasks on this deal appear live
  const timer = useRef(null)
  useEffect(() => watchCrm(['crm_leads', 'crm_activities', 'crm_tasks'], () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(load, 300)
  }), [load])
  useEffect(() => () => clearTimeout(timer.current), [])

  const save = async (patch) => {
    try {
      const updated = await crm.updateLead(lead.id, patch)
      setLead(l => ({ ...l, ...updated, contact: l.contact, tasks: l.tasks }))
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
      load()
    }
  }

  const saveDraftField = (field) => {
    const value = field === 'amount' ? Number(String(draft.amount).replace(/\s/g, '')) || 0 : draft.title.trim()
    if (value === (lead[field] ?? (field === 'amount' ? 0 : ''))) return
    save({ [field]: value })
  }

  const addNote = async (kind) => {
    const body = note.trim()
    if (!body && kind === 'note') return
    setPosting(true)
    try {
      if (kind === 'note') await crm.addNote(lead.id, body)
      else await crm.logActivity(lead.id, { type: 'call', direction: 'out', body: body || 'Исходящий звонок' })
      setNote('')
      await load()
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
    setPosting(false)
  }

  const addTask = async () => {
    if (!taskForm.text.trim()) return
    try {
      await crm.createTask({
        leadId: lead.id, text: taskForm.text.trim(),
        dueAt: new Date(taskForm.dueAt).toISOString(), assigneeId: taskForm.assigneeId || me,
      })
      setTaskForm(null)
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const toggleTask = async (task) => {
    try {
      await crm.updateTask(task.id, { done: !task.doneAt })
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const remove = async () => {
    if (!window.confirm('Удалить сделку? Её можно будет восстановить только через базу.')) return
    try {
      await crm.deleteLead(lead.id)
      onChanged()
      onClose()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(() => toast('Скопировано', 'success', 1500)).catch(() => {})
  }

  const title = lead ? (lead.title || lead.contact?.name || 'Сделка') : 'Сделка'

  return (
    <Modal isOpen onClose={onClose} title={title} size="xl">
      {missing ? (
        <p className="text-sm text-slate-500 text-center py-10">Сделка не найдена или удалена.</p>
      ) : !lead ? (
        <div className="flex items-center justify-center py-16"><Loader size={22} className="animate-spin text-slate-400" /></div>
      ) : (
        renderBody()
      )}
    </Modal>
  )

  // Plain render functions, not nested components: a component defined
  // inside this one would remount on every keystroke and drop input focus.
  function renderBody() {
    const pipeline = pipelines.find(p => p.id === lead.pipelineId)
    const stage = allStages[lead.stageId]
    const src = sourceMeta(lead.source)
    const contact = lead.contact

    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* ── Left: deal ─────────────────────────────────────────── */}
        <div className="space-y-5">
          <div className="flex flex-wrap gap-1.5">
            {pipeline?.stages.map(s => {
              const active = s.id === lead.stageId
              return (
                <button key={s.id} onClick={() => onMove(lead, s).then(moved => moved && load())}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                    active ? 'text-white border-transparent' : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
                  }`}
                  style={active ? { background: s.color || '#6366f1' } : undefined}>
                  {s.name}
                </button>
              )
            })}
          </div>
          {stage?.kind === 'lost' && lead.lossReason && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">Причина отказа: {lead.lossReason}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 text-xs text-slate-500">Название
              <input data-lead-draft="title" className={inputCls + ' mt-1'} value={draft.title}
                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} onBlur={() => saveDraftField('title')} />
            </label>
            <label className="text-xs text-slate-500">Сумма, сум
              <input data-lead-draft="amount" className={inputCls + ' mt-1'} inputMode="numeric" value={draft.amount}
                onChange={e => setDraft(d => ({ ...d, amount: e.target.value.replace(/[^\d\s]/g, '') }))}
                onBlur={() => saveDraftField('amount')} />
            </label>
            <label className="text-xs text-slate-500">Ответственный
              <select className={inputCls + ' mt-1'} value={lead.responsibleId || ''}
                onChange={e => save({ responsibleId: e.target.value || null })}>
                <option value="">Не назначен</option>
                {staff.map(e => <option key={e._docId} value={e._docId}>{e.name}</option>)}
              </select>
            </label>
            <label className="col-span-2 text-xs text-slate-500">Курс
              <select className={inputCls + ' mt-1'} value={lead.courseId || ''}
                onChange={e => save({ courseId: e.target.value || null })}>
                <option value="">Не выбран</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className={`font-medium rounded-full px-2 py-0.5 ${src.color}`}>{src.label}</span>
            <span>создана {formatDateTime(lead.createdAt)}</span>
            {lead.firstResponseAt && !lead.createdBy && (
              <span>· первый ответ через {Math.max(0, Math.round((Date.parse(lead.firstResponseAt) - Date.parse(lead.createdAt)) / 60000))} мин</span>
            )}
          </div>

          {/* Contact */}
          <div className="rounded-2xl bg-white/60 border border-slate-100 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <User size={16} className="text-slate-400" />
              <p className="text-sm font-semibold text-slate-800">{contact?.name || 'Контакт не указан'}</p>
              {(lead.studentId || contact?.studentId) && (
                <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
                  <GraduationCap size={12} /> Ученик
                </span>
              )}
            </div>
            {contact?.phones?.map(p => (
              <div key={p} className="flex items-center gap-2 text-sm">
                <a href={`tel:+${p}`} className="text-blue-600 hover:underline">{formatPhone(p)}</a>
                <button onClick={() => copy(`+${p}`)} title="Скопировать" className="text-slate-400 hover:text-slate-600"><Copy size={13} /></button>
              </div>
            ))}
            {contact?.instagram && <p className="text-sm text-slate-600">Instagram: {contact.instagram}</p>}
            {contact?.telegramUsername && <p className="text-sm text-slate-600">Telegram: @{contact.telegramUsername}</p>}
          </div>

          {/* Tasks */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Задачи</p>
              {!taskForm && (
                <button onClick={() => setTaskForm({ text: '', dueAt: tomorrowAt10(), assigneeId: lead.responsibleId || me })}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"><Plus size={14} /> Задача</button>
              )}
            </div>
            {taskForm && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 space-y-2">
                <input autoFocus className={inputCls} placeholder="Например: перезвонить и пригласить на пробный урок"
                  value={taskForm.text} onChange={e => setTaskForm(f => ({ ...f, text: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addTask()} />
                <div className="flex flex-wrap gap-2">
                  <input type="datetime-local" className={inputCls + ' flex-1 min-w-[180px]'} value={taskForm.dueAt}
                    onChange={e => setTaskForm(f => ({ ...f, dueAt: e.target.value }))} />
                  <select className={inputCls + ' flex-1 min-w-[150px]'} value={taskForm.assigneeId || ''}
                    onChange={e => setTaskForm(f => ({ ...f, assigneeId: e.target.value }))}>
                    {staff.map(e => <option key={e._docId} value={e._docId}>{e.name}</option>)}
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setTaskForm(null)} className="px-3 py-1.5 text-xs rounded-lg text-slate-600 hover:bg-white">Отмена</button>
                  <button onClick={addTask} disabled={!taskForm.text.trim()}
                    className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">Добавить</button>
                </div>
              </div>
            )}
            {lead.tasks?.length === 0 && !taskForm && <p className="text-xs text-slate-400">Задач нет</p>}
            {lead.tasks?.map(t => {
              const overdue = !t.doneAt && Date.parse(t.dueAt) < Date.now()
              return (
                <div key={t.id} className="flex items-start gap-2 text-sm">
                  <button onClick={() => toggleTask(t)} className="mt-0.5 text-slate-400 hover:text-blue-600">
                    {t.doneAt ? <CheckSquare size={16} className="text-emerald-500" /> : <Square size={16} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={t.doneAt ? 'line-through text-slate-400' : 'text-slate-700'}>{t.text}</p>
                    <p className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                      {formatDateTime(t.dueAt)} · {people[t.assigneeId]?.name || '—'}{overdue ? ' · просрочена' : ''}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            <button onClick={() => onSale({ ...lead })}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700">
              <CreditCard size={16} /> Оформить оплату
            </button>
            {isManager && (
              <button onClick={remove} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50 ml-auto">
                <Trash2 size={15} /> Удалить
              </button>
            )}
          </div>
        </div>

        {/* ── Right: timeline ────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="rounded-2xl bg-white/60 border border-slate-100 p-3 space-y-2">
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={5000}
              placeholder="Примечание: о чём договорились, что важно клиенту…"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => addNote('call')} disabled={posting} title="Записать исходящий звонок (текст — итог разговора)"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                <PhoneOutgoing size={14} /> Звонок
              </button>
              <button onClick={() => addNote('note')} disabled={posting || !note.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                <StickyNote size={14} /> Примечание
              </button>
            </div>
          </div>
          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {activities.map(renderActivity)}
          </div>
        </div>
      </div>
    )
  }

  function renderActivity(a) {
    const author = people[a.authorId]?.name
    let Icon = Info
    let color = 'bg-slate-100 text-slate-500'
    let text = a.body
    if (a.type === 'note') { Icon = StickyNote; color = 'bg-amber-100 text-amber-600' }
    else if (a.type === 'call') {
      Icon = a.direction === 'in' ? PhoneIncoming : PhoneOutgoing
      color = 'bg-sky-100 text-sky-600'
      const dur = a.meta?.duration ? ` · ${Math.round(a.meta.duration / 60)} мин` : ''
      text = `${a.direction === 'in' ? 'Входящий звонок' : 'Исходящий звонок'}${dur}${a.body ? ` — ${a.body}` : ''}`
    } else if (a.type === 'message') {
      Icon = MessageCircle
      color = 'bg-violet-100 text-violet-600'
    } else if (a.type === 'stage_change') {
      Icon = ArrowRight
      color = 'bg-indigo-100 text-indigo-600'
      const from = allStages[a.meta?.from]?.name
      const to = allStages[a.meta?.to]?.name || '—'
      text = from ? `${from} → ${to}` : `Сделка создана · ${to}`
    } else if (a.type === 'task') {
      Icon = CheckSquare
      color = 'bg-emerald-100 text-emerald-600'
      text = `Задача выполнена: ${a.body}${a.meta?.result ? ` — ${a.meta.result}` : ''}`
    } else if (a.type === 'sale') {
      Icon = DollarSign
      color = 'bg-emerald-100 text-emerald-600'
    }
    return (
      <div key={a.id} className="flex gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}><Icon size={15} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{text}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{formatDateTime(a.createdAt)}{author ? ` · ${author}` : ''}</p>
        </div>
      </div>
    )
  }
}
