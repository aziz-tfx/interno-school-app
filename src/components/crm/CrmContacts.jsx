// Contacts tab: everyone who ever came to the CRM, with search, filters and
// the number of their deals; duplicates (same phone) can be merged here.

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Loader, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Copy as CopyIcon, UserPlus, GraduationCap, Merge } from 'lucide-react'
import Modal from '../Modal'
import { toast } from '../Toaster'
import { crm, watchCrm, formatPhone, formatDateTime } from '../../backend/crm'

const PAGE = 50
const inputCls = 'px-3 py-2 bg-white/70 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const selectCls = 'bg-white/50 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function CrmContacts({ staff, people, onOpenContact }) {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [responsibleId, setResponsibleId] = useState('')
  const [student, setStudent] = useState('')
  const [sort, setSort] = useState({ key: 'activity', direction: 'desc' })
  const [page, setPage] = useState(0)
  const [data, setData] = useState(null)
  const [dupCount, setDupCount] = useState(0)
  const [dupOpen, setDupOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => { setSearch(q.trim()); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [q])

  const params = { q: search, responsibleId, student, sort: sort.key, direction: sort.direction }
  const key = JSON.stringify(params)
  useEffect(() => { setPage(0) }, [responsibleId, student, sort])

  const load = useCallback(async () => {
    try {
      setData(await crm.contacts({ ...JSON.parse(key), limit: PAGE, offset: page * PAGE }))
    } catch (err) {
      toast(err.message, 'error')
      setData(d => d || { total: 0, items: [] })
    }
  }, [key, page])
  const loadDuplicates = useCallback(() => crm.duplicates().then(g => setDupCount(g.length)).catch(() => {}), [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadDuplicates() }, [loadDuplicates])
  const timer = useRef(null)
  useEffect(() => watchCrm(['crm_contacts', 'crm_leads'], () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { load(); loadDuplicates() }, 600)
  }), [load, loadDuplicates])
  useEffect(() => () => clearTimeout(timer.current), [])

  const sortBy = (k) => setSort(s => ({ key: k, direction: s.key === k && s.direction === 'desc' ? 'asc' : 'desc' }))
  const th = (label, k) => (
    <th className="p-3 font-medium whitespace-nowrap">
      {k ? (
        <button onClick={() => sortBy(k)} className="inline-flex items-center gap-1 hover:text-slate-800">
          {label}{sort.key === k && (sort.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
        </button>
      ) : label}
    </th>
  )

  const items = data?.items || []
  const total = data?.total || 0

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-3 md:p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Имя, телефон, email, Instagram или Telegram"
            className="w-full pl-10 pr-4 py-2 bg-white/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={responsibleId} onChange={e => setResponsibleId(e.target.value)} className={selectCls}>
          <option value="">Все ответственные</option>
          <option value="none">Без ответственного</option>
          {staff.map(e => <option key={e._docId} value={e._docId}>{e.name}</option>)}
        </select>
        <select value={student} onChange={e => setStudent(e.target.value)} className={selectCls}>
          <option value="">Все</option>
          <option value="yes">Уже ученики</option>
          <option value="no">Ещё не ученики</option>
        </select>
        {dupCount > 0 && (
          <button onClick={() => setDupOpen(true)} className="px-3 py-2 rounded-xl text-sm bg-amber-50 text-amber-700 hover:bg-amber-100 flex items-center gap-1.5">
            <CopyIcon size={15} /> Дубли: {dupCount}
          </button>
        )}
        <button onClick={() => setNewOpen(true)} className="px-3 py-2 rounded-xl text-sm bg-white/70 border border-slate-200 hover:bg-white flex items-center gap-1.5">
          <UserPlus size={15} /> Контакт
        </button>
      </div>

      {data === null ? (
        <div className="flex items-center justify-center py-20"><Loader size={24} className="animate-spin text-slate-400" /></div>
      ) : (
        <>
          <p className="text-sm text-slate-500 px-1">Найдено: {total}</p>
          <div className="glass-card rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  {th('Имя', 'name')}{th('Телефон')}{th('Сделки')}{th('Ответственный')}{th('Активность', 'activity')}{th('Добавлен', 'created')}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-slate-400">Контактов не найдено</td></tr>}
                {items.map(c => (
                  <tr key={c.id} onClick={() => onOpenContact(c.id)} className="border-b border-slate-50 hover:bg-white/60 cursor-pointer">
                    <td className="p-3">
                      <span className="font-medium text-slate-800">{c.name || 'Без имени'}</span>
                      {c.studentId && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 align-middle">
                          <GraduationCap size={11} /> ученик
                        </span>
                      )}
                      {(c.instagram || c.telegramUsername) && (
                        <p className="text-xs text-slate-400">{[c.instagram, c.telegramUsername && `@${c.telegramUsername}`].filter(Boolean).join(' · ')}</p>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap text-slate-600">
                      {formatPhone(c.phones?.[0])}{c.phones?.length > 1 && <span className="text-xs text-slate-400"> +{c.phones.length - 1}</span>}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {c.leadsCount ? <span className="text-slate-700">{c.openLeads} в работе <span className="text-slate-400">/ {c.leadsCount}</span></span> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="p-3 whitespace-nowrap text-slate-600">{people[c.responsibleId]?.name || '—'}</td>
                    <td className="p-3 whitespace-nowrap text-xs text-slate-500">{formatDateTime(c.lastActivityAt) || '—'}</td>
                    <td className="p-3 whitespace-nowrap text-xs text-slate-500">{formatDateTime(c.createdAt)}</td>
                  </tr>
                ))}
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
        </>
      )}

      {dupOpen && <DuplicatesDialog onClose={() => { setDupOpen(false); load(); loadDuplicates() }} />}
      {newOpen && (
        <NewContactDialog
          onClose={() => setNewOpen(false)}
          onCreated={(c) => { setNewOpen(false); onOpenContact(c.id) }}
          onExisting={(c) => { setNewOpen(false); onOpenContact(c.id) }}
        />
      )}
    </div>
  )
}

function NewContactDialog({ onClose, onCreated, onExisting }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      onCreated(await crm.createContact({ name: name.trim(), phone: phone.trim() }))
    } catch (err) {
      if (err.status === 409 && err.body?.existing) {
        toast('Такой телефон уже есть — открываю контакт', 'info')
        onExisting(err.body.existing)
      } else toast(err.message, 'error')
    }
    setBusy(false)
  }
  return (
    <Modal isOpen onClose={onClose} title="Новый контакт" size="sm">
      <form onSubmit={submit} className="space-y-3">
        <input autoFocus required value={name} onChange={e => setName(e.target.value)} placeholder="Имя" className={inputCls + ' w-full'} />
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+998 90 123 45 67" className={inputCls + ' w-full'} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm rounded-xl text-slate-600 hover:bg-white">Отмена</button>
          <button disabled={busy || !name.trim()} className="px-4 py-2 text-sm rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">Создать</button>
        </div>
      </form>
    </Modal>
  )
}

