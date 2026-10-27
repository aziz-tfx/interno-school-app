// Questions asked when a deal is closed: why it was lost, and whether to
// take the payment right away when it's won.

import { useState } from 'react'
import { XCircle, Trophy, CreditCard, ArrowRight } from 'lucide-react'
import Modal from '../Modal'

const LOSS_REASONS = [
  'Дорого',
  'Выбрал другую школу',
  'Не подходит расписание',
  'Не отвечает',
  'Передумал / нет интереса',
  'Неактуальная заявка',
]

export function LossReasonDialog({ lead, onCancel, onConfirm }) {
  const [reason, setReason] = useState('')
  const [custom, setCustom] = useState('')
  const value = reason === 'other' ? custom.trim() : reason

  return (
    <Modal isOpen onClose={onCancel} title="Закрыть как отказ" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          <XCircle size={16} className="inline text-red-500 mr-1 -mt-0.5" />
          «{lead.title || lead.contact?.name}» — почему клиент отказался?
        </p>
        <div className="grid gap-2">
          {LOSS_REASONS.map(r => (
            <button key={r} onClick={() => setReason(r)}
              className={`text-left px-3 py-2 rounded-xl text-sm border transition-colors ${
                reason === r ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 bg-white/60 hover:bg-white'
              }`}>
              {r}
            </button>
          ))}
          <button onClick={() => setReason('other')}
            className={`text-left px-3 py-2 rounded-xl text-sm border transition-colors ${
              reason === 'other' ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 bg-white/60 hover:bg-white'
            }`}>
            Другое…
          </button>
          {reason === 'other' && (
            <input autoFocus value={custom} onChange={e => setCustom(e.target.value)} maxLength={300}
              placeholder="Причина отказа"
              className="px-3 py-2 rounded-xl text-sm border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-red-400" />
          )}
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">Отмена</button>
          <button disabled={!value} onClick={() => onConfirm(value)}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40">
            Закрыть сделку
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function WonDialog({ lead, onCancel, onJustMove, onPayment }) {
  return (
    <Modal isOpen onClose={onCancel} title="Успешная сделка" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Trophy size={20} className="text-emerald-600" />
          </div>
          <p className="text-sm text-slate-600">
            «{lead.title || lead.contact?.name}» — клиент оплатил? Оформите оплату: создастся ученик,
            договор и чек, а сделка закроется как успешная.
          </p>
        </div>
        <div className="grid gap-2">
          <button onClick={onPayment}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700">
            <CreditCard size={16} /> Оформить оплату
          </button>
          <button onClick={onJustMove}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm text-slate-700 bg-white/70 border border-slate-200 hover:bg-white">
            <ArrowRight size={16} /> Просто перенести в «Успешно»
          </button>
        </div>
      </div>
    </Modal>
  )
}
