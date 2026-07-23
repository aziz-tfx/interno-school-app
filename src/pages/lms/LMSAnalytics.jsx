import { useMemo } from 'react'
import {
  Users, TrendingUp, PlayCircle, CheckCircle2, AlertTriangle,
  Trophy, Clock, FileText, BarChart3,
} from 'lucide-react'
import { useData } from '../../contexts/DataContext'

// ─── LMS usage analytics for admins / teachers ──────────────────────────
// Built entirely from data the app already collects:
//   lmsProgress       — completed lessons (studentId, lessonId, completedAt)
//   lmsVideoProgress  — video watch (studentId, lessonId, percent, updatedAt)
//   lmsSubmissions    — assignment submissions (studentId, grade)
//   students / groups / courses / lmsLessons
//
// scopeStudentIds (optional): limit to a teacher's own students; omit for
// the whole school (admin).

const DAY = 24 * 60 * 60 * 1000
const activeWithinDays = (iso, days) => {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return !Number.isNaN(t) && (Date.now() - t) <= days * DAY
}
const latestOf = (...isos) => isos
  .filter(Boolean)
  .map(s => new Date(s).getTime())
  .filter(t => !Number.isNaN(t))
  .reduce((a, b) => Math.max(a, b), 0)

function Tile({ icon: Icon, tone, label, value, sub }) {
  const tones = {
    blue: 'text-blue-600 bg-blue-50', emerald: 'text-emerald-600 bg-emerald-50',
    amber: 'text-amber-600 bg-amber-50', violet: 'text-violet-600 bg-violet-50',
    red: 'text-red-600 bg-red-50', cyan: 'text-cyan-600 bg-cyan-50',
  }
  return (
    <div className="glass-card rounded-xl p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${tones[tone] || tones.blue}`}>
        <Icon size={16} />
      </div>
      <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Bar({ label, value, max, right, tone = 'from-blue-400 to-violet-500' }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 text-xs text-slate-600 text-right truncate flex-shrink-0">{label}</span>
      <div className="flex-1 h-6 bg-slate-100 rounded-lg overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${tone} rounded-lg`} style={{ width: `${Math.max(3, (value / Math.max(1, max)) * 100)}%` }} />
      </div>
      <span className="w-24 text-xs font-semibold text-slate-700 tabular-nums flex-shrink-0 text-right">{right}</span>
    </div>
  )
}

export default function LMSAnalytics({ scopeStudentIds = null }) {
  const { students, groups, courses, lmsLessons, lmsProgress, lmsVideoProgress, lmsSubmissions } = useData()

  const data = useMemo(() => {
    // Students in scope who have LMS access
    let scoped = students.filter(s => s.lmsAccess === true && s.status !== 'archived')
    if (scopeStudentIds) {
      const set = new Set(scopeStudentIds.map(String))
      scoped = scoped.filter(s => set.has(String(s.id)))
    }
    const total = scoped.length

    // Index progress/video/submissions by student
    const progByStudent = {}
    lmsProgress.forEach(p => {
      (progByStudent[p.studentId] ||= []).push(p)
    })
    const videoByStudent = {}
    lmsVideoProgress.forEach(v => {
      (videoByStudent[v.studentId] ||= []).push(v)
    })
    const subsByStudent = {}
    lmsSubmissions.forEach(s => {
      (subsByStudent[s.studentId] ||= []).push(s)
    })

    // Course lesson counts (for completion %)
    const lessonsByCourse = {}
    lmsLessons.forEach(l => { lessonsByCourse[l.courseId] = (lessonsByCourse[l.courseId] || 0) + 1 })
    const courseByName = {}
    courses.forEach(c => { courseByName[c.name] = c })
    const groupById = {}
    groups.forEach(g => { groupById[g.id] = g })

    // Per-student rollups
    const perStudent = scoped.map(s => {
      const prog = progByStudent[s.id] || []
      const vids = videoByStudent[s.id] || []
      const subs = subsByStudent[s.id] || []
      const lastActivity = latestOf(
        ...prog.map(p => p.completedAt),
        ...vids.map(v => v.updatedAt),
        ...subs.map(x => x.submittedAt || x.createdAt),
      )
      const avgVideo = vids.length ? Math.round(vids.reduce((a, v) => a + (v.percent || 0), 0) / vids.length) : 0
      return {
        id: s.id, name: s.name, group: s.group || '',
        completed: prog.length,
        videos: vids.length,
        avgVideo,
        submissions: subs.length,
        lastActivity, // ms epoch or 0
      }
    })

    const started = perStudent.filter(p => p.completed > 0 || p.videos > 0).length
    const active7 = perStudent.filter(p => p.lastActivity && activeWithinDays(new Date(p.lastActivity).toISOString(), 7)).length
    const active30 = perStudent.filter(p => p.lastActivity && activeWithinDays(new Date(p.lastActivity).toISOString(), 30)).length
    const avgCompleted = total ? (perStudent.reduce((a, p) => a + p.completed, 0) / total) : 0
    const avgVideoAll = (() => {
      const withVids = perStudent.filter(p => p.videos > 0)
      return withVids.length ? Math.round(withVids.reduce((a, p) => a + p.avgVideo, 0) / withVids.length) : 0
    })()

    // At-risk: has access but no activity in 14 days (or never started)
    const atRisk = perStudent
      .filter(p => !p.lastActivity || !activeWithinDays(new Date(p.lastActivity).toISOString(), 14))
      .sort((a, b) => (a.lastActivity || 0) - (b.lastActivity || 0))

    // Top active by lessons completed
    const topActive = [...perStudent].sort((a, b) => b.completed - a.completed).slice(0, 8).filter(p => p.completed > 0)

    // Completion by course: avg (student's completed lessons of that course / total course lessons)
    // Approximate: group scoped students by their course (student.course), then
    // average their completed count against the course lesson total.
    const byCourse = {}
    scoped.forEach(s => {
      const course = courseByName[s.course]
      if (!course) return
      const totalLessons = lessonsByCourse[course.id] || 0
      if (totalLessons === 0) return
      const completed = (progByStudent[s.id] || []).filter(p => {
        const lesson = lmsLessons.find(l => l.id === p.lessonId)
        return lesson && lesson.courseId === course.id
      }).length
      if (!byCourse[course.name]) byCourse[course.name] = { pctSum: 0, n: 0, totalLessons }
      byCourse[course.name].pctSum += Math.min(100, (completed / totalLessons) * 100)
      byCourse[course.name].n += 1
    })
    const courseCompletion = Object.entries(byCourse)
      .map(([name, v]) => ({ name, pct: Math.round(v.pctSum / v.n), students: v.n, lessons: v.totalLessons }))
      .sort((a, b) => b.pct - a.pct)

    // Assignment submission rate
    const totalSubs = lmsSubmissions.filter(x => !scopeStudentIds || scopeStudentIds.map(String).includes(String(x.studentId))).length
    const graded = lmsSubmissions.filter(x => (x.grade !== undefined && x.grade !== null) &&
      (!scopeStudentIds || scopeStudentIds.map(String).includes(String(x.studentId)))).length

    return {
      total, started, active7, active30, avgCompleted, avgVideoAll,
      atRisk, topActive, courseCompletion, totalSubs, graded,
    }
  }, [students, groups, courses, lmsLessons, lmsProgress, lmsVideoProgress, lmsSubmissions, scopeStudentIds])

  const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) : 0
  const fmtAgo = (ms) => {
    if (!ms) return 'ни разу'
    const days = Math.floor((Date.now() - ms) / DAY)
    if (days <= 0) return 'сегодня'
    if (days === 1) return 'вчера'
    return `${days} дн. назад`
  }

  if (data.total === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center">
        <BarChart3 size={40} className="mx-auto text-slate-300 mb-3" />
        <p className="text-slate-400">Пока нет студентов с доступом к LMS</p>
      </div>
    )
  }

  const maxCompleted = Math.max(1, ...data.topActive.map(s => s.completed))

  return (
    <div className="space-y-5">
      {/* Overview tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Tile icon={Users} tone="blue" label="Студентов с доступом" value={data.total} />
        <Tile icon={PlayCircle} tone="cyan" label="Начали обучение" value={data.started}
          sub={`${pct(data.started, data.total)}% от всех`} />
        <Tile icon={TrendingUp} tone="emerald" label="Активны за 7 дней" value={data.active7}
          sub={`${pct(data.active7, data.total)}%`} />
        <Tile icon={Clock} tone="violet" label="Активны за 30 дней" value={data.active30}
          sub={`${pct(data.active30, data.total)}%`} />
        <Tile icon={CheckCircle2} tone="emerald" label="Ср. пройдено уроков" value={data.avgCompleted.toFixed(1)} />
        <Tile icon={PlayCircle} tone="amber" label="Ср. досмотр видео" value={`${data.avgVideoAll}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Course completion */}
        <div className="glass-card rounded-2xl p-4 md:p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <BarChart3 size={16} className="text-blue-500" /> Прохождение по курсам
          </h3>
          {data.courseCompletion.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">Нет данных</p>
          ) : (
            <div className="space-y-2">
              {data.courseCompletion.map(c => (
                <Bar key={c.name} label={c.name} value={c.pct} max={100}
                  right={`${c.pct}% · ${c.students} студ.`}
                  tone={c.pct >= 70 ? 'from-emerald-400 to-teal-500' : c.pct >= 40 ? 'from-amber-400 to-amber-500' : 'from-red-400 to-red-500'} />
              ))}
            </div>
          )}
        </div>

        {/* Top active */}
        <div className="glass-card rounded-2xl p-4 md:p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Trophy size={16} className="text-amber-500" /> Самые активные студенты
          </h3>
          {data.topActive.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">Пока никто не проходил уроки</p>
          ) : (
            <div className="space-y-2">
              {data.topActive.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3 text-sm">
                  <span className={`w-5 text-center font-bold ${i === 0 ? 'text-amber-500' : 'text-slate-400'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{s.name}</p>
                    <p className="text-[11px] text-slate-400">{s.group || '—'}</p>
                  </div>
                  <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden max-w-[120px]">
                    <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500" style={{ width: `${(s.completed / maxCompleted) * 100}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-600 w-16 text-right">{s.completed} ур.</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* At-risk students */}
      <div className="glass-card rounded-2xl p-4 md:p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-500" /> Неактивные студенты
          <span className="text-xs font-normal text-slate-400">нет активности &gt; 14 дней · есть доступ</span>
          <span className="ml-auto text-sm font-bold text-red-500">{data.atRisk.length}</span>
        </h3>
        {data.atRisk.length === 0 ? (
          <p className="text-sm text-emerald-600 py-4 text-center">🎉 Все студенты активны</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {data.atRisk.slice(0, 20).map(s => (
              <div key={s.id} className="flex items-center justify-between py-2 px-3 bg-red-50/50 border border-red-100 rounded-lg text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-700 truncate">{s.name}</p>
                  <p className="text-[11px] text-slate-400">{s.group || '—'} · {s.completed} ур. пройдено</p>
                </div>
                <span className="text-xs text-red-500 flex-shrink-0 ml-2">{fmtAgo(s.lastActivity)}</span>
              </div>
            ))}
            {data.atRisk.length > 20 && (
              <p className="text-xs text-slate-400 col-span-full pt-1">… и ещё {data.atRisk.length - 20}</p>
            )}
          </div>
        )}
      </div>

      {/* Assignments footer */}
      <div className="glass-card rounded-2xl p-4 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <FileText size={16} className="text-purple-500" />
          <span className="text-slate-500">Сдано работ:</span>
          <b className="text-slate-800">{data.totalSubs}</b>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 size={16} className="text-emerald-500" />
          <span className="text-slate-500">Проверено:</span>
          <b className="text-slate-800">{data.graded}</b>
          <span className="text-slate-400">({pct(data.graded, data.totalSubs)}%)</span>
        </div>
      </div>
    </div>
  )
}
