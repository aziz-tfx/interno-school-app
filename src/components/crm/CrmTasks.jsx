// Task list: what each manager has to do and when — overdue first.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { CheckSquare, Square, Loader } from 'lucide-react'
import { crm, watchCrm, formatDateTime } from '../../backend/crm'
import { toast } from '../Toaster'

function bucketOf(task) {
  if (task.doneAt) return 'done'
  const due = new Date(task.dueAt)
  const now = new Date()
  if (due < now) return 'overdue'
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999)
  if (due <= endOfToday) return 'today'
  const endOfTomorrow = new Date(endOfToday); endOfTomorrow.setDate(endOfTomorrow.getDate() + 1)
  if (due <= endOfTomorrow) return 'tomorrow'
  return 'later'
}

const BUCKETS = [
  { id: 'overdue', label: 'Просрочено', cls: 'text-red-600' },
  { id: 'today', label: 'Сегодня', cls: 'text-slate-800' },
  { id: 'tomorrow', label: 'Завтра', cls: 'text-slate-800' },
  { id: 'later', label: 'Позже', cls: 'text-slate-500' },
  { id: 'done', label: 'Выполнено', cls: 'text-slate-400' },
]

export default function CrmTasks({ me, isManager, people, onOpenLead }) {
  const [assignee, setAssignee] = useState('me')
  const [status, setStatus] = useState('open')
  const [tasks, setTasks] = useState(null)

  const load = useCallback(async () => {
    try {
      setTasks(await crm.tasks({ assigneeId: assignee, status }))
    } catch (err) {
      toast(err.message, 'error')
      setTasks(t => t || [])
    }
  }, [assignee, status])

  useEffect(() => { load() }, [load])

  const timer = useRef(null)
  useEffect(() => watchCrm(['crm_tasks'], () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(load, 300)
  }), [load])
  useEffect(() => () => clearTimeout(timer.current), [])

  const toggle = async (task) => {
    setTasks(ts => ts.map(t => (t.id === task.id ? { ...t, doneAt: t.doneAt ? null : new Date().toISOString() } : t)))
    try {
      await crm.updateTask(task.id, { done: !task.doneAt })
    } catch (err) {
      toast(err.message, 'error')
      load()
    }
  }

  const grouped = useMemo(() => {
    const g = {}
    for (const t of tasks || []) (g[bucketOf(t)] ||= []).push(t)
    return g
  }, [tasks])

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-3 md:p-4 flex flex-wrap gap-2 items-center">
        {isManager && (
          <select value={assignee} onChange={e => setAssignee(e.target.value)}
            className="bg-white/50 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="me">Мои задачи</option>
            <option value="all">Все менеджеры</option>
          </select>
        )}
        <div className="flex gap-1 bg-white/50 rounded-xl p-1">
          {[['open', 'Открытые'], ['overdue', 'Просроченные'], ['done', 'Выполненные']].map(([id, label]) => (
            <button key={id} onClick={() => setStatus(id)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${status === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tasks === null ? (
        <div className="flex items-center justify-center py-16"><Loader size={22} className="animate-spin text-slate-400" /></div>
      ) : tasks.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-sm text-slate-500">
          {status === 'done' ? 'Выполненных задач нет' : 'Задач нет — всё сделано 🎉'}
        </div>
      ) : (
        <div className="space-y-4">
          {BUCKETS.filter(b => grouped[b.id]?.length).map(b => (
            <div key={b.id} className="glass-card rounded-2xl p-4">
              <p className={`text-sm font-semibold mb-3 ${b.cls}`}>{b.label} · {grouped[b.id].length}</p>
              <div className="divide-y divide-slate-100">
                {grouped[b.id].map(t => (
                  <div key={t.id} className="flex items-start gap-3 py-2.5">
                    <button onClick={() => toggle(t)} className="mt-0.5 text-slate-400 hover:text-blue-600">
                      {t.doneAt ? <CheckSquare size={18} className="text-emerald-500" /> : <Square size={18} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${t.doneAt ? 'line-through text-slate-400' : 'text-slate-800'}`}>{t.text}</p>
                      <div className="flex flex-wrap gap-x-3 text-xs text-slate-400 mt-0.5">
                        <span className={b.id === 'overdue' ? 'text-red-600 font-medium' : ''}>{formatDateTime(t.dueAt)}</span>
                        {assignee === 'all' && <span>{people[t.assigneeId]?.name || '—'}</span>}
                        {t.leadId && (
                          <button onClick={() => onOpenLead(t.leadId)} className="text-blue-600 hover:underline truncate max-w-[240px]">
                            {t.leadTitle || 'Сделка'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
