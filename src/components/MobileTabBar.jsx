// Bottom tab bar for phones (and the Telegram mini app): the 4 sections a
// role uses most + «Меню», which opens the full sidebar. Hidden from md up.
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, SquareKanban, GraduationCap, DollarSign, Calendar, Monitor,
  ClipboardCheck, BarChart3, BookOpen, PenTool, Wallet, Menu, Users,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { USE_SERVER } from '../backend/api'
import { haptic } from '../utils/telegramWebApp'

// [ru, uz] — tab labels must stay short to fit five in 320px
const L = {
  home: ['Главная', 'Asosiy'],
  overview: ['Обзор', 'Umumiy'],
  crm: ['CRM', 'CRM'],
  students: ['Ученики', "O'quvchilar"],
  sales: ['Продажи', 'Sotuvlar'],
  schedule: ['Расписание', 'Jadval'],
  lms: ['LMS', 'LMS'],
  attendance: ['Отметки', 'Davomat'],
  teachers: ['Учителя', 'Ustozlar'],
  course: ['Курс', 'Kurs'],
  tasks: ['Задания', 'Vazifalar'],
  payments: ['Оплата', "To'lov"],
  menu: ['Меню', 'Menyu'],
}

function tabsFor(user, hasPermission) {
  if (user.role === 'student') {
    return [
      { to: '/', icon: BarChart3, label: 'overview' },
      { to: '/?tab=course', icon: BookOpen, label: 'course' },
      { to: '/?tab=assignments', icon: PenTool, label: 'tasks' },
      { to: '/?tab=payments', icon: Wallet, label: 'payments' },
    ]
  }
  const candidates = user.role === 'teacher'
    ? [
        { to: '/', icon: ClipboardCheck, label: 'attendance' },
        { to: '/schedule', icon: Calendar, label: 'schedule', perm: 'schedule' },
        { to: '/lms', icon: Monitor, label: 'lms', perm: 'lms' },
        { to: '/students', icon: GraduationCap, label: 'students', perm: 'students' },
      ]
    : [
        { to: '/', icon: LayoutDashboard, label: 'home' },
        ...(USE_SERVER ? [{ to: '/crm', icon: SquareKanban, label: 'crm', perm: 'crm' }] : []),
        { to: '/students', icon: GraduationCap, label: 'students', perm: 'students' },
        { to: '/finance', icon: DollarSign, label: 'sales', perm: 'finance' },
        { to: '/schedule', icon: Calendar, label: 'schedule', perm: 'schedule' },
        { to: '/attendance', icon: ClipboardCheck, label: 'attendance', perm: 'attendance' },
        { to: '/lms', icon: Monitor, label: 'lms', perm: 'lms' },
        { to: '/teachers', icon: Users, label: 'teachers', perm: 'teachers' },
      ]
  return candidates.filter(c => !c.perm || hasPermission(c.perm)).slice(0, 4)
}

export default function MobileTabBar({ onMenuClick, menuOpen }) {
  const { user, hasPermission } = useAuth()
  const { language } = useLanguage()
  const location = useLocation()
  if (!user) return null

  const label = (key) => L[key][language === 'uz' ? 1 : 0]
  const currentTab = new URLSearchParams(location.search).get('tab')
  const isActive = (to) => {
    if (menuOpen) return false
    if (to.startsWith('/?tab=')) return location.pathname === '/' && currentTab === new URLSearchParams(to.slice(2)).get('tab')
    if (to === '/') return location.pathname === '/' && !currentTab
    return location.pathname.startsWith(to)
  }

  const itemClass = (active) =>
    `flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-2xl text-[10.5px] font-medium leading-tight transition-colors ${
      active ? 'text-primary-600 dark:text-primary-300' : 'text-slate-500 active:bg-slate-100/70'
    }`

  return (
    <nav
      aria-label="Основные разделы"
      className="mobile-tabbar md:hidden fixed bottom-0 inset-x-0 z-40 glass-strong border-t border-white/40 px-1.5 pt-1"
    >
      <div className="flex items-stretch gap-0.5 h-14">
        {tabsFor(user, hasPermission).map(({ to, icon: Icon, label: key }) => {
          const active = isActive(to)
          return (
            <NavLink key={to} to={to} end onClick={() => haptic('select')} className={itemClass(active)}
              aria-current={active ? 'page' : undefined}>
              <span className={`flex items-center justify-center w-12 h-7 rounded-full transition-colors ${active ? 'bg-primary-100/80 dark:bg-white/10' : ''}`}>
                <Icon size={20} strokeWidth={active ? 2.3 : 1.9} />
              </span>
              <span className="truncate max-w-full px-0.5">{label(key)}</span>
            </NavLink>
          )
        })}
        <button type="button" onClick={() => { haptic('select'); onMenuClick() }} className={itemClass(menuOpen)}
          aria-expanded={menuOpen}>
          <span className={`flex items-center justify-center w-12 h-7 rounded-full ${menuOpen ? 'bg-primary-100/80 dark:bg-white/10' : ''}`}>
            <Menu size={20} />
          </span>
          <span>{label('menu')}</span>
        </button>
      </div>
    </nav>
  )
}
