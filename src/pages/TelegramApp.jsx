import { useState, useEffect, useMemo } from 'react'
import { db } from '../firebase'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import {
  BookOpen, Play, CheckCircle2, Lock, Clock, ChevronRight,
  ArrowLeft, FileText, Link2, Download, AlertCircle, Shield,
  GraduationCap, BarChart3, User, Phone, Flame, Zap,
} from 'lucide-react'
import { isLessonAccessible, isModuleUnlocked, getUnlockedModuleCount } from '../utils/lessonAccess'
import { computeXP, getLevel, getLevelProgress } from '../data/gamification'

// ─── Kinescope / YouTube parser ────────────────────────────────────
function parseVideoUrl(url) {
  if (!url) return null
  const kinescopeMatch = url.match(/kinescope\.io\/(?:embed\/)?([a-zA-Z0-9-]+)/)
  if (kinescopeMatch) return { type: 'kinescope', id: kinescopeMatch[1] }
  if (/^[a-f0-9-]{36}$/i.test(url.trim()) || (url.trim().length > 11 && /^[a-zA-Z0-9-]+$/.test(url.trim()))) {
    return { type: 'kinescope', id: url.trim() }
  }
  let videoId = null
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com')) videoId = u.searchParams.get('v')
    else if (u.hostname === 'youtu.be') videoId = u.pathname.slice(1)
  } catch {
    const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    if (match) videoId = match[1]
  }
  if (videoId) return { type: 'youtube', id: videoId }
  return null
}

// ─── Watermark ─────────────────────────────────────────────────────
function Watermark({ text }) {
  if (!text) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden select-none" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="absolute whitespace-nowrap text-white/10 font-bold text-xs"
          style={{ transform: 'rotate(-35deg)', top: `${i * 100 - 40}px`, left: `${(i % 3) * 200 - 80}px`, letterSpacing: '1px' }}>
          {text} &middot; INTERNO &middot; {text} &middot; INTERNO
        </div>
      ))}
    </div>
  )
}

