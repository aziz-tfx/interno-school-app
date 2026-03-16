import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

// ─── Роли и метки ──────────────────────────────────────────────────────────
export const ROLE_LABELS = {
  owner:            'Владелец',
  admin:            'Администратор',
  branch_director:  'Руководитель филиала',
  rop:              'РОП',
  sales:            'Менеджер по продажам',
  accountant:       'Бухгалтер',
  financier:        'Финансист',
  hr:               'HR менеджер',
  smm:              'СММ менеджер',
  teacher:          'Учитель',
  student:          'Студент',
}

export const ROLE_COLORS = {
  owner:            'bg-yellow-600',
  admin:            'bg-blue-600',
  branch_director:  'bg-indigo-600',
  rop:              'bg-teal-600',
  sales:            'bg-emerald-600',
  accountant:       'bg-pink-600',
  financier:        'bg-cyan-600',
  hr:               'bg-orange-600',
  smm:              'bg-violet-600',
  teacher:          'bg-purple-600',
  student:          'bg-slate-500',
}

// ─── Права доступа ─────────────────────────────────────────────────────────
const PERMISSIONS = {
  owner: {
    dashboard: true, branches: true,
    students:  { view: true, add: true, edit: true, delete: true },
    teachers:  { view: true, add: true, edit: true, delete: true, salaries: true },
    courses:   { view: true, add: true, edit: true },
    finance:   { view: true, fullPnL: true, expenses: true, payments: true },
    employees: { view: true, add: true, edit: true, delete: true },
    settings: true,
  },
  admin: {
    dashboard: true, branches: true,
    students:  { view: true, add: true, edit: true, delete: true },
    teachers:  { view: true, add: true, edit: true, delete: true, salaries: true },
    courses:   { view: true, add: true, edit: true },
    finance:   { view: true, fullPnL: true, expenses: true, payments: true },
    employees: { view: true, add: true, edit: true, delete: true },
    settings: true,
  },
  branch_director: {
    dashboard: true, branches: true,
    students:  { view: true, add: true, edit: true, delete: true },
    teachers:  { view: true, add: true, edit: true, delete: true, salaries: true },
    courses:   { view: true, add: true, edit: true },
    finance:   { view: true, fullPnL: true, expenses: true, payments: true },
    employees: { view: true, add: true, edit: true, delete: false },
    settings: false,
  },
  rop: {
    dashboard: true, branches: false,
    students:  { view: true, add: true, edit: true, delete: false },
    teachers:  { view: true, add: false, edit: false, delete: false, salaries: false },
    courses:   { view: true, add: false, edit: false },
    finance:   { view: true, fullPnL: false, expenses: false, payments: true },
    employees: { view: true, add: false, edit: false, delete: false },
    settings: false,
  },
  sales: {
    dashboard: true, branches: false,
    students:  { view: true, add: true, edit: true, delete: false },
    teachers:  { view: true, add: false, edit: false, delete: false, salaries: false },
    courses:   { view: true, add: false, edit: false },
    finance:   { view: true, fullPnL: false, expenses: false, payments: true },
    employees: false,
    settings: false,
  },
  accountant: {
    dashboard: true, branches: false,
    students:  { view: true, add: false, edit: false, delete: false },
    teachers:  { view: true, add: false, edit: false, delete: false, salaries: true },
    courses:   { view: true, add: false, edit: false },
    finance:   { view: true, fullPnL: true, expenses: true, payments: true },
    employees: false,
    settings: false,
  },
  financier: {
    dashboard: true, branches: false,
    students:  { view: true, add: false, edit: false, delete: false },
    teachers:  { view: true, add: false, edit: false, delete: false, salaries: true },
    courses:   { view: true, add: false, edit: false },
    finance:   { view: true, fullPnL: true, expenses: true, payments: true },
    employees: false,
    settings: false,
  },
  hr: {
    dashboard: true, branches: false,
    students:  { view: false, add: false, edit: false, delete: false },
    teachers:  { view: true, add: true, edit: true, delete: false, salaries: false },
    courses:   { view: true, add: false, edit: false },
    finance:   false,
    employees: { view: true, add: true, edit: true, delete: false },
    settings: false,
  },
  smm: {
    dashboard: true, branches: false,
    students:  { view: true, add: false, edit: false, delete: false },
    teachers:  { view: false, add: false, edit: false, delete: false, salaries: false },
    courses:   { view: true, add: false, edit: false },
    finance:   false,
    employees: false,
    settings: false,
  },
  teacher: {
    dashboard: false, branches: false,
    students:  { view: true, add: false, edit: false, delete: false },
    teachers:  { view: false, add: false, edit: false, delete: false, salaries: false },
    courses:   { view: true, add: false, edit: false },
    finance:   false,
    employees: false,
    settings: false,
  },
  student: {
    dashboard: false, branches: false,
    students:  false,
    teachers:  false,
    courses:   { view: true, add: false, edit: false },
    finance:   false,
    employees: false,
    settings: false,
  },
}

