import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, GraduationCap, Users, BookOpen, DollarSign,
  ClipboardCheck, Calendar, UserCog, Monitor, Trophy,
  ChevronRight, ChevronLeft, X, Sparkles, CheckCircle2, Rocket,
  BarChart3, Bell, PenTool, Plug, Shield,
} from 'lucide-react'

const ALL_STEPS = [
  {
    id: 'welcome',
    icon: Sparkles,
    emoji: '👋',
    title: 'Добро пожаловать в INTERNO!',
    body: 'Это система управления вашей школой. Здесь всё: ученики, продажи, расписание, LMS. Давайте познакомимся с основными разделами.',
    color: 'from-indigo-500 to-purple-600',
    roles: ['all'],
  },
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    emoji: '📊',
    title: 'Дашборд',
    body: 'Главная аналитика: выручка, количество учеников, конверсия, P&L. Можно фильтровать по филиалу и периоду.',
    color: 'from-blue-500 to-indigo-600',
    link: '/dashboard',
    roles: ['owner', 'admin', 'branch_director', 'branch_admin', 'rop', 'accountant', 'financier'],
  },
  {
    id: 'students',
    icon: GraduationCap,
    emoji: '🎓',
    title: 'Ученики и группы',
    body: 'Управление учениками: добавление, редактирование, статус (активный/должник/заморожен). Вкладка «Группы» для организации по курсам.',
    color: 'from-emerald-500 to-teal-600',
    link: '/students',
    roles: ['owner', 'admin', 'branch_director', 'branch_admin', 'rop', 'sales'],
  },
  {
    id: 'sales',
    icon: DollarSign,
    emoji: '💰',
    title: 'Продажи',
    body: 'Создавайте продажи через «Новая продажа», отслеживайте KPI менеджеров, планы и выполнение. Доплаты — отдельной кнопкой.',
    color: 'from-green-500 to-emerald-600',
    link: '/finance',
    roles: ['owner', 'admin', 'branch_director', 'rop', 'sales', 'accountant', 'financier'],
  },
  {
    id: 'lms',
    icon: Monitor,
    emoji: '🎥',
    title: 'LMS — Обучение',
    body: 'Создавайте уроки, загружайте видео, добавляйте задания. Ученики проходят модули, получают оценки и XP. Всё в реальном времени.',
    color: 'from-violet-500 to-purple-600',
    link: '/lms',
    roles: ['owner', 'admin', 'branch_director', 'teacher'],
  },
  {
    id: 'attendance',
    icon: ClipboardCheck,
    emoji: '✅',
    title: 'Посещаемость',
    body: 'Ежедневная отметка: присутствует / опоздал / отсутствует. Статистика посещений по каждому ученику.',
    color: 'from-cyan-500 to-blue-600',
    link: '/attendance',
    roles: ['owner', 'admin', 'branch_director', 'branch_admin', 'teacher'],
  },
  {
    id: 'schedule',
    icon: Calendar,
    emoji: '📅',
    title: 'Расписание',
    body: 'Недельное расписание занятий. Привяжите группу к кабинету и преподавателю, система подскажет если есть конфликты.',
    color: 'from-amber-500 to-orange-600',
    link: '/schedule',
    roles: ['owner', 'admin', 'branch_director', 'branch_admin', 'teacher'],
  },
  {
    id: 'leaderboard',
    icon: Trophy,
    emoji: '🏆',
    title: 'Рейтинг менеджеров',
    body: 'Соревнование отдела продаж: кто больше продал, у кого выше конверсия. Мотивация через прозрачность.',
    color: 'from-yellow-500 to-amber-600',
    link: '/leaderboard',
    roles: ['owner', 'admin', 'branch_director', 'rop', 'sales'],
  },
  {
    id: 'employees',
    icon: UserCog,
    emoji: '👥',
    title: 'Сотрудники',
    body: 'Управление командой: добавление, роли, права доступа. Каждый видит только то, что ему разрешено.',
    color: 'from-pink-500 to-rose-600',
    link: '/employees',
    roles: ['owner', 'admin', 'hr'],
  },
  {
    id: 'integrations',
    icon: Plug,
    emoji: '🔌',
    title: 'Интеграции',
    body: 'Подключите Telegram-бот для уведомлений о продажах, amoCRM для воронки и ONPBX для звонков.',
    color: 'from-slate-500 to-slate-700',
    link: '/integrations',
    roles: ['owner', 'admin'],
  },
  {
    id: 'ready',
    icon: Rocket,
    emoji: '🚀',
    title: 'Вы готовы!',
    body: 'Теперь вы знаете основные разделы системы. Если что-то непонятно — обратитесь к администратору. Удачной работы!',
    color: 'from-emerald-500 to-green-600',
    roles: ['all'],
    final: true,
  },
]

