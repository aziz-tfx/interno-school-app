import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Users, Clock, Sheet, UserRound, CalendarRange, Upload, Info } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { buildRoomGrid, groupsWithoutTime } from '../utils/roomGrid'
import { directionKey, dayLabel, toMinutes, WEEKDAY_KEYS } from '../utils/roomSheet'
import SheetImportModal from './SheetImportModal'

// «Расписание» → «Кабинеты»: rooms across, time down, built from the
// groups in the system (room + days + time of each group). A group made in
// the group form shows up here at once; the Google Sheet the school used
// before is moved in once with «Перенести из Google Таблицы».

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

const shortDate = (iso) => {
  const m = String(iso || '').match(/^\d{4}-(\d{2})-(\d{2})/)
  return m ? `${m[2]}.${m[1]}` : ''
}

function GroupCard({ placement, color, teacherName, students, ended, onOpen }) {
  const { group, slot, days, partial, conflict } = placement
  return (
    // a div, not a <button>: the app turns light-theme buttons into pills
    <div role="button" tabIndex={0} onClick={onOpen} title={group.sheetNote || group.name}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      className={`w-full h-full rounded-xl border p-2.5 text-left cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
        conflict ? 'border-red-400 ring-1 ring-red-300 ' : ''}${ended ? 'bg-slate-50 border-dashed border-amber-400 text-slate-600 dark:text-slate-300' : color}`}>
      <p className="text-[11px] font-bold flex items-center gap-1 tabular-nums">
        <Clock size={11} /> {slot.start}–{slot.end}
        {partial && <span className="ml-auto font-medium opacity-80">только {days.map(dayLabel).join(', ')}</span>}
      </p>
      <p className="text-sm font-semibold leading-tight break-words mt-0.5">{group.name}</p>
      {group.course && <p className="text-xs opacity-80 leading-snug">{group.course}</p>}
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-[11px] opacity-90">
        {teacherName && <span className="flex items-center gap-0.5"><UserRound size={10} /> {teacherName}</span>}
        <span className="flex items-center gap-0.5 tabular-nums"><Users size={10} /> {students}{group.maxOffline && !slot.online ? `/${group.maxOffline}` : ''}</span>
        {(group.startDate || group.endDate) && (
          <span className="tabular-nums">{shortDate(group.startDate) || '?'} → {shortDate(group.endDate) || '?'}</span>
        )}
      </div>
      {group.sheetNote && <p className="text-[11px] opacity-70 mt-1 italic leading-snug">{group.sheetNote}</p>}
      {conflict && (
        <p className="mt-1.5 text-[11px] font-medium text-red-600 dark:text-red-300 leading-snug">
          <AlertTriangle size={11} className="inline -mt-0.5 mr-1" />Пересекается по времени с другой группой
        </p>
      )}
      {ended && (
        <p className="mt-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 leading-snug">
          <AlertTriangle size={11} className="inline -mt-0.5 mr-1" />Дата окончания {shortDate(group.endDate)} прошла
        </p>
      )}
    </div>
  )
}

