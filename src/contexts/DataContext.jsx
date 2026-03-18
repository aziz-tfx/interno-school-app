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
  writeBatch,
} from 'firebase/firestore'
import {
  branches as defaultBranches,
  students as defaultStudents,
  teachers as defaultTeachers,
  payments as defaultPayments,
} from '../data/mockData'

// Цвета для филиалов (используются в графиках и бейджах)
const BRANCH_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']

const DataContext = createContext(null)

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

// Helper: seed a collection with default data array
async function seedCollection(collectionName, defaultData) {
  const batch = writeBatch(db)
  for (const item of defaultData) {
    const docRef = doc(collection(db, collectionName))
    // Filter out undefined values — Firestore rejects them
    const cleanItem = Object.fromEntries(
      Object.entries(item).filter(([, v]) => v !== undefined)
    )
    if (item.id) cleanItem._originalId = item.id
    batch.set(docRef, cleanItem)
  }
  await batch.commit()
}

// Helper: seed a single-doc collection (for objects like salesPlans or arrays like attendance)
async function seedDocCollection(collectionName, data) {
  await setDoc(doc(db, collectionName, '_meta'), { data })
}

// Helper: delete all docs in a collection
async function clearCollection(collectionName) {
  const snapshot = await getDocs(collection(db, collectionName))
  const batch = writeBatch(db)
  snapshot.docs.forEach(d => batch.delete(d.ref))
  await batch.commit()
}

// Migrate courses: update existing Firestore docs with new fields from DEFAULT_COURSES
async function migrateCourses() {
  try {
    const snapshot = await getDocs(collection(db, 'courses'))
    if (snapshot.empty) return

    const batch = writeBatch(db)
    let hasChanges = false

    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data()
      const defaultCourse = DEFAULT_COURSES.find(c => c.name === data.name)
      if (!defaultCourse) return

      const updates = {}
      // Add missing fields from default
      if (!data.description && defaultCourse.description) updates.description = defaultCourse.description
      if ((!data.features || data.features.length === 0) && defaultCourse.features) updates.features = defaultCourse.features
      if (!data.tariffFeatures && defaultCourse.tariffFeatures) updates.tariffFeatures = defaultCourse.tariffFeatures

      if (Object.keys(updates).length > 0) {
        batch.update(docSnap.ref, updates)
        hasChanges = true
      }
    })

    if (hasChanges) {
      await batch.commit()
      console.log('Courses migrated with descriptions and features')
    }
  } catch (err) {
    console.error('Course migration error:', err)
  }
}