// ─── Сотрудники по умолчанию ───────────────────────────────────────────────
const DEFAULT_EMPLOYEES = [
  // Владелец
  { id: 1,  login: 'owner',   password: 'owner123',  name: 'Тошполатов Азиз',     role: 'owner',   branch: 'all',       avatar: 'А', phone: '' },
  // Администратор
  { id: 2,  login: 'admin',   password: 'admin123',  name: 'Каримов Азиз',         role: 'admin',   branch: 'all',       avatar: 'К', phone: '' },
  // Руководители филиалов
  { id: 3,  login: 'dir_t',   password: 'dir123',    name: 'Усманов Фарход',       role: 'branch_director', branch: 'tashkent',  avatar: 'У', phone: '' },
  { id: 4,  login: 'dir_s',   password: 'dir123',    name: 'Жураев Бекзод',        role: 'branch_director', branch: 'samarkand', avatar: 'Ж', phone: '' },
  { id: 5,  login: 'dir_f',   password: 'dir123',    name: 'Мухамедов Алишер',     role: 'branch_director', branch: 'fergana',   avatar: 'М', phone: '' },
  // РОПы
  { id: 6,  login: 'rop1',    password: 'rop123',    name: 'Хасанова Мадина',      role: 'rop', branch: 'tashkent',  managerId: 'rop_t1', avatar: 'Х', phone: '' },
  { id: 7,  login: 'rop2',    password: 'rop123',    name: 'Каримов Отабек',       role: 'rop', branch: 'samarkand', managerId: 'rop_s1', avatar: 'О', phone: '' },
  { id: 8,  login: 'rop3',    password: 'rop123',    name: 'Садуллаева Нилуфар',   role: 'rop', branch: 'fergana',   managerId: 'rop_f1', avatar: 'Н', phone: '' },
  // Менеджеры по продажам — Ташкент
  { id: 10, login: 'sales1',  password: 'sales123',  name: 'Нурматова Гулнора',    role: 'sales', branch: 'tashkent',  managerId: 'mgr_t1', avatar: 'Г', phone: '' },
  { id: 11, login: 'sales4',  password: 'sales123',  name: 'Абдуллаев Камил',      role: 'sales', branch: 'tashkent',  managerId: 'mgr_t2', avatar: 'А', phone: '' },
  { id: 12, login: 'sales5',  password: 'sales123',  name: 'Юсупова Лейла',        role: 'sales', branch: 'tashkent',  managerId: 'mgr_t3', avatar: 'Л', phone: '' },
  { id: 13, login: 'sales6',  password: 'sales123',  name: 'Холматов Шахзод',      role: 'sales', branch: 'tashkent',  managerId: 'mgr_t4', avatar: 'Ш', phone: '' },
  // Менеджеры по продажам — Самарканд
  { id: 14, login: 'sales2',  password: 'sales123',  name: 'Исмаилов Руслан',      role: 'sales', branch: 'samarkand', managerId: 'mgr_s1', avatar: 'Р', phone: '' },
  { id: 15, login: 'sales7',  password: 'sales123',  name: 'Рахимова Замира',      role: 'sales', branch: 'samarkand', managerId: 'mgr_s2', avatar: 'З', phone: '' },
  { id: 16, login: 'sales8',  password: 'sales123',  name: 'Садиков Тимур',        role: 'sales', branch: 'samarkand', managerId: 'mgr_s3', avatar: 'Т', phone: '' },
  { id: 17, login: 'sales9',  password: 'sales123',  name: 'Норматова Афина',      role: 'sales', branch: 'samarkand', managerId: 'mgr_s4', avatar: 'А', phone: '' },
  // Менеджеры по продажам — Фергана
  { id: 18, login: 'sales3',  password: 'sales123',  name: 'Файзуллаева Дина',     role: 'sales', branch: 'fergana',   managerId: 'mgr_f1', avatar: 'Д', phone: '' },
  { id: 19, login: 'sales10', password: 'sales123',  name: 'Курбанов Икром',       role: 'sales', branch: 'fergana',   managerId: 'mgr_f2', avatar: 'И', phone: '' },
  { id: 20, login: 'sales11', password: 'sales123',  name: 'Тураева Максима',      role: 'sales', branch: 'fergana',   managerId: 'mgr_f3', avatar: 'М', phone: '' },
  { id: 21, login: 'sales12', password: 'sales123',  name: 'Каримова Ясмина',      role: 'sales', branch: 'fergana',   managerId: 'mgr_f4', avatar: 'Я', phone: '' },
  // Бухгалтер
  { id: 22, login: 'buh1',    password: 'buh123',    name: 'Ташпулатова Сабина',   role: 'accountant', branch: 'all', avatar: 'С', phone: '' },
  // Финансист
  { id: 23, login: 'fin1',    password: 'fin123',    name: 'Закирова Ольга',       role: 'financier',  branch: 'all', avatar: 'О', phone: '' },
  // HR менеджер
  { id: 24, login: 'hr1',     password: 'hr123',     name: 'Аминова Шахло',        role: 'hr',  branch: 'all', avatar: 'Ш', phone: '' },
  // СММ менеджер
  { id: 25, login: 'smm1',    password: 'smm123',    name: 'Турсунова Малика',     role: 'smm', branch: 'all', avatar: 'М', phone: '' },
  // Учителя
  { id: 26, login: 'teacher1', password: 'teach123', name: 'Смирнова Елена',       role: 'teacher', branch: 'tashkent',  teacherId: 1, avatar: 'Е', phone: '' },
  { id: 27, login: 'teacher2', password: 'teach123', name: 'Эргашев Бобур',        role: 'teacher', branch: 'samarkand', teacherId: 5, avatar: 'Б', phone: '' },
  { id: 28, login: 'teacher3', password: 'teach123', name: 'Холматова Наргиза',    role: 'teacher', branch: 'fergana',   teacherId: 8, avatar: 'Н', phone: '' },
]

