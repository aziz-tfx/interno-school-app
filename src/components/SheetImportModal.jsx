import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, RefreshCw, Sheet, Clock, MapPin } from 'lucide-react'
import Modal from './Modal'
import { api } from '../backend/api'
import { useData } from '../contexts/DataContext'
import { sameBranch } from '../utils/branchMatch'
import {
  parseRoomSheet, sheetGroups, planImport, groupDocFromRow, scheduleLine,
} from '../utils/roomSheet'

// One-time move of the room grid from the school's Google Sheet into the
// system: each card of the sheet becomes a group with its room(s), days,
// time, teacher and dates. Groups that already exist (same name, e.g. the
// Telegram name «28.08») are updated instead of duplicated, so running it
// again is safe.

const shortDate = (iso) => {
  const m = String(iso || '').match(/^\d{4}-(\d{2})-(\d{2})/)
  return m ? `${m[2]}.${m[1]}` : '?'
}

const field = 'w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs'

export default function SheetImportModal({ defaultBranch, onClose }) {
  const { branches, groups, rooms, teachers, courses, addRoom, addGroup, updateGroup } = useData()
  const [step, setStep] = useState('link') // link | preview | saving | done
  const [url, setUrl] = useState('')
  const [branch, setBranch] = useState(defaultBranch || branches[0]?.id || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [roomPlan, setRoomPlan] = useState([])
  const [rows, setRows] = useState([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState(null)

  const inBranch = (ref) => sameBranch(ref, branch, branches)
  const branchRooms = useMemo(() => rooms.filter(r => inBranch(r.branchId || r.branch)), [rooms, branch, branches]) // eslint-disable-line react-hooks/exhaustive-deps
  const branchGroups = useMemo(() => groups.filter(g => inBranch(g.branch)), [groups, branch, branches]) // eslint-disable-line react-hooks/exhaustive-deps
  const branchTeachers = useMemo(() => teachers.filter(t => inBranch(t.branch)), [teachers, branch, branches]) // eslint-disable-line react-hooks/exhaustive-deps
  const teacherList = useMemo(() => [...branchTeachers, ...teachers.filter(t => !branchTeachers.includes(t))], [teachers, branchTeachers])

  const load = async (e) => {
    e?.preventDefault()
    setLoading(true); setError('')
    try {
      const { rows: cells } = await api('/api/admin/schedule/sheet-rows', { method: 'POST', body: { url: url.trim() } })
      const items = sheetGroups(parseRoomSheet(cells))
      if (!items.length) throw new Error('На этом листе не нашлось сетки «кабинеты × время» с карточками групп. Проверьте, что ссылка ведёт на нужный лист.')
      const plan = planImport(items, { courses, teachers, branchTeachers, branchRooms, branchGroups })
      setRoomPlan(plan.rooms)
      setRows(plan.rows)
      setStep('preview')
    } catch (err) {
      setError(err.message || 'Не удалось прочитать таблицу')
    } finally {
      setLoading(false)
    }
  }

  const setRow = (i, patch) => setRows(rs => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const setRoom = (i, roomId) => setRoomPlan(rs => rs.map((r, k) => (k === i ? { ...r, roomId } : r)))

  const included = rows.filter(r => r.include)
  const usedRooms = new Set(included.flatMap(r => r.slots.filter(s => !s.online).map(s => s.room.short)))
  const roomsToCreate = roomPlan.filter(r => !r.roomId && usedRooms.has(r.short))
  const toUpdate = included.filter(r => r.groupId).length
  const toCreate = included.length - toUpdate

  const run = async () => {
    setStep('saving'); setError('')
    const errors = []
    const total = roomsToCreate.length + included.length
    let done = 0
    setProgress({ done, total })
    const roomIds = {}
    const allRooms = [...rooms]
    for (const r of roomPlan) {
      if (!usedRooms.has(r.short)) continue
      if (r.roomId) { roomIds[r.short] = r.roomId; continue }
      try {
        const created = await addRoom({ name: r.name, capacity: r.capacity || 8, branchId: branch })
        roomIds[r.short] = created.id
        allRooms.push(created)
      } catch (err) {
        errors.push(`Кабинет «${r.name}»: ${err.message || 'ошибка'}`)
      }
      setProgress({ done: ++done, total })
    }
    let created = 0, updated = 0
    for (const row of included) {
      const existing = row.groupId ? groups.find(g => g.id === row.groupId) : null
      try {
        const doc = groupDocFromRow(row, { branch, roomIds, rooms: allRooms, existing })
        if (existing) { await updateGroup(existing.id, doc); updated++ }
        else { await addGroup(doc); created++ }
      } catch (err) {
        errors.push(`Группа «${row.name}»: ${err.message || 'ошибка'}`)
      }
      setProgress({ done: ++done, total })
    }
    setResult({ created, updated, rooms: roomsToCreate.length, errors })
    setStep('done')
  }

  const title = step === 'link' ? 'Перенос расписания из Google Таблицы'
    : step === 'preview' ? `Проверьте перед переносом: ${rows.length} групп`
      : step === 'saving' ? 'Переносим…' : 'Готово'

  return (
    <Modal isOpen onClose={step === 'saving' ? () => {} : onClose} title={title} size="xl">
      {step === 'link' && (
        <form onSubmit={load} className="space-y-4">
          <div className="flex items-start gap-3 text-sm text-slate-600">
            <Sheet size={20} className="text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p>Каждая карточка листа станет группой: кабинет, дни, время, учитель, даты старта и окончания. Группы с таким же названием, которые уже есть в системе, обновятся, а не продублируются.</p>
              <p>Откройте лист с сеткой кабинетов и скопируйте ссылку из адресной строки, в ней есть <code className="text-xs bg-slate-100 px-1 rounded">#gid=…</code>. Таблица должна быть открыта по ссылке. Перед записью вы увидите всё, что будет перенесено.</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-[1fr_220px] gap-3">
            <input type="url" required value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=…"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
            <select value={branch} onChange={e => setBranch(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm" aria-label="Филиал">
              {branches.map(b => <option key={b.id} value={b.id}>Филиал: {b.name}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-red-600 flex items-start gap-1.5"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">Отмена</button>
            <button type="submit" disabled={loading || !url.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {loading ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />} Прочитать лист
            </button>
          </div>
        </form>
      )}

      {step === 'preview' && (
        <div className="space-y-5">
          {/* Rooms */}
          <section>
            <h4 className="text-sm font-semibold text-slate-800 mb-2">Кабинеты</h4>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {roomPlan.map((r, i) => (
                <label key={r.short} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 text-slate-600">{r.name}{r.capacity ? ` (${r.capacity})` : ''} →</span>
                  <select value={r.roomId} onChange={e => setRoom(i, e.target.value)} className={field}>
                    <option value="">Создать «{r.name}»</option>
                    {branchRooms.map(x => <option key={x.id} value={x.id}>{x.name}{x.capacity ? ` (${x.capacity} мест)` : ''}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </section>

          {/* Groups */}
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-800">Группы</h4>
            {rows.map((r, i) => (
              <div key={r.key} className={`rounded-xl border p-3 ${r.include ? 'border-slate-200 bg-white/60' : 'border-dashed border-slate-200 opacity-60'}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={r.include} onChange={e => setRow(i, { include: e.target.checked })}
                    className="mt-1 w-4 h-4 accent-blue-600 shrink-0" aria-label={`Переносить ${r.name}`} />
                  <div className="min-w-0 flex-1 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3">
                    <div className="min-w-0 text-xs text-slate-600 space-y-0.5">
                      <p className="text-sm font-semibold text-slate-900 break-words">{r.name}</p>
                      <p>{r.speaker}{r.tags.length ? ` (${r.tags.join(', ')})` : ''} · {r.direction || 'направление не указано'}</p>
                      <p className="flex items-center gap-1"><Clock size={11} className="shrink-0" /> {scheduleLine(r.slots)}</p>
                      <p className="flex items-center gap-1"><MapPin size={11} className="shrink-0" />
                        {r.slots.map(s => s.online ? 'онлайн' : s.room.name).filter((v, k, a) => a.indexOf(v) === k).join(', ')}
                        <span className="ml-1 tabular-nums">· {shortDate(r.startDate)} → {r.endDate ? shortDate(r.endDate) : 'не указано'}</span>
                      </p>
                      {(r.students || r.notes.length > 0) && (
                        <p className="italic text-slate-500">{[r.students && `Студенты: ${r.students}`, ...r.notes].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                    <div className="grid sm:grid-cols-3 gap-2">
                      <label className="text-[11px] text-slate-500 space-y-0.5">
                        <span>Группа в системе</span>
                        <select value={r.groupId} onChange={e => setRow(i, { groupId: e.target.value })} className={field} disabled={!r.include}>
                          <option value="">Создать «{r.name}»</option>
                          {branchGroups.map(g => <option key={g.id} value={g.id}>Обновить «{g.name}»{g.status === 'archived' ? ' (архив)' : ''}</option>)}
                        </select>
                      </label>
                      <label className="text-[11px] text-slate-500 space-y-0.5">
                        <span>Курс</span>
                        <select value={r.course} onChange={e => setRow(i, { course: e.target.value })} className={field} disabled={!r.include}>
                          <option value="">«{r.direction || '—'}» как в таблице</option>
                          {courses.map(c => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
                        </select>
                      </label>
                      <label className="text-[11px] text-slate-500 space-y-0.5">
                        <span>Учитель</span>
                        <select value={r.teacherId === '' || r.teacherId == null ? '' : String(r.teacherId)} disabled={!r.include}
                          onChange={e => setRow(i, { teacherId: teacherList.find(t => String(t.id) === e.target.value)?.id ?? '' })}
                          className={`${field} ${r.teacherId === '' || r.teacherId == null ? 'border-amber-300' : ''}`}>
                          <option value="">Не выбран (в таблице: {r.speaker || '—'})</option>
                          {teacherList.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>

          <div className="sticky bottom-0 -mx-4 md:-mx-6 px-4 md:px-6 py-3 glass-strong border-t border-white/20 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm text-slate-600 flex-1">
              Создать групп: <b>{toCreate}</b> · обновить: <b>{toUpdate}</b>{roomsToCreate.length > 0 && <> · новых кабинетов: <b>{roomsToCreate.length}</b></>}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setStep('link')} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">Назад</button>
              <button onClick={run} disabled={!included.length}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50">
                Перенести {included.length}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'saving' && (
        <div className="py-10 text-center space-y-3">
          <RefreshCw size={28} className="mx-auto animate-spin text-blue-600" />
          <p className="text-sm text-slate-600 tabular-nums">{progress.done} из {progress.total}</p>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden max-w-sm mx-auto">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
            <div className="text-sm text-slate-700">
              <p className="font-semibold">Расписание перенесено в систему</p>
              <p className="mt-0.5">Создано групп: {result.created}, обновлено: {result.updated}{result.rooms ? `, новых кабинетов: ${result.rooms}` : ''}.</p>
              <p className="mt-1 text-slate-500">Дальше группы добавляются в системе, Google Таблицу больше вести не нужно.</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              <p className="font-medium">Не получилось: {result.errors.length}</p>
              <ul className="mt-1 text-xs space-y-0.5">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              <p className="mt-1 text-xs">Можно запустить перенос ещё раз: уже перенесённые группы обновятся, а не продублируются.</p>
            </div>
          )}
          <div className="flex justify-end">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700">Закрыть</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
