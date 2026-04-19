import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { db } from '../firebase'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  setDoc,
  query,
  where,
} from 'firebase/firestore'
import { logAudit } from '../utils/auditLog'
import { DEFAULT_TENANT_ID } from '../utils/tenancy'

// Цвета для филиалов (используются в графиках и бейджах)
const BRANCH_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']

const DataContext = createContext(null)


export function DataProvider({ children, currentUser }) {
  const [branches, setBranches] = useState([])
  const [courses, setCourses] = useState([])
  const [groups, setGroups] = useState([])
  const [students, setStudents] = useState([])
  const [teachers, setTeachers] = useState([])
  const [paymentsList, setPaymentsList] = useState([])
  const [attendance, setAttendance] = useState([])
  const [salesPlans, setSalesPlansState] = useState({})
  const [loading, setLoading] = useState(true)

  // Rooms collection
  const [rooms, setRooms] = useState([])

  // LMS collections
  const [lmsLessons, setLmsLessons] = useState([])
  const [lmsAssignments, setLmsAssignments] = useState([])
  const [lmsSubmissions, setLmsSubmissions] = useState([])
  const [lmsAnnouncements, setLmsAnnouncements] = useState([])
  const [lmsModules, setLmsModules] = useState([])
  const [lmsProgress, setLmsProgress] = useState([])

  // Gamification streak data
  const [studentGameData, setStudentGameData] = useState([])

  // Schedule collection
  const [schedule, setSchedule] = useState([])

  // Audit log collection
  const [auditLogs, setAuditLogs] = useState([])

  // Track whether initial load has resolved for each collection
  const loadedRef = useRef({ branches: false, courses: false, groups: false, students: false, teachers: false, payments: false, attendance: false, salesPlans: false, rooms: false, lmsLessons: false, lmsAssignments: false, lmsSubmissions: false, lmsAnnouncements: false, lmsModules: false, lmsProgress: false, studentGameData: false, schedule: false, auditLogs: false })

  const checkAllLoaded = () => {
    const r = loadedRef.current
    if (r.branches && r.courses && r.groups && r.students && r.teachers && r.payments && r.attendance && r.salesPlans && r.rooms && r.lmsLessons && r.lmsAssignments && r.lmsSubmissions && r.lmsAnnouncements && r.lmsModules && r.lmsProgress && r.studentGameData && r.schedule && r.auditLogs) {
      setLoading(false)
    }
  }

  const tenantId = currentUser?.tenantId || DEFAULT_TENANT_ID

  useEffect(() => {
    const unsubscribers = []

    // Subscribe to a Firestore collection filtered by tenantId.
    // Falls back to unfiltered query if tenantId filter returns empty
    // (pre-migration data without tenantId field).
    function subscribeCollection(collectionName, setter, loadKey) {
      let fallbackActive = false
      const q = query(collection(db, collectionName), where('tenantId', '==', tenantId))
      const unsub = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id }))
        if (items.length === 0 && !fallbackActive) {
          // No results with tenantId filter — try unfiltered (pre-migration)
          fallbackActive = true
          const fallbackUnsub = onSnapshot(collection(db, collectionName), (fallbackSnap) => {
            const allItems = fallbackSnap.docs.map(d => ({ ...d.data(), id: d.id }))
            setter(allItems)
            if (!loadedRef.current[loadKey]) {
              loadedRef.current[loadKey] = true
              checkAllLoaded()
            }
          })
          unsubscribers.push(fallbackUnsub)
        } else if (!fallbackActive) {
          setter(items)
        }
        if (!loadedRef.current[loadKey]) {
          loadedRef.current[loadKey] = true
          checkAllLoaded()
        }
      }, (err) => {
        console.error(`Collection ${collectionName} error:`, err)
        if (!loadedRef.current[loadKey]) {
          loadedRef.current[loadKey] = true
          checkAllLoaded()
        }
      })
      unsubscribers.push(unsub)
    }

    // Subscribe to a single-doc meta collection (attendance, salesPlans)
    // Meta docs use tenantId as part of their doc key: `_meta_{tenantId}`
    function subscribeMetaDoc(collectionName, setter, loadKey) {
      const metaDocId = `_meta_${tenantId}`
      const unsub = onSnapshot(doc(db, collectionName, metaDocId), (snapshot) => {
        if (snapshot.exists()) {
          setter(snapshot.data().data)
        } else {
          // Fallback: try legacy _meta doc for backward compatibility
          const legacyUnsub = onSnapshot(doc(db, collectionName, '_meta'), (legacySnap) => {
            if (legacySnap.exists()) {
              setter(legacySnap.data().data)
            }
          })
          unsubscribers.push(legacyUnsub)
        }
        if (!loadedRef.current[loadKey]) {
          loadedRef.current[loadKey] = true
          checkAllLoaded()
        }
      })
      unsubscribers.push(unsub)
    }

    subscribeCollection('branches', setBranches, 'branches')
    subscribeCollection('courses', setCourses, 'courses')
    subscribeCollection('groups', setGroups, 'groups')
    subscribeCollection('students', setStudents, 'students')
    subscribeCollection('teachers', setTeachers, 'teachers')
    subscribeCollection('payments', setPaymentsList, 'payments')
    subscribeMetaDoc('attendance', setAttendance, 'attendance')
    subscribeMetaDoc('salesPlans', setSalesPlansState, 'salesPlans')

    // Additional collections
    subscribeCollection('rooms', setRooms, 'rooms')
    subscribeCollection('lmsLessons', setLmsLessons, 'lmsLessons')
    subscribeCollection('lmsAssignments', setLmsAssignments, 'lmsAssignments')
    subscribeCollection('lmsSubmissions', setLmsSubmissions, 'lmsSubmissions')
    subscribeCollection('lmsAnnouncements', setLmsAnnouncements, 'lmsAnnouncements')
    subscribeCollection('lmsModules', setLmsModules, 'lmsModules')
    subscribeCollection('lmsProgress', setLmsProgress, 'lmsProgress')
    subscribeCollection('studentGameData', setStudentGameData, 'studentGameData')
    subscribeCollection('schedule', setSchedule, 'schedule')
    subscribeCollection('auditLog', setAuditLogs, 'auditLogs')

    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }, [tenantId])

  // Helper: get user info for audit
  const auditUser = () => currentUser ? { id: currentUser.id || currentUser._docId, name: currentUser.name, role: currentUser.role } : {}

  // Helper: inject tenantId into data objects before writing
  const withTenant = (data) => ({ ...data, tenantId })

  // --- Branches CRUD ---
  const addBranch = async (branch) => {
    const newBranch = {
      ...branch,
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
    const docRef = await addDoc(collection(db, 'branches'), withTenant(newBranch))
    logAudit({ action: 'create', collection: 'branches', documentId: docRef.id, user: auditUser(), after: newBranch, description: `Создан филиал "${newBranch.name}"` })
    return { ...newBranch, id: docRef.id }
  }

  const updateBranch = async (id, updates) => {
    const before = branches.find(b => b.id === id)
    await updateDoc(doc(db, 'branches', id), updates)
    logAudit({ action: 'update', collection: 'branches', documentId: id, user: auditUser(), before, after: { ...before, ...updates }, description: `Обновлён филиал "${before?.name || id}"` })
  }

  const deleteBranch = async (id) => {
    const before = branches.find(b => b.id === id)
    await deleteDoc(doc(db, 'branches', id))
    logAudit({ action: 'delete', collection: 'branches', documentId: id, user: auditUser(), before, description: `Удалён филиал "${before?.name || id}"` })
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

  // --- Rooms CRUD ---
  const addRoom = async (room) => {
    const docRef = await addDoc(collection(db, 'rooms'), withTenant(room))
    return { ...room, id: docRef.id }
  }

  const updateRoom = async (id, updates) => {
    await updateDoc(doc(db, 'rooms', id), updates)
  }

  const deleteRoom = async (id) => {
    await deleteDoc(doc(db, 'rooms', id))
  }

  // --- Courses CRUD ---
  const addCourse = async (course) => {
    const docRef = await addDoc(collection(db, 'courses'), withTenant(course))
    logAudit({ action: 'create', collection: 'courses', documentId: docRef.id, user: auditUser(), after: course, description: `Создан курс "${course.name}"` })
    return { ...course, id: docRef.id }
  }

  const updateCourse = async (id, updates) => {
    const before = courses.find(c => c.id === id)
    await updateDoc(doc(db, 'courses', id), updates)
    logAudit({ action: 'update', collection: 'courses', documentId: id, user: auditUser(), before, after: { ...before, ...updates }, description: `Обновлён курс "${before?.name || id}"` })
  }

  const deleteCourse = async (id) => {
    const before = courses.find(c => c.id === id)
    await deleteDoc(doc(db, 'courses', id))
    logAudit({ action: 'delete', collection: 'courses', documentId: id, user: auditUser(), before, description: `Удалён курс "${before?.name || id}"` })
  }

  // --- Students CRUD ---
  const addStudent = async (student) => {
    const newStudent = {
      ...student,
      startDate: new Date().toISOString().split('T')[0],
    }
    const docRef = await addDoc(collection(db, 'students'), withTenant(newStudent))
    logAudit({ action: 'create', collection: 'students', documentId: docRef.id, user: auditUser(), after: newStudent, description: `Добавлен студент "${newStudent.name}"` })
    return { ...newStudent, id: docRef.id }
  }

  const updateStudent = async (id, updates) => {
    const before = students.find(s => s.id === id)
    await updateDoc(doc(db, 'students', id), updates)
    logAudit({ action: 'update', collection: 'students', documentId: id, user: auditUser(), before, after: { ...before, ...updates }, description: `Обновлён студент "${before?.name || id}"` })
  }

  const deleteStudent = async (id) => {
    const before = students.find(s => s.id === id)
    await deleteDoc(doc(db, 'students', id))
    logAudit({ action: 'delete', collection: 'students', documentId: id, user: auditUser(), before, description: `Удалён студент "${before?.name || id}"` })
  }

  // --- Teachers CRUD ---
  const addTeacher = async (teacher) => {
    const newTeacher = { ...teacher }
    const docRef = await addDoc(collection(db, 'teachers'), withTenant(newTeacher))
    logAudit({ action: 'create', collection: 'teachers', documentId: docRef.id, user: auditUser(), after: newTeacher, description: `Добавлен преподаватель "${newTeacher.name}"` })
    return { ...newTeacher, id: docRef.id }
  }

  const updateTeacher = async (id, updates) => {
    const before = teachers.find(t => t.id === id)
    await updateDoc(doc(db, 'teachers', id), updates)
    logAudit({ action: 'update', collection: 'teachers', documentId: id, user: auditUser(), before, after: { ...before, ...updates }, description: `Обновлён преподаватель "${before?.name || id}"` })
  }

  const deleteTeacher = async (id) => {
    const before = teachers.find(t => t.id === id)
    await deleteDoc(doc(db, 'teachers', id))
    logAudit({ action: 'delete', collection: 'teachers', documentId: id, user: auditUser(), before, description: `Удалён преподаватель "${before?.name || id}"` })
  }

  // --- Payments CRUD ---
  const addPayment = async (payment) => {
    const newPayment = {
      ...payment,
      date: payment.date || new Date().toISOString().split('T')[0],
    }
    const docRef = await addDoc(collection(db, 'payments'), withTenant(newPayment))
    logAudit({ action: 'create', collection: 'payments', documentId: docRef.id, user: auditUser(), after: newPayment, description: `${newPayment.type === 'income' ? 'Оплата' : 'Расход'} ${newPayment.amount} сум — ${newPayment.student || ''}` })

    // Update student balance and debt status if it's a student payment
    if (payment.type === 'income' && payment.studentId) {
      let student = students.find(s => String(s.id) === String(payment.studentId))
      // If student not yet in local state (just created), read from Firestore directly
      if (!student) {
        try {
          const snap = await getDocs(collection(db, 'students'))
          const freshStudent = snap.docs.find(d => d.id === String(payment.studentId))
          if (freshStudent) {
            student = { id: freshStudent.id, ...freshStudent.data() }
          }
        } catch (e) {
          console.error('Failed to fetch student from Firestore:', e)
        }
      }
      if (student) {
        const newBalance = student.balance + payment.amount
        const totalCoursePrice = student.totalCoursePrice || 0

        // Calculate total paid including this new payment
        const previousPaid = paymentsList
          .filter(p => p.type === 'income' && String(p.studentId) === String(payment.studentId))
          .reduce((sum, p) => sum + p.amount, 0)
        const totalPaidNow = previousPaid + payment.amount
        const remainingDebt = totalCoursePrice > 0 ? totalCoursePrice - totalPaidNow : 0

        // Determine status: if there's remaining debt, mark as debtor
        let newStatus = student.status
        if (totalCoursePrice > 0) {
          newStatus = remainingDebt > 0 ? 'debtor' : 'active'
        }

        // Grant LMS access on first payment
        const isFirstPayment = previousPaid === 0 && payment.amount > 0
        const lmsUpdate = {}
        if (isFirstPayment) {
          lmsUpdate.lmsAccess = true
          lmsUpdate.lmsAccessGrantedAt = new Date().toISOString()
        }
        // If status becomes active after payment (was debtor), restore LMS access
        if (newStatus === 'active' && student.status === 'debtor') {
          lmsUpdate.lmsAccess = true
        }

        // Extend LMS access for 6 months from payment date on every payment
        const payDate = new Date(payment.date || new Date())
        payDate.setMonth(payDate.getMonth() + 6)
        lmsUpdate.lmsExpiresAt = payDate.toISOString()

        // Also update totalCoursePrice if provided and student doesn't have one
        const priceUpdate = {}
        if (payment.totalCoursePrice && !student.totalCoursePrice) {
          priceUpdate.totalCoursePrice = payment.totalCoursePrice
        }

        await updateDoc(doc(db, 'students', payment.studentId), {
          balance: newBalance,
          status: newStatus,
          nextPaymentDate: payment.nextPaymentDate || student.nextPaymentDate || null,
          ...lmsUpdate,
          ...priceUpdate,
        })

        // Auto-create student LMS account if not exists yet
        const studentPhone = student.phone || payment.phone
        if (studentPhone && !student.lmsLogin) {
          try {
            const employeesRef = collection(db, 'employees')
            const empSnap = await getDocs(employeesRef)
            const allEmps = empSnap.docs.map(d => d.data())
            // Check if account already exists (by phone)
            const existing = allEmps.find(e => e.phone === studentPhone && e.role === 'student')
            if (!existing) {
              // Generate 6-digit password
              const password = String(100000 + Math.floor(Math.random() * 900000))
              // Login = phone (cleaned: digits only)
              const login = studentPhone.replace(/[^0-9]/g, '')
              const newId = Date.now()
              const studentAccount = {
                id: newId,
                login,
                password,
                name: student.name,
                role: 'student',
                branch: student.branch || 'tashkent',
                avatar: student.name?.charAt(0)?.toUpperCase() || '?',
                phone: studentPhone,
                studentId: student.id,
                tenantId,
              }
              await setDoc(doc(employeesRef, String(newId)), studentAccount)
              // Save credentials on student record for receipt display
              await updateDoc(doc(db, 'students', String(payment.studentId)), {
                lmsLogin: login,
                lmsPassword: password,
                lmsAccess: true,
                lmsAccessGrantedAt: new Date().toISOString(),
              })
              return { ...newPayment, id: docRef.id, lmsCredentials: { login, password } }
            } else {
              // Account exists — return existing credentials
              return { ...newPayment, id: docRef.id, lmsCredentials: { login: existing.login, password: existing.password } }
            }
          } catch (err) {
            console.error('Failed to create student LMS account:', err)
          }
        }
        // If student already has lmsLogin, return it
        if (student.lmsLogin) {
          return { ...newPayment, id: docRef.id, lmsCredentials: { login: student.lmsLogin, password: student.lmsPassword } }
        }
      }
    }

    return { ...newPayment, id: docRef.id }
  }

  const updatePayment = async (id, updates) => {
    const before = paymentsList.find(p => p.id === id)
    await updateDoc(doc(db, 'payments', id), updates)
    logAudit({ action: 'update', collection: 'payments', documentId: id, user: auditUser(), before, after: { ...before, ...updates }, description: `Обновлён платёж #${id}` })
  }

  const deletePayment = async (id) => {
    const before = paymentsList.find(p => p.id === id)
    await deleteDoc(doc(db, 'payments', id))
    logAudit({ action: 'delete', collection: 'payments', documentId: id, user: auditUser(), before, description: `Удалён платёж на ${before?.amount || 0} сум` })
  }

  // --- Attendance ---
  const markAttendance = async (record) => {
    // record: { date, groupName, studentId, status: 'present'|'absent'|'late', teacherId }
    const updated = [...attendance]
    const existing = updated.findIndex(
      a => a.date === record.date && a.studentId === record.studentId && a.groupName === record.groupName
    )
    if (existing >= 0) {
      updated[existing] = record
    } else {
      updated.push(record)
    }
    await setDoc(doc(db, 'attendance', `_meta_${tenantId}`), { data: updated, tenantId })
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

  // --- LMS CRUD ---
  const addLmsLesson = async (lesson) => {
    const docRef = await addDoc(collection(db, 'lmsLessons'), withTenant(lesson))
    return { ...lesson, id: docRef.id }
  }
  const updateLmsLesson = async (id, updates) => {
    await updateDoc(doc(db, 'lmsLessons', id), updates)
  }
  const deleteLmsLesson = async (id) => {
    await deleteDoc(doc(db, 'lmsLessons', id))
  }

  const addLmsAssignment = async (assignment) => {
    const docRef = await addDoc(collection(db, 'lmsAssignments'), withTenant(assignment))
    return { ...assignment, id: docRef.id }
  }
  const updateLmsAssignment = async (id, updates) => {
    await updateDoc(doc(db, 'lmsAssignments', id), updates)
  }
  const deleteLmsAssignment = async (id) => {
    await deleteDoc(doc(db, 'lmsAssignments', id))
  }

  const addLmsSubmission = async (submission) => {
    const docRef = await addDoc(collection(db, 'lmsSubmissions'), withTenant(submission))
    return { ...submission, id: docRef.id }
  }
  const updateLmsSubmission = async (id, updates) => {
    await updateDoc(doc(db, 'lmsSubmissions', id), updates)
  }

  const addLmsAnnouncement = async (announcement) => {
    const docRef = await addDoc(collection(db, 'lmsAnnouncements'), withTenant(announcement))
    return { ...announcement, id: docRef.id }
  }
  const deleteLmsAnnouncement = async (id) => {
    await deleteDoc(doc(db, 'lmsAnnouncements', id))
  }

  // --- LMS Modules CRUD ---
  const addLmsModule = async (mod) => {
    const docRef = await addDoc(collection(db, 'lmsModules'), withTenant(mod))
    return { ...mod, id: docRef.id }
  }
  const updateLmsModule = async (id, updates) => {
    await updateDoc(doc(db, 'lmsModules', id), updates)
  }
  const deleteLmsModule = async (id) => {
    await deleteDoc(doc(db, 'lmsModules', id))
  }

  // --- LMS Progress CRUD ---
  const addLmsProgress = async (progress) => {
    const docRef = await addDoc(collection(db, 'lmsProgress'), withTenant(progress))
    return { ...progress, id: docRef.id }
  }
  const deleteLmsProgress = async (id) => {
    await deleteDoc(doc(db, 'lmsProgress', id))
  }

  // --- Student Game Data (Gamification streaks) ---
  const updateStudentGameData = async (studentId, updates) => {
    await setDoc(doc(db, 'studentGameData', studentId), { ...updates, tenantId }, { merge: true })
  }

  // --- Sales Plans ---
  const setSalesPlan = async (managerId, amount, month) => {
    const key = month || new Date().toISOString().slice(0, 7)
    const updated = {
      ...salesPlans,
      [managerId]: { ...(salesPlans[managerId] || {}), [key]: Number(amount) },
    }
    await setDoc(doc(db, 'salesPlans', `_meta_${tenantId}`), { data: updated, tenantId })
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
  const addGroup = async (group) => {
    const newGroup = {
      ...group,
      status: group.status || 'active',
    }
    const docRef = await addDoc(collection(db, 'groups'), withTenant(newGroup))
    logAudit({ action: 'create', collection: 'groups', documentId: docRef.id, user: auditUser(), after: newGroup, description: `Создана группа "${newGroup.name}"` })
    return { ...newGroup, id: docRef.id }
  }

  const updateGroup = async (id, updates) => {
    const before = groups.find(g => g.id === id)
    await updateDoc(doc(db, 'groups', id), updates)
    logAudit({ action: 'update', collection: 'groups', documentId: id, user: auditUser(), before, after: { ...before, ...updates }, description: `Обновлена группа "${before?.name || id}"` })
  }

  const deleteGroup = async (id) => {
    const before = groups.find(g => g.id === id)
    await deleteDoc(doc(db, 'groups', id))
    logAudit({ action: 'delete', collection: 'groups', documentId: id, user: auditUser(), before, description: `Удалена группа "${before?.name || id}"` })
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

  // --- Schedule CRUD ---
  const addScheduleEntry = async (entry) => {
    const docRef = await addDoc(collection(db, 'schedule'), withTenant(entry))
    logAudit({ action: 'create', collection: 'schedule', documentId: docRef.id, user: auditUser(), after: entry, description: `Добавлено расписание: ${entry.groupName || ''} — ${entry.dayOfWeek} ${entry.startTime}` })
    return { ...entry, id: docRef.id }
  }

  const updateScheduleEntry = async (id, updates) => {
    const before = schedule.find(s => s.id === id)
    await updateDoc(doc(db, 'schedule', id), updates)
    logAudit({ action: 'update', collection: 'schedule', documentId: id, user: auditUser(), before, after: { ...before, ...updates }, description: `Обновлено расписание #${id}` })
  }

  const deleteScheduleEntry = async (id) => {
    const before = schedule.find(s => s.id === id)
    await deleteDoc(doc(db, 'schedule', id))
    logAudit({ action: 'delete', collection: 'schedule', documentId: id, user: auditUser(), before, description: `Удалено расписание: ${before?.groupName || ''} — ${before?.dayOfWeek} ${before?.startTime}` })
  }

  return (
    <DataContext.Provider value={{
      branches, addBranch, updateBranch, deleteBranch, getBranchName, getBranchNames,
      rooms, addRoom, updateRoom, deleteRoom,
      courses, addCourse, updateCourse, deleteCourse,
      groups, addGroup, updateGroup, deleteGroup, getGroupOfflineCount, getGroupOnlineCount, getGroupStudents,
      students, addStudent, updateStudent, deleteStudent,
      teachers, addTeacher, updateTeacher, deleteTeacher,
      payments: paymentsList, addPayment, updatePayment, deletePayment,
      attendance, markAttendance, getAttendanceByGroup, getAttendanceStats,
      getStudentsByBranch, getTeachersByBranch, getPaymentsByBranch,
      getDebtors, getTotalRevenue, getTotalExpenses,
      salesPlans, setSalesPlan, getSalesPlan, getManagerPerf, getBranchPerf,
      // LMS
      lmsLessons, addLmsLesson, updateLmsLesson, deleteLmsLesson,
      lmsAssignments, addLmsAssignment, updateLmsAssignment, deleteLmsAssignment,
      lmsSubmissions, addLmsSubmission, updateLmsSubmission,
      lmsAnnouncements, addLmsAnnouncement, deleteLmsAnnouncement,
      lmsModules, addLmsModule, updateLmsModule, deleteLmsModule,
      lmsProgress, addLmsProgress, deleteLmsProgress,
      studentGameData, updateStudentGameData,
      schedule, addScheduleEntry, updateScheduleEntry, deleteScheduleEntry,
      auditLogs,
      tenantId,
      loading,
    }}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => useContext(DataContext)
