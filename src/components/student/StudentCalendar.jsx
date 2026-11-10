import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, PenTool, Wallet, Unlock, MapPin, User, CalendarPlus, CheckCircle2, Flag,
} from 'lucide-react'
import { useData } from '../../contexts/DataContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { localISO, todayISO, DAY_KEYS } from '../../utils/dates'
import { getUnlockedModuleCount } from '../../utils/lessonAccess'

// The student's calendar: everything with a date in one place —
//   lessons of their group (the weekly timetable), homework deadlines,
//   the next payment, and for online students the Mondays when the next
//   module opens. A month to look at, a day to tap, and a button that puts
//   it all into the phone's own calendar (.ics).

const HORIZON_DAYS = 60 // how far ahead the timetable is laid out
const PAST_DAYS = 31    // …and back (the month grid shows the whole current month)

const KINDS = {
  lesson: { icon: Clock, dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-600' },
  deadline: { icon: PenTool, dot: 'bg-purple-500', chip: 'bg-purple-50 text-purple-600' },
  payment: { icon: Wallet, dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-600' },
  module: { icon: Unlock, dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-600' },
  start: { icon: Flag, dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-600' },
}

const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return localISO(d) }
const monthOf = (iso) => iso.slice(0, 7)

/** All dated things of a student between `from` and `to` (ISO days, inclusive). */
export function buildStudentEvents({ student, groups, schedule, assignments, submissions, modules, courses, debt, nextPaymentDate, from, to, t }) {
  const events = []
  const realGroups = groups.filter(g => !g.synthetic && !g.bonus)
  const groupIds = new Set(realGroups.map(g => g.id))
  const groupNames = new Set(realGroups.map(g => g.name))

  // ── lessons: the weekly timetable, not before the group starts ──
  const slots = (schedule || []).filter(e => (e.groupId && groupIds.has(e.groupId)) || (e.groupName && groupNames.has(e.groupName)))
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const key = DAY_KEYS[new Date(`${day}T12:00:00`).getDay()]
    for (const e of slots) {
      if (e.dayOfWeek !== key) continue
      const g = realGroups.find(x => x.id === e.groupId || x.name === e.groupName)
      if (g?.startDate && day < String(g.startDate).slice(0, 10)) continue
      events.push({
        id: `lesson:${e.id}:${day}`, kind: 'lesson', date: day, time: e.startTime || '', endTime: e.endTime || '',
        title: e.courseName || g?.course || t('scal.lesson'),
        details: [e.roomName && { icon: MapPin, text: e.roomName }, e.teacherName && { icon: User, text: e.teacherName }].filter(Boolean),
        to: '/schedule', slot: e,
      })
    }
  }

  // ── course start ──
  for (const g of realGroups) {
    const start = String(g.startDate || '').slice(0, 10)
    if (start && start >= from && start <= to) {
      events.push({ id: `start:${g.id}`, kind: 'start', date: start, time: '', title: t('scal.course_start', { course: g.course || g.name }), details: [], allDay: true })
    }
  }

  // ── homework deadlines ──
  const handedIn = new Map((submissions || []).map(s => [s.assignmentId, s]))
  for (const a of assignments || []) {
    const day = String(a.deadline || '').slice(0, 10)
    if (!day || day < from || day > to) continue
    const sub = handedIn.get(a.id)
    events.push({
      id: `deadline:${a.id}`, kind: 'deadline', date: day, time: '', allDay: true,
      title: a.title || t('scal.homework'),
      done: !!sub, status: sub ? (sub.status === 'reviewed' || sub.grade != null ? t('scal.checked') : t('scal.handed_in')) : null,
      to: a.groupId && a.groupId !== 'all' ? `/lms/group/${a.groupId}?tab=assignments` : '/?tab=assignments',
    })
  }

  // ── next payment ──
  const pay = String(nextPaymentDate || '').slice(0, 10)
  if (debt > 0 && pay && pay >= from && pay <= to) {
    events.push({ id: `payment:${pay}`, kind: 'payment', date: pay, time: '', allDay: true, title: t('scal.payment'), amount: debt, to: '/?tab=payments' })
  }

  // ── online: the Mondays when the next modules open ──
  // (only while the weekly schedule is what opens lessons: less than half paid)
  const price = Number(student?.totalCoursePrice) || 0
  const paidShare = price > 0 ? (price - debt) / price : 1
  if (student?.learningFormat === 'Онлайн' && !student.freeAccess && paidShare < 0.5) {
    for (const g of realGroups) {
      if (!g.startDate) continue
      const course = (courses || []).find(c => c.name === g.course)
      const mods = (modules || []).filter(m => m.courseId === course?.id).sort((a, b) => (a.order || 0) - (b.order || 0))
      const open = getUnlockedModuleCount(g.startDate)
      // walk Mondays from today forward: each one opens the next module
      let n = open
      for (let day = todayISO(); day <= to && n < mods.length; day = addDays(day, 1)) {
        if (new Date(`${day}T12:00:00`).getDay() !== 1 || day === todayISO()) continue
        if (day <= String(g.startDate).slice(0, 10)) continue
        events.push({ id: `module:${g.id}:${n}`, kind: 'module', date: day, time: '', allDay: true, title: t('scal.module_opens', { title: mods[n].title || `${n + 1}` }), to: '/?tab=course' })
        n++
      }
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '00:00').localeCompare(b.time || '00:00'))
}

// ─── .ics for the phone's calendar ───────────────────────────────────────
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')
const icsDay = (iso) => iso.replace(/-/g, '')
const icsTime = (iso, hhmm) => `${icsDay(iso)}T${(hhmm || '00:00').replace(':', '')}00`
const BYDAY = { sun: 'SU', mon: 'MO', tue: 'TU', wed: 'WE', thu: 'TH', fri: 'FR', sat: 'SA' }

export function buildIcs(events, { calendarName }) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//INTERNO//LMS//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsText(calendarName)}`]
  // lessons: one repeating event per timetable slot instead of sixty single ones
  const slots = new Map()
  for (const e of events) if (e.kind === 'lesson' && !slots.has(e.slot.id)) slots.set(e.slot.id, e)
  for (const e of slots.values()) {
    const until = icsDay(addDays(todayISO(), 120))
    out.push('BEGIN:VEVENT', `UID:lesson-${e.slot.id}@interno`, `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Tashkent:${icsTime(e.date, e.time)}`, `DTEND;TZID=Asia/Tashkent:${icsTime(e.date, e.endTime || e.time)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[e.slot.dayOfWeek]};UNTIL=${until}T000000Z`,
      `SUMMARY:${icsText(e.title)}`,
      e.slot.roomName ? `LOCATION:${icsText(e.slot.roomName)}` : null,
      e.slot.teacherName ? `DESCRIPTION:${icsText(e.slot.teacherName)}` : null,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'TRIGGER:-PT60M', 'END:VALARM',
      'END:VEVENT')
  }
  for (const e of events) {
    if (e.kind === 'lesson' || e.date < todayISO()) continue
    out.push('BEGIN:VEVENT', `UID:${e.id.replace(/[^\w-]/g, '-')}@interno`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDay(e.date)}`, `DTEND;VALUE=DATE:${icsDay(addDays(e.date, 1))}`,
      `SUMMARY:${icsText(e.title)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'TRIGGER:-PT15H', 'END:VALARM',
      'END:VEVENT')
  }
  out.push('END:VCALENDAR')
  return out.filter(Boolean).join('\r\n')
}

export default function StudentCalendar({ student, groups, assignments, submissions, debt, nextPaymentDate }) {
  const { t, language } = useLanguage()
  const navigate = useNavigate()
  const { schedule, lmsModules, courses } = useData()
  const locale = language === 'uz' ? 'uz-UZ' : 'ru-RU'
  const today = todayISO()
  const [month, setMonth] = useState(monthOf(today))
  const [picked, setPicked] = useState(today)

  const events = useMemo(() => buildStudentEvents({
    student, groups, schedule, assignments, submissions, modules: lmsModules, courses, debt, nextPaymentDate,
    from: addDays(today, -PAST_DAYS), to: addDays(today, HORIZON_DAYS), t,
  }), [student, groups, schedule, assignments, submissions, lmsModules, courses, debt, nextPaymentDate, today, t])

  const byDay = useMemo(() => {
    const map = new Map()
    for (const e of events) { if (!map.has(e.date)) map.set(e.date, []); map.get(e.date).push(e) }
    return map
  }, [events])

  // ─── month grid (Monday first) ───
  const cells = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const first = new Date(y, m - 1, 1)
    const lead = (first.getDay() + 6) % 7
    const days = new Date(y, m, 0).getDate()
    const list = Array(lead).fill(null)
    for (let d = 1; d <= days; d++) list.push(`${month}-${String(d).padStart(2, '0')}`)
    while (list.length % 7) list.push(null)
    return list
  }, [month])
  const shiftMonth = (n) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + n, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const minMonth = monthOf(addDays(today, -PAST_DAYS)), maxMonth = monthOf(addDays(today, HORIZON_DAYS))
  // «Ноябрь 2026» — CSS capitalize would also turn the trailing «г.» into «Г.»
  const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1)
  const monthLabel = capFirst(new Date(`${month}-01T12:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' }).replace(/\s*г\.$/, ''))
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' })), [locale]) // 2024-01-01 is a Monday

  const dayLabel = (iso) => {
    if (iso === today) return t('scal.today')
    if (iso === addDays(today, 1)) return t('scal.tomorrow')
    return capFirst(new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }))
  }

  const pickedEvents = byDay.get(picked) || []
  // what's ahead, after the picked day's own list: the next two weeks
  const upcoming = useMemo(() => {
    const out = []
    for (const [day, list] of byDay) {
      if (day < today || day === picked || day > addDays(today, 14)) continue
      out.push([day, list])
    }
    return out.sort(([a], [b]) => a.localeCompare(b))
  }, [byDay, today, picked])
  const overdue = useMemo(
    () => events.filter(e => e.kind === 'deadline' && !e.done && e.date < today),
    [events, today]
  )

  const exportIcs = () => {
    const ics = buildIcs(events.filter(e => e.kind === 'lesson' || e.date >= today), { calendarName: `INTERNO — ${student?.course || ''}` })
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'interno.ics'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  const row = (e) => {
    const kind = KINDS[e.kind]
    const Icon = e.done ? CheckCircle2 : kind.icon
    const body = (
      <>
        <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${e.done ? 'bg-emerald-50 text-emerald-600' : kind.chip}`}>
          <Icon size={18} />
        </span>
        <span className="flex-1 min-w-0 text-left">
          <span className={`block text-sm font-medium [overflow-wrap:anywhere] ${e.done ? 'text-slate-500' : 'text-slate-800'}`}>{e.title}</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
            {e.time && <span className="font-medium text-slate-700">{e.time}{e.endTime ? `–${e.endTime}` : ''}</span>}
            {e.kind === 'deadline' && <span>{e.status || t('scal.due')}</span>}
            {e.kind === 'payment' && <span>{new Intl.NumberFormat('ru-RU').format(e.amount)} {t('scal.sum')}</span>}
            {(e.details || []).map((d, i) => (
              <span key={i} className="flex items-center gap-1 min-w-0"><d.icon size={12} className="shrink-0" /> <span className="truncate">{d.text}</span></span>
            ))}
          </span>
        </span>
        {e.to && <ChevronRight size={16} className="shrink-0 text-slate-300" />}
      </>
    )
    return e.to
      ? <button key={e.id} type="button" onClick={() => navigate(e.to)} className="w-full flex items-center gap-3 py-2.5 min-h-[56px]">{body}</button>
      : <div key={e.id} className="flex items-center gap-3 py-2.5 min-h-[56px]">{body}</div>
  }

  return (
    <div className="space-y-5">
      {/* Month */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2 min-w-0">
            <CalendarDays size={18} className="text-blue-500 shrink-0" /> <span className="truncate">{monthLabel}</span>
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            {month !== monthOf(today) && (
              <button type="button" onClick={() => { setMonth(monthOf(today)); setPicked(today) }}
                className="px-3 h-10 text-xs font-medium text-blue-600 rounded-xl hover:bg-blue-50">{t('scal.today')}</button>
            )}
            <button type="button" onClick={() => shiftMonth(-1)} disabled={month <= minMonth} aria-label={t('scal.prev_month')}
              className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ChevronLeft size={18} /></button>
            <button type="button" onClick={() => shiftMonth(1)} disabled={month >= maxMonth} aria-label={t('scal.next_month')}
              className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-400 mb-1">
          {weekdays.map(w => <span key={w} className="capitalize">{w}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((day, i) => {
            if (!day) return <span key={`e${i}`} />
            const list = byDay.get(day) || []
            const kinds = [...new Set(list.map(e => e.kind))].slice(0, 3)
            const isToday = day === today, isPicked = day === picked
            return (
              <button key={day} type="button" onClick={() => setPicked(day)} aria-pressed={isPicked}
                aria-label={`${dayLabel(day)}${list.length ? `, ${list.length}` : ''}`}
                className="flex flex-col items-center justify-center gap-0.5 h-11 rounded-xl">
                <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm transition-colors ${
                  isPicked ? 'bg-blue-600 text-white font-semibold'
                    : isToday ? 'bg-blue-50 text-blue-700 font-semibold'
                    : day < today ? 'text-slate-400' : 'text-slate-700'
                }`}>{Number(day.slice(8))}</span>
                <span className="flex gap-0.5 h-1.5">
                  {kinds.map(k => <span key={k} className={`w-1.5 h-1.5 rounded-full ${KINDS[k].dot}`} />)}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
          {['lesson', 'deadline', 'payment', 'module'].map(k => (
            <span key={k} className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${KINDS[k].dot}`} /> {t(`scal.legend_${k}`)}</span>
          ))}
        </div>
      </div>

      {/* Overdue homework comes first */}
      {overdue.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-200 p-4 sm:p-5">
          <p className="text-sm font-semibold text-red-600">{t('scal.overdue')} · {overdue.length}</p>
          <div className="divide-y divide-slate-100">{overdue.map(row)}</div>
        </div>
      )}

      {/* The picked day */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
        <p className="text-sm font-semibold text-slate-800">{dayLabel(picked)}</p>
        {pickedEvents.length === 0
          ? <p className="text-sm text-slate-400 py-5 text-center">{t('scal.nothing')}</p>
          : <div className="divide-y divide-slate-100">{pickedEvents.map(row)}</div>}
      </div>

      {/* What's ahead */}
      {upcoming.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-800">{t('scal.upcoming')}</p>
          {upcoming.map(([day, list]) => (
            <div key={day}>
              <p className="text-xs font-semibold text-slate-500">{dayLabel(day)}</p>
              <div className="divide-y divide-slate-100">{list.map(row)}</div>
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={exportIcs} disabled={events.length === 0}
        className="w-full flex items-center justify-center gap-2 min-h-[48px] px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
        <CalendarPlus size={18} className="text-blue-500" /> {t('scal.export')}
      </button>
      <p className="text-xs text-slate-400 text-center -mt-2 px-4">{t('scal.export_hint')}</p>
    </div>
  )
}
