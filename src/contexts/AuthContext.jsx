import { createContext, useContext, useState, useEffect } from 'react'
import { db } from '../firebase'
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  query,
  where,
} from 'firebase/firestore'
import { DEFAULT_TENANT_ID } from '../utils/tenancy'

const AuthContext = createContext(null)

// ─── Роли и метки ──────────────────────────────────────────────────────────
export const ROLE_LABELS = {
  owner:            'Владелец',
  admin:            'Администратор',
  branch_director:  'Руководитель филиала',
  branch_admin:     'Админ филиала',
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
  branch_admin:     'bg-sky-600',
  rop:              'bg-teal-600',
  sales:            'bg-emerald-600',
  accountant:       'bg-pink-600',
  financier:        'bg-cyan-600',
  hr:               'bg-orange-600',
  smm:              'bg-violet-600',
  teacher:          'bg-purple-600',
  student:          'bg-slate-500',
}

// ─── Права доступа (дефолтные) ─────────────────────────────────────────────
export const DEFAULT_PERMISSIONS = {
  owner: {
    dashboard: true, branches: true,
    students:  { view: true, add: true, edit: true, delete: true },
    teachers:  { view: true, add: true, edit: true, delete: true, salaries: true },
    courses:   { view: true, add: true, edit: true },
    finance:   { view: true, fullPnL: true, expenses: true, payments: true },
    employees: { view: true, add: true, edit: true, delete: true },
    attendance: { view: true, mark: true, edit: true },
    lms:       { view: true, create_content: true, grade: true, manage: true },
    schedule:  { view: true, edit: true },
    audit:     true,
    settings: true,
  },
  admin: {
    dashboard: true, branches: true,
    students:  { view: true, add: true, edit: true, delete: true },
    teachers:  { view: true, add: true, edit: true, delete: true, salaries: true },
    courses:   { view: true, add: true, edit: true },
    finance:   { view: true, fullPnL: true, expenses: true, payments: true },
    employees: { view: true, add: true, edit: true, delete: true },
    attendance: { view: true, mark: true, edit: true },
    lms:       { view: true, create_content: true, grade: true, manage: true },
    schedule:  { view: true, edit: true },
    audit:     true,
    settings: true,
  },
  branch_director: {
    dashboard: true, branches: true,
    students:  { view: true, add: true, edit: true, delete: true },
    teachers:  { view: true, add: true, edit: true, delete: true, salaries: true },
    courses:   { view: true, add: true, edit: true },
    finance:   { view: true, fullPnL: true, expenses: true, payments: true },
    employees: { view: true, add: true, edit: true, delete: false },
    attendance: { view: true, mark: true, edit: true },
    lms:       { view: true, create_content: true, grade: true, manage: true },
    schedule:  { view: true, edit: true },
    audit:     false,
    settings: false,
  },
  branch_admin: {
    dashboard: true, branches: false,
    students:  { view: true, add: true, edit: true, delete: false },
    teachers:  { view: true, add: false, edit: false, delete: false, salaries: false },
    courses:   { view: true, add: false, edit: false },
    finance:   { view: true, fullPnL: false, expenses: false, payments: true },
    employees: { view: true, add: false, edit: false, delete: false },
    attendance: { view: true, mark: true, edit: true },
    lms:       { view: true, create_content: false, grade: true, manage: false },
    schedule:  { view: true, edit: false },
    audit:     false,
    settings: false,
  },
  rop: {
    dashboard: true, branches: false,
    students:  { view: true, add: true, edit: true, delete: false },
    teachers:  { view: true, add: false, edit: false, delete: false, salaries: false },
    courses:   { view: true, add: false, edit: false },
    finance:   { view: true, fullPnL: false, expenses: false, payments: true },
    employees: { view: true, add: false, edit: false, delete: false },
    attendance: { view: true, mark: true, edit: false },
    lms:       { view: true, create_content: false, grade: false, manage: false },
    schedule:  { view: true, edit: false },
    audit:     false,
    settings: false,
  },
  sales: {
    dashboard: true, branches: false,
    students:  { view: true, add: true, edit: true, delete: false },
    teachers:  { view: true, add: false, edit: false, delete: false, salaries: false },
    courses:   { view: true, add: false, edit: false },
    finance:   { view: true, fullPnL: false, expenses: false, payments: true },
    employees: false,
    attendance: { view: true, mark: false, edit: false },
    lms:       false,
    schedule:  false,
    audit:     false,
    settings: false,
  },
  accountant: {
    dashboard: true, branches: false,
    students:  { view: true, add: false, edit: false, delete: false },
    teachers:  { view: true, add: false, edit: false, delete: false, salaries: true },
    courses:   { view: true, add: false, edit: false },
    finance:   { view: true, fullPnL: true, expenses: true, payments: true },
    employees: false,
    attendance: { view: true, mark: false, edit: false },
    lms:       false,
    schedule:  false,
    audit:     false,
    settings: false,
  },
  financier: {
    dashboard: true, branches: false,
    students:  { view: true, add: false, edit: false, delete: false },
    teachers:  { view: true, add: false, edit: false, delete: false, salaries: true },
    courses:   { view: true, add: false, edit: false },
    finance:   { view: true, fullPnL: true, expenses: true, payments: true },
    employees: false,
    attendance: false,
    lms:       false,
    schedule:  false,
    audit:     false,
    settings: false,
  },
  hr: {
    dashboard: true, branches: false,
    students:  { view: false, add: false, edit: false, delete: false },
    teachers:  { view: true, add: true, edit: true, delete: false, salaries: false },
    courses:   { view: true, add: false, edit: false },
    finance:   false,
    employees: { view: true, add: true, edit: true, delete: false },
    attendance: false,
    lms:       false,
    schedule:  false,
    audit:     false,
    settings: false,
  },
  smm: {
    dashboard: true, branches: false,
    students:  { view: true, add: false, edit: false, delete: false },
    teachers:  { view: false, add: false, edit: false, delete: false, salaries: false },
    courses:   { view: true, add: false, edit: false },
    finance:   false,
    employees: false,
    attendance: false,
    lms:       false,
    schedule:  false,
    audit:     false,
    settings: false,
  },
  teacher: {
    dashboard: false, branches: false,
    students:  { view: true, add: false, edit: false, delete: false },
    teachers:  { view: false, add: false, edit: false, delete: false, salaries: false },
    courses:   { view: true, add: false, edit: false },
    finance:   false,
    employees: false,
    attendance: { view: true, mark: true, edit: false },
    lms:       { view: true, create_content: true, grade: true, manage: false },
    schedule:  { view: true, edit: false },
    audit:     false,
    settings: false,
  },
  student: {
    dashboard: false, branches: false,
    students:  false,
    teachers:  false,
    courses:   false,
    finance:   false,
    employees: false,
    attendance: false,
    lms:       { view: true, create_content: false, grade: false, manage: false },
    schedule:  { view: true, edit: false },
    audit:     false,
    settings: false,
  },
}