export default function RoomsView() {
  const { user } = useAuth()
  const { groups, rooms, teachers, branches, getGroupOfflineCount, getGroupOnlineCount } = useData()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'
  const allBranches = user?.branch === 'all'

  const defaultBranch = useMemo(() => {
    if (!allBranches) return user?.branch || ''
    const withRooms = branches.find(b => rooms.some(r => (r.branchId || r.branch) === b.id))
    return (withRooms || branches[0])?.id || ''
  }, [allBranches, user, branches, rooms])
  const [branchId, setBranchId] = useState('')
  useEffect(() => { if (!branchId && defaultBranch) setBranchId(defaultBranch) }, [defaultBranch, branchId])

  const [blockId, setBlockId] = useState(null)
  const [teacherFilter, setTeacherFilter] = useState('')
  const [onlyEnded, setOnlyEnded] = useState(false)
  const [importing, setImporting] = useState(false)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const teacherNameOf = (g) =>
    teachers.find(t => String(t.id) === String(g.teacherId))?.name || g.teacherName || ''

  const grid = useMemo(
    () => buildRoomGrid({ groups, rooms, branchId: branchId || defaultBranch, branches, today: now }),
    [groups, rooms, branchId, defaultBranch, branches, now],
  )
  const noTime = useMemo(
    () => groupsWithoutTime({ groups, branchId: branchId || defaultBranch, branches }),
    [groups, branchId, defaultBranch, branches],
  )

  const todayKey = WEEKDAY_KEYS[now.getDay()]
  const block = grid.find(b => b.id === blockId) || grid.find(b => b.days.includes(todayKey)) || grid[0]

  const directionOrder = useMemo(() => {
    const keys = []
    for (const g of groups) { const k = directionKey(g.course); if (k && !keys.includes(k)) keys.push(k) }
    return keys
  }, [groups])
  const colorOf = (course) => Math.max(0, directionOrder.indexOf(directionKey(course))) % PALETTE.length

  const teacherOptions = useMemo(() => {
    const set = new Set()
    for (const b of grid) for (const r of b.rows) for (const c of r.cells) for (const p of c) {
      const n = teacherNameOf(p.group); if (n) set.add(n)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [grid, teachers]) // eslint-disable-line react-hooks/exhaustive-deps

  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const isEnded = (g) => !!g.endDate && new Date(`${g.endDate}T23:59:59`) < day0
  const totalPlaced = grid.reduce((s, b) => s + b.stats.groups, 0)
  const imported = groups.some(g => g.importedFrom === 'sheet')
  const visible = (p) => (!teacherFilter || teacherNameOf(p.group) === teacherFilter) && (!onlyEnded || isEnded(p.group))
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const legend = useMemo(() => {
    const seen = new Map()
    if (block) for (const r of block.rows) for (const c of r.cells) for (const p of c) {
      const k = directionKey(p.group.course)
      if (k && !seen.has(k)) seen.set(k, p.group.course)
    }
    return [...seen.values()]
  }, [block])

  return (
    <div className="space-y-4">
      {/* Branch + import */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {allBranches && branches.length > 1 && (
          <select value={branchId} onChange={e => { setBranchId(e.target.value); setTeacherFilter('') }}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm">
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <p className="text-sm text-slate-500 flex items-start gap-1.5 flex-1 min-w-0">
          <Info size={15} className="mt-0.5 shrink-0" />
          Сетка строится из групп: кабинет, дни и время берутся из карточки группы. Новая группа появится здесь сразу после создания.
        </p>
        {isAdmin && totalPlaced > 0 && (
          <button onClick={() => setImporting(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200">
            <Sheet size={14} /> {imported ? 'Перенести из таблицы ещё раз' : 'Перенести из Google Таблицы'}
          </button>
        )}
      </div>

      {totalPlaced === 0 ? (
        <div className="glass-card rounded-2xl p-8 sm:p-10 text-center">
          <CalendarRange size={44} className="mx-auto text-slate-300 mb-3" />
          <p className="font-semibold text-slate-800">В этом филиале пока нет групп с кабинетом и временем</p>
          <p className="text-sm text-slate-500 mt-1 max-w-xl mx-auto">
            {isAdmin
              ? 'Перенесите текущее расписание из Google Таблицы: каждая карточка станет группой с кабинетом, днями, временем, учителем и датами. Дальше группы добавляются в системе.'
              : 'Когда у групп будут указаны кабинет, дни и время, они появятся здесь.'}
          </p>
          {isAdmin && (
            <button onClick={() => setImporting(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700">
              <Upload size={16} /> Перенести из Google Таблицы
            </button>
          )}
        </div>
      ) : block && (
        <>
          {/* Day pattern tabs + filters */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex gap-1.5 overflow-x-auto">
              {grid.map(b => {
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
              <select value={teacherFilter} onChange={e => setTeacherFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm max-w-full">
                <option value="">Все учителя</option>
                {teacherOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {block.stats.ended > 0 && (
                <button onClick={() => setOnlyEnded(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium ${onlyEnded ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
                  <AlertTriangle size={13} /> Дата окончания прошла: {block.stats.ended}
                </button>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              [block.stats.groups, 'групп', 'text-slate-900'],
              [block.stats.busy, 'занятых слотов', 'text-blue-600'],
              [block.stats.free, 'свободных слотов', 'text-emerald-600'],
              [block.stats.ended, 'дата окончания прошла', 'text-amber-600'],
            ].map(([v, label, color]) => (
              <div key={label} className="glass-card rounded-xl p-3 text-center">
                <p className={`text-2xl font-bold tabular-nums ${color}`}>{v}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-separate border-spacing-0 text-sm" style={{ minWidth: `${76 + block.columns.length * 170}px` }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-slate-50 border-b border-slate-200 px-3 py-2.5 text-left text-xs font-semibold text-slate-500 w-[76px]">Время</th>
                    {block.columns.map(c => (
                      <th key={c.id} className="bg-slate-50 border-b border-l border-slate-200 px-3 py-2.5 text-left">
                        <p className={`text-sm font-semibold ${c.kind === 'none' ? 'text-amber-700' : 'text-slate-800'}`}>{c.name}</p>
                        {c.capacity && <p className="text-[11px] font-normal text-slate-500">до {c.capacity} мест</p>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map(row => {
                    const live = block.days.includes(todayKey) && row.start && nowMin >= toMinutes(row.start) && nowMin < toMinutes(row.end)
                    return (
                      <tr key={row.label} className={live ? 'bg-blue-50/60 dark:bg-blue-500/10' : ''}>
                        <td className={`sticky left-0 z-10 border-b border-slate-100 px-3 py-2 align-top ${live ? 'bg-blue-50 dark:bg-blue-950' : 'bg-white'}`}>
                          <p className="text-xs font-bold text-slate-700 tabular-nums">{row.start || 'до'}</p>
                          <p className="text-[11px] text-slate-400 tabular-nums">–{row.end}</p>
                          {live && <p className="text-[10px] font-semibold text-blue-600 mt-0.5">сейчас</p>}
                        </td>
                        {row.cells.map((cell, ci) => {
                          const shown = cell.filter(visible)
                          return (
                            <td key={ci} className="border-b border-l border-slate-100 p-1.5 align-top">
                              {shown.length ? (
                                <div className="space-y-1.5">
                                  {shown.map(p => (
                                    <GroupCard key={`${p.group.id}-${p.slot.start}`} placement={p}
                                      color={PALETTE[colorOf(p.group.course)]}
                                      teacherName={teacherNameOf(p.group)}
                                      students={getGroupOfflineCount(p.group.name) + getGroupOnlineCount(p.group.name)}
                                      ended={isEnded(p.group)}
                                      onOpen={() => navigate(`/students?tab=groups&q=${encodeURIComponent(p.group.name)}`)} />
                                  ))}
                                </div>
                              ) : cell.length ? (
                                <div className="h-full min-h-[56px] rounded-xl bg-slate-50/60" />
                              ) : (
                                <div className="h-full min-h-[56px] rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-[11px] text-slate-300 dark:border-white/10 dark:text-slate-600">свободно</div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {legend.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
              {legend.map(label => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${DOT[colorOf(label)]}`} /> {label}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {noTime.length > 0 && totalPlaced > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 dark:bg-amber-400/10 dark:border-amber-400/30 dark:text-amber-200">
          <p className="font-medium flex items-center gap-1.5"><AlertTriangle size={15} /> Не в сетке: у {noTime.length} групп не указаны дни и время</p>
          <p className="mt-1 text-xs">{noTime.slice(0, 12).map(g => g.name).join(', ')}{noTime.length > 12 ? ` и ещё ${noTime.length - 12}` : ''}. Укажите расписание в карточке группы.</p>
        </div>
      )}

      {importing && (
        <SheetImportModal defaultBranch={branchId || defaultBranch} onClose={() => setImporting(false)} />
      )}
    </div>
  )
}