// Groups of contacts sharing a phone; pick the one to keep, the rest fold into it.
function DuplicatesDialog({ onClose }) {
  const [groups, setGroups] = useState(null)
  const [keep, setKeep] = useState({}) // phone → contact id to keep
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    try { setGroups(await crm.duplicates()) } catch (err) { toast(err.message, 'error'); setGroups([]) }
  }, [])
  useEffect(() => { load() }, [load])

  const merge = async (g) => {
    // default: the contact with the most deals, else the oldest
    const target = keep[g.phone] || [...g.contacts].sort((a, b) => b.leadsCount - a.leadsCount)[0].id
    setBusy(g.phone)
    try {
      await crm.mergeContacts(target, g.contacts.map(c => c.id).filter(id => id !== target))
      toast('Контакты объединены', 'success')
      await load()
    } catch (err) {
      toast(err.message, 'error')
    }
    setBusy(null)
  }

  return (
    <Modal isOpen onClose={onClose} title="Дубли контактов" size="lg">
      {groups === null ? (
        <div className="flex justify-center py-10"><Loader size={22} className="animate-spin text-slate-400" /></div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">Дублей нет 🎉</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Один телефон у нескольких контактов. Выберите, какой оставить — сделки, история, задачи и файлы остальных перейдут к нему.</p>
          {groups.map(g => {
            const chosen = keep[g.phone] || [...g.contacts].sort((a, b) => b.leadsCount - a.leadsCount)[0].id
            return (
              <div key={g.phone} className="rounded-xl bg-white/60 border border-slate-100 p-3 space-y-2">
                <p className="text-sm font-medium text-slate-700">{formatPhone(g.phone)}</p>
                {g.contacts.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name={g.phone} checked={chosen === c.id} onChange={() => setKeep(k => ({ ...k, [g.phone]: c.id }))} />
                    <span className="font-medium text-slate-800">{c.name || 'Без имени'}</span>
                    <span className="text-xs text-slate-400">{c.leadsCount} сделок · с {formatDateTime(c.createdAt)}</span>
                    {c.studentId && <span className="text-[10px] text-emerald-700 bg-emerald-50 rounded-full px-2">ученик</span>}
                  </label>
                ))}
                <div className="flex justify-end">
                  <button onClick={() => merge(g)} disabled={busy === g.phone}
                    className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                    {busy === g.phone ? <Loader size={13} className="animate-spin" /> : <Merge size={13} />} Объединить
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
