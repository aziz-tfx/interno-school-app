import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
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
  X,
  Monitor,
  Plug,
  BarChart3,
  Trophy,
  Wallet,
  PenTool,
  Bell,
  FileText,
  Calendar,
  ScrollText,
  Zap,
  ChevronDown,
  ChevronRight,
  Sliders,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import Logo from './Logo'

export default function Sidebar({ open, onClose }) {
  const { user, hasPermission, getRoleLabel, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()

  const studentNavItems = [
    { to: '/', icon: BarChart3, label: 'Обзор' },
    { to: '/?tab=course', icon: BookOpen, label: 'Мой курс' },
    { to: '/?tab=achievements', icon: Trophy, label: 'Достижения' },
    { to: '/?tab=payments', icon: Wallet, label: 'Оплата' },
    { to: '/?tab=attendance', icon: ClipboardCheck, label: 'Посещаемость' },
    { to: '/?tab=assignments', icon: PenTool, label: 'Задания' },
    { to: '/?tab=announcements', icon: Bell, label: 'Объявления' },
    { to: '/?tab=contract', icon: FileText, label: 'Договор' },
    { divider: true },
    { to: '/lms', icon: Monitor, label: t('sidebar.lms'), permission: 'lms' },
    { to: '/schedule', icon: Calendar, label: t('sidebar.schedule'), permission: 'schedule' },
  ]

  // Grouped navigation for staff. A `group` item renders as an expandable
  // section; its children are listed as leaf links when expanded.
  // Flat leaves (no `group`) still render as a single link.
  const allNavItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('sidebar.dashboard'), permission: 'dashboard' },
    { to: '/branches', icon: Building2, label: t('sidebar.branches'), permission: 'branches' },
    { to: '/students', icon: GraduationCap, label: t('sidebar.students'), permission: 'students' },
    { to: '/teachers', icon: Users, label: t('sidebar.teachers'), permission: 'teachers' },
    {
      group: 'learning',
      icon: BookOpen,
      label: 'Обучение',
      children: [
        { to: '/courses', icon: BookOpen, label: t('sidebar.courses'), permission: 'courses' },
        { to: '/lms', icon: Monitor, label: t('sidebar.lms'), permission: 'lms' },
      ],
    },
    {
      group: 'sales',
      icon: DollarSign,
      label: t('sidebar.finance'),
      children: [
        { to: '/finance', icon: DollarSign, label: t('sidebar.finance'), permission: 'finance' },
        { to: '/amo', icon: Zap, label: 'amoCRM эффективность', permission: 'finance' },
        { to: '/leaderboard', icon: Trophy, label: t('sidebar.leaderboard'), permission: 'finance' },
      ],
    },
    {
      group: 'schedule',
      icon: Calendar,
      label: 'Расписание',
      children: [
        { to: '/schedule', icon: Calendar, label: t('sidebar.schedule'), permission: 'schedule' },
        { to: '/attendance', icon: ClipboardCheck, label: t('sidebar.attendance'), permission: 'attendance' },
      ],
    },
    {
      group: 'settings',
      icon: Sliders,
      label: 'Настройки школы',
      children: [
        { to: '/employees', icon: UserCog, label: t('sidebar.employees'), permission: 'employees' },
        { to: '/integrations', icon: Plug, label: t('sidebar.integrations'), permission: 'settings' },
        { to: '/contract-templates', icon: FileText, label: 'Шаблоны договоров', permission: 'settings' },
        { to: '/audit', icon: ScrollText, label: t('sidebar.audit'), permission: 'audit' },
      ],
    },
    ...(user?.isSuperAdmin ? [{ to: '/superadmin', icon: Settings, label: 'SaaS панель', permission: null }] : []),
  ]

  // Filter by permissions — hide groups that end up empty.
  const filterByPerm = (item) => {
    if (item.permission === null) return true
    return hasPermission(item.permission)
  }

  const navItems = useMemo(() => {
    if (user?.role === 'student') {
      return studentNavItems.filter(it => !it.permission || hasPermission(it.permission))
    }
    return allNavItems
      .map(item => {
        if (item.group) {
          const children = item.children.filter(filterByPerm)
          return children.length ? { ...item, children } : null
        }
        return filterByPerm(item) ? item : null
      })
      .filter(Boolean)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.customPermissions, t])

  // Track which groups are open. Auto-open the group containing the
  // currently active route so the user sees where they are.
  const initialOpen = useMemo(() => {
    const state = {}
    allNavItems.forEach(it => {
      if (it.group) {
        state[it.group] = it.children.some(c => location.pathname.startsWith(c.to))
      }
    })
    return state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [openGroups, setOpenGroups] = useState(initialOpen)

  // Make sure the group containing the current route is open when route changes.
  useEffect(() => {
    setOpenGroups(prev => {
      const next = { ...prev }
      allNavItems.forEach(it => {
        if (it.group && it.children.some(c => location.pathname.startsWith(c.to))) {
          next[it.group] = true
        }
      })
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const toggleGroup = (id) => setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }))

  // ─── Hover flyout ────────────────────────────────────────────────────
  // On desktop (hover-capable pointers) we show an elegant floating panel
  // with the group's children to the right of the sidebar when the user
  // hovers the group header. On touch devices this is disabled and users
  // tap the header to expand the group inline.
  const canHover = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches
  }, [])
  const [flyout, setFlyout] = useState(null) // { groupId, top, left, item }
  const hideTimer = useRef(null)

  const showFlyout = (item, rect) => {
    if (!canHover) return
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
    setFlyout({
      groupId: item.group,
      item,
      top: Math.max(8, rect.top),
      left: rect.right + 8,
    })
  }
  const scheduleHideFlyout = () => {
    if (!canHover) return
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setFlyout(null), 150)
  }
  const cancelHideFlyout = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
  }
  // Close flyout on route change
  useEffect(() => { setFlyout(null) }, [location.pathname])

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

  const linkClass = (isActive, indent = false) =>
    `flex items-center gap-3 ${indent ? 'pl-10 pr-4' : 'px-4'} py-2.5 rounded-xl text-sm font-medium transition-all ${
      isActive
        ? 'bg-white/15 text-white shadow-lg shadow-blue-500/10 backdrop-blur-sm'
        : 'text-slate-400 hover:bg-white/8 hover:text-white'
    }`

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
          {navItems.map((item, idx) => {
            if (item.divider) return <div key={`div-${idx}`} className="my-2 border-t border-white/10" />

            // ─── Group (expandable on click, flyout on hover) ──────
            if (item.group) {
              const Icon = item.icon
              const isExpanded = !!openGroups[item.group]
              const hasActiveChild = item.children.some(c => location.pathname.startsWith(c.to))
              const isHovered = flyout?.groupId === item.group
              const Chev = isExpanded ? ChevronDown : ChevronRight
              return (
                <div
                  key={`grp-${item.group}`}
                  onMouseEnter={(e) => showFlyout(item, e.currentTarget.getBoundingClientRect())}
                  onMouseLeave={scheduleHideFlyout}
                >
                  <button
                    type="button"
                    onClick={() => { if (!canHover) toggleGroup(item.group) }}
                    className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      hasActiveChild || isHovered
                        ? 'bg-white/10 text-white'
                        : 'text-slate-300 hover:bg-white/8 hover:text-white'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="flex-1 text-left">{item.label}</span>
                    <Chev size={16} className="text-slate-500" />
                  </button>
                  {/* Inline expansion only on touch devices */}
                  {!canHover && isExpanded && (
                    <div className="mt-1 space-y-1">
                      {item.children.map(child => {
                        const ChildIcon = child.icon
                        return (
                          <NavLink
                            key={child.to}
                            to={child.to}
                            onClick={onClose}
                            className={({ isActive }) => linkClass(isActive, true)}
                          >
                            <ChildIcon size={16} />
                            {child.label}
                          </NavLink>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            // ─── Flat leaf link ────────────────────────────────────
            const { to, icon: Icon, label } = item
            const isStudentTab = user?.role === 'student' && to.startsWith('/?tab=')
            const isHomeTab = user?.role === 'student' && to === '/'
            let isActive = false
            if (isStudentTab) {
              const tabParam = new URLSearchParams(to.split('?')[1]).get('tab')
              const currentTab = new URLSearchParams(location.search).get('tab')
              isActive = currentTab === tabParam
            } else if (isHomeTab) {
              const currentTab = new URLSearchParams(location.search).get('tab')
              isActive = location.pathname === '/' && !currentTab
            }

            if (isStudentTab || isHomeTab) {
              return (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onClose}
                  end
                  className={linkClass(isActive)}
                >
                  <Icon size={18} />
                  {label}
                </NavLink>
              )
            }

            return (
              <NavLink
                key={to}
                to={to}
                onClick={onClose}
                className={({ isActive }) => linkClass(isActive)}
              >
                <Icon size={18} />
                {label}
              </NavLink>
            )
          })}
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

      {/* ─── Hover flyout (desktop only) ───────────────────────────── */}
      {flyout && typeof document !== 'undefined' && (() => {
        const HeaderIcon = flyout.item.icon
        return createPortal(
        <div
          onMouseEnter={cancelHideFlyout}
          onMouseLeave={scheduleHideFlyout}
          style={{ top: flyout.top, left: flyout.left }}
          className="fixed z-[60] min-w-[220px] rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/40 p-2 animate-[flyoutIn_120ms_ease-out]"
        >
          <div className="px-3 pt-2 pb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
            <HeaderIcon size={12} />
            {flyout.item.label}
          </div>
          <div className="space-y-0.5">
            {flyout.item.children.map(child => {
              const ChildIcon = child.icon
              return (
                <NavLink
                  key={child.to}
                  to={child.to}
                  onClick={() => { setFlyout(null); onClose() }}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-white/15 text-white shadow-inner'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  <ChildIcon size={15} />
                  {child.label}
                </NavLink>
              )
            })}
          </div>
        </div>,
        document.body
      )})()}

      {/* Flyout animation keyframes */}
      <style>{`
        @keyframes flyoutIn {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
  )
}