// ─── Main Telegram App ─────────────────────────────────────────────
export default function TelegramApp() {
  const [screen, setScreen] = useState('loading') // loading | auth | home | lessons | lesson
  const [student, setStudent] = useState(null)
  const [students, setStudents] = useState([])
  const [groups, setGroups] = useState([])
  const [courses, setCourses] = useState([])
  const [lessons, setLessons] = useState([])
  const [modules, setModules] = useState([])
  const [progress, setProgress] = useState([])
  const [payments, setPayments] = useState([])
  const [attendance, setAttendance] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [gameData, setGameData] = useState([])
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [tgUser, setTgUser] = useState(null)
  const [phoneInput, setPhoneInput] = useState('')
  const [authError, setAuthError] = useState('')

  // ─── Telegram WebApp SDK ───────────────────────────────────────
  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
      // Apply Telegram theme
      document.documentElement.style.setProperty('--tg-bg', tg.backgroundColor || '#ffffff')
      document.documentElement.style.setProperty('--tg-text', tg.themeParams?.text_color || '#000000')
      if (tg.initDataUnsafe?.user) {
        setTgUser(tg.initDataUnsafe.user)
      }
    }
  }, [])

  // ─── Firestore subscriptions ───────────────────────────────────
  useEffect(() => {
    const unsubs = []
    unsubs.push(onSnapshot(collection(db, 'students'), snap => {
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }))
    unsubs.push(onSnapshot(collection(db, 'groups'), snap => {
      setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }))
    unsubs.push(onSnapshot(collection(db, 'courses'), snap => {
      setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }))
    unsubs.push(onSnapshot(collection(db, 'lmsLessons'), snap => {
      setLessons(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }))
    unsubs.push(onSnapshot(collection(db, 'lmsModules'), snap => {
      setModules(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }))
    unsubs.push(onSnapshot(collection(db, 'lmsProgress'), snap => {
      setProgress(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }))
    unsubs.push(onSnapshot(collection(db, 'payments'), snap => {
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }))
    unsubs.push(onSnapshot(collection(db, 'lmsSubmissions'), snap => {
      setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }))
    unsubs.push(onSnapshot(collection(db, 'studentGameData'), snap => {
      setGameData(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }))
    unsubs.push(onSnapshot(doc(db, 'attendance', '_meta'), snap => {
      if (snap.exists()) setAttendance(snap.data().data || [])
    }))
    return () => unsubs.forEach(u => u())
  }, [])

  // ─── Auto-auth by Telegram phone ──────────────────────────────
  useEffect(() => {
    if (students.length === 0) return

    // Try to find student by Telegram user phone
    if (tgUser?.id) {
      // Check localStorage for saved mapping
      const savedPhone = localStorage.getItem(`tg_student_${tgUser.id}`)
      if (savedPhone) {
        const found = students.find(s => s.phone?.replace(/\D/g, '') === savedPhone.replace(/\D/g, ''))
        if (found) {
          setStudent(found)
          setScreen('home')
          return
        }
      }
    }

    setScreen('auth')
  }, [students, tgUser])

  // ─── Phone auth ────────────────────────────────────────────────
  const handlePhoneAuth = () => {
    setAuthError('')
    const cleanPhone = phoneInput.replace(/\D/g, '')
    if (cleanPhone.length < 9) {
      setAuthError('Введите корректный номер телефона')
      return
    }
    const found = students.find(s => {
      const sp = (s.phone || '').replace(/\D/g, '')
      return sp === cleanPhone || sp.endsWith(cleanPhone) || cleanPhone.endsWith(sp)
    })
    if (!found) {
      setAuthError('Студент с таким номером не найден')
      return
    }
    if (found.lmsAccess !== true) {
      setAuthError('Доступ к LMS не активирован. Обратитесь к администратору.')
      return
    }
    // Check expiry
    if (found.lmsExpiresAt && new Date(found.lmsExpiresAt) < new Date()) {
      setAuthError('Срок доступа истёк. Обратитесь к администратору для продления.')
      return
    }
    setStudent(found)
    setScreen('home')
    // Save mapping
    if (tgUser?.id) {
      localStorage.setItem(`tg_student_${tgUser.id}`, found.phone)
    }
  }

  // ─── Derived data ──────────────────────────────────────────────
  const myGroup = useMemo(() => {
    if (!student) return null
    return groups.find(g => g.name === student.group || g.id === student.groupId)
  }, [student, groups])

  const myCourse = useMemo(() => {
    if (!myGroup) return null
    return courses.find(c => c.name === myGroup.course)
  }, [myGroup, courses])

  const myLessons = useMemo(() => {
    if (!myCourse) return []
    return lessons
      .filter(l => l.courseId === myCourse.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
  }, [lessons, myCourse])

  const myModules = useMemo(() => {
    if (!myCourse) return []
    return modules
      .filter(m => m.courseId === myCourse.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
  }, [modules, myCourse])

  const myProgress = useMemo(() => {
    if (!student) return []
    return progress.filter(p => p.studentId === student.id)
  }, [progress, student])

  const completedLessonIds = new Set(myProgress.filter(p => p.completed).map(p => p.lessonId))

  // ─── Gamification ─────────────────────────────────────────────
  const gamData = useMemo(() => {
    if (!student) return null
    const myAtt = attendance.filter(a => a.studentId === student.id)
    const mySubs = submissions.filter(s => s.studentId === student.id)
    const gd = gameData.find(d => d.id === student.id) || {}
    const xp = computeXP({
      completedLessons: myProgress.length,
      submissions: mySubs,
      attendancePresent: myAtt.filter(a => a.status === 'present').length,
      attendanceLate: myAtt.filter(a => a.status === 'late').length,
      streakBonusesClaimed: gd.streakBonusesClaimed || [],
    })
    return {
      xp,
      level: getLevel(xp.total),
      levelProgress: getLevelProgress(xp.total),
      streak: gd.currentStreak || 0,
    }
  }, [student, myProgress, attendance, submissions, gameData])

  // ─── Debt calculation ──────────────────────────────────────────
  const studentDebt = useMemo(() => {
    if (!student) return 0
    const totalPaid = payments
      .filter(p => p.type === 'income' && String(p.studentId) === String(student.id))
      .reduce((s, p) => s + (p.amount || 0), 0)
    const coursePrice = student.totalCoursePrice || 0
    return Math.max(0, coursePrice - totalPaid)
  }, [payments, student])

  // ─── Accessible lessons count ──────────────────────────────────
  const accessibleLessonIds = useMemo(() => {
    if (!student || !myGroup) return new Set()
    const ids = new Set()
    myLessons.forEach(lesson => {
      const access = isLessonAccessible({
        lesson, student, group: myGroup, modules: myModules, debt: studentDebt
      })
      if (access.accessible) ids.add(lesson.id)
    })
    return ids
  }, [myLessons, student, myGroup, myModules, studentDebt])

  const completionPct = myLessons.length > 0 ? Math.round((completedLessonIds.size / myLessons.length) * 100) : 0

  // Group lessons by module
  const lessonsByModule = useMemo(() => {
    const result = []
    const ungrouped = []
    const moduleMap = new Map()

    myModules.forEach(m => moduleMap.set(m.id, { ...m, lessons: [] }))

    myLessons.forEach(l => {
      if (l.moduleId && moduleMap.has(l.moduleId)) {
        moduleMap.get(l.moduleId).lessons.push(l)
      } else {
        ungrouped.push(l)
      }
    })

    moduleMap.forEach(m => { if (m.lessons.length > 0) result.push(m) })
    if (ungrouped.length > 0) result.push({ id: '__ungrouped', title: 'Уроки', lessons: ungrouped })

    return result
  }, [myLessons, myModules])

  // ─── Back button handler ───────────────────────────────────────
  const goBack = () => {
    const tg = window.Telegram?.WebApp
    if (screen === 'lesson') {
      setSelectedLesson(null)
      setScreen('lessons')
    } else if (screen === 'lessons') {
      setScreen('home')
    } else if (tg) {
      tg.close()
    }
  }

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      if (screen === 'lessons' || screen === 'lesson') {
        tg.BackButton.show()
        tg.BackButton.onClick(goBack)
      } else {
        tg.BackButton.hide()
      }
    }
    return () => {
      if (window.Telegram?.WebApp?.BackButton) {
        window.Telegram.WebApp.BackButton.offClick(goBack)
      }
    }
  }, [screen])

  // ═══════════════════════════════════════════════════════════════
  // SCREENS
  // ═══════════════════════════════════════════════════════════════

  // ─── Loading ───────────────────────────────────────────────────
  if (screen === 'loading') {
    return (
      <div className="tg-app flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500">Загрузка...</p>
        </div>
      </div>
    )
  }

  // ─── Auth Screen ───────────────────────────────────────────────
  if (screen === 'auth') {
    return (
      <div className="tg-app min-h-screen flex items-center justify-center p-5">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30">
              <GraduationCap size={32} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">INTERNO LMS</h1>
            <p className="text-sm text-slate-500 mt-1">Введите номер телефона для входа</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Номер телефона</label>
              <div className="flex gap-2">
                <span className="flex items-center px-3 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500">+998</span>
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={e => { setPhoneInput(e.target.value); setAuthError('') }}
                  placeholder="90 123 45 67"
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
            </div>

            {authError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-600">{authError}</p>
              </div>
            )}

            <button onClick={handlePhoneAuth}
              className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-500/25">
              Войти
            </button>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            Используйте номер, указанный при регистрации на курс
          </p>
        </div>
      </div>
    )
  }

  // ─── Home Screen ───────────────────────────────────────────────
  if (screen === 'home') {
    return (
      <div className="tg-app min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-violet-700 px-5 pt-6 pb-8 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-lg font-bold backdrop-blur-sm">
              {student?.name?.charAt(0) || '?'}
            </div>
            <div>
              <h2 className="font-bold text-base">{student?.name}</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-white/70 text-xs">{student?.course} · {student?.group}</p>
                {gamData && (
                  <span className="bg-amber-400/20 text-amber-200 text-[10px] px-2 py-0.5 rounded-full font-bold">
                    {gamData.level.emoji} Lv.{gamData.level.level}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Progress Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/80 text-xs">Прогресс курса</span>
              <span className="text-sm font-bold">{completionPct}%</span>
            </div>
            <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${completionPct}%` }} />
            </div>
            <div className="flex justify-between mt-2 text-xs text-white/60">
              <span>{completedLessonIds.size} из {myLessons.length} уроков</span>
              {student?.lmsExpiresAt && (
                <span>Доступ до {new Date(student.lmsExpiresAt).toLocaleDateString('ru-RU')}</span>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 -mt-3 space-y-4 pb-8">
          {/* Course Card */}
          <button onClick={() => setScreen('lessons')}
            className="w-full bg-white rounded-2xl border border-slate-200 p-4 shadow-sm active:scale-[0.98] transition-all text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center">
                  <BookOpen size={22} className="text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{myCourse?.name || student?.course}</h3>
                  <p className="text-xs text-slate-500">{myLessons.length} уроков · {myModules.length > 0 ? `${myModules.length} модулей` : ''}</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-slate-400" />
            </div>
          </button>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-white rounded-xl border border-slate-200 p-3 text-center shadow-sm">
              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center mx-auto mb-1.5">
                <CheckCircle2 size={16} className="text-emerald-600" />
              </div>
              <p className="text-lg font-bold text-slate-900">{completedLessonIds.size}</p>
              <p className="text-[10px] text-slate-500">Пройдено</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3 text-center shadow-sm">
              <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center mx-auto mb-1.5">
                <Zap size={16} className="text-amber-600" />
              </div>
              <p className="text-lg font-bold text-slate-900">{gamData?.xp?.total || 0}</p>
              <p className="text-[10px] text-slate-500">XP</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3 text-center shadow-sm">
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center mx-auto mb-1.5">
                <Flame size={16} className="text-orange-500" />
              </div>
              <p className="text-lg font-bold text-slate-900">{gamData?.streak || 0}</p>
              <p className="text-[10px] text-slate-500">Стрик</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3 text-center shadow-sm">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-1.5">
                <BarChart3 size={16} className="text-purple-600" />
              </div>
              <p className="text-lg font-bold text-slate-900">{completionPct}%</p>
              <p className="text-[10px] text-slate-500">Прогресс</p>
            </div>
          </div>

          {/* Quick Info */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
            <h4 className="text-xs font-semibold text-slate-500 uppercase">Информация</h4>
            <div className="flex items-center gap-3 text-sm">
              <User size={16} className="text-slate-400" />
              <span className="text-slate-600">{student?.name}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Phone size={16} className="text-slate-400" />
              <span className="text-slate-600">{student?.phone}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <GraduationCap size={16} className="text-slate-400" />
              <span className="text-slate-600">{student?.course}</span>
            </div>
            {student?.lmsExpiresAt && (
              <div className="flex items-center gap-3 text-sm">
                <Clock size={16} className="text-slate-400" />
                <span className={new Date(student.lmsExpiresAt) < new Date() ? 'text-red-500' : 'text-slate-600'}>
                  Доступ до {new Date(student.lmsExpiresAt).toLocaleDateString('ru-RU')}
                </span>
              </div>
            )}
          </div>

          {/* Logout */}
          <button onClick={() => {
            if (tgUser?.id) localStorage.removeItem(`tg_student_${tgUser.id}`)
            setStudent(null)
            setScreen('auth')
          }}
            className="w-full py-2.5 bg-slate-100 text-slate-500 rounded-xl text-xs font-medium hover:bg-slate-200 transition-colors">
            Выйти из аккаунта
          </button>
        </div>
      </div>
    )
  }

  // ─── Lessons List Screen ───────────────────────────────────────
  if (screen === 'lessons') {
    return (
      <div className="tg-app min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-5 py-4 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button onClick={() => setScreen('home')} className="p-1 -ml-1">
              <ArrowLeft size={20} className="text-slate-600" />
            </button>
            <div>
              <h2 className="text-base font-bold text-slate-900">{myCourse?.name || student?.course}</h2>
              <p className="text-xs text-slate-500">{myLessons.length} уроков · {completedLessonIds.size} пройдено</p>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="px-5 py-3">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Прогресс</span>
            <span className="font-semibold text-blue-600">{completionPct}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${completionPct}%` }} />
          </div>
        </div>

        {/* Access Banner */}
        {(() => {
          const isOnline = student?.learningFormat === 'Онлайн'
          if (!isOnline && studentDebt > 0) {
            const hasPaid = (student?.totalCoursePrice || 0) - studentDebt > 0
            return (
              <div className="mx-5 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                <Lock size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-amber-800">
                    {hasPaid ? 'Доступен только 1-й модуль' : 'Уроки заблокированы'}
                  </p>
                  <p className="text-[10px] text-amber-600 mt-0.5">
                    {hasPaid ? 'Оплатите курс полностью для доступа ко всем модулям' : 'Произведите оплату для доступа к урокам'}
                  </p>
                </div>
              </div>
            )
          }
          if (isOnline && myGroup?.startDate) {
            const unlocked = getUnlockedModuleCount(myGroup.startDate)
            const totalMods = myModules.length || myLessons.length
            if (unlocked < totalMods) {
              return (
                <div className="mx-5 flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-3">
                  <Clock size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-blue-800">Модули по расписанию</p>
                    <p className="text-[10px] text-blue-600 mt-0.5">Новый модуль каждый понедельник. Доступно: {unlocked} из {totalMods}</p>
                  </div>
                </div>
              )
            }
          }
          return null
        })()}

        {/* Modules & Lessons */}
        <div className="px-5 pb-8 space-y-4">
          {lessonsByModule.map(mod => {
            const isOnline = student?.learningFormat === 'Онлайн'
            const hasPaid = (student?.totalCoursePrice || 0) - studentDebt > 0
            const modLocked = mod.id !== '__ungrouped' && !isModuleUnlocked(mod.order, myGroup?.startDate, isOnline, studentDebt, hasPaid)

            return (
            <div key={mod.id}>
              {mod.id !== '__ungrouped' && (
                <div className="flex items-center gap-2 mb-2">
                  {modLocked
                    ? <Lock size={12} className="text-slate-400" />
                    : <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />}
                  <h3 className={`text-xs font-semibold uppercase tracking-wide ${modLocked ? 'text-slate-400' : 'text-slate-500'}`}>{mod.title}</h3>
                  {modLocked && <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">Скоро</span>}
                </div>
              )}
              <div className="space-y-2">
                {mod.lessons.map((lesson, idx) => {
                  const isCompleted = completedLessonIds.has(lesson.id)
                  const hasVideo = !!lesson.videoUrl
                  const locked = modLocked || !accessibleLessonIds.has(lesson.id)

                  return (
                    <button key={lesson.id}
                      onClick={() => { if (!locked) { setSelectedLesson(lesson); setScreen('lesson') } }}
                      disabled={locked}
                      className={`w-full rounded-xl border p-3.5 transition-all text-left shadow-sm ${
                        locked
                          ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                          : 'bg-white border-slate-200 active:scale-[0.98]'
                      }`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          locked ? 'bg-slate-100'
                            : isCompleted ? 'bg-emerald-100' : hasVideo ? 'bg-blue-100' : 'bg-slate-100'
                        }`}>
                          {locked
                            ? <Lock size={16} className="text-slate-400" />
                            : isCompleted
                              ? <CheckCircle2 size={18} className="text-emerald-600" />
                              : hasVideo
                                ? <Play size={18} className="text-blue-600" />
                                : <FileText size={18} className="text-slate-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${locked ? 'text-slate-400' : 'text-slate-900'}`}>{lesson.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {lesson.date && <span className="text-[10px] text-slate-400">{lesson.date}</span>}
                            {!locked && hasVideo && <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">Video</span>}
                            {!locked && lesson.materials?.length > 0 && (
                              <span className="text-[10px] text-slate-400">{lesson.materials.length} файлов</span>
                            )}
                          </div>
                        </div>
                        {locked
                          ? <Lock size={14} className="text-slate-300 flex-shrink-0" />
                          : <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          )}

          {myLessons.length === 0 && (
            <div className="text-center py-12">
              <BookOpen size={40} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm text-slate-400">Уроки пока не добавлены</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── Lesson View Screen ────────────────────────────────────────
  if (screen === 'lesson' && selectedLesson) {
    const videoInfo = parseVideoUrl(selectedLesson.videoUrl)
    const studentWatermark = `${student?.name || ''} ${student?.phone || ''}`

    return (
      <div className="tg-app min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-5 py-3 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button onClick={() => { setSelectedLesson(null); setScreen('lessons') }} className="p-1 -ml-1">
              <ArrowLeft size={20} className="text-slate-600" />
            </button>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{selectedLesson.title}</p>
              <p className="text-[10px] text-slate-400">Урок {myLessons.indexOf(selectedLesson) + 1} из {myLessons.length}</p>
            </div>
          </div>
        </div>

        <div className="space-y-0">
          {/* Video Player */}
          {videoInfo?.type === 'kinescope' && (() => {
            const params = new URLSearchParams()
            if (studentWatermark) {
              params.set('watermark_text', studentWatermark)
              params.set('watermark_mode', 'viewer')
            }
            params.set('drm', 'true')
            params.set('dnt', '1')
            params.set('download', 'false')
            const embedUrl = `https://kinescope.io/embed/${videoInfo.id}?${params.toString()}`
            return (
              <div className="relative w-full bg-black" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  src={embedUrl}
                  title={selectedLesson.title}
                  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full border-0"
                  referrerPolicy="no-referrer-when-downgrade"
                  sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                />
                {studentWatermark && (
                  <div className="pointer-events-none absolute inset-0 z-10 select-none" aria-hidden="true">
                    <div className="absolute top-2 left-3 text-white/[0.12] text-[10px] font-medium tracking-wide">{studentWatermark}</div>
                    <div className="absolute bottom-2 right-3 text-white/[0.12] text-[10px] font-medium tracking-wide">{studentWatermark}</div>
                  </div>
                )}
              </div>
            )
          })()}

          {videoInfo?.type === 'youtube' && (
            <div className="relative w-full bg-black" style={{ paddingBottom: '56.25%' }}>
              <iframe
                src={`https://www.youtube.com/embed/${videoInfo.id}`}
                title={selectedLesson.title}
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
              <Watermark text={studentWatermark} />
            </div>
          )}

          {/* Lesson Content */}
          <div className="px-5 py-4 space-y-4">
            {/* Title & Description */}
            <div>
              <h1 className="text-lg font-bold text-slate-900">{selectedLesson.title}</h1>
              {selectedLesson.description && (
                <p className="text-sm text-slate-500 mt-1">{selectedLesson.description}</p>
              )}
              {selectedLesson.date && (
                <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                  <Clock size={12} /> {selectedLesson.date}
                </p>
              )}
            </div>

            {/* Content */}
            {selectedLesson.content && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 relative overflow-hidden">
                <Watermark text={student?.name} />
                <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap select-none"
                  style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
                  {selectedLesson.content}
                </div>
              </div>
            )}

            {/* Materials */}
            {selectedLesson.materials?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Материалы</h4>
                <div className="space-y-2">
                  {selectedLesson.materials.map(m => (
                    <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3 active:scale-[0.98] transition-all">
                      <Link2 size={16} className="text-blue-500 flex-shrink-0" />
                      <span className="text-sm text-slate-700 flex-1 truncate">{m.name}</span>
                      <Download size={14} className="text-slate-400" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-3 pt-4">
              {myLessons.indexOf(selectedLesson) > 0 && (
                <button onClick={() => {
                  const prev = myLessons[myLessons.indexOf(selectedLesson) - 1]
                  if (accessibleLessonIds.has(prev.id)) setSelectedLesson(prev)
                }}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-medium active:scale-[0.98] transition-all ${
                    accessibleLessonIds.has(myLessons[myLessons.indexOf(selectedLesson) - 1]?.id)
                      ? 'bg-slate-100 text-slate-600' : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                  }`}>
                  ← Предыдущий
                </button>
              )}
              {myLessons.indexOf(selectedLesson) < myLessons.length - 1 && (() => {
                const next = myLessons[myLessons.indexOf(selectedLesson) + 1]
                const nextAccessible = accessibleLessonIds.has(next?.id)
                return (
                  <button onClick={() => nextAccessible && setSelectedLesson(next)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-medium active:scale-[0.98] transition-all ${
                      nextAccessible
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}>
                    {nextAccessible ? 'Следующий →' : '🔒 Заблокирован'}
                  </button>
                )
              })()}
            </div>
          </div>
        </div>

        {/* Content protection */}
        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-50 to-transparent h-6 pointer-events-none" />
      </div>
    )
  }

  return null
}
