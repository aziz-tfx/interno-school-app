import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, Bell, PenTool, Trophy, MessageCircle, Calendar,
  Wallet, Monitor, ChevronRight, ChevronLeft, X, Sparkles,
  GraduationCap, CheckCircle2, Rocket,
} from 'lucide-react'

const STEPS = [
  {
    icon: Sparkles,
    emoji: '👋',
    title: 'Добро пожаловать!',
    body: 'Это ваш личный кабинет. Здесь вы найдёте всё для учёбы: уроки, задания, оценки и расписание. Давайте познакомимся с основными разделами!',
    color: 'from-indigo-500 to-purple-600',
    bg: 'bg-indigo-50',
  },
  {
    icon: BookOpen,
    emoji: '📚',
    title: 'Мой курс',
    body: 'Здесь ваш прогресс по курсу. Видно сколько уроков пройдено, какие модули завершены. Нажмите «Продолжить» чтобы перейти к следующему уроку.',
    color: 'from-blue-500 to-indigo-600',
    bg: 'bg-blue-50',
    tab: 'course',
  },
  {
    icon: Monitor,
    emoji: '🎥',
    title: 'LMS — Уроки',
    body: 'В разделе LMS находятся все видеоуроки, материалы и записи. Каждый урок можно отметить как «пройденный» и получить XP за прогресс!',
    color: 'from-violet-500 to-purple-600',
    bg: 'bg-violet-50',
    link: '/lms',
  },
  {
    icon: PenTool,
    emoji: '✍️',
    title: 'Задания',
    body: 'Преподаватель даёт домашние задания с дедлайнами. Отправьте ответ, получите оценку и обратную связь. Следите за дедлайнами — просроченные подсвечиваются красным!',
    color: 'from-amber-500 to-orange-600',
    bg: 'bg-amber-50',
    tab: 'assignments',
  },
  {
    icon: MessageCircle,
    emoji: '💬',
    title: 'Чат с преподавателем',
    body: 'Есть вопрос по уроку? Напишите преподавателю в чате. Он ответит и вы получите уведомление.',
    color: 'from-emerald-500 to-teal-600',
    bg: 'bg-emerald-50',
    tab: 'chat',
  },
  {
    icon: Bell,
    emoji: '🔔',
    title: 'Уведомления',
    body: 'Колокольчик в правом верхнем углу показывает всё важное: новые уроки, дедлайны, оценки, сообщения. Красный бейдж = есть непрочитанное!',
    color: 'from-red-500 to-pink-600',
    bg: 'bg-red-50',
  },
  {
    icon: Trophy,
    emoji: '🏆',
    title: 'Достижения и XP',
    body: 'За каждый пройденный урок, задание и посещение вы получаете XP. Набирайте очки, повышайте уровень и соревнуйтесь с одногруппниками!',
    color: 'from-amber-500 to-yellow-500',
    bg: 'bg-amber-50',
    tab: 'achievements',
  },
  {
    icon: Rocket,
    emoji: '🚀',
    title: 'Вы готовы!',
    body: 'Теперь вы знаете все возможности. Начните с перехода к урокам курса — удачи в обучении!',
    color: 'from-emerald-500 to-green-600',
    bg: 'bg-emerald-50',
    final: true,
  },
]

const STORAGE_KEY = 'interno_onboarding_done'

export default function StudentOnboarding({ studentId }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!studentId) return
    const key = `${STORAGE_KEY}_${studentId}`
    const done = localStorage.getItem(key)
    if (!done) setVisible(true)
  }, [studentId])

  const finish = () => {
    if (studentId) localStorage.setItem(`${STORAGE_KEY}_${studentId}`, '1')
    setVisible(false)
  }

  const skip = () => finish()

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1)
    else finish()
  }

  const prev = () => {
    if (step > 0) setStep(step - 1)
  }

  const goToSection = () => {
    const s = STEPS[step]
    if (s.tab) navigate(`/?tab=${s.tab}`)
    else if (s.link) navigate(s.link)
    finish()
  }

  if (!visible) return null

  const current = STEPS[step]
  const Icon = current.icon
  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={skip} />

      {/* Card */}
      <div className="relative w-full max-w-md animate-[scaleIn_300ms_ease-out]">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-slate-100">
            <div className={`h-full bg-gradient-to-r ${current.color} transition-all duration-500`}
              style={{ width: `${progress}%` }} />
          </div>

          {/* Skip button */}
          <button onClick={skip}
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
              <p className="text-white/60 text-xs mt-1">Шаг {step + 1} из {STEPS.length}</p>
            </div>
          </div>

          {/* Body */}
          <div className="px-8 py-6">
            <p className="text-sm text-slate-600 leading-relaxed">{current.body}</p>

            {/* Go to section button */}
            {(current.tab || current.link) && (
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

            {/* Step dots */}
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
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
