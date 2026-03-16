import { createContext, useContext, useState, useEffect } from 'react'
import {
  branches as defaultBranches,
  students as defaultStudents,
  teachers as defaultTeachers,
  payments as defaultPayments,
} from '../data/mockData'

// Цвета для филиалов (используются в графиках и бейджах)
const BRANCH_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']

const DataContext = createContext(null)

function loadFromStorage(key, defaultValue) {
  const saved = localStorage.getItem(`interno_${key}`)
  return saved ? JSON.parse(saved) : defaultValue
}

function saveToStorage(key, value) {
  localStorage.setItem(`interno_${key}`, JSON.stringify(value))
}

// Группы по умолчанию
const DEFAULT_GROUPS = [
  { id: 'grp_1', name: 'ENG-A1-01', branch: 'tashkent', course: 'Английский', teacherId: 1, maxOffline: 15, schedule: 'Пн/Ср/Пт 09:00-10:30', status: 'active' },
  { id: 'grp_2', name: 'ENG-B2-01', branch: 'samarkand', course: 'Английский', teacherId: 5, maxOffline: 12, schedule: 'Вт/Чт 14:00-15:30', status: 'active' },
  { id: 'grp_3', name: 'ENG-C1-02', branch: 'tashkent', course: 'Английский', teacherId: 1, maxOffline: 10, schedule: 'Пн/Ср/Пт 11:00-12:30', status: 'active' },
  { id: 'grp_4', name: 'ENG-B1-02', branch: 'samarkand', course: 'Английский', teacherId: 5, maxOffline: 12, schedule: 'Пн/Ср/Пт 10:00-11:30', status: 'active' },
  { id: 'grp_5', name: 'ENG-A2-01', branch: 'fergana', course: 'Английский', teacherId: 8, maxOffline: 14, schedule: 'Вт/Чт/Сб 09:00-10:30', status: 'active' },
  { id: 'grp_6', name: 'MATH-01', branch: 'tashkent', course: 'Математика', teacherId: 2, maxOffline: 20, schedule: 'Вт/Чт 09:00-10:30', status: 'active' },
  { id: 'grp_7', name: 'MATH-02', branch: 'samarkand', course: 'Математика', teacherId: 6, maxOffline: 18, schedule: 'Пн/Ср/Пт 14:00-15:30', status: 'active' },
  { id: 'grp_8', name: 'IT-B1-03', branch: 'tashkent', course: 'IT/Программирование', teacherId: 4, maxOffline: 12, schedule: 'Пн/Ср 16:00-18:00', status: 'active' },
  { id: 'grp_9', name: 'IT-A1-01', branch: 'samarkand', course: 'IT/Программирование', teacherId: 7, maxOffline: 10, schedule: 'Вт/Чт 16:00-18:00', status: 'active' },
  { id: 'grp_10', name: 'IELTS-01', branch: 'fergana', course: 'Подготовка к IELTS', teacherId: null, maxOffline: 8, schedule: 'Сб 10:00-13:00', status: 'active' },
  { id: 'grp_11', name: 'IELTS-02', branch: 'tashkent', course: 'Подготовка к IELTS', teacherId: 3, maxOffline: 10, schedule: 'Сб/Вс 10:00-13:00', status: 'active' },
  { id: 'grp_12', name: 'RUS-A2-01', branch: 'fergana', course: 'Русский язык', teacherId: 10, maxOffline: 16, schedule: 'Пн/Ср/Пт 15:00-16:30', status: 'active' },
]