// Mutable reference – starts with defaults, gets overwritten from Firestore
export let PERMISSIONS = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS))

// ─── Сотрудники по умолчанию ───────────────────────────────────────────────
const DEFAULT_EMPLOYEES = [
  // Владелец
  { id: 1,  login: 'owner',   password: 'owner123',  name: 'Тошполатов Азиз',     role: 'owner',   branch: 'all',       avatar: 'А', phone: '', tenantId: DEFAULT_TENANT_ID, isSuperAdmin: true },
  // Демо-аккаунт для презентации
  { id: 100, login: 'demo',   password: 'demo123',   name: 'DEMO Аккаунт',         role: 'owner',   branch: 'all',       avatar: 'D', phone: '', tenantId: DEFAULT_TENANT_ID },
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

  // Student test account
  { id: 50, login: 'student1', password: 'student123', name: 'Иванов Алексей',     role: 'student', branch: 'tashkent', avatar: 'И', phone: '+998 90 123-45-67' },
]

const employeesRef = collection(db, 'employees')
const permissionsDocRef = doc(db, 'settings', 'permissions')

// ─── Provider ──────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('interno_user')
    return saved ? JSON.parse(saved) : null
  })
  const [employees, setEmployees] = useState([])
  const [customPermissions, setCustomPermissions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Persist user session in localStorage
  useEffect(() => {
    if (user) localStorage.setItem('interno_user', JSON.stringify(user))
    else localStorage.removeItem('interno_user')
  }, [user])

  // Real-time sync for permissions from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(permissionsDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data()
        // Deep merge: Firestore overrides per-section, defaults fill new sections
        const merged = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS))
        Object.keys(data).forEach(role => {
          if (role === '_id') return
          if (merged[role]) {
            Object.keys(data[role]).forEach(section => {
              merged[role][section] = data[role][section]
            })
          }
        })
        PERMISSIONS = merged
        setCustomPermissions(merged)
      } else {
        // No custom permissions saved yet, use defaults
        PERMISSIONS = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS))
        setCustomPermissions(null)
      }
    })
    return () => unsubscribe()
  }, [])

  // Real-time sync with Firestore + seed if empty
  useEffect(() => {
    const unsubscribe = onSnapshot(employeesRef, async (snapshot) => {
      if (snapshot.empty) {
        const batch = writeBatch(db)
        DEFAULT_EMPLOYEES.forEach((emp) => {
          const docRef = doc(employeesRef, String(emp.id))
          batch.set(docRef, emp)
        })
        await batch.commit()
        return
      }

      const list = snapshot.docs
        .map((d) => ({ ...d.data(), _docId: d.id }))
        .filter((e) => !e.deleted)
      setEmployees(list)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const login = (loginStr, password) => {
    const found = employees.find(u => u.login === loginStr && u.password === password)
    if (found) {
      if (found.status === 'pending') {
        setError('Ваша заявка на регистрацию ещё не одобрена. Обратитесь к администратору.')
        return false
      }
      if (found.status === 'rejected') {
        setError('Ваша заявка на регистрацию была отклонена.')
        return false
      }
      const { password: _, ...safe } = found
      safe.tenantId = safe.tenantId || DEFAULT_TENANT_ID
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
    // Check individual custom permissions first (override role defaults)
    const custom = user.customPermissions
    if (custom && custom[section] !== undefined) {
      if (typeof custom[section] === 'boolean') return custom[section]
      if (action && typeof custom[section] === 'object') return custom[section][action]
      if (typeof custom[section] === 'object') return custom[section].view
    }
    // Fall back to role-based permissions
    const perms = PERMISSIONS[user.role]
    if (!perms) return false
    if (typeof perms[section] === 'boolean') return perms[section]
    if (action && typeof perms[section] === 'object') return perms[section][action]
    if (typeof perms[section] === 'object') return perms[section].view
    return false
  }

  const getRoleLabel = (role) => ROLE_LABELS[role || user?.role] || ''

  // ─── Employee CRUD (Firestore) ──────────────────────────────────────────
  const addEmployee = async (emp) => {
    const newId = Date.now()
    const newEmp = {
      ...emp,
      id: newId,
      tenantId: emp.tenantId || user?.tenantId || DEFAULT_TENANT_ID,
      avatar: emp.name?.charAt(0)?.toUpperCase() || '?',
      managerId: (emp.role === 'sales' || emp.role === 'rop') ? `mgr_${newId}` : undefined,
    }
    // Remove undefined fields (Firestore does not accept undefined)
    const cleanEmp = Object.fromEntries(
      Object.entries(newEmp).filter(([, v]) => v !== undefined)
    )
    await setDoc(doc(employeesRef, String(newId)), cleanEmp)
    return newEmp
  }

  const updateEmployee = async (id, updates) => {
    // Remove undefined fields
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    )
    const emp = employees.find(e => e.id === id)
    const docId = emp?._docId || String(id)
    await updateDoc(doc(employeesRef, docId), cleanUpdates)
    // Update current session if editing self
    if (user?.id === id) {
      const updatedUser = { ...user, ...cleanUpdates }
      delete updatedUser.password
      setUser(updatedUser)
    }
  }

  const deleteEmployee = async (id) => {
    const emp = employees.find(e => e.id === id)
    const docId = emp?._docId || String(id)
    // Soft delete — mark as deleted instead of removing document
    // This prevents old cached clients from re-creating the document
    await updateDoc(doc(employeesRef, docId), { deleted: true })
  }

  const resetEmployees = async () => {
    // Delete all existing employees
    const batch = writeBatch(db)
    employees.forEach((emp) => {
      batch.delete(doc(employeesRef, emp._docId || String(emp.id)))
    })
    await batch.commit()

    // Re-seed with defaults
    const seedBatch = writeBatch(db)
    DEFAULT_EMPLOYEES.forEach((emp) => {
      seedBatch.set(doc(employeesRef, String(emp.id)), emp)
    })
    await seedBatch.commit()
  }

  // Helper: get sales-related staff (for plan tracking)
  const getSalesStaff = (branchId) => {
    const list = employees.filter(e => e.role === 'sales' || e.role === 'rop')
    if (!branchId || branchId === 'all') return list
    return list.filter(e => e.branch === branchId)
  }

  // ─── Permissions management ──────────────────────────────────────────
  const getPermissions = () => {
    return customPermissions || JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS))
  }

  const updatePermissions = async (newPermissions) => {
    await setDoc(permissionsDocRef, newPermissions)
  }

  const resetPermissions = async () => {
    await deleteDoc(permissionsDocRef)
  }

  return (
    <AuthContext.Provider value={{
      user, login, logout, error, setError,
      hasPermission, getRoleLabel,
      employees, addEmployee, updateEmployee, deleteEmployee, resetEmployees,
      getSalesStaff, loading,
      getPermissions, updatePermissions, resetPermissions,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
