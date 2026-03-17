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
  Shield,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function Sidebar() {
  const { user, hasPermission, getRoleLabel, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const allNavItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Дашборд', permission: 'dashboard' },
    { to: '/branches', icon: Building2, label: 'Филиалы', permission: 'branches' },
    { to: '/students', icon: GraduationCap, label: 'Ученики', permission: 'students' },
    { to: '/teachers', icon: Users, label: 'Учителя', permission: 'teachers' },
    { to: '/courses', icon: BookOpen, label: 'Курсы', permission: 'courses' },
    { to: '/finance', icon: DollarSign, label: 'Финансы', permission: 'finance' },
    { to: '/employees', icon: UserCog, label: 'Сотрудники', permission: 'employees' },
    { to: '/attendance', icon: ClipboardCheck, label: 'Посещаемость', permission: null },
    { to: '/access-control', icon: Shield, label: 'Доступы', permission: 'settings' },
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
    <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold tracking-tight">INTERNO</h1>
        <p className="text-slate-400 text-sm mt-1">School Management</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-700">
        <button
          onClick={() => navigate('/profile')}
          className={`flex items-center gap-3 w-full px-4 py-2 mb-1 rounded-lg transition-colors ${
            location.pathname === '/profile'
              ? 'bg-blue-600 text-white'
              : 'hover:bg-slate-800'
          }`}
        >
          <div className={`w-8 h-8 ${roleColors[user?.role] || 'bg-blue-600'} rounded-full flex items-center justify-center text-sm font-bold`}>
            {user?.avatar}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-slate-400">{getRoleLabel()}</p>
          </div>
          <Settings size={14} className="text-slate-400" />
        </button>
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <LogOut size={16} />
          Выйти
        </button>
      </div>
    </aside>
  )
}