export function DataProvider({ children }) {
  const [branches, setBranches] = useState(() => loadFromStorage('branches', defaultBranches))
  const [groups, setGroups] = useState(() => loadFromStorage('groups', DEFAULT_GROUPS))
  const [students, setStudents] = useState(() => loadFromStorage('students', defaultStudents))
  const [teachers, setTeachers] = useState(() => loadFromStorage('teachers', defaultTeachers))
  const [paymentsList, setPaymentsList] = useState(() => loadFromStorage('payments', defaultPayments))
  const [attendance, setAttendance] = useState(() => loadFromStorage('attendance', []))
  const [salesPlans, setSalesPlansState] = useState(() => loadFromStorage('salesPlans', {}))

  useEffect(() => { saveToStorage('branches', branches) }, [branches])
  useEffect(() => { saveToStorage('groups', groups) }, [groups])
  useEffect(() => { saveToStorage('students', students) }, [students])
  useEffect(() => { saveToStorage('teachers', teachers) }, [teachers])
  useEffect(() => { saveToStorage('payments', paymentsList) }, [paymentsList])
  useEffect(() => { saveToStorage('attendance', attendance) }, [attendance])
  useEffect(() => { saveToStorage('salesPlans', salesPlans) }, [salesPlans])

  // --- Branches CRUD ---
  const addBranch = (branch) => {
    const newBranch = {
      ...branch,
      id: branch.id || `branch_${Date.now()}`,
      status: branch.status || 'active',
      students: branch.students || 0,
      teachers: branch.teachers || 0,
      courses: branch.courses || 0,
      groups: branch.groups || 0,
      capacity: branch.capacity || 100,
      monthlyRevenue: branch.monthlyRevenue || 0,
      monthlyExpenses: branch.monthlyExpenses || 0,
      rating: branch.rating || 0,
      color: branch.color || BRANCH_COLORS[branches.length % BRANCH_COLORS.length],
    }
    setBranches(prev => [...prev, newBranch])
    return newBranch
  }

  const updateBranch = (id, updates) => {
    setBranches(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b))
  }

  const deleteBranch = (id) => {
    setBranches(prev => prev.filter(b => b.id !== id))
  }

  // Helper: get branch name by id
  const getBranchName = (id) => {
    if (id === 'all') return 'Все филиалы'
    const branch = branches.find(b => b.id === id)
    return branch ? branch.name : id
  }

  // Helper: get id→name map for dropdowns etc.
  const getBranchNames = () => {
    const map = {}
    branches.forEach(b => { map[b.id] = b.name })
    return map
  }

  // --- Students CRUD ---
  const addStudent = (student) => {
    const newStudent = {
      ...student,
      id: Date.now(),
      startDate: new Date().toISOString().split('T')[0],
    }
    setStudents(prev => [...prev, newStudent])
    return newStudent
  }

  const updateStudent = (id, updates) => {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
  }

  const deleteStudent = (id) => {
    setStudents(prev => prev.filter(s => s.id !== id))
  }

  // --- Teachers CRUD ---
  const addTeacher = (teacher) => {
    const newTeacher = {
      ...teacher,
      id: Date.now(),
    }
    setTeachers(prev => [...prev, newTeacher])
    return newTeacher
  }

  const updateTeacher = (id, updates) => {
    setTeachers(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
  }

  const deleteTeacher = (id) => {
    setTeachers(prev => prev.filter(t => t.id !== id))
  }

  // --- Payments CRUD ---
  const addPayment = (payment) => {
    const newPayment = {
      ...payment,
      id: Date.now(),
      date: payment.date || new Date().toISOString().split('T')[0],
    }
    setPaymentsList(prev => [newPayment, ...prev])

    // Update student balance and debt status if it's a student payment
    if (payment.type === 'income' && payment.studentId) {
      setStudents(prev => prev.map(s => {
        if (s.id !== payment.studentId) return s

        const newBalance = s.balance + payment.amount
        const totalCoursePrice = s.totalCoursePrice || 0

        // Calculate total paid including this new payment
        const previousPaid = paymentsList
          .filter(p => p.type === 'income' && p.studentId === payment.studentId)
          .reduce((sum, p) => sum + p.amount, 0)
        const totalPaidNow = previousPaid + payment.amount
        const remainingDebt = totalCoursePrice > 0 ? totalCoursePrice - totalPaidNow : 0

        // Determine status: if there's remaining debt, mark as debtor
        let newStatus = s.status
        if (totalCoursePrice > 0) {
          newStatus = remainingDebt > 0 ? 'debtor' : 'active'
        }

        return {
          ...s,
          balance: newBalance,
          status: newStatus,
          // Store last next payment date for tracking
          nextPaymentDate: payment.nextPaymentDate || s.nextPaymentDate,
        }
      }))
    }

    return newPayment
  }

  // --- Attendance ---
  const markAttendance = (record) => {
    // record: { date, groupName, studentId, status: 'present'|'absent'|'late', teacherId }
    setAttendance(prev => {
      const existing = prev.findIndex(
        a => a.date === record.date && a.studentId === record.studentId && a.groupName === record.groupName
      )
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = record
        return updated
      }
      return [...prev, record]
    })
  }

  const getAttendanceByGroup = (groupName, date) => {
    return attendance.filter(a => a.groupName === groupName && a.date === date)
  }

  const getAttendanceStats = (studentId) => {
    const records = attendance.filter(a => a.studentId === studentId)
    const total = records.length
    const present = records.filter(a => a.status === 'present').length
    const late = records.filter(a => a.status === 'late').length
    const absent = records.filter(a => a.status === 'absent').length
    return { total, present, late, absent, rate: total > 0 ? Math.round(((present + late) / total) * 100) : 0 }
  }

  // --- Stats ---
  const getStudentsByBranch = (branchId) => {
    return students.filter(s => s.branch === branchId)
  }

  const getTeachersByBranch = (branchId) => {
    return teachers.filter(t => t.branch === branchId)
  }

  const getPaymentsByBranch = (branchId) => {
    if (branchId === 'all') return paymentsList
    return paymentsList.filter(p => p.branch === branchId)
  }

  const getDebtors = (branchId) => {
    const list = branchId && branchId !== 'all'
      ? students.filter(s => s.branch === branchId)
      : students
    return list.filter(s => s.balance < 0)
  }

  const getTotalRevenue = (branchId) => {
    const list = branchId && branchId !== 'all'
      ? paymentsList.filter(p => p.branch === branchId && p.type === 'income')
      : paymentsList.filter(p => p.type === 'income')
    return list.reduce((sum, p) => sum + p.amount, 0)
  }

  const getTotalExpenses = (branchId) => {
    const list = branchId && branchId !== 'all'
      ? paymentsList.filter(p => p.branch === branchId && p.type === 'expense')
      : paymentsList.filter(p => p.type === 'expense')
    return list.reduce((sum, p) => sum + p.amount, 0)
  }

  // --- Sales Plans ---
  const setSalesPlan = (managerId, amount, month) => {
    const key = month || new Date().toISOString().slice(0, 7)
    setSalesPlansState(prev => ({
      ...prev,
      [managerId]: { ...(prev[managerId] || {}), [key]: Number(amount) },
    }))
  }

  const getSalesPlan = (managerId, month) => {
    const key = month || new Date().toISOString().slice(0, 7)
    return salesPlans[managerId]?.[key] || 0
  }

  // Returns { plan, achieved, percentage, status } for one manager
  const getManagerPerf = (managerId, month) => {
    const key = month || new Date().toISOString().slice(0, 7)
    const plan = getSalesPlan(managerId, key)
    const achieved = paymentsList
      .filter(p => p.type === 'income' && p.managerId === managerId && (p.date || '').startsWith(key))
      .reduce((s, p) => s + p.amount, 0)
    const pct = plan > 0 ? Math.min(Math.round((achieved / plan) * 100), 999) : 0
    const status = pct >= 100 ? 'done' : pct >= 75 ? 'good' : pct >= 40 ? 'risk' : 'low'
    return { plan, achieved, remaining: Math.max(0, plan - achieved), percentage: pct, status }
  }

  // Returns aggregate { plan, achieved, percentage, status } for a branch or 'all'
  const getBranchPerf = (branchId, month, managers) => {
    const list = branchId === 'all' ? managers : managers.filter(m => m.branch === branchId)
    const plan = list.reduce((s, m) => s + getSalesPlan(m.managerId, month), 0)
    const key = month || new Date().toISOString().slice(0, 7)
    const achieved = paymentsList
      .filter(p => {
        if (p.type !== 'income') return false
        if (branchId !== 'all' && p.branch !== branchId) return false
        return (p.date || '').startsWith(key)
      })
      .reduce((s, p) => s + p.amount, 0)
    const pct = plan > 0 ? Math.min(Math.round((achieved / plan) * 100), 999) : 0
    const status = pct >= 100 ? 'done' : pct >= 75 ? 'good' : pct >= 40 ? 'risk' : 'low'
    return { plan, achieved, remaining: Math.max(0, plan - achieved), percentage: pct, status }
  }

  // --- Groups CRUD ---
  const addGroup = (group) => {
    const newGroup = {
      ...group,
      id: `grp_${Date.now()}`,
      status: group.status || 'active',
    }
    setGroups(prev => [...prev, newGroup])
    return newGroup
  }

  const updateGroup = (id, updates) => {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g))
  }

  const deleteGroup = (id) => {
    setGroups(prev => prev.filter(g => g.id !== id))
  }

  // Count offline students in a group
  const getGroupOfflineCount = (groupName) => {
    return students.filter(s => s.group === groupName && s.learningFormat !== 'Онлайн').length
  }

  // Count online students in a group
  const getGroupOnlineCount = (groupName) => {
    return students.filter(s => s.group === groupName && s.learningFormat === 'Онлайн').length
  }

  // Get all students in a group
  const getGroupStudents = (groupName) => {
    return students.filter(s => s.group === groupName)
  }

  // Reset to defaults
  const resetData = () => {
    setBranches(defaultBranches)
    setGroups(DEFAULT_GROUPS)
    setStudents(defaultStudents)
    setTeachers(defaultTeachers)
    setPaymentsList(defaultPayments)
    setAttendance([])
    setSalesPlansState({})
  }

  return (
    <DataContext.Provider value={{
      branches, addBranch, updateBranch, deleteBranch, getBranchName, getBranchNames,
      groups, addGroup, updateGroup, deleteGroup, getGroupOfflineCount, getGroupOnlineCount, getGroupStudents,
      students, addStudent, updateStudent, deleteStudent,
      teachers, addTeacher, updateTeacher, deleteTeacher,
      payments: paymentsList, addPayment,
      attendance, markAttendance, getAttendanceByGroup, getAttendanceStats,
      getStudentsByBranch, getTeachersByBranch, getPaymentsByBranch,
      getDebtors, getTotalRevenue, getTotalExpenses,
      salesPlans, setSalesPlan, getSalesPlan, getManagerPerf, getBranchPerf,
      resetData,
    }}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => useContext(DataContext)
