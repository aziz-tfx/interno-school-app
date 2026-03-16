import { useState, useMemo } from 'react'
import { useAuth, ROLE_LABELS, ROLE_COLORS } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import {
  User, Lock, Phone, Building2, Shield, Camera,
  Save, Eye, EyeOff, CheckCircle, AlertTriangle,
  Users, GraduationCap, DollarSign, TrendingUp,
  Calendar, Clock, BookOpen, BarChart3, Briefcase,
  Mail, MapPin, Star, Award, Activity
} from 'lucide-react'

const AVATAR_COLORS = [
  'bg-blue-600', 'bg-rose-600', 'bg-emerald-600', 'bg-purple-600',
  'bg-amber-600', 'bg-teal-600', 'bg-indigo-600', 'bg-cyan-600',
  'bg-pink-600', 'bg-orange-600', 'bg-violet-600', 'bg-red-600',
]

export default function Profile() {
  const { user, employees, updateEmployee, hasPermission, getRoleLabel } = useAuth()
  const { students, groups, branches, payments, getBranchName } = useData()

  const [activeTab, setActiveTab] = useState('profile')
  const [showPassword, setShowPassword] = useState(false)
  const [saved, setSaved] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  // Full employee record (with password)
  const fullEmployee = employees.find(e => e.id === user?.id)

  const [form, setForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    avatarColor: ROLE_COLORS[user?.role] || 'bg-blue-600',
  })

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))
  const setPwd = (field, value) => setPasswordForm(prev => ({ ...prev, [field]: value }))

  // === Role-based stats ===
  const roleStats = useMemo(() => {
    if (!user) return {}
    const role = user.role
    const branch = user.branch

    // Branch filter helper
    const filterByBranch = (arr, branchField = 'branch') => {
      if (branch === 'all') return arr
      return arr.filter(item => item[branchField] === branch)
    }

    const branchStudents = filterByBranch(students)
    const branchGroups = filterByBranch(groups)
    const branchPayments = filterByBranch(payments)

    const stats = {}

    // Owner / Admin — full business overview
    if (role === 'owner' || role === 'admin') {
      stats.totalStudents = students.length
      stats.activeStudents = students.filter(s => s.status === 'active').length
      stats.totalGroups = groups.filter(g => g.status !== 'archived').length
      stats.totalBranches = branches.length
      stats.totalEmployees = employees.length
      stats.totalRevenue = payments.reduce((s, p) => s + (p.amount || 0), 0)
      stats.debtors = students.filter(s => s.status === 'debtor').length
    }

    // Branch director
    if (role === 'branch_director') {
      stats.branchStudents = branchStudents.length
      stats.activeStudents = branchStudents.filter(s => s.status === 'active').length
      stats.branchGroups = branchGroups.filter(g => g.status !== 'archived').length
      stats.branchEmployees = employees.filter(e => e.branch === branch).length
      stats.branchRevenue = branchPayments.reduce((s, p) => s + (p.amount || 0), 0)
      stats.debtors = branchStudents.filter(s => s.status === 'debtor').length
    }

    // ROP
    if (role === 'rop') {
      const teamSales = employees.filter(e => e.role === 'sales' && e.branch === branch)
      stats.teamSize = teamSales.length
      stats.branchStudents = branchStudents.length
      stats.newStudentsThisMonth = branchStudents.filter(s => {
        if (!s.createdAt) return false
        const d = new Date(s.createdAt)
        const now = new Date()
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      }).length
      stats.branchRevenue = branchPayments.reduce((s, p) => s + (p.amount || 0), 0)
    }

    // Sales manager
    if (role === 'sales') {
      const myPayments = payments.filter(p => p.managerId === user.managerId || p.employeeId === user.id)
      stats.myStudents = students.filter(s => s.managerId === user.managerId).length
      stats.myRevenue = myPayments.reduce((s, p) => s + (p.amount || 0), 0)
      stats.myPaymentsCount = myPayments.length
    }

    // Accountant / Financier
    if (role === 'accountant' || role === 'financier') {
      stats.totalRevenue = payments.reduce((s, p) => s + (p.amount || 0), 0)
      stats.totalPayments = payments.length
      stats.debtors = students.filter(s => s.status === 'debtor').length
    }

    // HR
    if (role === 'hr') {
      stats.totalEmployees = employees.length
      stats.roleDistribution = Object.entries(
        employees.reduce((acc, e) => { acc[e.role] = (acc[e.role] || 0) + 1; return acc }, {})
      ).sort((a, b) => b[1] - a[1]).slice(0, 5)
    }

    // Teacher
    if (role === 'teacher') {
      const myGroups = groups.filter(g => g.teacherId === user.teacherId)
      stats.myGroups = myGroups.length
      stats.myStudents = myGroups.reduce((total, g) => {
        return total + students.filter(s => s.group === g.name).length
      }, 0)
      stats.myGroupNames = myGroups.map(g => g.name)
    }

    // SMM
    if (role === 'smm') {
      stats.totalStudents = students.length
      stats.activeBranches = branches.length
    }

    return stats
  }, [user, students, groups, branches, payments, employees])

  // === Permissions list for current role ===
  const permissionsList = useMemo(() => {
    if (!user) return []
    const sections = [
      { key: 'dashboard', label: 'Дашборд', icon: BarChart3 },
      { key: 'branches', label: 'Филиалы', icon: Building2 },
      { key: 'students', label: 'Ученики', icon: GraduationCap },
      { key: 'teachers', label: 'Учителя', icon: Users },
      { key: 'courses', label: 'Курсы', icon: BookOpen },
      { key: 'finance', label: 'Финансы', icon: DollarSign },
      { key: 'employees', label: 'Сотрудники', icon: Briefcase },
      { key: 'settings', label: 'Настройки', icon: Shield },
    ]
    return sections.map(s => ({
      ...s,
      hasAccess: hasPermission(s.key),
    }))
  }, [user])

  const handleSaveProfile = () => {
    const updates = { name: form.name, phone: form.phone }
    updateEmployee(user.id, updates)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleChangePassword = () => {
    setPasswordError('')
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      setPasswordError('Заполните все поля')
      return
    }
    if (fullEmployee?.password !== passwordForm.currentPassword) {
      setPasswordError('Неверный текущий пароль')
      return
    }
    if (passwordForm.newPassword.length < 4) {
      setPasswordError('Минимум 4 символа')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Пароли не совпадают')
      return
    }
    updateEmployee(user.id, { password: passwordForm.newPassword })
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const fmtMoney = (n) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' млн'
    if (n >= 1_000) return (n / 1_000).toFixed(0) + ' тыс'
    return n?.toLocaleString() || '0'
  }

  // Tabs based on role
  const tabs = [
    { id: 'profile', label: 'Профиль', icon: User },
    { id: 'security', label: 'Безопасность', icon: Lock },
    { id: 'stats', label: 'Моя статистика', icon: Activity },
    { id: 'access', label: 'Уровень доступа', icon: Shield },
  ]

  const roleColor = ROLE_COLORS[user?.role] || 'bg-blue-600'

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-8 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.03%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-50" />
        <div className="relative flex items-center gap-6">
          <div className={`w-20 h-20 ${roleColor} rounded-2xl flex items-center justify-center text-3xl font-bold shadow-lg ring-4 ring-white/10`}>
            {user?.avatar}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{user?.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className={`px-3 py-1 ${roleColor} rounded-full text-xs font-semibold`}>
                {getRoleLabel()}
              </span>
              {user?.branch && (
                <span className="flex items-center gap-1 text-slate-300 text-sm">
                  <MapPin size={14} />
                  {user.branch === 'all' ? 'Все филиалы' : getBranchName(user.branch)}
                </span>
              )}
            </div>
            <p className="text-slate-400 text-sm mt-1">Логин: {fullEmployee?.login}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Success toast */}
      {saved && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm font-medium animate-pulse">
          <CheckCircle size={18} />
          Изменения сохранены
        </div>
      )}

      {/* ═══════ PROFILE TAB ═══════ */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <User size={20} className="text-blue-600" />
            Личные данные
          </h3>
          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">ФИО</label>
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Телефон</label>
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="+998 90 123-45-67"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Логин</label>
              <input type="text" value={fullEmployee?.login || ''} disabled
                className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Роль</label>
              <input type="text" value={getRoleLabel()} disabled
                className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Филиал</label>
              <input type="text" value={user?.branch === 'all' ? 'Все филиалы' : getBranchName(user?.branch)} disabled
                className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed" />
            </div>

            {/* Avatar color picker */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">Цвет аватара</label>
              <div className="flex gap-2 flex-wrap">
                {AVATAR_COLORS.map(color => (
                  <button key={color} type="button" onClick={() => set('avatarColor', color)}
                    className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center text-white text-sm font-bold transition-all ${
                      form.avatarColor === color ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-105'
                    }`}>
                    {user?.avatar}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-6 pt-4 border-t border-slate-100">
            <button onClick={handleSaveProfile}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
              <Save size={16} />
              Сохранить
            </button>
          </div>
        </div>
      )}

      {/* ═══════ SECURITY TAB ═══════ */}
      {activeTab === 'security' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Lock size={20} className="text-blue-600" />
            Смена пароля
          </h3>

          {passwordError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">
              <AlertTriangle size={16} />
              {passwordError}
            </div>
          )}

          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Текущий пароль</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={passwordForm.currentPassword}
                  onChange={e => setPwd('currentPassword', e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Новый пароль</label>
              <input type={showPassword ? 'text' : 'password'} value={passwordForm.newPassword}
                onChange={e => setPwd('newPassword', e.target.value)}
                placeholder="Минимум 4 символа"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Подтвердите пароль</label>
              <input type={showPassword ? 'text' : 'password'} value={passwordForm.confirmPassword}
                onChange={e => setPwd('confirmPassword', e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="flex justify-end mt-6 pt-4 border-t border-slate-100">
            <button onClick={handleChangePassword}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
              <Lock size={16} />
              Изменить пароль
            </button>
          </div>

          {/* Security info */}
          <div className="mt-6 p-4 bg-slate-50 rounded-xl">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Информация о безопасности</h4>
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <Shield size={14} className="text-slate-400" />
                <span>Роль: <span className="font-medium">{getRoleLabel()}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <Building2 size={14} className="text-slate-400" />
                <span>Доступ: <span className="font-medium">{user?.branch === 'all' ? 'Полный (все филиалы)' : `Филиал: ${getBranchName(user?.branch)}`}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-slate-400" />
                <span>Настройки: <span className="font-medium">{hasPermission('settings') ? 'Полный доступ' : 'Только профиль'}</span></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ STATS TAB ═══════ */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {/* Owner/Admin stats */}
          {(user?.role === 'owner' || user?.role === 'admin') && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={GraduationCap} label="Всего учеников" value={roleStats.totalStudents} color="blue" />
              <StatCard icon={Users} label="Активных" value={roleStats.activeStudents} color="emerald" />
              <StatCard icon={BookOpen} label="Групп" value={roleStats.totalGroups} color="purple" />
              <StatCard icon={Building2} label="Филиалов" value={roleStats.totalBranches} color="indigo" />
              <StatCard icon={Briefcase} label="Сотрудников" value={roleStats.totalEmployees} color="teal" />
              <StatCard icon={DollarSign} label="Общий доход" value={fmtMoney(roleStats.totalRevenue || 0)} color="amber" />
              <StatCard icon={AlertTriangle} label="Должников" value={roleStats.debtors} color="red" />
            </div>
          )}

          {/* Branch director stats */}
          {user?.role === 'branch_director' && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard icon={GraduationCap} label="Учеников филиала" value={roleStats.branchStudents} color="blue" />
              <StatCard icon={Users} label="Активных" value={roleStats.activeStudents} color="emerald" />
              <StatCard icon={BookOpen} label="Групп" value={roleStats.branchGroups} color="purple" />
              <StatCard icon={Briefcase} label="Сотрудников" value={roleStats.branchEmployees} color="indigo" />
              <StatCard icon={DollarSign} label="Доход филиала" value={fmtMoney(roleStats.branchRevenue || 0)} color="amber" />
              <StatCard icon={AlertTriangle} label="Должников" value={roleStats.debtors} color="red" />
            </div>
          )}

          {/* ROP stats */}
          {user?.role === 'rop' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={Users} label="Размер команды" value={roleStats.teamSize} color="blue" />
              <StatCard icon={GraduationCap} label="Учеников" value={roleStats.branchStudents} color="emerald" />
              <StatCard icon={TrendingUp} label="Новых за месяц" value={roleStats.newStudentsThisMonth} color="purple" />
              <StatCard icon={DollarSign} label="Доход филиала" value={fmtMoney(roleStats.branchRevenue || 0)} color="amber" />
            </div>
          )}

          {/* Sales stats */}
          {user?.role === 'sales' && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard icon={GraduationCap} label="Мои ученики" value={roleStats.myStudents} color="blue" />
              <StatCard icon={DollarSign} label="Мой доход" value={fmtMoney(roleStats.myRevenue || 0)} color="emerald" />
              <StatCard icon={Activity} label="Платежей" value={roleStats.myPaymentsCount} color="purple" />
            </div>
          )}

          {/* Accountant / Financier stats */}
          {(user?.role === 'accountant' || user?.role === 'financier') && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard icon={DollarSign} label="Общий доход" value={fmtMoney(roleStats.totalRevenue || 0)} color="emerald" />
              <StatCard icon={Activity} label="Платежей" value={roleStats.totalPayments} color="blue" />
              <StatCard icon={AlertTriangle} label="Должников" value={roleStats.debtors} color="red" />
            </div>
          )}

          {/* HR stats */}
          {user?.role === 'hr' && (
            <div>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <StatCard icon={Briefcase} label="Всего сотрудников" value={roleStats.totalEmployees} color="blue" />
              </div>
              {roleStats.roleDistribution && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h4 className="text-sm font-bold text-slate-900 mb-4">Распределение по ролям</h4>
                  <div className="space-y-3">
                    {roleStats.roleDistribution.map(([role, count]) => (
                      <div key={role} className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${ROLE_COLORS[role] || 'bg-slate-400'}`} />
                        <span className="text-sm text-slate-600 flex-1">{ROLE_LABELS[role]}</span>
                        <span className="text-sm font-bold text-slate-900">{count}</span>
                        <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${ROLE_COLORS[role] || 'bg-slate-400'} rounded-full`}
                            style={{ width: `${(count / roleStats.totalEmployees) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Teacher stats */}
          {user?.role === 'teacher' && (
            <div>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <StatCard icon={BookOpen} label="Мои группы" value={roleStats.myGroups} color="purple" />
                <StatCard icon={GraduationCap} label="Мои ученики" value={roleStats.myStudents} color="blue" />
              </div>
              {roleStats.myGroupNames?.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h4 className="text-sm font-bold text-slate-900 mb-4">Мои группы</h4>
                  <div className="flex flex-wrap gap-2">
                    {roleStats.myGroupNames.map(name => (
                      <span key={name} className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-sm font-medium">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SMM stats */}
          {user?.role === 'smm' && (
            <div className="grid grid-cols-2 gap-4">
              <StatCard icon={GraduationCap} label="Всего учеников" value={roleStats.totalStudents} color="blue" />
              <StatCard icon={Building2} label="Филиалов" value={roleStats.activeBranches} color="indigo" />
            </div>
          )}

          {/* Student role */}
          {user?.role === 'student' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-500">
              <GraduationCap size={48} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm">Статистика для студентов в разработке</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════ ACCESS TAB ═══════ */}
      {activeTab === 'access' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
            <Shield size={20} className="text-blue-600" />
            Уровень доступа
          </h3>
          <p className="text-sm text-slate-500 mb-6">
            Ваша роль: <span className={`inline-flex px-2 py-0.5 ${roleColor} text-white rounded-md text-xs font-semibold`}>{getRoleLabel()}</span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {permissionsList.map(perm => (
              <div key={perm.key}
                className={`flex items-center gap-3 p-4 rounded-xl border transition-colors ${
                  perm.hasAccess
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-slate-50 border-slate-200'
                }`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  perm.hasAccess ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'
                }`}>
                  <perm.icon size={20} />
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${perm.hasAccess ? 'text-slate-900' : 'text-slate-400'}`}>
                    {perm.label}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {perm.hasAccess ? 'Доступ разрешён' : 'Нет доступа'}
                  </p>
                </div>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  perm.hasAccess ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-white'
                }`}>
                  {perm.hasAccess ? <CheckCircle size={14} /> : <Lock size={14} />}
                </div>
              </div>
            ))}
          </div>

          {/* Detailed permissions for owner/admin */}
          {hasPermission('settings') && (
            <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <h4 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
                <Star size={14} />
                Полные права администратора
              </h4>
              <p className="text-xs text-blue-600">
                У вас есть доступ ко всем разделам системы, включая управление сотрудниками,
                настройки системы, полный финансовый отчёт и управление филиалами.
              </p>
            </div>
          )}

          {!hasPermission('settings') && (
            <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-100">
              <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
                <AlertTriangle size={14} />
                Ограниченный доступ
              </h4>
              <p className="text-xs text-amber-600">
                Ваш уровень доступа ограничен ролью «{getRoleLabel()}».
                Для расширения прав обратитесь к администратору.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Stat Card Component ─────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    teal: 'bg-teal-50 text-teal-600 border-teal-100',
    red: 'bg-red-50 text-red-600 border-red-100',
  }
  const iconColorMap = {
    blue: 'bg-blue-100 text-blue-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    purple: 'bg-purple-100 text-purple-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    amber: 'bg-amber-100 text-amber-600',
    teal: 'bg-teal-100 text-teal-600',
    red: 'bg-red-100 text-red-600',
  }

  return (
    <div className={`p-4 rounded-2xl border ${colorMap[color]}`}>
      <div className={`w-10 h-10 rounded-xl ${iconColorMap[color]} flex items-center justify-center mb-3`}>
        <Icon size={20} />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  )
}