// Default courses with pricing data
const DEFAULT_COURSES = [
  {
    name: 'Интерьер Дизайн', icon: '🎨', duration: '6 мес',
    description: 'Профессиональный курс по дизайну интерьеров. Изучение планировки, 3D-визуализации, подбора материалов, работы с клиентами и создания дизайн-проектов.',
    features: ['Планировка и зонирование', '3D-визуализация (3ds Max, SketchUp)', 'Подбор материалов и мебели', 'Работа с заказчиком', 'Портфолио по итогам курса'],
    tariffFeatures: {
      standard: ['Групповые занятия', 'Базовая программа', 'Доступ к материалам'],
      vip: ['Мини-группа до 8 чел.', 'Расширенная программа', 'Персональный ментор', 'Реальный проект'],
      premium: ['Индивид. внимание в группе', 'Полная программа', 'Персональный ментор', 'Стажировка в студии', 'Помощь с трудоустройством'],
      individual: ['Персональное обучение 1 на 1', 'Гибкий график', 'Индивидуальная программа'],
    },
    pricing: {
      tashkent: {
        standard: { full: 8000000, d10: 7200000, d15: 6800000, d20: 6400000 },
        vip: { full: 12000000, d10: 10800000, d15: 10200000, d20: 9600000 },
        premium: { full: 18000000, d10: 16200000, d15: 15300000, d20: 14400000 },
        individual: { full: 6000000, d10: 5400000, monthly: true },
      },
      fergana: {
        standard: { full: 4000000, d10: 3600000, d15: 3400000, d20: 3200000 },
        vip: { full: 6600000, d10: 5940000, d15: 5610000, d20: 5280000 },
        premium: { full: 10500000, d10: 9450000, d15: 8925000, d20: 8400000 },
        individual: { full: 4000000, d10: 3600000, monthly: true },
      },
      online: {
        standard: { full: 4000000, d10: 3600000, d15: 3400000, d20: 3200000 },
        vip: { full: 6000000, d10: 5400000, d15: 5100000, d20: 4800000 },
      },
    },
  },
  {
    name: 'Английский', icon: '🇬🇧', duration: '6 мес',
    pricing: {
      tashkent: {
        standard: { full: 8000000, d10: 7200000, d15: 6800000, d20: 6400000 },
        vip: { full: 12000000, d10: 10800000, d15: 10200000, d20: 9600000 },
        premium: { full: 18000000, d10: 16200000, d15: 15300000, d20: 14400000 },
        individual: { full: 6000000, d10: 5400000, monthly: true },
      },
      fergana: {
        standard: { full: 4000000, d10: 3600000, d15: 3400000, d20: 3200000 },
        vip: { full: 6600000, d10: 5940000, d15: 5610000, d20: 5280000 },
        premium: { full: 10500000, d10: 9450000, d15: 8925000, d20: 8400000 },
        individual: { full: 4000000, d10: 3600000, monthly: true },
      },
      online: {
        standard: { full: 4000000, d10: 3600000, d15: 3400000, d20: 3200000 },
        vip: { full: 6000000, d10: 5400000, d15: 5100000, d20: 4800000 },
      },
    },
  },
  {
    name: 'Подготовка к IELTS', icon: '📝', duration: '4 мес',
    pricing: {
      tashkent: {
        standard: { full: 8000000, d10: 7200000, d15: 6800000, d20: 6400000 },
        vip: { full: 12000000, d10: 10800000, d15: 10200000, d20: 9600000 },
        premium: { full: 18000000, d10: 16200000, d15: 15300000, d20: 14400000 },
        individual: { full: 6000000, d10: 5400000, monthly: true },
      },
      fergana: {
        standard: { full: 4000000, d10: 3600000, d15: 3400000, d20: 3200000 },
        vip: { full: 6600000, d10: 5940000, d15: 5610000, d20: 5280000 },
        premium: { full: 10500000, d10: 9450000, d15: 8925000, d20: 8400000 },
        individual: { full: 4000000, d10: 3600000, monthly: true },
      },
      online: {
        standard: { full: 4000000, d10: 3600000, d15: 3400000, d20: 3200000 },
        vip: { full: 6000000, d10: 5400000, d15: 5100000, d20: 4800000 },
      },
    },
  },
  {
    name: 'Математика', icon: '📐', duration: '9 мес',
    pricing: {
      tashkent: {
        standard: { full: 8000000, d10: 7200000, d15: 6800000, d20: 6400000 },
        vip: { full: 12000000, d10: 10800000, d15: 10200000, d20: 9600000 },
        premium: { full: 18000000, d10: 16200000, d15: 15300000, d20: 14400000 },
        individual: { full: 6000000, d10: 5400000, monthly: true },
      },
      fergana: {
        standard: { full: 4000000, d10: 3600000, d15: 3400000, d20: 3200000 },
        vip: { full: 6600000, d10: 5940000, d15: 5610000, d20: 5280000 },
        premium: { full: 10500000, d10: 9450000, d15: 8925000, d20: 8400000 },
        individual: { full: 4000000, d10: 3600000, monthly: true },
      },
      online: {
        standard: { full: 4000000, d10: 3600000, d15: 3400000, d20: 3200000 },
        vip: { full: 6000000, d10: 5400000, d15: 5100000, d20: 4800000 },
      },
    },
  },
  {
    name: 'IT/Программирование', icon: '💻', duration: '8 мес',
    pricing: {
      tashkent: {
        standard: { full: 8000000, d10: 7200000, d15: 6800000, d20: 6400000 },
        vip: { full: 12000000, d10: 10800000, d15: 10200000, d20: 9600000 },
        premium: { full: 18000000, d10: 16200000, d15: 15300000, d20: 14400000 },
        individual: { full: 6000000, d10: 5400000, monthly: true },
      },
      fergana: {
        standard: { full: 4000000, d10: 3600000, d15: 3400000, d20: 3200000 },
        vip: { full: 6600000, d10: 5940000, d15: 5610000, d20: 5280000 },
        premium: { full: 10500000, d10: 9450000, d15: 8925000, d20: 8400000 },
        individual: { full: 4000000, d10: 3600000, monthly: true },
      },
      online: {
        standard: { full: 4000000, d10: 3600000, d15: 3400000, d20: 3200000 },
        vip: { full: 6000000, d10: 5400000, d15: 5100000, d20: 4800000 },
      },
    },
  },
  {
    name: 'Русский язык', icon: '🇷🇺', duration: '6 мес',
    pricing: {
      tashkent: {
        standard: { full: 8000000, d10: 7200000, d15: 6800000, d20: 6400000 },
        vip: { full: 12000000, d10: 10800000, d15: 10200000, d20: 9600000 },
        premium: { full: 18000000, d10: 16200000, d15: 15300000, d20: 14400000 },
        individual: { full: 6000000, d10: 5400000, monthly: true },
      },
      fergana: {
        standard: { full: 4000000, d10: 3600000, d15: 3400000, d20: 3200000 },
        vip: { full: 6600000, d10: 5940000, d15: 5610000, d20: 5280000 },
        premium: { full: 10500000, d10: 9450000, d15: 8925000, d20: 8400000 },
        individual: { full: 4000000, d10: 3600000, monthly: true },
      },
      online: {
        standard: { full: 4000000, d10: 3600000, d15: 3400000, d20: 3200000 },
        vip: { full: 6000000, d10: 5400000, d15: 5100000, d20: 4800000 },
      },
    },
  },
  {
    name: 'Корейский язык', icon: '🇰🇷', duration: '6 мес',
    pricing: {
      tashkent: {
        standard: { full: 8000000, d10: 7200000, d15: 6800000, d20: 6400000 },
        vip: { full: 12000000, d10: 10800000, d15: 10200000, d20: 9600000 },
        premium: { full: 18000000, d10: 16200000, d15: 15300000, d20: 14400000 },
        individual: { full: 6000000, d10: 5400000, monthly: true },
      },
      fergana: {
        standard: { full: 4000000, d10: 3600000, d15: 3400000, d20: 3200000 },
        vip: { full: 6600000, d10: 5940000, d15: 5610000, d20: 5280000 },
        premium: { full: 10500000, d10: 9450000, d15: 8925000, d20: 8400000 },
        individual: { full: 4000000, d10: 3600000, monthly: true },
      },
      online: {
        standard: { full: 4000000, d10: 3600000, d15: 3400000, d20: 3200000 },
        vip: { full: 6000000, d10: 5400000, d15: 5100000, d20: 4800000 },
      },
    },
  },
  {
    name: 'Подготовка к SAT', icon: '🎓', duration: '5 мес',
    pricing: {
      tashkent: {
        standard: { full: 8000000, d10: 7200000, d15: 6800000, d20: 6400000 },
        vip: { full: 12000000, d10: 10800000, d15: 10200000, d20: 9600000 },
        premium: { full: 18000000, d10: 16200000, d15: 15300000, d20: 14400000 },
        individual: { full: 6000000, d10: 5400000, monthly: true },
      },
      fergana: {
        standard: { full: 4000000, d10: 3600000, d15: 3400000, d20: 3200000 },
        vip: { full: 6600000, d10: 5940000, d15: 5610000, d20: 5280000 },
        premium: { full: 10500000, d10: 9450000, d15: 8925000, d20: 8400000 },
        individual: { full: 4000000, d10: 3600000, monthly: true },
      },
      online: {
        standard: { full: 4000000, d10: 3600000, d15: 3400000, d20: 3200000 },
        vip: { full: 6000000, d10: 5400000, d15: 5100000, d20: 4800000 },
      },
    },
  },
  {
    name: 'Робототехника', icon: '🤖', duration: '9 мес',
    pricing: {
      tashkent: {
        standard: { full: 8000000, d10: 7200000, d15: 6800000, d20: 6400000 },
        vip: { full: 12000000, d10: 10800000, d15: 10200000, d20: 9600000 },
        premium: { full: 18000000, d10: 16200000, d15: 15300000, d20: 14400000 },
        individual: { full: 6000000, d10: 5400000, monthly: true },
      },
      fergana: {
        standard: { full: 4000000, d10: 3600000, d15: 3400000, d20: 3200000 },
        vip: { full: 6600000, d10: 5940000, d15: 5610000, d20: 5280000 },
        premium: { full: 10500000, d10: 9450000, d15: 8925000, d20: 8400000 },
        individual: { full: 4000000, d10: 3600000, monthly: true },
      },
      online: {
        standard: { full: 4000000, d10: 3600000, d15: 3400000, d20: 3200000 },
        vip: { full: 6000000, d10: 5400000, d15: 5100000, d20: 4800000 },
      },
    },
  },
  {
    name: 'Дата Аналитика', icon: '📊', duration: '6 мес',
    description: 'Курс по анализу данных: от основ статистики и Excel до Python, SQL, Power BI и Machine Learning. Подготовка к карьере Data Analyst.',
    features: ['Excel и Google Sheets (продвинутый)', 'SQL и базы данных', 'Python для анализа данных', 'Визуализация (Power BI / Tableau)', 'Основы Machine Learning'],
    tariffFeatures: {
      standard: ['Групповые занятия', 'Базовая программа', 'Доступ к материалам'],
      vip: ['Мини-группа до 8 чел.', 'Расширенная программа', 'Персональный ментор', 'Реальные датасеты', 'Помощь с резюме'],
    },
    pricing: {
      tashkent: {
        standard: { full: 6000000, d10: 5400000, d15: 5100000, d20: 4800000 },
        vip: { full: 9200000, d10: 8280000, d15: 7820000, d20: 7360000 },
      },
      online: {
        standard: { full: 1000000, monthly: true },
        vip: { full: 1500000, monthly: true },
      },
    },
  },
]

