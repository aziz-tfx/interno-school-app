import { useEffect, useMemo, useState, useCallback } from 'react'
import { RefreshCw, ExternalLink, Link2, AlertTriangle, Users, Clock, Send, Sheet, Save } from 'lucide-react'
import { api } from '../backend/api'
import { useAuth } from '../contexts/AuthContext'
import {
  parseRoomSheet, blockStats, directionKey, formatShortDate, toMinutes, WEEKDAY_KEYS,
} from '../utils/roomSheet'

// «Расписание» → «Кабинеты»: the school's live room grid, read from the
// Google Sheet the admins keep it in (see server/src/routes/scheduleSheet.js).

const PALETTE = [
  'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-400/10 dark:border-blue-400/30 dark:text-blue-100',
  'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-400/10 dark:border-emerald-400/30 dark:text-emerald-100',
  'bg-violet-50 border-violet-200 text-violet-900 dark:bg-violet-400/10 dark:border-violet-400/30 dark:text-violet-100',
  'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-400/10 dark:border-amber-400/30 dark:text-amber-100',
  'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-400/10 dark:border-rose-400/30 dark:text-rose-100',
  'bg-cyan-50 border-cyan-200 text-cyan-900 dark:bg-cyan-400/10 dark:border-cyan-400/30 dark:text-cyan-100',
  'bg-indigo-50 border-indigo-200 text-indigo-900 dark:bg-indigo-400/10 dark:border-indigo-400/30 dark:text-indigo-100',
  'bg-orange-50 border-orange-200 text-orange-900 dark:bg-orange-400/10 dark:border-orange-400/30 dark:text-orange-100',
]
const DOT = ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-orange-500']

function colorIndex(direction, order) {
  const key = directionKey(direction)
  const i = order.indexOf(key)
  return (i < 0 ? 0 : i) % PALETTE.length
}

function LinkForm({ initial, onSaved, onCancel }) {
  const [url, setUrl] = useState(initial || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      await api('/api/admin/schedule/sheet', { method: 'POST', body: { url: url.trim() } })
      onSaved()
    } catch (err) {
      setError(err.message || 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="glass-card rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
          <Sheet size={18} className="text-emerald-700" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">Подключить Google Таблицу с кабинетами</p>
          <p className="text-sm text-slate-500 mt-0.5">
            Откройте в таблице лист с сеткой кабинетов и скопируйте ссылку из адресной строки: в ней должно быть <code className="text-xs bg-slate-100 px-1 rounded">#gid=…</code>.
            Таблица должна быть открыта «Всем, у кого есть ссылка». Платформа читает только этот лист.
          </p>
        </div>
      </div>
      <input
        type="url" value={url} onChange={e => setUrl(e.target.value)} required={!initial}
        placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=…"
        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
      />
      {error && <p className="text-sm text-red-600 flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">Отмена</button>
        )}
        {initial && (
          <button type="button" disabled={saving}
            onClick={async () => { setSaving(true); try { await api('/api/admin/schedule/sheet', { method: 'POST', body: { url: '' } }); onSaved() } catch (err) { setError(err.message) } finally { setSaving(false) } }}
            className="px-4 py-2 text-sm text-red-600 bg-red-50 rounded-xl hover:bg-red-100 disabled:opacity-50">
            Отключить
          </button>
        )}
        <button type="submit" disabled={saving || !url.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} Сохранить
        </button>
      </div>
    </form>
  )
}

function LessonCard({ lesson, slot, colorClass }) {
  const ownTime = lesson.time && (lesson.time.start !== slot.start || lesson.time.end !== slot.end)
  const ended = lesson.status === 'ended'
  const upcoming = lesson.status === 'upcoming'
  return (
    <div className={`h-full rounded-xl border p-2.5 text-left ${ended ? 'bg-slate-50 border-dashed border-amber-400 text-slate-600' : colorClass}`}
      title={lesson.raw}>
      {ownTime && (
        <p className="text-[11px] font-bold flex items-center gap-1 mb-0.5"><Clock size={11} /> {lesson.time.start}–{lesson.time.end}</p>
      )}
      <p className="text-sm font-semibold leading-tight break-words">
        {lesson.speaker || lesson.notes[0] || '—'}
        {lesson.tags.map(t => (
          <span key={t} className="ml-1 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-white/70 border border-black/5 align-middle dark:bg-white/10 dark:border-white/10">{t}</span>
        ))}
      </p>
      {lesson.direction && <p className="text-xs opacity-80 mt-0.5 leading-snug">{lesson.direction}</p>}
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-[11px] opacity-90">
        {lesson.tgName && <span className="flex items-center gap-0.5"><Send size={10} /> {lesson.tgName}</span>}
        {lesson.students && <span className="flex items-center gap-0.5"><Users size={10} /> {lesson.students}</span>}
        {(lesson.start || lesson.end) && (
          <span className="tabular-nums">{formatShortDate(lesson.start) || '?'} → {formatShortDate(lesson.end) || '?'}</span>
        )}
      </div>
      {lesson.speaker && lesson.notes.length > 0 && (
        <p className="text-[11px] opacity-70 mt-1 italic leading-snug">{lesson.notes.join(' · ')}</p>
      )}
      {ended && (
        <p className="mt-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 leading-snug">
          <AlertTriangle size={11} className="inline -mt-0.5 mr-1" />По таблице курс закончился {formatShortDate(lesson.end)}
        </p>
      )}
      {upcoming && (
        <p className="mt-1.5 text-[11px] font-medium text-blue-700 dark:text-blue-300">Старт {formatShortDate(lesson.start)}</p>
      )}
    </div>
  )
}

