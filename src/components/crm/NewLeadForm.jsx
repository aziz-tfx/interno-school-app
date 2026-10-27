// New deal. The server matches the phone against existing contacts, so a
// client who writes again from another channel doesn't become a duplicate.

import { useState } from 'react'
import { crm, SOURCES } from '../../backend/crm'
import { toast } from '../Toaster'

const inputCls = 'w-full px-3 py-2 bg-white/70 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function NewLeadForm({ pipeline, me, staff, courses, onCancel, onCreated }) {
  const [form, setForm] = useState({
    name: '', phone: '', source: 'manual', amount: '', courseId: '', responsibleId: me || '', note: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const lead = await crm.createLead({
        pipelineId: pipeline.id,
        contact: { name: form.name.trim(), ...(form.phone.trim() && { phone: form.phone.trim() }) },
        source: form.source,
        amount: Number(form.amount.replace(/\s/g, '')) || 0,
        courseId: form.courseId || null,
        responsibleId: form.responsibleId || null,
        note: form.note.trim() || null,
      })
      toast('Сделка создана', 'success')
      onCreated(lead)
    } catch (err) {
      toast(err.message, 'error')
    }
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-slate-500">Имя клиента *
          <input autoFocus required className={inputCls + ' mt-1'} value={form.name} onChange={set('name')} placeholder="Малика" />
        </label>
        <label className="text-xs text-slate-500">Телефон
          <input className={inputCls + ' mt-1'} type="tel" value={form.phone} onChange={set('phone')} placeholder="+998 90 123 45 67" />
        </label>
        <label className="text-xs text-slate-500">Источник
          <select className={inputCls + ' mt-1'} value={form.source} onChange={set('source')}>
            {Object.entries(SOURCES).filter(([k]) => k !== 'amo').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">Сумма, сум
          <input className={inputCls + ' mt-1'} inputMode="numeric" value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value.replace(/[^\d\s]/g, '') }))} placeholder="0" />
        </label>
        <label className="text-xs text-slate-500">Курс
          <select className={inputCls + ' mt-1'} value={form.courseId} onChange={set('courseId')}>
            <option value="">Не выбран</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">Ответственный
          <select className={inputCls + ' mt-1'} value={form.responsibleId} onChange={set('responsibleId')}>
            <option value="">Не назначен</option>
            {staff.map(e => <option key={e._docId} value={e._docId}>{e.name}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-xs text-slate-500">Примечание
        <textarea className={inputCls + ' mt-1'} rows={3} value={form.note} onChange={set('note')}
          placeholder="Что интересует клиента, удобное время для звонка…" />
      </label>
      <p className="text-xs text-slate-400">Сделка попадёт в первый этап воронки «{pipeline?.name}».</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">Отмена</button>
        <button type="submit" disabled={saving || !form.name.trim()}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
          {saving ? 'Сохранение…' : 'Создать сделку'}
        </button>
      </div>
    </form>
  )
}