export function DataProvider({ children }) {
  const [branches, setBranches] = useState([])
  const [courses, setCourses] = useState([])
  const [groups, setGroups] = useState([])
  const [students, setStudents] = useState([])
  const [teachers, setTeachers] = useState([])
  const [paymentsList, setPaymentsList] = useState([])
  const [attendance, setAttendance] = useState([])
  const [salesPlans, setSalesPlansState] = useState({})
  const [loading, setLoading] = useState(true)

  // Track whether initial load has resolved for each collection
  const loadedRef = useRef({ branches: false, courses: false, groups: false, students: false, teachers: false, payments: false, attendance: false, salesPlans: false })

  const checkAllLoaded = () => {
    const r = loadedRef.current
    if (r.branches && r.courses && r.groups && r.students && r.teachers && r.payments && r.attendance && r.salesPlans) {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsubscribers = []

    // Helper to subscribe to a Firestore collection and map docs to array with id
    function subscribeCollection(collectionName, setter, defaultData, loadKey) {
      const unsub = onSnapshot(collection(db, collectionName), async (snapshot) => {
        if (snapshot.empty && defaultData?.length > 0) {
          // Collection is empty — seed with defaults (works on first load AND after deletion)
          if (!loadedRef.current[`${loadKey}_seeding`]) {
            loadedRef.current[`${loadKey}_seeding`] = true
            try {
              await seedCollection(collectionName, defaultData)
            } catch (err) {
              console.error(`Failed to seed ${collectionName}:`, err)
            }
            loadedRef.current[`${loadKey}_seeding`] = false
          }
          if (!loadedRef.current[loadKey]) {
            loadedRef.current[loadKey] = true
            checkAllLoaded()
          }
          return
        }
        const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id }))
        setter(items)
        if (!loadedRef.current[loadKey]) {
          loadedRef.current[loadKey] = true
          checkAllLoaded()
        }
      })
      unsubscribers.push(unsub)
    }

    // Helper to subscribe to a single-doc meta collection (attendance, salesPlans)
    function subscribeMetaDoc(collectionName, setter, defaultValue, loadKey) {
      const unsub = onSnapshot(doc(db, collectionName, '_meta'), async (snapshot) => {
        if (!snapshot.exists()) {
          if (!loadedRef.current[loadKey]) {
            await seedDocCollection(collectionName, defaultValue)
            loadedRef.current[loadKey] = true
            checkAllLoaded()
          }
          return
        }
        setter(snapshot.data().data)
        if (!loadedRef.current[loadKey]) {
          loadedRef.current[loadKey] = true
          checkAllLoaded()
        }
      })
      unsubscribers.push(unsub)
    }

    subscribeCollection('branches', setBranches, defaultBranches, 'branches')
    // Courses: force-seed if empty, then subscribe
    ;(async () => {
      try {
        const coursesSnap = await getDocs(collection(db, 'courses'))
        if (coursesSnap.empty) {
          console.log('Courses collection empty — seeding with defaults...')
          await seedCollection('courses', DEFAULT_COURSES)
          console.log('Courses seeded:', DEFAULT_COURSES.length, 'courses')
        } else {
          // Migrate existing courses with new fields
          await migrateCourses()
        }
      } catch (err) {
        console.error('Courses seed/migrate error:', err)
      }
    })()
    subscribeCollection('courses', setCourses, DEFAULT_COURSES, 'courses')
    subscribeCollection('groups', setGroups, DEFAULT_GROUPS, 'groups')
    subscribeCollection('students', setStudents, defaultStudents, 'students')
    subscribeCollection('teachers', setTeachers, defaultTeachers, 'teachers')
    subscribeCollection('payments', setPaymentsList, defaultPayments, 'payments')
    subscribeMetaDoc('attendance', setAttendance, [], 'attendance')
    subscribeMetaDoc('salesPlans', setSalesPlansState, {}, 'salesPlans')

    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }, [])

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
    const docRef = await addDoc(collection(db, 'branches'), newBranch)
    return { ...newBranch, id: docRef.id }
  }

  const updateBranch = async (id, updates) => {
    await updateDoc(doc(db, 'branches', id), updates)
  }

  const deleteBranch = async (id) => {
    await deleteDoc(doc(db, 'branches', id))
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

  // --- Courses CRUD ---
  const addCourse = async (course) => {
    const docRef = await addDoc(collection(db, 'courses'), course)
    return { ...course, id: docRef.id }
  }

  const updateCourse = async (id, updates) => {
    await updateDoc(doc(db, 'courses', id), updates)
  }

  const deleteCourse = async (id) => {
    await deleteDoc(doc(db, 'courses', id))
  }

  // --- Students CRUD ---
  const addStudent = async (student) => {
    const newStudent = {
      ...student,
      startDate: new Date().toISOString().split('T')[0],
    }
    const docRef = await addDoc(collection(db, 'students'), newStudent)
    return { ...newStudent, id: docRef.id }
  }

  const updateStudent = async (id, updates) => {
    await updateDoc(doc(db, 'students', id), updates)
  }

  const deleteStudent = async (id) => {
    await deleteDoc(doc(db, 'students', id))
  }

  // --- Teachers CRUD ---
  const addTeacher = async (teacher) => {
    const newTeacher = { ...teacher }
    const docRef = await addDoc(collection(db, 'teachers'), newTeacher)
    return { ...newTeacher, id: docRef.id }
  }

  const updateTeacher = async (id, updates) => {
    await updateDoc(doc(db, 'teachers', id), updates)
  }

  const deleteTeacher = async (id) => {
    await deleteDoc(doc(db, 'teachers', id))
  }

  // --- Payments CRUD ---
  const addPayment = async (payment) => {
    const newPayment = {
      ...payment,
      date: payment.date || new Date().toISOString().split('T')[0],
    }
    const docRef = await addDoc(collection(db, 'payments'), newPayment)

    // Update student balance and debt status if it's a student payment
    if (payment.type === 'income' && payment.studentId) {
      const student = students.find(s => s.id === payment.studentId)
      if (student) {
        const newBalance = student.balance + payment.amount
        const totalCoursePrice = student.totalCoursePrice || 0

        // Calculate total paid including this new payment
        const previousPaid = paymentsList
          .filter(p => p.type === 'income' && p.studentId === payment.studentId)
          .reduce((sum, p) => sum + p.amount, 0)
        const totalPaidNow = previousPaid + payment.amount
        const remainingDebt = totalCoursePrice > 0 ? totalCoursePrice - totalPaidNow : 0

        // Determine status: if there's remaining debt, mark as debtor
        let newStatus = student.status
        if (totalCoursePrice > 0) {
          newStatus = remainingDebt > 0 ? 'debtor' : 'active'
        }

        await updateDoc(doc(db, 'students', payment.studentId), {
          balance: newBalance,
          status: newStatus,
          nextPaymentDate: payment.nextPaymentDate || student.nextPaymentDate || null,
        })
      }
    }

    return { ...newPayment, id: docRef.id }
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
    await setDoc(doc(db, 'attendance', '_meta'), { data: updated })
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
  const setSalesPlan = async (managerId, amount, month) => {
    const key = month || new Date().toISOString().slice(0, 7)
    const updated = {
      ...salesPlans,
      [managerId]: { ...(salesPlans[managerId] || {}), [key]: Number(amount) },
    }
    await setDoc(doc(db, 'salesPlans', '_meta'), { data: updated })
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
    const docRef = await addDoc(collection(db, 'groups'), newGroup)
    return { ...newGroup, id: docRef.id }
  }

  const updateGroup = async (id, updates) => {
    await updateDoc(doc(db, 'groups', id), updates)
  }

  const deleteGroup = async (id) => {
    await deleteDoc(doc(db, 'groups', id))
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

  // Reset to defaults — delete all docs and re-seed
  const resetData = async () => {
    setLoading(true)
    await Promise.all([
      clearCollection('branches'),
      clearCollection('courses'),
      clearCollection('groups'),
      clearCollection('students'),
      clearCollection('teachers'),
      clearCollection('payments'),
    ])
    await Promise.all([
      seedCollection('branches', defaultBranches),
      seedCollection('courses', DEFAULT_COURSES),
      seedCollection('groups', DEFAULT_GROUPS),
      seedCollection('students', defaultStudents),
      seedCollection('teachers', defaultTeachers),
      seedCollection('payments', defaultPayments),
      seedDocCollection('attendance', []),
      seedDocCollection('salesPlans', {}),
    ])
    setLoading(false)
  }

  return (
    <DataContext.Provider value={{
      branches, addBranch, updateBranch, deleteBranch, getBranchName, getBranchNames,
      courses, addCourse, updateCourse, deleteCourse,
      groups, addGroup, updateGroup, deleteGroup, getGroupOfflineCount, getGroupOnlineCount, getGroupStudents,
      students, addStudent, updateStudent, deleteStudent,
      teachers, addTeacher, updateTeacher, deleteTeacher,
      payments: paymentsList, addPayment,
      attendance, markAttendance, getAttendanceByGroup, getAttendanceStats,
      getStudentsByBranch, getTeachersByBranch, getPaymentsByBranch,
      getDebtors, getTotalRevenue, getTotalExpenses,
      salesPlans, setSalesPlan, getSalesPlan, getManagerPerf, getBranchPerf,
      resetData,
      loading,
    }}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => useContext(DataContext)
