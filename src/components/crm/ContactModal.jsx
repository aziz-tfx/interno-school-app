// Contact card: details (phones, email, Instagram, Telegram, manager, own
// fields), every deal of the person and the timeline across them. Opened
// with ?contact=<id> (see pages/Crm.jsx).

import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader, Plus, X, Trash2, GraduationCap, Copy, Phone } from 'lucide-react'
import Modal from '../Modal'
import { toast } from '../Toaster'
import { crm, watchCrm, formatPhone, formatSum, formatDateTime } from '../../backend/crm'
import ActivityItem from './ActivityItem'

const inputCls = 'w-full px-3 py-2 bg-white/70 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function ContactModal({ contactId, isManager, pipelines, allStages, staff, people, fields = [], onClose, onOpenLead, onOpenContact }) {
  const [contact, setContact] = useState(null)
  const [activities, setActivities] = useState([])
  const [missing, setMissing] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [conflict, setConflict] = useState(null) // contact that already has a phone being added

  const load = useCallback(async () => {
    try {
      const [c, acts] = await Promise.all([crm.contact(contactId), crm.contactActivities(contactId)])
      setContact(c)
      setActivities(acts)
    } catch (err) {
      if (err.status === 404) setMissing(true)
      else toast(err.message, 'error')
    }
  }, [contactId])

  useEffect(() => { setContact(null); setMissing(false); load() }, [load])
  const timer = useRef(null)
  useEffect(() => watchCrm(['crm_contacts', 'crm_leads', 'crm_activities'], () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(load, 400)
  }), [load])
  useEffect(() => () => clearTimeout(timer.current), [])

  const save = async (patch) => {
    try {
      const updated = await crm.updateContact(contact.id, patch)
      setContact(c => ({ ...c, ...updated }))
      return true
    } catch (err) {
      if (err.status === 409 && err.body?.existing) setConflict(err.body.existing)
      else toast(err.message, 'error')
      return false
    }
  }

  const addPhone = async () => {
    const p = newPhone.trim()
    if (!p) return
    if (await save({ phones: [...contact.phones, p] })) setNewPhone('')
  }

  const mergeConflict = async () => {
    try {
      await crm.mergeContacts(contact.id, [conflict.id])
      setConflict(null)
      toast('Контакты объединены', 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const newLead = async () => {
    try {
      const lead = await crm.createLead({ contactId: contact.id, title: contact.name || 'Новая сделка' })
      onOpenLead(lead.id)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const remove = async () => {
    if (!window.confirm('Удалить контакт?')) return
    try {
      await crm.deleteContact(contact.id)
      onClose()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const textField = (label, key, placeholder) => (
    <label className="text-xs text-slate-500">{label}
      <input key={`${key}:${contact[key] || ''}`} defaultValue={contact[key] || ''} placeholder={placeholder} className={inputCls + ' mt-1'}
        onBlur={e => e.target.value.trim() !== (contact[key] || '') && save({ [key]: e.target.value.trim() })} />
    </label>
  )

  return (
    <Modal isOpen onClose={onClose} title={contact?.name || 'Контакт'} size="xl">
      {missing ? (
        <p className="text-sm text-slate-500 text-center py-10">Контакт не найден или удалён.</p>
      ) : !contact ? (
        <div className="flex items-center justify-center py-16"><Loader size={22} className="animate-spin text-slate-400" /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-5">
            {contact.studentId && (
              <p className="flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
                <GraduationCap size={16} /> Уже учится в школе
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">{textField('Имя', 'name')}</div>
              <div className="col-span-2 space-y-1.5">
                <p className="text-xs text-slate-500">Телефоны</p>
                {contact.phones.map(p => (
                  <div key={p} className="flex items-center gap-2 text-sm">
                    <Phone size={13} className="text-slate-400" />
                    <a href={`tel:+${p}`} className="text-blue-600 hover:underline">{formatPhone(p)}</a>
                    <button onClick={() => navigator.clipboard?.writeText(`+${p}`)} title="Скопировать" className="text-slate-400 hover:text-slate-600"><Copy size={13} /></button>
                    {contact.phones.length > 1 && (
                      <button onClick={() => save({ phones: contact.phones.filter(x => x !== p) })} title="Убрать" className="text-slate-300 hover:text-red-500 ml-auto"><X size={14} /></button>
                    )}
                  </div>
                ))}
                <div className="flex gap-2">
                  <input value={newPhone} onChange={e => setNewPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPhone()}
                    placeholder="+ телефон" className={inputCls} />
                  <button onClick={addPhone} disabled={!newPhone.trim()} className="px-3 rounded-xl bg-white border border-slate-200 text-slate-600 disabled:opacity-40"><Plus size={15} /></button>
                </div>
              </div>
              {textField('Email', 'email')}
              {textField('Instagram', 'instagram', '@username')}
              {textField('Telegram', 'telegramUsername', 'username')}
              <label className="text-xs text-slate-500">Ответственный
                <select className={inputCls + ' mt-1'} value={contact.responsibleId || ''} onChange={e => save({ responsibleId: e.target.value || null })}>
                  <option value="">Не назначен</option>
                  {staff.map(e => <option key={e._docId} value={e._docId}>{e.name}</option>)}
                </select>
              </label>
              {fields.map(f => renderField(f))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Сделки</p>
                <button onClick={newLead} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"><Plus size={14} /> Сделка</button>
              </div>
              {contact.leads.length === 0 && <p className="text-xs text-slate-400">Сделок нет</p>}
              {contact.leads.map(l => {
                const stage = allStages[l.stageId]
                const pipe = pipelines.find(p => p.id === l.pipelineId)
                return (
                  <button key={l.id} onClick={() => onOpenLead(l.id)} className="w-full text-left rounded-xl bg-white/60 border border-slate-100 hover:border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800 truncate">{l.title || 'Без названия'}</p>
                      {l.amount > 0 && <span className="text-xs font-semibold text-slate-700">{formatSum(l.amount)}</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: stage?.color || '#94a3b8' }} />
                      {stage?.name || '—'}{pipelines.length > 1 && pipe ? ` · ${pipe.name}` : ''} · {formatDateTime(l.createdAt)}
                    </p>
                  </button>
                )
              })}
            </div>

            {isManager && contact.leads.length === 0 && (
              <button onClick={remove} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50">
                <Trash2 size={15} /> Удалить контакт
              </button>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-800">История по всем сделкам</p>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {activities.length === 0 && <p className="text-xs text-slate-400">Пока пусто</p>}
              {activities.map(a => (
                <ActivityItem key={a.id} a={a} allStages={allStages} people={people} showLead onOpenLead={onOpenLead} />
              ))}
            </div>
          </div>
        </div>
      )}

      {conflict && (
        <Modal isOpen onClose={() => setConflict(null)} title="Телефон уже есть" size="sm">
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Этот номер уже у контакта «{conflict.name || 'без имени'}». Скорее всего, это один человек.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => { const id = conflict.id; setConflict(null); onOpenContact(id) }} className="px-3 py-2 text-sm rounded-xl text-slate-600 hover:bg-white">Открыть его</button>
              <button onClick={mergeConflict} className="px-4 py-2 text-sm rounded-xl bg-blue-600 text-white hover:bg-blue-700">Объединить в этот</button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  )

  function renderField(f) {
    const value = contact.custom?.fields?.[f.key]
    const k = `${f.key}:${JSON.stringify(value ?? null)}`
    const set = (v) => {
      const next = v === '' ? null : v
      if (JSON.stringify(value ?? null) !== JSON.stringify(next)) save({ fields: { [f.key]: next } })
    }
    let input
    if (f.type === 'select') {
      input = (
        <select key={k} className={inputCls + ' mt-1'} defaultValue={value ?? ''} onChange={e => set(e.target.value)}>
          <option value="">—</option>
          {f.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    } else if (f.type === 'multiselect') {
      const chosen = Array.isArray(value) ? value : []
      input = (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {f.options.map(o => (
            <button key={o} onClick={() => set(chosen.includes(o) ? chosen.filter(x => x !== o) : [...chosen, o])}
              className={`text-xs px-2.5 py-1 rounded-lg border ${chosen.includes(o) ? 'bg-blue-600 text-white border-transparent' : 'bg-white/60 border-slate-200 text-slate-600'}`}>{o}</button>
          ))}
        </div>
      )
    } else if (f.type === 'checkbox') {
      input = <input key={k} type="checkbox" className="mt-2 block" defaultChecked={!!value} onChange={e => set(e.target.checked || null)} />
    } else if (f.type === 'textarea') {
      input = <textarea key={k} rows={2} className={inputCls + ' mt-1'} defaultValue={value ?? ''} onBlur={e => set(e.target.value.trim())} />
    } else {
      input = <input key={k} type={f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text'} className={inputCls + ' mt-1'} defaultValue={value ?? ''} onBlur={e => set(e.target.value.trim())} />
    }
    return (
      <label key={f.id} className={`text-xs text-slate-500 ${f.type === 'textarea' || f.type === 'multiselect' ? 'col-span-2' : ''}`}>
        {f.label}{input}
      </label>
    )
  }
}