const STORAGE_KEY = 'interno_staff_onboarding'

export default function StaffOnboarding() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)

  const role = user?.role || ''
  const userId = user?.id || user?._docId || ''

  // Filter steps for this user's role
  const steps = useMemo(() => {
    if (!role || role === 'student') return []
    return ALL_STEPS.filter(s => s.roles.includes('all') || s.roles.includes(role))
  }, [role])

  useEffect(() => {
    if (!userId || !role || role === 'student' || steps.length === 0) return
    const key = `${STORAGE_KEY}_${userId}`
    const done = localStorage.getItem(key)
    if (!done) setVisible(true)
  }, [userId, role, steps.length])

  const finish = () => {
    if (userId) localStorage.setItem(`${STORAGE_KEY}_${userId}`, '1')
    setVisible(false)
  }

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1)
    else finish()
  }

  const prev = () => {
    if (step > 0) setStep(step - 1)
  }

  const goToSection = () => {
    const s = steps[step]
    if (s.link) navigate(s.link)
    finish()
  }

  if (!visible || steps.length === 0) return null

  const current = steps[step]
  const Icon = current.icon
  const progress = ((step + 1) / steps.length) * 100

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={finish} />

      <div className="relative w-full max-w-md animate-[scaleIn_300ms_ease-out]">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Progress */}
          <div className="h-1 bg-slate-100">
            <div className={`h-full bg-gradient-to-r ${current.color} transition-all duration-500`}
              style={{ width: `${progress}%` }} />
          </div>

          {/* Skip */}
          <button onClick={finish}
            className="absolute top-4 right-4 z-10 p-2 rounded-xl bg-white/80 backdrop-blur-sm hover:bg-slate-100 transition-colors">
            <X size={16} className="text-slate-400" />
          </button>

          {/* Hero */}
          <div className={`bg-gradient-to-br ${current.color} px-8 pt-10 pb-8 text-center relative overflow-hidden`}>
            <div className="absolute inset-0 opacity-20">
              <div className="absolute top-0 right-0 w-48 h-48 bg-white rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-white rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
            </div>
            <div className="relative z-10">
              <div className="text-5xl mb-3">{current.emoji}</div>
              <h2 className="text-xl font-bold text-white">{current.title}</h2>
              <p className="text-white/60 text-xs mt-1">Шаг {step + 1} из {steps.length}</p>
            </div>
          </div>

          {/* Body */}
          <div className="px-8 py-6">
            <p className="text-sm text-slate-600 leading-relaxed">{current.body}</p>

            {current.link && (
              <button onClick={goToSection}
                className={`mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r ${current.color} text-white hover:opacity-90 transition-opacity`}>
                <Icon size={16} /> Перейти в раздел
              </button>
            )}
          </div>

          {/* Navigation */}
          <div className="px-8 pb-6 flex items-center justify-between">
            <button onClick={prev} disabled={step === 0}
              className="flex items-center gap-1 px-3 py-2 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={16} /> Назад
            </button>

            <div className="flex gap-1.5">
              {steps.map((_, i) => (
                <button key={i} onClick={() => setStep(i)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === step ? 'w-6 bg-gradient-to-r ' + current.color : i < step ? 'bg-slate-400' : 'bg-slate-200'
                  }`} />
              ))}
            </div>

            <button onClick={next}
              className={`flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                current.final
                  ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/25'
                  : 'text-blue-600 hover:bg-blue-50'
              }`}>
              {current.final ? (
                <><CheckCircle2 size={16} /> Начать!</>
              ) : (
                <>Далее <ChevronRight size={16} /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
