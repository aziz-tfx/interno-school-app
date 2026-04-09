import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useLanguage } from '../contexts/LanguageContext'
import {
  GraduationCap, BookOpen, Calendar, DollarSign, ClipboardCheck,
  FileText, Bell, CheckCircle2, AlertCircle, Clock, TrendingUp,
  Play, ChevronRight, CreditCard, Award, User, Layers,
  Eye, XCircle, X, ExternalLink, Wallet, BarChart3,
  BookMarked, PenTool, Star, Target, Zap, Flame, Trophy, Bot,
} from 'lucide-react'
import useGamification from '../hooks/useGamification'
import AIChat from '../components/AIChat'

// ─── Format currency ───────────────────────────────────────────────
function fmt(n) {
  if (!n) return '0'
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

export default function StudentCabinet() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const {
    students, groups, courses, payments, teachers, branches,
    getAttendanceByGroup, getAttendanceStats,
    lmsProgress, lmsLessons, lmsModules, lmsAssignments, lmsSubmissions, lmsAnnouncements,
  } = useData()

  const [searchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'overview'
  const [aiChatOpen, setAiChatOpen] = useState(false)

  // ─── Student identity ──────────────────────────────────────────
  const myStudent = useMemo(() => {
    return students.find(s => s.name === user?.name || s.phone === user?.phone) || null
  }, [students, user])

  const myGroup = useMemo(() => {
    if (!myStudent) return null
    return groups.find(g => g.name === myStudent.group || g.id === myStudent.groupId) || null
  }, [myStudent, groups])

  const myGroups = useMemo(() => {
    if (!myStudent) return []
    // Prioritize groupId match, fallback to name match, deduplicate by course name
    const byId = myStudent.groupId ? groups.filter(g => g.id === myStudent.groupId) : []
    if (byId.length > 0) return byId
    const byName = groups.filter(g => g.name === myStudent.group)
    const seen = new Set()
    return byName.filter(g => { const k = g.course || g.id; if (seen.has(k)) return false; seen.add(k); return true })
  }, [myStudent, groups])

  const myCourse = useMemo(() => {
    if (!myGroup) return null
    return courses.find(c => c.name === myGroup.course) || null
  }, [myGroup, courses])

  const myTeacher = useMemo(() => {
    if (!myGroup) return null
    return teachers.find(t => String(t.id) === String(myGroup.teacherId)) || null
  }, [myGroup, teachers])

  const myBranch = useMemo(() => {
    if (!myStudent) return null
    return branches.find(b => b.id === myStudent.branch) || null
  }, [myStudent, branches])

  // ─── Payments ──────────────────────────────────────────────────
  const myPayments = useMemo(() => {
    if (!myStudent) return []
    return payments
      .filter(p => p.type === 'income' && String(p.studentId) === String(myStudent.id))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [payments, myStudent])

  const totalPaid = myPayments.reduce((s, p) => s + (p.amount || 0), 0)
  const coursePrice = myStudent?.totalCoursePrice || 0
  const debt = Math.max(0, coursePrice - totalPaid)

  // ─── LMS Progress ─────────────────────────────────────────────
  const myProgressIds = useMemo(() => {
    if (!myStudent) return new Set()
    return new Set(lmsProgress.filter(p => p.studentId === myStudent.id).map(p => p.lessonId))
  }, [lmsProgress, myStudent])

  const courseProgressData = useMemo(() => {
    if (!myStudent) return {}
    const result = {}
    myGroups.forEach(group => {
      const course = courses.find(c => c.name === group.course)
      if (!course) return
      const lessons = lmsLessons.filter(l => l.courseId === course.id).sort((a, b) => (a.order || 0) - (b.order || 0))
      const completed = lessons.filter(l => myProgressIds.has(l.id))
      const nextLesson = lessons.find(l => !myProgressIds.has(l.id))
      result[group.id] = { total: lessons.length, completed: completed.length, nextLesson, course }
    })
    return result
  }, [lmsLessons, myProgressIds, myStudent, myGroups, courses])

  const overallProgress = useMemo(() => {
    let total = 0, completed = 0
    Object.values(courseProgressData).forEach(p => { total += p.total; completed += p.completed })
    return { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 }
  }, [courseProgressData])

  // ─── Assignments ───────────────────────────────────────────────
  const myGroupIds = myGroups.map(g => g.id)
  const myAssignments = useMemo(() => {
    return lmsAssignments.filter(a => myGroupIds.includes(a.groupId))
  }, [lmsAssignments, myGroupIds])

  const mySubmissions = useMemo(() => {
    if (!myStudent) return []
    return lmsSubmissions.filter(s => s.studentId === myStudent.id)
  }, [lmsSubmissions, myStudent])

  const pendingAssignments = useMemo(() => {
    const submittedIds = new Set(mySubmissions.map(s => s.assignmentId))
    return myAssignments.filter(a => !submittedIds.has(a.id))
  }, [myAssignments, mySubmissions])

  const gradedSubmissions = useMemo(() => {
    return mySubmissions.filter(s => s.grade !== undefined && s.grade !== null)
  }, [mySubmissions])

  // ─── Announcements ────────────────────────────────────────────
  const myAnnouncements = useMemo(() => {
    return lmsAnnouncements
      .filter(a => myGroupIds.includes(a.groupId) || a.groupId === 'all')
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  }, [lmsAnnouncements, myGroupIds])

  // ─── Attendance ────────────────────────────────────────────────
  const attendanceStats = useMemo(() => {
    if (!myStudent) return { present: 0, absent: 0, late: 0, total: 0, rate: 0 }
    return getAttendanceStats(myStudent.id)
  }, [myStudent, getAttendanceStats])

  // ─── Contract ──────────────────────────────────────────────────
  const contractPayments = useMemo(() => {
    return myPayments.filter(p => p.contractNumber)
  }, [myPayments])

  // ─── Gamification ─────────────────────────────────────────────
  const gam = useGamification(myStudent?.id)

  const setActiveTab = (tab) => navigate(tab === 'overview' ? '/' : `/?tab=${tab}`)

  // ─── Blocked screen ───────────────────────────────────────────
  if (myStudent && myStudent.lmsAccess !== true) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} className="text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Доступ ограничен</h2>
          <p className="text-slate-500 text-sm mb-6">Для активации личного кабинета необходимо произвести оплату</p>
          {myStudent.course && (
            <p className="text-sm text-slate-600 mb-1">Курс: <b>{myStudent.course}</b></p>
          )}
          {myStudent.group && (
            <p className="text-sm text-slate-600 mb-4">Группа: <b>{myStudent.group}</b></p>
          )}
          <p className="text-xs text-slate-400 mt-4">Свяжитесь с нами: <span className="font-medium text-slate-600">+998 95 387 79 27</span></p>
        </div>
      </div>
    )
  }

  // ─── Progress circle SVG ───────────────────────────────────────
  const ProgressCircle = ({ percentage, size = 56, strokeWidth = 4, color = '#3b82f6' }) => (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="-rotate-90" viewBox="0 0 36 36" style={{ width: size, height: size }}>
        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none" stroke={percentage >= 100 ? '#10b981' : color} strokeWidth={strokeWidth}
          strokeDasharray={`${percentage}, 100`} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700">
        {percentage}%
      </span>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen pb-8">
      {/* ─── Welcome Header ─────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-purple-700 -mx-4 -mt-4 px-4 pt-8 pb-12 md:px-8 md:-mx-8 md:-mt-8 mb-0 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-blue-300 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3" />
        </div>
        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-white text-xl font-bold border border-white/20">
                {user?.avatar || user?.name?.[0] || 'S'}
              </div>
              <div>
                <p className="text-white/60 text-sm">Добро пожаловать!</p>
                <h1 className="text-2xl md:text-3xl font-bold text-white">{myStudent?.name || user?.name}</h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {myStudent?.course && (
                    <span className="bg-white/15 backdrop-blur-sm text-white/90 text-xs px-2.5 py-0.5 rounded-full">{myStudent.course}</span>
                  )}
                  {myStudent?.group && (
                    <span className="bg-white/15 backdrop-blur-sm text-white/90 text-xs px-2.5 py-0.5 rounded-full">{myStudent.group}</span>
                  )}
                  {myBranch && (
                    <span className="bg-white/10 backdrop-blur-sm text-white/70 text-xs px-2.5 py-0.5 rounded-full">{myBranch.name}</span>
                  )}
                  {gam?.level && (
                    <span className="bg-amber-400/20 backdrop-blur-sm text-amber-200 text-xs px-2.5 py-0.5 rounded-full font-bold">
                      {gam.level.emoji} Lv.{gam.level.level} {gam.level.title}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right side: quick stats */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10">
                <ProgressCircle percentage={overallProgress.percentage} size={48} strokeWidth={3.5} color="#fff" />
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10 text-center">
                <p className="text-2xl font-bold text-white">{overallProgress.completed}</p>
                <p className="text-white/50 text-xs">из {overallProgress.total} уроков</p>
              </div>
              {gam?.xp && (
                <div className="bg-amber-500/20 backdrop-blur-sm rounded-xl px-4 py-3 border border-amber-400/20 text-center">
                  <p className="text-2xl font-bold text-amber-200">{gam.xp.total}</p>
                  <p className="text-amber-300/60 text-xs">XP</p>
                </div>
              )}
              {gam?.streak?.current > 0 && (
                <div className="bg-orange-500/20 backdrop-blur-sm rounded-xl px-4 py-3 border border-orange-400/20 text-center">
                  <p className="text-2xl font-bold text-orange-200 flex items-center gap-1 justify-center">
                    <Flame size={18} />{gam.streak.current}
                  </p>
                  <p className="text-orange-300/60 text-xs">стрик</p>
                </div>
              )}
              {pendingAssignments.length > 0 && (
                <div className="bg-red-500/20 backdrop-blur-sm rounded-xl px-4 py-3 border border-red-400/20 text-center">
                  <p className="text-2xl font-bold text-red-200">{pendingAssignments.length}</p>
                  <p className="text-red-300/60 text-xs">заданий</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Stats Cards ────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto -mt-6 mb-6 px-2 relative z-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <TrendingUp size={16} className="text-blue-500" />
              </div>
              <span className="text-xs text-slate-400">Прогресс</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{overallProgress.percentage}%</p>
            <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${overallProgress.percentage}%` }} />
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                <ClipboardCheck size={16} className="text-emerald-500" />
              </div>
              <span className="text-xs text-slate-400">Посещаемость</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{attendanceStats.rate || 0}%</p>
            <p className="text-xs text-slate-400 mt-1">{attendanceStats.present} из {attendanceStats.total} занятий</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                <Zap size={16} className="text-amber-500" />
              </div>
              <span className="text-xs text-slate-400">Уровень</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{gam?.level?.emoji} {gam?.level?.level || 1}</p>
            {gam?.levelProgress && (
              <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${gam.levelProgress.progressPercent}%` }} />
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${debt > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                <Wallet size={16} className={debt > 0 ? 'text-red-500' : 'text-emerald-500'} />
              </div>
              <span className="text-xs text-slate-400">Баланс</span>
            </div>
            <p className={`text-xl font-bold ${debt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {debt > 0 ? `-${fmt(debt)}` : 'Оплачено'}
            </p>
            <p className="text-xs text-slate-400 mt-1">{fmt(totalPaid)} / {fmt(coursePrice)}</p>
          </div>
        </div>
      </div>


      {/* ─── Tab Content ────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-2">

        {/* ══════════ OVERVIEW ══════════ */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Course Progress */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center"><BookOpen size={16} className="text-blue-500" /></div>
                  Мой курс
                </h3>
                <button onClick={() => setActiveTab('course')} className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1">Подробнее <ChevronRight size={14} /></button>
              </div>
              {myGroups.map(group => {
                const prog = courseProgressData[group.id] || { total: 0, completed: 0, nextLesson: null }
                const pct = prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0
                return (
                  <div key={group.id} className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl mb-3 last:mb-0">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-slate-800 text-sm">{group.course}</p>
                      <span className="text-xs font-bold text-blue-600">{pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-white/80 rounded-full overflow-hidden mb-3">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500">{prog.completed} / {prog.total} уроков</p>
                      {prog.nextLesson && (
                        <button onClick={() => navigate(`/lms/course/${group.id}`)}
                          className="flex items-center gap-1 text-xs text-blue-600 font-medium hover:text-blue-800">
                          <Play size={12} /> Продолжить
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              {myGroups.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Вы пока не записаны на курс</p>}
            </div>

            {/* Schedule & Teacher */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center"><Calendar size={16} className="text-purple-500" /></div>
                Расписание
              </h3>
              {myGroup ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl">
                    <Clock size={18} className="text-purple-500" />
                    <div>
                      <p className="font-medium text-slate-800 text-sm">{myGroup.schedule || 'Не указано'}</p>
                      <p className="text-xs text-slate-500">Расписание занятий</p>
                    </div>
                  </div>
                  {myTeacher && (
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                      <User size={18} className="text-slate-500" />
                      <div>
                        <p className="font-medium text-slate-800 text-sm">{myTeacher.name}</p>
                        <p className="text-xs text-slate-500">Преподаватель</p>
                      </div>
                    </div>
                  )}
                  {myGroup.startDate && (
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                      <Calendar size={18} className="text-slate-400" />
                      <div>
                        <p className="font-medium text-slate-800 text-sm">{myGroup.startDate}</p>
                        <p className="text-xs text-slate-500">Дата начала курса</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <Layers size={18} className="text-slate-400" />
                    <div>
                      <p className="font-medium text-slate-800 text-sm">{myStudent?.learningFormat || 'Оффлайн'}</p>
                      <p className="text-xs text-slate-500">Формат обучения</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-6">Группа не назначена</p>
              )}
            </div>

            {/* Pending Assignments */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center"><PenTool size={16} className="text-amber-500" /></div>
                  Задания
                  {pendingAssignments.length > 0 && <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-bold">{pendingAssignments.length}</span>}
                </h3>
                <button onClick={() => setActiveTab('assignments')} className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1">Все <ChevronRight size={14} /></button>
              </div>
              {pendingAssignments.length === 0 ? (
                <div className="text-center py-6">
                  <CheckCircle2 size={28} className="mx-auto text-emerald-400 mb-2" />
                  <p className="text-sm text-slate-400">Все задания выполнены!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingAssignments.slice(0, 4).map(a => (
                    <button key={a.id} onClick={() => navigate(`/lms/course/${a.groupId}`)}
                      className="w-full text-left p-3 rounded-xl hover:bg-slate-50 border border-slate-100 transition-colors">
                      <p className="font-medium text-slate-800 text-sm">{a.title}</p>
                      {a.deadline && <p className="text-xs text-slate-400 mt-0.5">Срок: {a.deadline}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Achievements Preview */}
            {gam?.achievements && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center"><Trophy size={16} className="text-amber-500" /></div>
                    Достижения
                    <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-bold">{gam.unlockedCount}/{gam.achievements.length}</span>
                  </h3>
                  <button onClick={() => setActiveTab('achievements')} className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1">Все <ChevronRight size={14} /></button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {gam.achievements.slice(0, 8).map(a => (
                    <div key={a.id} className={`text-center p-2 rounded-xl transition-all ${a.unlocked ? 'bg-amber-50' : 'bg-slate-50 opacity-40'}`}>
                      <div className="text-2xl mb-1">{a.icon}</div>
                      <p className="text-[10px] text-slate-600 leading-tight">{a.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Leaderboard Preview */}
            {myGroup && gam?.getLeaderboard && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center"><BarChart3 size={16} className="text-indigo-500" /></div>
                  Рейтинг группы
                </h3>
                <div className="space-y-2">
                  {gam.getLeaderboard(myGroup.id).slice(0, 5).map((s, i) => (
                    <div key={s.studentId} className={`flex items-center gap-3 p-2.5 rounded-xl ${s.studentId === myStudent?.id ? 'bg-indigo-50 border border-indigo-200' : 'bg-slate-50'}`}>
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-slate-300 text-white' : i === 2 ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{s.name}</p>
                        <p className="text-[10px] text-slate-400">{s.level.emoji} Lv.{s.level.level}</p>
                      </div>
                      <span className="text-sm font-bold text-amber-600">{s.xp} XP</span>
                    </div>
                  ))}
                  {gam.getLeaderboard(myGroup.id).length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-4">Пока нет данных</p>
                  )}
                </div>
              </div>
            )}

            {/* Recent Announcements */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center"><Bell size={16} className="text-blue-500" /></div>
                  Объявления
                </h3>
                {myAnnouncements.length > 0 && (
                  <button onClick={() => setActiveTab('announcements')} className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1">Все <ChevronRight size={14} /></button>
                )}
              </div>
              {myAnnouncements.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Нет объявлений</p>
              ) : (
                <div className="space-y-2">
                  {myAnnouncements.slice(0, 3).map(a => (
                    <div key={a.id} className="p-3 bg-blue-50 rounded-xl border-l-3 border-blue-400">
                      <p className="font-medium text-slate-800 text-sm">{a.title}</p>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{a.content}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{a.createdAt}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════ COURSE TAB ══════════ */}
        {activeTab === 'course' && (
          <div className="space-y-5">
            {myGroups.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
                <GraduationCap size={48} className="mx-auto mb-3 text-slate-300" />
                <p className="text-slate-500">Вы пока не записаны на курс</p>
              </div>
            ) : myGroups.map(group => {
              const prog = courseProgressData[group.id] || { total: 0, completed: 0, nextLesson: null, course: null }
              const pct = prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0
              const course = prog.course || courses.find(c => c.name === group.course)
              const modules = course ? lmsModules.filter(m => m.courseId === course.id).sort((a, b) => (a.order || 0) - (b.order || 0)) : []
              const lessons = course ? lmsLessons.filter(l => l.courseId === course.id).sort((a, b) => (a.order || 0) - (b.order || 0)) : []

              return (
                <div key={group.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  {/* Course Header */}
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-bold">{group.course}</h3>
                        <p className="text-white/60 text-sm mt-1">Группа: {group.name} · {group.schedule || ''}</p>
                      </div>
                      <ProgressCircle percentage={pct} size={64} strokeWidth={4} color="#fff" />
                    </div>
                    <div className="flex items-center gap-4 mt-4">
                      <span className="text-sm text-white/80">{prog.completed} / {prog.total} уроков</span>
                      <span className="text-sm text-white/80">{modules.length} модулей</span>
                    </div>
                  </div>

                  {/* Next lesson */}
                  {prog.nextLesson && (
                    <button onClick={() => navigate(`/lms/course/${group.id}`)}
                      className="w-full flex items-center gap-3 p-4 bg-emerald-50 border-b border-emerald-100 hover:bg-emerald-100 transition-colors text-left">
                      <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Play size={18} className="text-white ml-0.5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-emerald-600 font-medium">Следующий урок</p>
                        <p className="text-sm font-semibold text-slate-800">{prog.nextLesson.title}</p>
                      </div>
                      <ChevronRight size={18} className="text-emerald-400" />
                    </button>
                  )}

                  {/* Lessons list */}
                  <div className="p-5">
                    {modules.length > 0 ? modules.map(mod => {
                      const modLessons = lessons.filter(l => l.moduleId === mod.id)
                      return (
                        <div key={mod.id} className="mb-4 last:mb-0">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{mod.title}</p>
                          <div className="space-y-1">
                            {modLessons.map(lesson => {
                              const done = myProgressIds.has(lesson.id)
                              return (
                                <button key={lesson.id} onClick={() => navigate(`/lms/lesson/${lesson.id}`)}
                                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${done ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-emerald-500' : 'border-2 border-slate-200'}`}>
                                    {done && <CheckCircle2 size={14} className="text-white" />}
                                  </div>
                                  <span className={`text-sm ${done ? 'text-slate-500' : 'text-slate-800 font-medium'}`}>{lesson.title}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    }) : (
                      <div className="space-y-1">
                        {lessons.map(lesson => {
                          const done = myProgressIds.has(lesson.id)
                          return (
                            <button key={lesson.id} onClick={() => navigate(`/lms/lesson/${lesson.id}`)}
                              className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${done ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-emerald-500' : 'border-2 border-slate-200'}`}>
                                {done && <CheckCircle2 size={14} className="text-white" />}
                              </div>
                              <span className={`text-sm ${done ? 'text-slate-500' : 'text-slate-800 font-medium'}`}>{lesson.title}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {lessons.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Уроки скоро появятся</p>}
                  </div>

                  {pct === 100 && (
                    <div className="bg-emerald-50 border-t border-emerald-100 p-4 text-center">
                      <Award size={24} className="mx-auto text-emerald-500 mb-1" />
                      <p className="text-sm font-semibold text-emerald-700">Курс завершён! Поздравляем! 🎉</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ══════════ ACHIEVEMENTS TAB ══════════ */}
        {activeTab === 'achievements' && gam && (
          <div className="space-y-5">
            {/* Level Progress */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center gap-4 mb-4">
                <div className="text-4xl">{gam.level.emoji}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold text-slate-800">Lv.{gam.level.level} {gam.level.title}</h3>
                    <span className="text-sm font-bold text-amber-600">{gam.xp.total} XP</span>
                  </div>
                  {gam.levelProgress.nextLevel ? (
                    <>
                      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all" style={{ width: `${gam.levelProgress.progressPercent}%` }} />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {gam.xp.total} / {gam.levelProgress.nextLevel.minXP} XP до Lv.{gam.levelProgress.nextLevel.level} {gam.levelProgress.nextLevel.title}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-amber-600 font-medium">Максимальный уровень достигнут!</p>
                  )}
                </div>
              </div>

              {/* XP Breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-blue-600">{gam.xp.lessons}</p>
                  <p className="text-[10px] text-slate-500">Уроки</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-emerald-600">{gam.xp.attendance}</p>
                  <p className="text-[10px] text-slate-500">Посещения</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-purple-600">{gam.xp.assignments}</p>
                  <p className="text-[10px] text-slate-500">Задания</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-orange-600">{gam.xp.streakBonuses}</p>
                  <p className="text-[10px] text-slate-500">Стрики</p>
                </div>
              </div>
            </div>

            {/* Streak */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center"><Flame size={16} className="text-orange-500" /></div>
                Стрик активности
              </h3>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-4xl font-bold text-orange-500 flex items-center gap-1"><Flame size={28} />{gam.streak.current}</p>
                  <p className="text-xs text-slate-400 mt-1">текущий стрик</p>
                </div>
                <div className="h-12 w-px bg-slate-200" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-700">{gam.streak.max}</p>
                  <p className="text-xs text-slate-400 mt-1">лучший результат</p>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-3">Проходите уроки каждый день, чтобы увеличивать стрик и получать бонусные XP!</p>
            </div>

            {/* All Achievements */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center"><Trophy size={16} className="text-amber-500" /></div>
                Все достижения
                <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-bold">{gam.unlockedCount}/{gam.achievements.length}</span>
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {gam.achievements.map(a => (
                  <div key={a.id} className={`p-4 rounded-xl border transition-all ${a.unlocked ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100 opacity-50'}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{a.icon}</span>
                      <div>
                        <p className="font-semibold text-sm text-slate-800">{a.title}</p>
                        <p className="text-[11px] text-slate-500">{a.description}</p>
                      </div>
                    </div>
                    {a.unlocked && <p className="text-[10px] text-amber-600 font-medium mt-2">Разблокировано!</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Full Leaderboard */}
            {myGroup && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center"><BarChart3 size={16} className="text-indigo-500" /></div>
                  Рейтинг группы — {myGroup.name}
                </h3>
                <div className="space-y-2">
                  {gam.getLeaderboard(myGroup.id).map((s, i) => (
                    <div key={s.studentId} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${s.studentId === myStudent?.id ? 'bg-indigo-50 border border-indigo-200' : 'bg-slate-50'}`}>
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-slate-300 text-white' : i === 2 ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{s.name} {s.studentId === myStudent?.id ? '(Вы)' : ''}</p>
                        <p className="text-[10px] text-slate-400">{s.level.emoji} Lv.{s.level.level} {s.level.title}</p>
                      </div>
                      <span className="text-sm font-bold text-amber-600">{s.xp} XP</span>
                    </div>
                  ))}
                  {gam.getLeaderboard(myGroup.id).length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-6">Пока нет данных для рейтинга</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════ PAYMENTS TAB ══════════ */}
        {activeTab === 'payments' && (
          <div className="space-y-5">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
                <DollarSign size={20} className="mx-auto text-blue-500 mb-2" />
                <p className="text-xs text-slate-400">Стоимость курса</p>
                <p className="text-xl font-bold text-slate-800">{fmt(coursePrice)} сум</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
                <CheckCircle2 size={20} className="mx-auto text-emerald-500 mb-2" />
                <p className="text-xs text-slate-400">Оплачено</p>
                <p className="text-xl font-bold text-emerald-600">{fmt(totalPaid)} сум</p>
              </div>
              <div className={`rounded-2xl border p-5 text-center ${debt > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                {debt > 0 ? <AlertCircle size={20} className="mx-auto text-red-500 mb-2" /> : <CheckCircle2 size={20} className="mx-auto text-emerald-500 mb-2" />}
                <p className="text-xs text-slate-400">Остаток</p>
                <p className={`text-xl font-bold ${debt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{debt > 0 ? `${fmt(debt)} сум` : 'Оплачено полностью'}</p>
              </div>
            </div>
            {/* Progress bar */}
            {coursePrice > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-500">Прогресс оплаты</span>
                  <span className="text-sm font-bold text-slate-700">{Math.round((totalPaid / coursePrice) * 100)}%</span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(100, (totalPaid / coursePrice) * 100)}%` }} />
                </div>
              </div>
            )}
            {/* Payment history */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 mb-4">История платежей</h3>
              {myPayments.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Платежей пока нет</p>
              ) : (
                <div className="space-y-2">
                  {myPayments.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <DollarSign size={14} className="text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">{fmt(p.amount)} сум</p>
                          <p className="text-xs text-slate-400">{p.method} · {p.date}</p>
                        </div>
                      </div>
                      {p.contractNumber && (
                        <span className="text-xs text-slate-400">№{p.contractNumber}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════ ATTENDANCE TAB ══════════ */}
        {activeTab === 'attendance' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 size={20} className="text-emerald-600" />
                </div>
                <p className="text-2xl font-bold text-emerald-600">{attendanceStats.present}</p>
                <p className="text-xs text-slate-400">Присутствовал</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
                <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <Clock size={20} className="text-yellow-600" />
                </div>
                <p className="text-2xl font-bold text-yellow-600">{attendanceStats.late}</p>
                <p className="text-xs text-slate-400">Опоздания</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <XCircle size={20} className="text-red-600" />
                </div>
                <p className="text-2xl font-bold text-red-600">{attendanceStats.absent}</p>
                <p className="text-xs text-slate-400">Пропуски</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <Target size={20} className="text-blue-600" />
                </div>
                <p className="text-2xl font-bold text-blue-600">{attendanceStats.rate || 0}%</p>
                <p className="text-xs text-slate-400">Посещаемость</p>
              </div>
            </div>
            {/* Visual progress */}
            {attendanceStats.total > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-800 mb-3">Статистика</h3>
                <div className="flex h-6 rounded-full overflow-hidden bg-slate-100">
                  {attendanceStats.present > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${(attendanceStats.present / attendanceStats.total) * 100}%` }} />}
                  {attendanceStats.late > 0 && <div className="bg-yellow-400 transition-all" style={{ width: `${(attendanceStats.late / attendanceStats.total) * 100}%` }} />}
                  {attendanceStats.absent > 0 && <div className="bg-red-400 transition-all" style={{ width: `${(attendanceStats.absent / attendanceStats.total) * 100}%` }} />}
                </div>
                <div className="flex justify-center gap-6 mt-3">
                  <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" /> Был</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 bg-yellow-400 rounded-full" /> Опоздал</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 bg-red-400 rounded-full" /> Пропуск</span>
                </div>
              </div>
            )}
            {attendanceStats.total === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <ClipboardCheck size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500">Данных пока нет</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════ ASSIGNMENTS TAB ══════════ */}
        {activeTab === 'assignments' && (
          <div className="space-y-5">
            {/* Pending */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <AlertCircle size={18} className="text-amber-500" />
                Не сданные ({pendingAssignments.length})
              </h3>
              {pendingAssignments.length === 0 ? (
                <div className="text-center py-6">
                  <CheckCircle2 size={28} className="mx-auto text-emerald-400 mb-2" />
                  <p className="text-sm text-slate-400">Все задания выполнены!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingAssignments.map(a => {
                    const group = groups.find(g => g.id === a.groupId)
                    return (
                      <button key={a.id} onClick={() => navigate(`/lms/course/${a.groupId}`)}
                        className="w-full text-left p-4 rounded-xl border border-amber-100 bg-amber-50 hover:bg-amber-100 transition-colors">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-slate-800 text-sm">{a.title}</p>
                          <ChevronRight size={16} className="text-slate-400" />
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          {group && <span className="text-xs text-slate-400">{group.course}</span>}
                          {a.deadline && <span className="text-xs text-amber-600">Срок: {a.deadline}</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Graded */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Star size={18} className="text-purple-500" />
                Оценённые ({gradedSubmissions.length})
              </h3>
              {gradedSubmissions.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Оценённых заданий пока нет</p>
              ) : (
                <div className="space-y-2">
                  {gradedSubmissions.map(s => {
                    const assignment = myAssignments.find(a => a.id === s.assignmentId)
                    return (
                      <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-purple-50">
                        <div>
                          <p className="font-medium text-slate-800 text-sm">{assignment?.title || 'Задание'}</p>
                          <p className="text-xs text-slate-400">{s.submittedAt}</p>
                        </div>
                        <span className="text-lg font-bold text-purple-600">{s.grade}{assignment?.maxScore ? `/${assignment.maxScore}` : ''}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════ ANNOUNCEMENTS TAB ══════════ */}
        {activeTab === 'announcements' && (
          <div className="space-y-3">
            {myAnnouncements.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <Bell size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500">Объявлений пока нет</p>
              </div>
            ) : myAnnouncements.map(a => (
              <div key={a.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bell size={18} className="text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-slate-800">{a.title}</h4>
                      <span className="text-xs text-slate-400">{a.createdAt}</span>
                    </div>
                    <p className="text-sm text-slate-600 mt-2 whitespace-pre-line">{a.content}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══════════ CONTRACT TAB ══════════ */}
        {activeTab === 'contract' && (
          <div className="space-y-4">
            {contractPayments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <FileText size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500">Договоров пока нет</p>
              </div>
            ) : contractPayments.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                      <FileText size={18} className="text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-800">Договор №{p.contractNumber}</h4>
                      <p className="text-xs text-slate-400">{p.course} · {p.date}</p>
                    </div>
                  </div>
                  {p.contractSigned ? (
                    <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 text-xs px-3 py-1 rounded-full font-medium">
                      <CheckCircle2 size={12} /> Подписан
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 bg-amber-100 text-amber-700 text-xs px-3 py-1 rounded-full font-medium">
                      <Clock size={12} /> Не подписан
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <p className="text-sm text-slate-600">Сумма: <b>{fmt(p.totalCoursePrice || p.amount)} сум</b></p>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  {!p.contractSigned && (
                    <button onClick={() => window.open(`/contract/${p.id}`, '_blank')}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
                      <PenTool size={14} /> Подписать
                    </button>
                  )}
                  <button onClick={() => window.open(`/contract/${p.id}`, '_blank')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors">
                    <Eye size={14} /> Просмотр
                  </button>
                </div>
                {p.signatureData && (
                  <div className="mt-3 p-3 bg-emerald-50 rounded-xl">
                    <img src={p.signatureData} alt="Подпись" className="h-12 object-contain" />
                    <p className="text-xs text-emerald-600 mt-1">Подписано электронной подписью {p.signedAt ? new Date(p.signedAt).toLocaleString('ru-RU') : ''}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Floating AI Chat Button */}
      <button
        onClick={() => setAiChatOpen(v => !v)}
        className={`fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg shadow-violet-500/30 flex items-center justify-center text-white transition-all z-40 ${
          aiChatOpen
            ? 'bg-slate-600 hover:bg-slate-700 rotate-90'
            : 'bg-gradient-to-br from-violet-600 to-blue-600 hover:scale-105'
        }`}
      >
        {aiChatOpen ? <X size={22} /> : <Bot size={24} />}
      </button>
      <AIChat
        isOpen={aiChatOpen}
        onClose={() => setAiChatOpen(false)}
        context={{
          courseName: myCourse?.name,
          studentName: myStudent?.name,
        }}
        mode="floating"
      />
    </div>
  )
}
