import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  GraduationCap,
  Users,
  BookOpen,
  DollarSign,
  ClipboardCheck,
  UserCog,
  LogOut,
  Settings,
  FileBarChart,
  X,
  Monitor,
  Plug,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import Logo from './Logo'

export default function Sidebar({ open, onClose }) {
  const { user, hasPermission, getRoleLabel, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()

  const allNavItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('sidebar.dashboard'), permission: 'dashboard' },
    { to: '/branches', icon: Building2, label: t('sidebar.branches'), permission: 'branches' },
    { to: '/students', icon: GraduationCap, label: t('sidebar.students'), permission: 'students' },
    { to: '/teachers', icon: Users, label: t('sidebar.teachers'), permission: 'teachers' },
    { to: '/courses', icon: BookOpen, label: t('sidebar.courses'), permission: 'courses' },
    { to: '/finance', icon: DollarSign, label: t('sidebar.finance'), permission: 'finance' },
    { to: '/employees', icon: UserCog, label: t('sidebar.employees'), permission: 'employees' },
    { to: '/reports', icon: FileBarChart, label: t('sidebar.reports'), permission: 'finance' },
    { to: '/lms', icon: Monitor, label: t('sidebar.lms'), permission: 'lms' },
    { to: '/attendance', icon: ClipboardCheck, label: t('sidebar.attendance'), permission: null },
    { to: '/integrations', icon: Plug, label: t('sidebar.integrations'), permission: 'settings' },
  ]

  const navItems = allNavItems.filter(item => {
    if (item.permission === null) return true
    return hasPermission(item.permission)
  })

  const roleColors = {
    owner: 'bg-rose-600',
    admin: 'bg-blue-600',
    branch_director: 'bg-indigo-600',
    rop: 'bg-teal-600',
    sales: 'bg-emerald-600',
    accountant: 'bg-amber-600',
    financier: 'bg-orange-600',
    hr: 'bg-pink-600',
    smm: 'bg-cyan-600',
    teacher: 'bg-purple-600',
    student: 'bg-slate-600',
  }

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 md:hidden" onClick={onClose} />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 glass-dark text-white flex flex-col shrink-0
        transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0 md:w-64
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Mobile close button */}
        <div className="md:hidden flex justify-end p-2">
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 border-b border-white/10">
          <Logo size="md" variant="light" />
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-white/15 text-white shadow-lg shadow-blue-500/10 backdrop-blur-sm'
                    : 'text-slate-400 hover:bg-white/8 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <button
            onClick={() => { navigate('/profile'); onClose(); }}
            className={`flex items-center gap-3 w-full px-4 py-2.5 mb-1 rounded-xl transition-all ${
              location.pathname === '/profile'
                ? 'bg-white/15 text-white'
                : 'hover:bg-white/8'
            }`}
          >
            <div className={`w-9 h-9 ${roleColors[user?.role] || 'bg-blue-600'} rounded-xl flex items-center justify-center text-sm font-bold shadow-lg`}>
              {user?.avatar}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-slate-400">{getRoleLabel()}</p>
            </div>
            <Settings size={14} className="text-slate-500" />
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-white/8 rounded-xl transition-all"
          >
            <LogOut size={16} />
            {t('sidebar.logout')}
          </button>
        </div>
      </aside>
    </>
  )
}