export default function RoomSheetView() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const [refreshing, setRefreshing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [blockId, setBlockId] = useState(null)
  const [speaker, setSpeaker] = useState('')
  const [onlyEnded, setOnlyEnded] = useState(false)
  const [now, setNow] = useState(() => new Date())

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    try {
      const data = await api(`/api/schedule/sheet${refresh ? '?refresh=1' : ''}`)
      setState({ loading: false, error: '', data })
    } catch (err) {
      setState(s => ({ loading: false, error: err.message || 'Не удалось загрузить таблицу', data: s.data }))
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  // the sheet is edited by hand all day: re-read it every 2 minutes, and tick the «сейчас» marker
  useEffect(() => {
    const id = setInterval(() => { setNow(new Date()); if (document.visibilityState === 'visible') load() }, 120_000)
    return () => clearInterval(id)
  }, [load])

  const parsed = useMemo(() => (state.data?.rows ? parseRoomSheet(state.data.rows, now) : { blocks: [] }), [state.data, now])
  const todayKey = WEEKDAY_KEYS[now.getDay()]
  const block = parsed.blocks.find(b => b.id === blockId)
    || parsed.blocks.find(b => b.days.includes(todayKey))
    || parsed.blocks[0]

  const directionOrder = useMemo(() => {
    const keys = []
    for (const b of parsed.blocks) for (const s of b.slots) for (const c of s.cells) {
      const k = c && directionKey(c.direction)
      if (k && !keys.includes(k)) keys.push(k)
    }
    return keys
  }, [parsed])

  const legend = useMemo(() => {
    const seen = new Map()
    for (const b of parsed.blocks) for (const s of b.slots) for (const c of s.cells) {
      if (c?.direction && !seen.has(directionKey(c.direction))) seen.set(directionKey(c.direction), c.direction)
    }
    return [...seen.entries()]
  }, [parsed])

  const speakers = useMemo(() => {
    const set = new Set()
    for (const b of parsed.blocks) for (const s of b.slots) for (const c of s.cells) if (c?.speaker) set.add(c.speaker)
    return [...set].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [parsed])

  if (state.loading) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center text-slate-400">
        <RefreshCw size={28} className="mx-auto mb-3 animate-spin" /> Загружаем таблицу…
      </div>
    )
  }

  const data = state.data
  if (!data?.configured || editing) {
    if (isAdmin) {
      return <LinkForm initial={data?.url} onSaved={() => { setEditing(false); setState(s => ({ ...s, loading: true })); load(true) }} onCancel={editing ? () => setEditing(false) : null} />
    }
    return (
      <div className="glass-card rounded-2xl p-10 text-center">
        <Sheet size={40} className="mx-auto text-slate-300 mb-3" />
        <p className="text-slate-500">{state.error || 'Таблица с кабинетами ещё не подключена. Попросите владельца или администратора подключить её.'}</p>
      </div>
    )
  }

  const stats = block ? blockStats(block) : null
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const isTodayBlock = block?.days.includes(todayKey)
  const visible = (c) => c && (!speaker || c.speaker === speaker) && (!onlyEnded || c.status === 'ended')
  const filtering = !!speaker || onlyEnded
  const fetchedAt = data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div className="space-y-4">
      {/* Source + actions */}
      <div className="glass-card rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Sheet size={18} className="text-emerald-600 shrink-0" />
          <p className="text-sm text-slate-600 min-w-0">
            Данные из Google Таблицы{fetchedAt && <> · обновлено в {fetchedAt}</>}
            <span className="hidden sm:inline text-slate-400"> · правки вносите в таблице, здесь они появятся сами</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => load(true)} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 disabled:opacity-60">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Обновить
          </button>
          <a href={data.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100">
            <ExternalLink size={14} /> Открыть таблицу
          </a>
          {isAdmin && (
            <button onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200">
              <Link2 size={14} /> Ссылка
            </button>
          )}
        </div>
      </div>

      {state.error && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{state.error}{data.rows ? ' Показана последняя загруженная версия.' : ''}</span>
        </div>
      )}

      {!block ? (
        <div className="glass-card rounded-2xl p-10 text-center text-slate-500">
          На этом листе не нашлось сетки «кабинеты × время». Проверьте, что ссылка ведёт на нужный лист.
        </div>
      ) : (
        <>
          {/* Day pattern tabs + filters */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex gap-1.5 overflow-x-auto">
              {parsed.blocks.map(b => {
                const active = b.id === block.id
                return (
                  <button key={b.id} onClick={() => setBlockId(b.id)}
                    className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {b.label}
                    {b.days.includes(todayKey) && <span className={`ml-1.5 text-[10px] font-medium ${active ? 'text-blue-100' : 'text-blue-600'}`}>сегодня</span>}
                  </button>
                )
              })}
            </div>
            <div className="flex flex-wrap gap-2 lg:ml-auto">
              <select value={speaker} onChange={e => setSpeaker(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm max-w-full">
                <option value="">Все спикеры</option>
                {speakers.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {stats.ended > 0 && (
                <button onClick={() => setOnlyEnded(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium ${onlyEnded ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
                  <AlertTriangle size={13} /> Курс закончился: {stats.ended}
                </button>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="glass-card rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{stats.busy}</p>
              <p className="text-xs text-slate-500">занятых слотов</p>
            </div>
            <div className="glass-card rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-emerald-600 tabular-nums">{stats.free}</p>
              <p className="text-xs text-slate-500">свободных слотов</p>
            </div>
            <div className="glass-card rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-blue-600 tabular-nums">{block.rooms.length}</p>
              <p className="text-xs text-slate-500">кабинетов</p>
            </div>
            <div className="glass-card rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-amber-600 tabular-nums">{stats.ended}</p>
              <p className="text-xs text-slate-500">закончились по датам</p>
            </div>
          </div>

          {/* Grid */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-separate border-spacing-0 text-sm" style={{ minWidth: `${76 + block.rooms.length * 170}px` }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-slate-50 border-b border-slate-200 px-3 py-2.5 text-left text-xs font-semibold text-slate-500 w-[76px]">Время</th>
                    {block.rooms.map((r, i) => (
                      <th key={i} className="bg-slate-50 border-b border-l border-slate-200 px-3 py-2.5 text-left">
                        <p className="text-sm font-semibold text-slate-800">{r.name}</p>
                        {r.capacity && <p className="text-[11px] font-normal text-slate-500">до {r.capacity} мест</p>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.slots.map((slot, si) => {
                    const live = isTodayBlock && nowMin >= toMinutes(slot.start) && nowMin < toMinutes(slot.end)
                    return (
                      <tr key={si} className={live ? 'bg-blue-50/60 dark:bg-blue-500/10' : ''}>
                        <td className={`sticky left-0 z-10 border-b border-slate-100 px-3 py-2 align-top ${live ? 'bg-blue-50 dark:bg-blue-950' : 'bg-white'}`}>
                          <p className="text-xs font-bold text-slate-700 tabular-nums">{slot.start}</p>
                          <p className="text-[11px] text-slate-400 tabular-nums">–{slot.end}</p>
                          {live && <p className="text-[10px] font-semibold text-blue-600 mt-0.5">сейчас</p>}
                        </td>
                        {slot.cells.map((c, ci) => (
                          <td key={ci} className="border-b border-l border-slate-100 p-1.5 align-top">
                            {visible(c) ? (
                              <LessonCard lesson={c} slot={slot} colorClass={PALETTE[colorIndex(c.direction, directionOrder)]} />
                            ) : c && filtering ? (
                              <div className="h-full min-h-[56px] rounded-xl bg-slate-50/60" />
                            ) : (
                              <div className="h-full min-h-[56px] rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-[11px] text-slate-300 dark:border-white/10 dark:text-slate-600">свободно</div>
                            )}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend + notes */}
          {legend.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
              {legend.map(([key, label]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${DOT[colorIndex(label, directionOrder)]}`} /> {label}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full border border-dashed border-amber-500" /> курс закончился по датам в таблице
              </span>
            </div>
          )}
          {block.notes.length > 0 && (
            <div className="glass-card rounded-2xl p-4">
              <p className="text-xs font-semibold text-slate-500 mb-1.5">Заметки на листе</p>
              <ul className="space-y-1 text-sm text-slate-700">
                {block.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
