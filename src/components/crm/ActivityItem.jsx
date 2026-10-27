// One line of a CRM timeline (deal card, contact card): note, call,
// message, stage move, finished task, sale or system event.

import {
  PhoneIncoming, PhoneOutgoing, MessageCircle, StickyNote, ArrowRight, CheckSquare, DollarSign, Info,
} from 'lucide-react'
import { formatDateTime } from '../../backend/crm'

export default function ActivityItem({ a, allStages, people, showLead = false, onOpenLead }) {
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
    <div className="flex gap-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}><Icon size={15} /></div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{text}</p>
        {a.type === 'call' && a.meta?.link && (
          <audio controls preload="none" src={a.meta.link} className="mt-1 h-8 w-full max-w-xs" />
        )}
        <p className="text-[11px] text-slate-400 mt-0.5">
          {formatDateTime(a.createdAt)}{author ? ` · ${author}` : ''}
          {showLead && a.leadTitle && (
            <> · <button onClick={() => onOpenLead?.(a.leadId)} className="text-blue-600 hover:underline">{a.leadTitle}</button></>
          )}
        </p>
      </div>
    </div>
  )
}