const STORAGE_KEY = 'interno_employees'

function loadEmployees() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : DEFAULT_EMPLOYEES
  } catch { return DEFAULT_EMPLOYEES }
}

function saveEmployees(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

// ─── Provider ──────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('interno_user')
    return saved ? JSON.parse(saved) : null
  })
  const [employees, setEmployees] = useState(loadEmployees)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user) localStorage.setItem('interno_user', JSON.stringify(user))
    else localStorage.removeItem('interno_user')
  }, [user])

  useEffect(() => { saveEmployees(employees) }, [employees])

  const login = (loginStr, password) => {
    const found = employees.find(u => u.login === loginStr && u.password === password)
    if (found) {
      const { password: _, ...safe } = found
      setUser(safe)
      setError('')
      return true
    }
    setError('Неверный логин или пароль')
    return false
  }

  const logout = () => setUser(null)

  const hasPermission = (section, action) => {
    if (!user) return false
    const perms = PERMISSIONS[user.role]
    if (!perms) return false
    if (typeof perms[section] === 'boolean') return perms[section]
    if (action && typeof perms[section] === 'object') return perms[section][action]
    if (typeof perms[section] === 'object') return perms[section].view
    return false
  }

  const getRoleLabel = (role) => ROLE_LABELS[role || user?.role] || ''

  // ─── Employee CRUD ─────────────────────────────────────────────────────
  const addEmployee = (emp) => {
    const newEmp = {
      ...emp,
      id: Date.now(),
      avatar: emp.name?.charAt(0)?.toUpperCase() || '?',
      managerId: (emp.role === 'sales' || emp.role === 'rop') ? `mgr_${Date.now()}` : undefined,
    }
    setEmployees(prev => [...prev, newEmp])
    return newEmp
  }

  const updateEmployee = (id, updates) => {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e))
    // Update current session if editing self
    if (user?.id === id) {
      setUser(prev => ({ ...prev, ...updates, password: undefined }))
    }
  }

  const deleteEmployee = (id) => {
    setEmployees(prev => prev.filter(e => e.id !== id))
  }

  const resetEmployees = () => {
    setEmployees(DEFAULT_EMPLOYEES)
  }

  // Helper: get sales-related staff (for plan tracking)
  const getSalesStaff = (branchId) => {
    const list = employees.filter(e => e.role === 'sales' || e.role === 'rop')
    if (!branchId || branchId === 'all') return list
    return list.filter(e => e.branch === branchId)
  }

  return (
    <AuthContext.Provider value={{
      user, login, logout, error, setError,
      hasPermission, getRoleLabel,
      employees, addEmployee, updateEmployee, deleteEmployee, resetEmployees,
      getSalesStaff,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
