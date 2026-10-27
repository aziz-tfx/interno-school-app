// The school's own fields on deals and contacts (managers): add, rename,
// reorder, edit the choices of a list, delete. Saved right away.

import { useState } from 'react'
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react'
import Modal from '../Modal'
import { crm } from '../../backend/crm'
import { toast } from '../Toaster'

export const FIELD_TYPES = [
  ['text', 'Строка'], ['textarea', 'Текст'], ['number', 'Число'], ['date', 'Дата'],
  ['select', 'Список'], ['multiselect', 'Мультисписок'], ['checkbox', 'Флажок'], ['url', 'Ссылка'],
]
const typeLabel = Object.fromEntries(FIELD_TYPES)
const hasOptions = (type) => type === 'select' || type === 'multiselect'
const inputCls = 'px-3 py-2 bg-white/70 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const splitOptions = (text) => text.split('\n').map(s => s.trim()).filter(Boolean)

export default function FieldSettings({ fields, onClose, onChanged }) {
  const [entity, setEntity] = useState('lead')
  const [draft, setDraft] = useState({ label: '', type: 'text', options: '' })
  const [busy, setBusy] = useState(false)
  const list = fields.filter(f => f.entity === entity)

  const run = async (fn) => {
    setBusy(true)
    try { await fn() } catch (err) { toast(err.message, 'error') }
    await onChanged()
    setBusy(false)
  }

  const add = () => run(async () => {
    if (!draft.label.trim()) return
    await crm.createField({ entity, label: draft.label.trim(), type: draft.type, options: splitOptions(draft.options) })
    setDraft({ label: '', type: 'text', options: '' })
  })

  const move = (index, delta) => run(async () => {
    const ordered = [...list]
    const [f] = ordered.splice(index, 1)
    ordered.splice(index + delta, 0, f)
    await Promise.all(ordered.map((x, i) => (x.sort === i ? null : crm.updateField(x.id, { sort: i }))).filter(Boolean))
  })

  return (
    <Modal isOpen onClose={onClose} title="Поля карточки" size="lg">
      <div className="space-y-4">
        <div className="flex gap-1 bg-white/50 rounded-xl p-1 w-fit">
          {[['lead', 'Сделка'], ['contact', 'Контакт']].map(([k, label]) => (
            <button key={k} onClick={() => setEntity(k)}
              className={`px-4 py-1.5 text-sm rounded-lg ${entity === k ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>{label}</button>
          ))}
        </div>

        {list.length === 0 && <p className="text-sm text-slate-400">Своих полей пока нет.</p>}
        <div className="space-y-2">
          {list.map((f, i) => (
            <div key={f.id} className="rounded-xl bg-white/60 border border-slate-100 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input defaultValue={f.label} disabled={busy} className={inputCls + ' flex-1'}
                  onBlur={e => e.target.value.trim() && e.target.value.trim() !== f.label && run(() => crm.updateField(f.id, { label: e.target.value.trim() }))} />
                <span className="text-xs text-slate-500 w-24">{typeLabel[f.type]}</span>
                <button disabled={busy || i === 0} onClick={() => move(i, -1)} className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowUp size={15} /></button>
                <button disabled={busy || i === list.length - 1} onClick={() => move(i, 1)} className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowDown size={15} /></button>
                <button disabled={busy} onClick={() => window.confirm(`Удалить поле «${f.label}»? Заполненные значения перестанут показываться.`) && run(() => crm.deleteField(f.id))}
                  className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
              {hasOptions(f.type) && (
                <label className="block text-xs text-slate-500">Варианты (каждый с новой строки)
                  <textarea defaultValue={f.options.join('\n')} rows={Math.min(6, f.options.length + 1)} disabled={busy}
                    className={inputCls + ' w-full mt-1'}
                    onBlur={e => {
                      const options = splitOptions(e.target.value)
                      if (options.join('\n') !== f.options.join('\n')) run(() => crm.updateField(f.id, { options }))
                    }} />
                </label>
              )}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-dashed border-slate-300 p-3 space-y-2">
          <p className="text-sm font-medium text-slate-700">Новое поле</p>
          <div className="flex flex-wrap gap-2">
            <input value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
              placeholder="Название, например «Возраст ученика»" className={inputCls + ' flex-1 min-w-[200px]'} />
            <select value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value }))} className={inputCls}>
              {FIELD_TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          {hasOptions(draft.type) && (
            <textarea value={draft.options} onChange={e => setDraft(d => ({ ...d, options: e.target.value }))} rows={3}
              placeholder={'Варианты, каждый с новой строки\nОнлайн\nОфлайн'} className={inputCls + ' w-full'} />
          )}
          <div className="flex justify-end">
            <button onClick={add} disabled={busy || !draft.label.trim()}
              className="px-4 py-2 text-sm rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1.5">
              <Plus size={15} /> Добавить
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
