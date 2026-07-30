import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardCheck, CalendarDays, Users, AlertTriangle, Snowflake,
  DoorOpen, TrendingUp, CheckCircle2, XCircle, Clock, Filter,
  CreditCard, ChevronRight, UserX,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { sameBranch } from '../utils/branchMatch'

// ─── Операционка — рабочий экран администратора филиала ─────────────────
// Ежедневный чек-лист (занятия сегодня + статус отметки посещаемости) и
// операционные показатели: посещаемость недели, риск отвала (пропуски
// подряд), заполняемость групп, загрузка кабинетов, должники. Всё
// считается из уже собираемых данных: schedule / attendance / groups /
// students / rooms / payments.

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DAY_LABELS = { mon: 'Пн', tue: 'Вт', wed: 'Ср', thu: 'Чт', fri: 'Пт', sat: 'Сб', sun: 'Вс' }

const todayISO = () => new Date().toISOString().split('T')[0]
const isoDaysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}
const nowHHMM = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const hoursBetween = (a, b) => {
  const [ah, am] = (a || '0:0').split(':').map(Number)
  const [bh, bm] = (b || '0:0').split(':').map(Number)
  return Math.max(0, (bh * 60 + bm - ah * 60 - am) / 60)
}

function Tile({ icon: Icon, tone, label, value, sub, onClick }) {
  const tones = {
    blue: 'text-blue-600 bg-blue-50', emerald: 'text-emerald-600 bg-emerald-50',
    amber: 'text-amber-600 bg-amber-50', red: 'text-red-600 bg-red-50',
    violet: 'text-violet-600 bg-violet-50', cyan: 'text-cyan-600 bg-cyan-50',
  }
  return (
    <div onClick={onClick}
      className={`glass-card rounded-xl p-4 ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all' : ''}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${tones[tone] || tones.blue}`}>
        <Icon size={16} />
      </div>
      <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function BranchOps() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { branches, groups, students, teachers, rooms, schedule, attendance, payments } = useData()

  const lockedBranch = user?.branch && user.branch !== 'all' ? user.branch : null
  const [branchSel, setBranchSel] = useState(lockedBranch || branches[0]?.id || '')
  const branch = lockedBranch || branchSel

  const today = todayISO()
  const todayKey = DAY_KEYS[new Date().getDay()]
  const now = nowHHMM()
  const weekAgo = isoDaysAgo(7)

  const data = useMemo(() => {
    // ─── Scope: groups / students of the branch ───
    const branchGroups = groups.filter(g => sameBranch(g.branch, branch, branches))
    const groupNames = new Set(branchGroups.map(g => g.name))
    const branchStudents = students.filter(s => sameBranch(s.branch, branch, branches) && s.status !== 'archived')
    const activeStudents = branchStudents.filter(s => s.status === 'active' || s.status === 'debtor')

    // ─── Today's lessons from the weekly schedule ───
    const todayLessons = schedule
      .filter(e => e.dayOfWeek === todayKey && (sameBranch(e.branchId, branch, branches) || groupNames.has(e.groupName)))
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
      .map(e => {
        const groupStudents = students.filter(s => (s.group === e.groupName || s.groupId === e.groupId) && s.status !== 'archived')
        const marked = attendance.filter(a => a.date === today && a.groupName === e.groupName)
        const lessonOver = (e.endTime || '') < now
        const inProgress = (e.startTime || '') <= now && !lessonOver
        return {
          ...e,
          studentsCount: groupStudents.length,
          markedCount: marked.length,
          isMarked: marked.length > 0,
          lessonOver,
          inProgress,
          // Красный флаг: занятие закончилось, а посещаемость не отмечена
          missedMark: lessonOver && marked.length === 0,
        }
      })

    // ─── Attendance rate, last 7 days (branch groups) ───
    const weekRecords = attendance.filter(a => a.date >= weekAgo && a.date <= today && groupNames.has(a.groupName))
    const weekPresent = weekRecords.filter(a => a.status === 'present' || a.status === 'late').length
    const weekRate = weekRecords.length ? Math.round((weekPresent / weekRecords.length) * 100) : null

    // Attendance rate per group (7 days)
    const byGroup = {}
    weekRecords.forEach(a => {
      if (!byGroup[a.groupName]) byGroup[a.groupName] = { total: 0, present: 0 }
      byGroup[a.groupName].total++
      if (a.status === 'present' || a.status === 'late') byGroup[a.groupName].present++
    })
    const groupRates = Object.entries(byGroup)
      .map(([name, v]) => ({ name, rate: Math.round((v.present / v.total) * 100), records: v.total }))
      .sort((a, b) => a.rate - b.rate)

    // ─── Risk: 2+ consecutive absences (latest records first) ───
    const recsByStudent = {}
    attendance.forEach(a => {
      if (!groupNames.has(a.groupName)) return
      ;(recsByStudent[a.studentId] ||= []).push(a)
    })
    const atRisk = []
    for (const s of activeStudents) {
      const recs = (recsByStudent[s.id] || []).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      let streak = 0
      for (const r of recs) {
        if (r.status === 'absent') streak++
        else break
      }
      if (streak >= 2) atRisk.push({ ...s, absentStreak: streak, lastDate: recs[0]?.date || '' })
    }
    atRisk.sort((a, b) => b.absentStreak - a.absentStreak)

    // ─── Group fill (offline groups vs capacity) ───
    const fill = branchGroups
      .filter(g => g.status === 'active' && g.format !== 'online')
      .map(g => {
        const count = students.filter(s => (s.group === g.name || s.groupId === g.id) && s.status !== 'archived' && s.learningFormat !== 'Онлайн').length
        const cap = Number(g.maxOffline) || 15
        return { id: g.id, name: g.name, course: g.course, count, cap, pct: Math.min(100, Math.round((count / cap) * 100)) }
      })
      .sort((a, b) => b.pct - a.pct)

    // ─── Room utilization: scheduled hours per week ───
    const roomLoad = rooms
      .filter(r => sameBranch(r.branchId, branch, branches))
      .map(r => {
        const entries = schedule.filter(e => e.roomId === r.id)
        const hours = entries.reduce((s, e) => s + hoursBetween(e.startTime, e.endTime), 0)
        return { id: r.id, name: r.name, capacity: r.capacity, slots: entries.length, hours: Math.round(hours * 10) / 10 }
      })
      .sort((a, b) => b.hours - a.hours)

    // ─── Debtors summary ───
    let debtSum = 0, debtorCount = 0, overdueCount = 0
    for (const s of branchStudents) {
      const price = Number(s.totalCoursePrice) || 0
      if (price <= 0) continue
      const paid = payments
        .filter(p => p.type === 'income' && !p.cancelled && String(p.studentId) === String(s.id))
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
      const debt = price - paid
      if (debt > 0 && paid > 0) {
        debtorCount++
        debtSum += debt
        if (s.nextPaymentDate && s.nextPaymentDate < today) overdueCount++
      }
    }

    const frozen = branchStudents.filter(s => s.status === 'frozen').length
    const markedToday = todayLessons.filter(l => l.isMarked).length

    return {
      todayLessons, markedToday, weekRate, weekRecords: weekRecords.length, groupRates,
      atRisk, fill, roomLoad, debtSum, debtorCount, overdueCount, frozen,
      activeCount: activeStudents.length,
    }
  }, [branch, branches, groups, students, rooms, schedule, attendance, payments, today, todayKey, now, weekAgo])

  const fmtMoney = (n) => {
    const v = Number(n) || 0
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)} млн`
    if (v >= 1000) return `${Math.round(v / 1000)} тыс`
    return String(v)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardCheck size={24} className="text-blue-600" /> Операционка
          </h2>
          <p className="text-slate-500 mt-1 text-sm">
            Ежедневная работа филиала: занятия, посещаемость, риски
          </p>
        </div>
        {!lockedBranch && (
          <div className="flex items-center gap-2 glass-card rounded-xl px-3 py-2">
            <Filter size={16} className="text-slate-400" />
            <select value={branchSel} onChange={e => setBranchSel(e.target.value)}
              className="bg-transparent text-sm font-medium text-slate-700 outline-none cursor-pointer">
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Tile icon={CalendarDays} tone="blue" label="Занятий сегодня"
          value={data.todayLessons.length}
          sub={`отмечено: ${data.markedToday}`} />
        <Tile icon={TrendingUp} tone={data.weekRate === null ? 'blue' : data.weekRate >= 80 ? 'emerald' : data.weekRate >= 60 ? 'amber' : 'red'}
          label="Посещаемость за 7 дней"
          value={data.weekRate === null ? '—' : `${data.weekRate}%`}
          sub={`${data.weekRecords} отметок`} />
        <Tile icon={Users} tone="cyan" label="Активных студентов" value={data.activeCount} />
        <Tile icon={UserX} tone={data.atRisk.length > 0 ? 'red' : 'emerald'}
          label="Риск отвала" value={data.atRisk.length}
          sub="2+ пропуска подряд" />
        <Tile icon={CreditCard} tone={data.overdueCount > 0 ? 'amber' : 'blue'}
          label="Должники" value={data.debtorCount}
          sub={`${fmtMoney(data.debtSum)} сум · просрочено ${data.overdueCount}`}
          onClick={() => navigate('/finance')} />
        <Tile icon={Snowflake} tone="violet" label="Заморожено" value={data.frozen} />
      </div>

      {/* Today's lessons checklist */}
      <div className="glass-card rounded-2xl p-4 md:p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <CalendarDays size={16} className="text-blue-500" />
          Занятия сегодня ({DAY_LABELS[todayKey]}, {today})
          <button onClick={() => navigate('/attendance')}
            className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
            Отметить посещаемость <ChevronRight size={13} />
          </button>
        </h3>
        {data.todayLessons.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">На сегодня занятий в расписании нет</p>
        ) : (
          <div className="space-y-1.5">
            {data.todayLessons.map(l => (
              <div key={l.id}
                className={`flex items-center gap-3 py-2.5 px-3 rounded-xl border-l-4 text-sm ${
                  l.missedMark ? 'border-l-red-500 bg-red-50/40'
                  : l.isMarked ? 'border-l-emerald-500 bg-emerald-50/30'
                  : l.inProgress ? 'border-l-blue-500 bg-blue-50/40'
                  : 'border-l-slate-200 bg-slate-50/50'
                }`}>
                <span className="font-mono text-xs font-semibold text-slate-600 w-24 flex-shrink-0">
                  {l.startTime}–{l.endTime}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 truncate">{l.groupName}</p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {l.courseName || '—'} · {l.teacherName || 'без учителя'} · {l.roomName || 'без кабинета'} · {l.studentsCount} студ.
                  </p>
                </div>
                {l.isMarked ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 flex-shrink-0">
                    <CheckCircle2 size={14} /> {l.markedCount}/{l.studentsCount}
                  </span>
                ) : l.missedMark ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-red-500 flex-shrink-0">
                    <XCircle size={14} /> не отмечено!
                  </span>
                ) : l.inProgress ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-blue-600 flex-shrink-0">
                    <Clock size={14} /> идёт сейчас
                  </span>
                ) : (
                  <span className="text-xs text-slate-400 flex-shrink-0">ожидается</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* At-risk students */}
        <div className="glass-card rounded-2xl p-4 md:p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500" /> Риск отвала
            <span className="text-xs font-normal text-slate-400">2+ пропуска подряд</span>
            <span className="ml-auto text-sm font-bold text-red-500">{data.atRisk.length}</span>
          </h3>
          {data.atRisk.length === 0 ? (
            <p className="text-sm text-emerald-600 text-center py-6">🎉 Пропусков подряд нет</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-auto pr-1">
              {data.atRisk.map(s => (
                <div key={s.id} className="flex items-center justify-between py-2 px-3 bg-red-50/50 border border-red-100 rounded-lg text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">{s.name}</p>
                    <p className="text-[11px] text-slate-400">{s.group || '—'}{s.phone ? ` · ${s.phone}` : ''}</p>
                  </div>
                  <span className="text-xs font-bold text-red-500 flex-shrink-0 ml-2">
                    {s.absentStreak} проп. подряд
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Attendance by group */}
        <div className="glass-card rounded-2xl p-4 md:p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-500" /> Посещаемость по группам
            <span className="text-xs font-normal text-slate-400">за 7 дней, худшие сверху</span>
          </h3>
          {data.groupRates.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">За неделю посещаемость не отмечалась</p>
          ) : (
            <div className="space-y-2">
              {data.groupRates.slice(0, 10).map(g => (
                <div key={g.name} className="flex items-center gap-3">
                  <span className="w-36 text-xs text-slate-600 text-right truncate flex-shrink-0">{g.name}</span>
                  <div className="flex-1 h-5 bg-slate-100 rounded-lg overflow-hidden">
                    <div className={`h-full rounded-lg bg-gradient-to-r ${
                      g.rate >= 80 ? 'from-emerald-400 to-teal-500' : g.rate >= 60 ? 'from-amber-400 to-amber-500' : 'from-red-400 to-red-500'
                    }`} style={{ width: `${Math.max(4, g.rate)}%` }} />
                  </div>
                  <span className="w-12 text-xs font-semibold text-slate-700 tabular-nums flex-shrink-0 text-right">{g.rate}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Group fill */}
        <div className="glass-card rounded-2xl p-4 md:p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Users size={16} className="text-violet-500" /> Заполняемость групп
          </h3>
          {data.fill.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Нет активных оффлайн-групп</p>
          ) : (
            <div className="space-y-2">
              {data.fill.map(g => (
                <div key={g.id} className="flex items-center gap-3">
                  <span className="w-36 text-xs text-slate-600 text-right truncate flex-shrink-0">{g.name}</span>
                  <div className="flex-1 h-5 bg-slate-100 rounded-lg overflow-hidden">
                    <div className={`h-full rounded-lg bg-gradient-to-r ${
                      g.pct >= 90 ? 'from-emerald-400 to-teal-500' : g.pct >= 50 ? 'from-blue-400 to-violet-500' : 'from-amber-400 to-amber-500'
                    }`} style={{ width: `${Math.max(4, g.pct)}%` }} />
                  </div>
                  <span className="w-14 text-xs font-semibold text-slate-700 tabular-nums flex-shrink-0 text-right">{g.count}/{g.cap}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Room load */}
        <div className="glass-card rounded-2xl p-4 md:p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <DoorOpen size={16} className="text-cyan-500" /> Загрузка кабинетов
            <span className="text-xs font-normal text-slate-400">часов в неделю по расписанию</span>
          </h3>
          {data.roomLoad.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">В этом филиале нет кабинетов</p>
          ) : (
            <div className="space-y-2">
              {(() => {
                const maxH = Math.max(1, ...data.roomLoad.map(r => r.hours))
                return data.roomLoad.map(r => (
                  <div key={r.id} className="flex items-center gap-3">
                    <span className="w-36 text-xs text-slate-600 text-right truncate flex-shrink-0">{r.name}</span>
                    <div className="flex-1 h-5 bg-slate-100 rounded-lg overflow-hidden">
                      <div className="h-full rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500"
                        style={{ width: `${Math.max(4, (r.hours / maxH) * 100)}%` }} />
                    </div>
                    <span className="w-20 text-xs font-semibold text-slate-700 tabular-nums flex-shrink-0 text-right">
                      {r.hours} ч · {r.slots} зан.
                    </span>
                  </div>
                ))
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
