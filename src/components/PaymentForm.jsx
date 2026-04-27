import { useState, useEffect, useRef } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency } from '../data/mockData'
import { Receipt, Printer, Paperclip, X, FileText, Image, FileDown, Monitor } from 'lucide-react'
import { generateContract, buildContractBlob } from '../utils/generateContract'
import { listTemplates, renderTemplateBlob, renderTemplateAndDownload } from '../utils/contractTemplates'
import { DEFAULT_TENANT_ID } from '../utils/tenancy'
import { pushSaleToAmo } from '../utils/amocrm'
import { pushSaleToTelegram } from '../utils/telegram'
import { db, storage } from '../firebase'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import Logo from './Logo'
import Modal from './Modal'
import { useLanguage } from '../contexts/LanguageContext'

const METHODS = ['Наличные', 'Терминал', 'Payme', 'Click', 'Uzum', 'Перечисление', 'Рассрочка (Uzum)', 'Рассрочка (Paylater)', 'Рассрочка (Alif)']
const MAX_FILES = 5
const TARIFF_OPTIONS = [
  { tKey: 'paymentForm.tariff_standard', value: 'standard' },
  { tKey: 'paymentForm.tariff_vip', value: 'vip' },
  { tKey: 'paymentForm.tariff_premium', value: 'premium' },
  { tKey: 'paymentForm.tariff_individual', value: 'individual' },
  { tKey: 'paymentForm.tariff_budget', value: 'budget' },
]
const DISCOUNT_OPTIONS = [
  { tKey: 'paymentForm.discount_none', value: 'full' },
  { tKey: 'paymentForm.discount_10', value: 'd10' },
  { tKey: 'paymentForm.discount_15', value: 'd15' },
  { tKey: 'paymentForm.discount_20', value: 'd20' },
]
const BRANCH_TO_REGION = {
  tashkent: 'tashkent',
  samarkand: 'fergana',
  fergana: 'fergana',
  bukhara: 'fergana',
  online: 'online',
}
const BRANCH_OPTIONS = [
  { slug: 'tashkent', name: 'Ташкент' },
  { slug: 'samarkand', name: 'Самарканд' },
  { slug: 'fergana', name: 'Фергана' },
  { slug: 'bukhara', name: 'Бухара' },
]
const FORMAT_OPTIONS = [
  { value: 'Оффлайн', tKey: 'paymentForm.format_offline' },
  { value: 'Онлайн', tKey: 'paymentForm.format_online' },
]

export default function PaymentForm({ onClose, preselectedStudentId, mode = 'new' }) {
  const isDoplata = mode === 'doplata'
  const { branches, students, payments, addPayment, updatePayment, addStudent, updateStudent, groups, courses } = useData()
  const { user, hasPermission } = useAuth()
  const { t } = useLanguage()

  const canExpenses = hasPermission('finance', 'expenses')
  const fileInputRef = useRef(null)

  const [form, setForm] = useState({
    type: 'income',
    studentId: preselectedStudentId ? String(preselectedStudentId) : '',
    clientName: '',
    phone: '',
    groupId: '',
    course: '',
    paymentDate: new Date().toISOString().split('T')[0],
    courseStartDate: '',
    method: 'Наличные',
    amount: '',
    contractNumber: '',
    tariff: 'standard',
    discount: 'full',
    learningFormat: 'Оффлайн',
    comment: '',
    branch: user?.branch !== 'all' ? user.branch : 'tashkent',
    nextPaymentDate: '',
    expenseDescription: '',
    passport: '',
    durationMonths: '3',
    schedule: '',
    // ─── Three-party contract (company pays for student) ───
    isCompanyPayer: false,
    payerCompanyName: '',
    payerCompanyInn: '',
    payerCompanyAddress: '',
    payerCompanyDirector: '',
    payerCompanyBank: '',
    payerCompanyPhone: '',
  })

  const [files, setFiles] = useState([])
  const [duplicateWarning, setDuplicateWarning] = useState(null) // { matches: [] }
  const bypassDuplicateRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [savedPayment, setSavedPayment] = useState(null)
  const [generatingContract, setGeneratingContract] = useState(false)
  const [customTemplates, setCustomTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('') // '' = INTERNO default (only allowed for default tenant)

  // Only the default (INTERNO) tenant can use the hardcoded INTERNO contract.
  // Other schools must upload their own template.
  const tenantIdForTemplates = user?.tenantId || DEFAULT_TENANT_ID
  const isDefaultTenant = tenantIdForTemplates === DEFAULT_TENANT_ID

  // Загружаем кастомные шаблоны договоров текущей школы
  useEffect(() => {
    listTemplates(tenantIdForTemplates).then(items => {
      setCustomTemplates(items)
      const def = items.find(t => t.isDefault)
      if (def) setSelectedTemplateId(def.id)
      else if (!isDefaultTenant && items.length > 0) {
        // Non-default tenant: auto-select first template (INTERNO default is forbidden)
        setSelectedTemplateId(items[0].id)
      }
    }).catch(e => console.warn('listTemplates failed:', e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [signatureData, setSignatureData] = useState(null)
  const [signing, setSigning] = useState(false)
  const canvasRef = useRef(null)
  const isDrawingRef = useRef(false)

  const branchStudents = students.filter(s =>
    user?.branch !== 'all' ? s.branch === user.branch : s.branch === form.branch
  )

  // Calculate student's previous payments and remaining debt
  const selectedStudent = form.studentId ? students.find(s => String(s.id) === String(form.studentId)) : null
  const studentPayments = form.studentId
    ? payments.filter(p => p.type === 'income' && String(p.studentId) === String(form.studentId))
    : []
  const totalPaid = studentPayments.reduce((sum, p) => sum + p.amount, 0)
  const currentAmount = Number(form.amount) || 0

  // Show all groups (not filtered by branch)
  const branchGroups = groups.filter(g => g.status !== 'archived')

  // ─── Auto-calculate course price from course + tariff + discount + region ───
  const selectedCourse = courses.find(c => c.name === form.course)
  const region = form.learningFormat === 'Онлайн' ? 'online' : (BRANCH_TO_REGION[form.branch] || 'tashkent')
  const coursePricing = selectedCourse?.pricing?.[region]?.[form.tariff]
  const courseFullPrice = coursePricing?.[form.discount] || coursePricing?.full || 0
  // Build tariff list: include all keys present in course pricing, plus resolve labels
  // from either the standard TARIFF_OPTIONS or from custom `label` stored on the price entry.
  const availableTariffs = (() => {
    const regionPricing = selectedCourse?.pricing?.[region]
    if (!regionPricing) return TARIFF_OPTIONS
    const keys = Object.keys(regionPricing)
    return keys.map(key => {
      const std = TARIFF_OPTIONS.find(to => to.value === key)
      const customLabel = regionPricing[key]?.label
      if (std && !customLabel) return std
      return { value: key, label: customLabel || key, tKey: std?.tKey || null }
    })
  })()
  const availableDiscounts = coursePricing
    ? DISCOUNT_OPTIONS.filter(d => coursePricing[d.value] !== undefined)
    : DISCOUNT_OPTIONS

  // Use course price from selection, or fallback to student's saved totalCoursePrice
  const totalCoursePrice = courseFullPrice || selectedStudent?.totalCoursePrice || 0
  const autoDebt = totalCoursePrice > 0 ? Math.max(0, totalCoursePrice - totalPaid - currentAmount) : 0

  // Auto-fill from selected student
  useEffect(() => {
    if (form.studentId) {
      const student = students.find(s => String(s.id) === String(form.studentId))
      if (student) {
        const studentGroup = groups.find(g => g.name === student.group)
        setForm(prev => ({
          ...prev,
          clientName: student.name,
          phone: student.phone,
          course: student.course,
          contractNumber: student.contractNumber || prev.contractNumber,
          groupId: studentGroup?.id || prev.groupId,
          schedule: studentGroup?.schedule || prev.schedule,
        }))
      }
    }
  }, [form.studentId, students, groups])

  // Auto-fill from selected group (course, schedule, startDate, duration)
  useEffect(() => {
    if (form.groupId) {
      const group = groups.find(g => g.id === form.groupId)
      if (group) {
        const groupCourse = courses.find(c => c.name === group.course)
        const groupRegion = BRANCH_TO_REGION[group.branch] || 'tashkent'
        const regionDur = groupCourse?.durationByRegion?.[groupRegion]
        const courseDuration = regionDur
          ? parseInt(regionDur)
          : (groupCourse?.duration ? parseInt(groupCourse.duration) : null)
        setForm(prev => ({
          ...prev,
          course: group.course,
          schedule: group.schedule || prev.schedule,
          branch: group.branch || prev.branch,
          courseStartDate: group.startDate || prev.courseStartDate,
          contractLang: group.language || 'uz',
          ...(courseDuration ? { durationMonths: String(courseDuration) } : {}),
        }))
      }
    }
  }, [form.groupId, groups, courses])

  // Auto-generate unique contract number
  useEffect(() => {
    if (!form.contractNumber) {
      const now = new Date()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const year = String(now.getFullYear()).slice(-2)
      // Count existing contracts this month to get next sequential number
      const prefix = `${month}/${year}`
      const existingThisMonth = payments.filter(p =>
        p.contractNumber && p.contractNumber.includes(`/${year}`)
      )
      const maxNum = existingThisMonth.reduce((max, p) => {
        const match = p.contractNumber.match(/^(\d+)\//)
        return match ? Math.max(max, parseInt(match[1])) : max
      }, 0)
      setForm(prev => prev.contractNumber ? prev : { ...prev, contractNumber: `${maxNum + 1}/${prefix}` })
    }
  }, [payments])

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleFileAdd = (e) => {
    const selectedFiles = Array.from(e.target.files)
    const remainingSlots = MAX_FILES - files.length
    if (remainingSlots <= 0) {
      alert(t('paymentForm.file_limit_reached').replace('{max}', MAX_FILES))
      e.target.value = ''
      return
    }
    const toAdd = selectedFiles.slice(0, remainingSlots)
    if (selectedFiles.length > remainingSlots) {
      alert(t('paymentForm.file_limit_exceeded').replace('{max}', MAX_FILES).replace('{added}', remainingSlots))
    }
    toAdd.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        alert(t('paymentForm.file_too_large').replace('{name}', file.name))
        return
      }
      const reader = new FileReader()
      reader.onload = (ev) => {
        setFiles(prev => {
          if (prev.length >= MAX_FILES) return prev
          return [...prev, {
            id: Date.now() + Math.random(),
            name: file.name,
            type: file.type,
            size: file.size,
            data: ev.target.result,
          }]
        })
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removeFile = (fileId) => {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const getFileIcon = (type) => {
    if (type.startsWith('image/')) return <Image size={14} className="text-blue-500" />
    return <FileText size={14} className="text-orange-500" />
  }

  // Detect potential duplicate payments (same client + amount + date or close)
  const findDuplicates = () => {
    if (form.type !== 'income') return []
    const amount = Number(form.amount) || 0
    if (!amount) return []
    const date = form.paymentDate
    const phoneClean = (form.phone || '').replace(/\D/g, '')
    const nameClean = (form.clientName || '').trim().toLowerCase()
    if (!nameClean && !phoneClean) return []

    return payments.filter(p => {
      if (p.type !== 'income') return false
      // Exclude existing tranches (those are intentionally separate)
      // Match by name OR phone
      const pName = (p.student || '').trim().toLowerCase()
      const pPhone = (p.phone || '').replace(/\D/g, '')
      const nameMatch = nameClean && pName && pName === nameClean
      const phoneMatch = phoneClean && pPhone && pPhone === phoneClean
      if (!nameMatch && !phoneMatch) return false
      // Same amount
      if (Number(p.amount) !== amount) return false
      // Same date or within 1 day
      if (date && p.date) {
        const d1 = new Date(date)
        const d2 = new Date(p.date)
        const diffDays = Math.abs(d1 - d2) / (1000 * 60 * 60 * 24)
        if (diffDays > 1) return false
      }
      return true
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // ─── Guard against double-submit (ref is synchronous, state is async) ───
    if (submittingRef.current) {
      console.warn('PaymentForm: ignoring duplicate submit while previous is in progress')
      return
    }

    // Duplicate check (only for new income payments, not for explicit "doplata" mode)
    if (form.type === 'income' && !isDoplata && !bypassDuplicateRef.current) {
      const dupes = findDuplicates()
      if (dupes.length > 0) {
        setDuplicateWarning({ matches: dupes })
        return
      }
    }
    bypassDuplicateRef.current = false

    // Lock out further submits immediately
    submittingRef.current = true
    setSubmitting(true)

    try {
    const selectedGroup = groups.find(g => g.id === form.groupId)
    let studentId = form.type === 'income' ? form.studentId || null : null

    // ─── Auto-create student if new client (no studentId selected) ───
    if (form.type === 'income' && !studentId && form.clientName) {
      // First: check if a student with the same phone already exists
      // (covers race condition where state hasn't refreshed yet OR repeated clicks)
      const phoneClean = (form.phone || '').replace(/\D/g, '')
      const nameClean = form.clientName.trim().toLowerCase()
      const existingStudent = students.find(s => {
        const sPhone = (s.phone || '').replace(/\D/g, '')
        const sName = (s.name || '').trim().toLowerCase()
        if (phoneClean && sPhone && sPhone === phoneClean) return true
        if (nameClean && sName && sName === nameClean && (s.branch === form.branch || !s.branch)) return true
        return false
      })
      if (existingStudent) {
        studentId = existingStudent.id
      } else try {
        const tariffOption = TARIFF_OPTIONS.find(to => to.value === form.tariff)
        const customTariffLabel = selectedCourse?.pricing?.[region]?.[form.tariff]?.label
        const tariffLabel = customTariffLabel || (tariffOption ? t(tariffOption.tKey) : form.tariff)
        const newStudent = await addStudent({
          name: form.clientName,
          phone: form.phone || '',
          course: form.course || '',
          branch: form.branch || 'tashkent',
          group: selectedGroup?.name || '',
          groupId: selectedGroup?.id || '',
          status: 'active',
          balance: 0,
          totalCoursePrice: courseFullPrice || 0,
          learningFormat: form.learningFormat || 'Оффлайн',
          tariff: tariffLabel,
          discount: form.discount || 'full',
          contractNumber: form.contractNumber || '',
          createdBy: user?.id || null,
          createdByName: user?.name || '',
          createdAt: new Date().toISOString(),
        })
        studentId = newStudent.id
      } catch (err) {
        console.error('Failed to auto-create student:', err)
      }
    }

    // ─── Update existing student's group if changed ───
    if (form.type === 'income' && studentId && selectedGroup) {
      try {
        const existingStudent = students.find(s => String(s.id) === String(studentId))
        if (existingStudent && existingStudent.group !== selectedGroup.name) {
          await updateStudent(studentId, {
            group: selectedGroup.name,
            groupId: selectedGroup.id,
            course: form.course || existingStudent.course,
            branch: form.branch || existingStudent.branch,
            learningFormat: form.learningFormat || existingStudent.learningFormat || 'Оффлайн',
            tariff: form.tariff || existingStudent.tariff || '',
          })
        }
      } catch (err) {
        console.error('Failed to update student group:', err)
      }
    }

    const tariffOpt = TARIFF_OPTIONS.find(to => to.value === form.tariff)
    const customLbl = selectedCourse?.pricing?.[region]?.[form.tariff]?.label
    const tariffLbl = customLbl || (tariffOpt ? t(tariffOpt.tKey) : form.tariff)
    const discountOpt = DISCOUNT_OPTIONS.find(d => d.value === form.discount)
    const discountLbl = discountOpt ? t(discountOpt.tKey) : ''
    const paymentData = {
      type: form.type,
      student: form.type === 'income' ? form.clientName : form.expenseDescription,
      studentId,
      branch: form.branch,
      amount: Number(form.amount),
      method: form.method,
      date: form.paymentDate,
      course: form.course,
      group: selectedGroup?.name || '',
      courseStartDate: form.courseStartDate,
      debt: autoDebt,
      totalCoursePrice: totalCoursePrice || 0,
      contractNumber: form.contractNumber,
      tariff: tariffLbl,
      discount: discountLbl,
      learningFormat: form.learningFormat,
      comment: form.comment,
      phone: form.phone,
      nextPaymentDate: form.nextPaymentDate,
      durationMonths: Number(form.durationMonths) || 3,
      schedule: form.schedule || '',
      passport: form.passport || '',
      contractLang: form.contractLang || 'uz',
      // Three-party contract
      isCompanyPayer: !!form.isCompanyPayer,
      payerCompanyName: form.payerCompanyName || '',
      payerCompanyInn: form.payerCompanyInn || '',
      payerCompanyAddress: form.payerCompanyAddress || '',
      payerCompanyDirector: form.payerCompanyDirector || '',
      payerCompanyBank: form.payerCompanyBank || '',
      payerCompanyPhone: form.payerCompanyPhone || '',
      templateId: selectedTemplateId || '',
      files: files.map(f => ({ id: f.id, name: f.name, type: f.type, size: f.size, data: f.data })),
      trancheNumber: studentPayments.length + 1,
      managerId: user?.managerId || null,
      createdBy: user?.id || null,
      createdByName: user?.name || '',
      createdAt: new Date().toISOString(),
    }

    const saved = await addPayment(paymentData)

    // Auto-update reports if this is an income payment
    if (form.type === 'income') {
      try {
        const paymentDate = new Date(form.paymentDate)
        const year = paymentDate.getFullYear()
        const month = paymentDate.getMonth() + 1
        const day = paymentDate.getDate()
        const monthKey = `${year}-${String(month).padStart(2, '0')}`
        const managerName = user?.name || ''

        if (managerName) {
          const tenantId = user?.tenantId || 'default'
          const docId = `${monthKey}_${tenantId}_${managerName}_${day}`
          const dailyRef = doc(db, 'reportDaily', docId)
          const existing = await getDoc(dailyRef)
          const existingData = existing.exists() ? existing.data() : {}

          await setDoc(dailyRef, {
            monthKey,
            tenantId,
            manager: managerName,
            day,
            leads: existingData.leads || 0,
            conversations: existingData.conversations || 0,
            signups: existingData.signups || 0,
            visited: existingData.visited || 0,
            sales: (existingData.sales || 0) + 1,
            revenue: (existingData.revenue || 0) + Number(form.amount),
          })
        }
      } catch (err) {
        console.error('Failed to update report:', err)
      }
    }

    // LMS credentials returned directly from addPayment if account was created
    const lmsCredentials = saved?.lmsCredentials || null

    setSavedPayment({ ...paymentData, id: saved.id, lmsCredentials })
    setShowReceipt(true)

    // ─── Auto-generate contract & upload to Firebase Storage ───
    // Runs in parallel, does NOT block Telegram/amoCRM notifications.
    // If Firebase Storage is not provisioned (Spark plan), this promise
    // will reject/hang — we race it against a 5-second timeout so the
    // Telegram push still fires reliably.
    let contractUploadPromise = Promise.resolve(null)
    if (form.type === 'income') {
      contractUploadPromise = (async () => {
        try {
          const contractData = {
            clientName: form.clientName,
            passport: form.passport || '',
            phone: form.phone,
            course: form.course,
            amount: courseFullPrice || totalCoursePrice || Number(form.amount) || 0,
            tariff: form.tariff,
            contractNumber: form.contractNumber,
            contractDate: form.paymentDate,
            courseStartDate: form.courseStartDate,
            durationMonths: Number(form.durationMonths) || 3,
            schedule: form.schedule || '',
            learningFormat: form.learningFormat,
            lang: form.contractLang || 'uz',
            // Three-party (company payer)
            isCompanyPayer: !!form.isCompanyPayer,
            payerCompanyName: form.payerCompanyName || '',
            payerCompanyInn: form.payerCompanyInn || '',
            payerCompanyAddress: form.payerCompanyAddress || '',
            payerCompanyDirector: form.payerCompanyDirector || '',
            payerCompanyBank: form.payerCompanyBank || '',
            payerCompanyPhone: form.payerCompanyPhone || '',
          }
          // Выбран кастомный шаблон — рендерим через docxtemplater.
          // Только default-тенант (INTERNO) может использовать встроенный шаблон.
          const selectedTpl = customTemplates.find(t => t.id === selectedTemplateId)
          if (!selectedTpl && !isDefaultTenant) {
            console.warn('Non-default tenant without custom template — skipping contract generation.')
            return null
          }
          const { blob, fileName } = selectedTpl
            ? await renderTemplateBlob(selectedTpl, contractData)
            : await buildContractBlob(contractData)
          const safeNumber = (form.contractNumber || `sale_${saved.id}`).replace(/[^\w-]/g, '_')
          const tenantPath = user?.tenantId || 'default'
          const storagePath = `${tenantPath}/contracts/${safeNumber}_${Date.now()}_${fileName}`
          const fileRef = storageRef(storage, storagePath)
          await uploadBytes(fileRef, blob, {
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            customMetadata: {
              paymentId: saved.id,
              contractNumber: form.contractNumber || '',
              clientName: form.clientName || '',
            },
          })
          const url = await getDownloadURL(fileRef)
          // Persist URL on the payment record (best-effort, don't block)
          updatePayment(saved.id, { contractUrl: url, contractFileName: fileName })
            .catch(e => console.warn('Failed to persist contractUrl on payment:', e))
          return url
        } catch (err) {
          console.error('Contract upload failed, continuing without URL:', err)
          return null
        }
      })()
    }

    // Wait up to 5s for contract URL, then fire notifications regardless.
    const contractUrl = await Promise.race([
      contractUploadPromise,
      new Promise(resolve => setTimeout(() => resolve(null), 5000)),
    ])

    // Push to amoCRM (non-blocking — doesn't prevent the sale)
    if (form.type === 'income') {
      pushSaleToAmo({
        clientName: form.clientName,
        phone: form.phone,
        course: form.course,
        group: selectedGroup?.name || '',
        amount: Number(form.amount),
        method: form.method,
        date: form.paymentDate,
        branch: form.branch,
        tariff: form.tariff,
        contractNumber: form.contractNumber,
        debt: autoDebt,
        trancheNumber: studentPayments.length + 1,
        managerName: user?.name || '',
        comment: form.comment,
      }).then(result => {
        if (result.success) {
          console.log('Sale pushed to amoCRM:', result.leadId)
        } else {
          console.warn('amoCRM sync skipped:', result.error)
        }
      })

      // Build manager sales fact for this month
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const managerSalesThisMonth = payments.filter(p =>
        p.type === 'income' &&
        (p.managerId === user?.managerId || p.createdBy === user?.id) &&
        p.date >= monthStart
      )
      const thisMonthCount = managerSalesThisMonth.length + 1 // +1 for current sale
      const thisMonthRevenue = managerSalesThisMonth.reduce((s, p) => s + (Number(p.amount) || 0), 0) + Number(form.amount)
      const fmtRev = (n) => Number(n).toLocaleString('ru-RU').replace(/,/g, ' ')
      const salesFact = `${thisMonthCount}-я продажа | ${fmtRev(thisMonthRevenue)} сум за месяц`

      // Push to Telegram group (non-blocking)
      pushSaleToTelegram({
        clientName: form.clientName,
        phone: form.phone,
        course: form.course,
        group: selectedGroup?.name || '',
        amount: Number(form.amount),
        method: form.method,
        date: form.paymentDate,
        courseStartDate: form.courseStartDate,
        // Route to the manager's branch group, not the sale's branch — a
        // Tashkent manager closing a Samarkand client should still notify
        // their own Tashkent group.
        branch: (user?.branch && user.branch !== 'all') ? user.branch : form.branch,
        tariff: tariffLbl,
        discount: discountLbl,
        contractNumber: form.contractNumber,
        debt: autoDebt,
        totalCoursePrice: courseFullPrice || 0,
        trancheNumber: studentPayments.length + 1,
        managerName: user?.name || '',
        salesFact,
        comment: form.comment,
        learningFormat: form.learningFormat,
        contractUrl,
      }).then(result => {
        if (result.success) {
          console.log('Sale notification sent to Telegram:', result.messageId)
          // Mark payment as notified so admin tools can filter missed ones
          updatePayment(saved.id, {
            telegramSent: true,
            telegramSentAt: new Date().toISOString(),
            telegramMessageId: result.messageId || null,
          }).catch(e => console.warn('Failed to mark telegramSent:', e))
        } else {
          console.warn('Telegram notification skipped:', result.error)
        }
      })
    }
    } catch (err) {
      console.error('PaymentForm submit failed:', err)
      alert('Не удалось сохранить продажу. Попробуйте ещё раз.')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleGenerateContract = async () => {
    setGeneratingContract(true)
    try {
      const payment = savedPayment || {}
      const contractData = {
        clientName: payment.student || form.clientName,
        passport: form.passport || '',
        phone: payment.phone || form.phone,
        course: payment.course || form.course,
        courseDetails: '',
        amount: payment.totalCoursePrice || totalCoursePrice || payment.amount || Number(form.amount) || 0,
        tariff: payment.tariff || form.tariff,
        contractNumber: payment.contractNumber || form.contractNumber,
        contractDate: payment.date || form.paymentDate,
        courseStartDate: payment.courseStartDate || form.courseStartDate,
        durationMonths: Number(form.durationMonths) || 3,
        schedule: form.schedule || '',
        learningFormat: payment.learningFormat || form.learningFormat,
        lang: payment.contractLang || form.contractLang || 'uz',
        // Three-party (company payer)
        isCompanyPayer: !!(payment.isCompanyPayer ?? form.isCompanyPayer),
        payerCompanyName: payment.payerCompanyName || form.payerCompanyName || '',
        payerCompanyInn: payment.payerCompanyInn || form.payerCompanyInn || '',
        payerCompanyAddress: payment.payerCompanyAddress || form.payerCompanyAddress || '',
        payerCompanyDirector: payment.payerCompanyDirector || form.payerCompanyDirector || '',
        payerCompanyBank: payment.payerCompanyBank || form.payerCompanyBank || '',
        payerCompanyPhone: payment.payerCompanyPhone || form.payerCompanyPhone || '',
      }
      const selectedTpl = customTemplates.find(t => t.id === (payment.templateId || selectedTemplateId))
      if (selectedTpl) {
        await renderTemplateAndDownload(selectedTpl, contractData)
      } else if (isDefaultTenant) {
        await generateContract(contractData)
      } else {
        alert('Для вашей школы не загружен шаблон договора. Добавьте его в разделе «Шаблоны договоров».')
      }
    } catch (err) {
      console.error('Contract generation failed:', err)
      alert(t('paymentForm.error_contract'))
    }
    setGeneratingContract(false)
  }

  // ========== Receipt View ==========
  if (showReceipt && savedPayment) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-emerald-600 mb-2">
          <Receipt size={20} />
          <span className="font-semibold">{t('paymentForm.receipt_success')}</span>
        </div>

        <div id="payment-receipt" className="border border-slate-200 rounded-xl p-6 bg-white space-y-3 text-sm">
          <div className="text-center border-b border-slate-200 pb-3 mb-3">
            <Logo size="md" variant="dark" />
            <p className="text-slate-500 text-xs mt-1">{branches.find(b => b.id === savedPayment.branch)?.name} — {t('paymentForm.receipt_title')}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="text-slate-500">{t('paymentForm.receipt_payment_date')}</div>
            <div className="font-medium">{savedPayment.date}</div>

            {savedPayment.courseStartDate && (
              <>
                <div className="text-slate-500">{t('paymentForm.receipt_course_start')}</div>
                <div className="font-medium">{savedPayment.courseStartDate}</div>
              </>
            )}

            <div className="text-slate-500">{t('paymentForm.receipt_client_name')}</div>
            <div className="font-medium">{savedPayment.student}</div>

            <div className="text-slate-500">{t('paymentForm.receipt_group')}</div>
            <div className="font-medium">{savedPayment.group || '—'}</div>

            <div className="text-slate-500">{t('paymentForm.receipt_course')}</div>
            <div className="font-medium">{savedPayment.course}</div>

            <div className="text-slate-500">{t('paymentForm.receipt_method')}</div>
            <div className="font-medium">{savedPayment.method}</div>

            <div className="text-slate-500">{t('paymentForm.receipt_tranche')}</div>
            <div className="font-medium">{savedPayment.trancheNumber}</div>

            <div className="text-slate-500">{t('paymentForm.receipt_amount')}</div>
            <div className="font-bold text-emerald-600">{formatCurrency(savedPayment.amount)}</div>

            {totalCoursePrice > 0 && (
              <>
                <div className="text-slate-500">{t('paymentForm.receipt_course_price')}</div>
                <div className="font-medium">{formatCurrency(totalCoursePrice)}</div>

                <div className="text-slate-500">{t('paymentForm.receipt_total_paid')}</div>
                <div className="font-medium">{formatCurrency(totalPaid + savedPayment.amount)}</div>
              </>
            )}

            {savedPayment.debt > 0 && (
              <>
                <div className="text-slate-500">{t('paymentForm.receipt_remaining')}</div>
                <div className="font-bold text-red-500">{formatCurrency(savedPayment.debt)}</div>
              </>
            )}

            {savedPayment.nextPaymentDate && (
              <>
                <div className="text-slate-500">{t('paymentForm.receipt_next_payment')}</div>
                <div className="font-medium text-blue-600">{savedPayment.nextPaymentDate}</div>
              </>
            )}

            {savedPayment.contractNumber && (
              <>
                <div className="text-slate-500">{t('paymentForm.receipt_contract')}</div>
                <div className="font-medium">{savedPayment.contractNumber}</div>
              </>
            )}

            {savedPayment.contractNumber && savedPayment.id && (
              <>
                <div className="text-slate-500">Ссылка на договор</div>
                <div className="font-medium">
                  <a href={`${window.location.origin}/contract/${savedPayment.id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline text-xs break-all">
                    {window.location.origin}/contract/{savedPayment.id}
                  </a>
                </div>
              </>
            )}

            {savedPayment.phone && (
              <>
                <div className="text-slate-500">{t('paymentForm.receipt_phone')}</div>
                <div className="font-medium">{savedPayment.phone}</div>
              </>
            )}

            {(savedPayment.learningFormat || savedPayment.tariff) && (
              <>
                <div className="text-slate-500">{t('paymentForm.receipt_format')}</div>
                <div className="font-medium">{savedPayment.learningFormat} ({savedPayment.tariff})</div>
              </>
            )}

            {savedPayment.discount && savedPayment.discount !== t('paymentForm.discount_none') && (
              <>
                <div className="text-slate-500">{t('paymentForm.receipt_discount')}</div>
                <div className="font-medium text-emerald-600">{savedPayment.discount}</div>
              </>
            )}

            {savedPayment.totalCoursePrice > 0 && (
              <>
                <div className="text-slate-500">{t('paymentForm.receipt_course_price')}</div>
                <div className="font-bold text-blue-600">{formatCurrency(savedPayment.totalCoursePrice)}</div>
              </>
            )}

            {savedPayment.debt > 0 && (
              <>
                <div className="text-slate-500">{t('paymentForm.receipt_remaining')}</div>
                <div className="font-bold text-red-500">{formatCurrency(savedPayment.debt)}</div>
              </>
            )}

            {savedPayment.comment && (
              <>
                <div className="text-slate-500">{t('paymentForm.receipt_comment')}</div>
                <div className="font-medium">{savedPayment.comment}</div>
              </>
            )}
          </div>

          {savedPayment.files && savedPayment.files.length > 0 && (
            <div className="border-t border-slate-200 pt-3 mt-3">
              <p className="text-xs text-slate-500 mb-2">{t('paymentForm.receipt_files')} {savedPayment.files.length}</p>
              <div className="flex flex-wrap gap-1">
                {savedPayment.files.map(f => (
                  <span key={f.id} className="text-xs bg-slate-100 px-2 py-1 rounded">{f.name}</span>
                ))}
              </div>
            </div>
          )}

          {/* LMS Account Credentials — shown on first payment */}
          {savedPayment.lmsCredentials && (
            <div className="border-t border-blue-200 bg-blue-50 rounded-xl p-4 mt-3">
              <div className="flex items-center gap-2 mb-2">
                <Monitor size={16} className="text-blue-600" />
                <p className="text-sm font-bold text-blue-800">{t('paymentForm.lms_credentials_title')}</p>
              </div>
              <p className="text-xs text-blue-600 mb-3">{t('paymentForm.lms_credentials_note')}</p>
              <div className="grid grid-cols-2 gap-2 bg-white rounded-lg p-3 border border-blue-200">
                <div className="text-slate-500 text-sm">{t('paymentForm.lms_login')}</div>
                <div className="font-bold text-slate-900 text-sm font-mono">{savedPayment.lmsCredentials.login}</div>
                <div className="text-slate-500 text-sm">{t('paymentForm.lms_password')}</div>
                <div className="font-bold text-slate-900 text-sm font-mono">{savedPayment.lmsCredentials.password}</div>
              </div>
              <p className="text-[10px] text-blue-400 mt-2">{t('paymentForm.lms_student_note')}</p>
            </div>
          )}

          <div className="border-t border-dashed border-slate-300 pt-3 mt-3 text-center text-xs text-slate-400">
            Квитанция #{savedPayment.id} &middot; {new Date().toLocaleString('ru-RU')}
          </div>
        </div>

        {/* Contract Link */}
        {savedPayment.contractNumber && savedPayment.id && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-blue-800 mb-2">📋 Ссылка для подписания договора</p>
            <p className="text-xs text-blue-600 mb-3">Отправьте эту ссылку клиенту для электронного подписания договора:</p>
            <div className="flex items-center gap-2">
              <input type="text" readOnly
                value={`${window.location.origin}/contract/${savedPayment.id}`}
                className="flex-1 bg-white border border-blue-300 rounded-lg px-3 py-2 text-xs text-slate-700 font-mono"
              />
              <button onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/contract/${savedPayment.id}`)
                const btn = document.getElementById('copy-link-btn')
                if (btn) { btn.textContent = '✓'; setTimeout(() => { btn.textContent = 'Копировать' }, 1500) }
              }}
                id="copy-link-btn"
                className="px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap">
                Копировать
              </button>
            </div>
          </div>
        )}

        {/* Signature Pad */}
        {savedPayment.contractNumber && !signatureData && (
          <div className="border-t border-slate-200 pt-3 mt-3">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Электронная подпись клиента</p>
            {!signing ? (
              <button onClick={() => {
                setSigning(true)
                setTimeout(() => {
                  const canvas = canvasRef.current
                  if (canvas) {
                    const ctx = canvas.getContext('2d')
                    ctx.lineWidth = 2
                    ctx.lineCap = 'round'
                    ctx.strokeStyle = '#1e40af'
                  }
                }, 100)
              }}
                className="w-full py-3 border-2 border-dashed border-blue-300 rounded-lg text-sm text-blue-600 font-medium hover:bg-blue-50 transition-colors">
                ✍ Нажмите для подписи
              </button>
            ) : (
              <div className="space-y-2">
                <canvas ref={canvasRef} width={400} height={120}
                  className="w-full border border-blue-300 rounded-lg bg-white cursor-crosshair touch-none"
                  onMouseDown={(e) => {
                    isDrawingRef.current = true
                    const canvas = canvasRef.current
                    const rect = canvas.getBoundingClientRect()
                    const ctx = canvas.getContext('2d')
                    ctx.beginPath()
                    ctx.moveTo((e.clientX - rect.left) * (canvas.width / rect.width), (e.clientY - rect.top) * (canvas.height / rect.height))
                  }}
                  onMouseMove={(e) => {
                    if (!isDrawingRef.current) return
                    const canvas = canvasRef.current
                    const rect = canvas.getBoundingClientRect()
                    const ctx = canvas.getContext('2d')
                    ctx.lineTo((e.clientX - rect.left) * (canvas.width / rect.width), (e.clientY - rect.top) * (canvas.height / rect.height))
                    ctx.stroke()
                  }}
                  onMouseUp={() => { isDrawingRef.current = false }}
                  onMouseLeave={() => { isDrawingRef.current = false }}
                  onTouchStart={(e) => {
                    isDrawingRef.current = true
                    const canvas = canvasRef.current
                    const rect = canvas.getBoundingClientRect()
                    const ctx = canvas.getContext('2d')
                    const touch = e.touches[0]
                    ctx.beginPath()
                    ctx.moveTo((touch.clientX - rect.left) * (canvas.width / rect.width), (touch.clientY - rect.top) * (canvas.height / rect.height))
                  }}
                  onTouchMove={(e) => {
                    if (!isDrawingRef.current) return
                    e.preventDefault()
                    const canvas = canvasRef.current
                    const rect = canvas.getBoundingClientRect()
                    const ctx = canvas.getContext('2d')
                    const touch = e.touches[0]
                    ctx.lineTo((touch.clientX - rect.left) * (canvas.width / rect.width), (touch.clientY - rect.top) * (canvas.height / rect.height))
                    ctx.stroke()
                  }}
                  onTouchEnd={() => { isDrawingRef.current = false }}
                />
                <div className="flex gap-2">
                  <button onClick={() => {
                    const canvas = canvasRef.current
                    const ctx = canvas.getContext('2d')
                    ctx.clearRect(0, 0, canvas.width, canvas.height)
                  }}
                    className="px-3 py-1.5 text-xs text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">Очистить</button>
                  <button onClick={async () => {
                    const canvas = canvasRef.current
                    const data = canvas.toDataURL('image/png')
                    setSignatureData(data)
                    setSigning(false)
                    if (savedPayment?.id) {
                      try {
                        await updatePayment(savedPayment.id, { signatureData: data, contractSigned: true })
                      } catch (err) { console.error('Failed to save signature:', err) }
                    }
                  }}
                    className="px-3 py-1.5 text-xs text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 font-medium">✓ Подтвердить подпись</button>
                </div>
              </div>
            )}
          </div>
        )}

        {signatureData && (
          <div className="border-t border-emerald-200 bg-emerald-50 rounded-lg p-3 mt-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-emerald-600 text-sm font-medium">✓ Договор подписан электронно</span>
            </div>
            <img src={signatureData} alt="Подпись" className="h-12 object-contain" />
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 flex-wrap">
          <button onClick={handleGenerateContract} disabled={generatingContract}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-700 bg-purple-100 rounded-lg hover:bg-purple-200 transition-colors disabled:opacity-50">
            <FileDown size={16} />
            {generatingContract ? t('paymentForm.btn_generating') : t('paymentForm.btn_generate_contract')}
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
            <Printer size={16} />
            {t('paymentForm.btn_print')}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            {t('paymentForm.btn_done')}
          </button>
        </div>
      </div>
    )
  }

  // ========== Form View ==========
  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type selector — only show expense tab if user has permission & not doplata */}
      {isDoplata ? (
        <div className="bg-blue-50 rounded-lg py-2.5 px-4 text-sm font-medium text-blue-700 text-center">
          {t('paymentForm.doplata_title')}
        </div>
      ) : canExpenses ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => set('type', 'income')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${form.type === 'income' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'}`}>
            {t('paymentForm.type_income')}
          </button>
          <button type="button" onClick={() => set('type', 'expense')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${form.type === 'expense' ? 'bg-red-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'}`}>
            {t('paymentForm.type_expense')}
          </button>
        </div>
      ) : (
        <div className="bg-emerald-50 rounded-lg py-2.5 px-4 text-sm font-medium text-emerald-700 text-center">
          {t('paymentForm.type_income')}
        </div>
      )}

      {form.type === 'income' ? (
        <div className="space-y-4">

          {/* ═══ DOPLATA MODE: simplified — just pick student ═══ */}
          {isDoplata ? (
            <>
              {/* Student selector — required */}
              <div className="bg-blue-50 rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide">{t('paymentForm.select_student_doplata')}</h4>
                <select value={form.studentId} onChange={(e) => set('studentId', e.target.value)} required
                  className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">{t('paymentForm.select_student')}</option>
                  {branchStudents.map(s => (
                    <option key={s.id} value={s.id}>{s.name} — {s.course} ({s.group})</option>
                  ))}
                </select>

                {/* Student info card */}
                {selectedStudent && (
                  <div className="bg-white rounded-lg p-3 border border-blue-100 text-sm space-y-1">
                    <div className="flex justify-between"><span className="text-slate-500">{t('paymentForm.student_label')}</span><span className="font-semibold">{selectedStudent.name}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">{t('paymentForm.course_label')}</span><span className="font-medium">{selectedStudent.course}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">{t('paymentForm.group_label')}</span><span className="font-medium">{selectedStudent.group || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">{t('paymentForm.phone_label')}</span><span className="font-medium">{selectedStudent.phone || '—'}</span></div>
                  </div>
                )}
              </div>

              {/* Tranche history */}
              {form.studentId && (
                <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {t('paymentForm.payment_history')} ({studentPayments.length} {studentPayments.length === 1 ? t('paymentForm.tranche') : studentPayments.length < 5 ? t('paymentForm.tranches_few') : t('paymentForm.tranches_many')})
                  </h4>

                  {studentPayments.length > 0 ? (
                    <div className="space-y-2">
                      {studentPayments
                        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                        .map((p, idx) => (
                        <div key={p.id || idx} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-200">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-slate-700">{formatCurrency(p.amount)}</div>
                              <div className="text-xs text-slate-400">{p.date} · {p.method}</div>
                            </div>
                          </div>
                          {p.files && p.files.length > 0 && (
                            <span className="text-xs text-blue-500 flex items-center gap-1"><Paperclip size={10} />{p.files.length}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 italic">{t('paymentForm.no_payments_yet')}</p>
                  )}

                  {/* Summary */}
                  <div className="bg-white rounded-lg p-3 border border-emerald-200 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">{t('paymentForm.total_paid')}</span>
                      <span className="font-bold text-emerald-600">{formatCurrency(totalPaid)}</span>
                    </div>
                    {totalCoursePrice > 0 && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">{t('paymentForm.course_price')}</span>
                          <span className="font-medium">{formatCurrency(totalCoursePrice)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">{t('paymentForm.remaining_debt')}</span>
                          <span className={`font-bold ${totalCoursePrice - totalPaid > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                            {formatCurrency(Math.max(0, totalCoursePrice - totalPaid))}
                          </span>
                        </div>
                        {/* Progress bar */}
                        <div className="mt-2">
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${Math.min(100, (totalPaid / totalCoursePrice) * 100)}%` }} />
                          </div>
                          <div className="text-xs text-slate-400 mt-1 text-right">
                            {Math.round((totalPaid / totalCoursePrice) * 100)}% {t('paymentForm.paid_percent')}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* ═══ NEW SALE MODE: full form ═══ */}
              {/* Section: Client Info */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('paymentForm.client_info')}</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.select_from_db')}</label>
                    <select value={form.studentId} onChange={(e) => set('studentId', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">{t('paymentForm.or_new_client')}</option>
                      {branchStudents.map(s => (
                        <option key={s.id} value={s.id}>{s.name} — {s.course} ({s.group})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_fullname')}</label>
                    <input type="text" value={form.clientName} onChange={(e) => set('clientName', e.target.value)} required
                      placeholder={t('paymentForm.placeholder_fullname')}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_phone')}</label>
                    <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} required
                      placeholder={t('paymentForm.placeholder_phone')}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>

              {/* Section: Course & Group */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('paymentForm.payment_details')}</h4>
                <div className="grid grid-cols-2 gap-3">
                  {/* Course selection */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_course')} *</label>
                    <select value={form.course} onChange={(e) => {
                      set('course', e.target.value)
                      // Reset tariff if not available for this course
                      const c = courses.find(cr => cr.name === e.target.value)
                      const r = form.learningFormat === 'Онлайн' ? 'online' : (BRANCH_TO_REGION[form.branch] || 'tashkent')
                      if (c?.pricing?.[r] && !c.pricing[r][form.tariff]) {
                        const firstTariff = Object.keys(c.pricing[r])[0]
                        if (firstTariff) set('tariff', firstTariff)
                      }
                    }} required
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Выберите курс —</option>
                      {courses.map(c => (
                        <option key={c.id || c.name} value={c.name}>{c.icon || '📚'} {c.name} ({c.duration || '—'})</option>
                      ))}
                    </select>
                  </div>

                  {/* Branch (affects pricing per region) */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_branch')} *</label>
                    <select value={form.branch} onChange={(e) => {
                      const newBranch = e.target.value
                      set('branch', newBranch)
                      // Reset tariff if not available for new region
                      const c = courses.find(cr => cr.name === form.course)
                      const r = form.learningFormat === 'Онлайн' ? 'online' : (BRANCH_TO_REGION[newBranch] || 'tashkent')
                      if (c?.pricing?.[r] && !c.pricing[r][form.tariff]) {
                        const firstTariff = Object.keys(c.pricing[r])[0]
                        if (firstTariff) set('tariff', firstTariff)
                      }
                    }} required
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {BRANCH_OPTIONS.map(b => (
                        <option key={b.slug} value={b.slug}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Format */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_format')}</label>
                    <select value={form.learningFormat} onChange={(e) => set('learningFormat', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {FORMAT_OPTIONS.map(f => <option key={f.value} value={f.value}>{t(f.tKey)}</option>)}
                    </select>
                  </div>

                  {/* Tariff */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_tariff')}</label>
                    <select value={form.tariff} onChange={(e) => set('tariff', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {availableTariffs.map(tf => <option key={tf.value} value={tf.value}>{tf.tKey ? t(tf.tKey) : (tf.label || tf.value)}</option>)}
                    </select>
                  </div>

                  {/* Discount */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_discount')}</label>
                    <select value={form.discount} onChange={(e) => set('discount', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {availableDiscounts.map(d => <option key={d.value} value={d.value}>{t(d.tKey)}</option>)}
                    </select>
                  </div>

                  {/* Auto-calculated price display */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.calculated_price')}</label>
                    <div className={`w-full px-3 py-2 rounded-lg text-sm font-bold ${courseFullPrice > 0 ? 'bg-blue-50 border border-blue-200 text-blue-700' : 'bg-slate-100 border border-slate-200 text-slate-400'}`}>
                      {courseFullPrice > 0 ? formatCurrency(courseFullPrice) : t('paymentForm.calculated_price')}
                    </div>
                  </div>

                  {/* Group selection */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_group')} *</label>
                    <select value={form.groupId} onChange={(e) => set('groupId', e.target.value)} required
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">{t('paymentForm.select_group')}</option>
                      {branchGroups
                        .filter(g => !form.course || g.course === form.course)
                        .map(g => (
                          <option key={g.id} value={g.id}>{g.name} — {g.course} ({g.schedule || 'без расписания'})</option>
                        ))}
                    </select>
                  </div>

                  {form.groupId && (() => {
                    const selectedGroup = groups.find(g => g.id === form.groupId)
                    const groupCourse = selectedGroup ? courses.find(c => c.name === selectedGroup.course) : null
                    return selectedGroup ? (
                      <div className="col-span-2 bg-white rounded-lg p-3 border border-blue-100 text-sm space-y-1">
                        <div className="flex justify-between"><span className="text-slate-500">{t('paymentForm.course_label')}</span><span className="font-medium">{selectedGroup.course}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">{t('paymentForm.label_schedule')}:</span><span className="font-medium">{selectedGroup.schedule || '—'}</span></div>
                        {selectedGroup.startDate && <div className="flex justify-between"><span className="text-slate-500">Дата старта:</span><span className="font-medium">{selectedGroup.startDate}</span></div>}
                        {groupCourse?.duration && <div className="flex justify-between"><span className="text-slate-500">Длительность:</span><span className="font-medium">{groupCourse.duration} мес</span></div>}
                        <div className="flex justify-between"><span className="text-slate-500">{t('paymentForm.label_branch')}:</span><span className="font-medium">{branches.find(b => b.id === selectedGroup.branch)?.name || selectedGroup.branch}</span></div>
                      </div>
                    ) : null
                  })()}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Номер договора</label>
                    <input type="text" value={form.contractNumber} onChange={(e) => set('contractNumber', e.target.value)}
                      placeholder="25/03"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>

              {/* Section: Contract / Shartnoma Info */}
              <div className="bg-purple-50 rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Данные для договора (Шартнома)</h4>

                {/* Template selector (custom tenant templates) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Шаблон договора</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {isDefaultTenant && <option value="">Стандартный INTERNO</option>}
                    {!isDefaultTenant && customTemplates.length === 0 && (
                      <option value="">— Шаблон не загружен —</option>
                    )}
                    {customTemplates.map(tpl => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name}{tpl.isDefault ? ' (по умолчанию)' : ''}
                      </option>
                    ))}
                  </select>
                  {customTemplates.length === 0 && (
                    <p className="text-xs text-slate-500 mt-1">
                      {isDefaultTenant
                        ? 'Чтобы добавить свои шаблоны, перейдите в «Шаблоны договоров» в меню.'
                        : 'Загрузите шаблон договора вашей школы в разделе «Шаблоны договоров» — без него договор не будет сформирован.'}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_passport')}</label>
                    <input type="text" value={form.passport} onChange={(e) => set('passport', e.target.value)}
                      placeholder="AD 1234567"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_duration_months')}</label>
                    <input type="number" min="1" max="24" value={form.durationMonths} onChange={(e) => set('durationMonths', e.target.value)}
                      placeholder="3"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Дата старта курса</label>
                    <input type="date" value={form.courseStartDate} onChange={(e) => set('courseStartDate', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_schedule')}</label>
                    <input type="text" value={form.schedule} onChange={(e) => set('schedule', e.target.value)}
                      placeholder={t('paymentForm.placeholder_schedule')}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                </div>

                {/* ─── Three-party contract toggle ─── */}
                <div className="mt-3 pt-3 border-t border-purple-200">
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!form.isCompanyPayer}
                      onChange={(e) => set('isCompanyPayer', e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Трёхсторонний договор</div>
                      <div className="text-xs text-slate-500">За студента оплачивает компания. В договоре будут три стороны: Исполнитель, Заказчик, Плательщик.</div>
                    </div>
                  </label>

                  {form.isCompanyPayer && (
                    <div className="mt-3 rounded-lg border border-purple-300 bg-white p-3 space-y-3">
                      <h5 className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Плательщик (компания)</h5>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-700 mb-1">Наименование компании *</label>
                          <input type="text" value={form.payerCompanyName} onChange={(e) => set('payerCompanyName', e.target.value)}
                            placeholder='ООО "Название"'
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">ИНН / STIR</label>
                          <input type="text" value={form.payerCompanyInn} onChange={(e) => set('payerCompanyInn', e.target.value)}
                            placeholder="123 456 789"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Телефон</label>
                          <input type="tel" value={form.payerCompanyPhone} onChange={(e) => set('payerCompanyPhone', e.target.value)}
                            placeholder="+998 __ ___ __ __"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-700 mb-1">Юридический адрес</label>
                          <input type="text" value={form.payerCompanyAddress} onChange={(e) => set('payerCompanyAddress', e.target.value)}
                            placeholder="г. Ташкент, ул. ..."
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Директор (ФИО, должность)</label>
                          <input type="text" value={form.payerCompanyDirector} onChange={(e) => set('payerCompanyDirector', e.target.value)}
                            placeholder="Иванов И.И., ген. директор"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Банковские реквизиты</label>
                          <input type="text" value={form.payerCompanyBank} onChange={(e) => set('payerCompanyBank', e.target.value)}
                            placeholder="р/с, банк, МФО"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ═══ SHARED: Payment Info (both modes) ═══ */}
          <div className="bg-emerald-50 rounded-lg p-4 space-y-3">
            <h4 className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Информация об оплате</h4>

            {/* Show previous tranches info — only in new sale mode */}
            {!isDoplata && form.studentId && studentPayments.length > 0 && (
              <div className="bg-white rounded-lg p-3 border border-emerald-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Предыдущие транши: <span className="font-semibold text-slate-700">{studentPayments.length}</span></span>
                  <span className="text-slate-500">Оплачено: <span className="font-semibold text-emerald-600">{formatCurrency(totalPaid)}</span></span>
                </div>
                {totalCoursePrice > 0 && (
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="text-slate-500">Стоимость курса: <span className="font-semibold">{formatCurrency(totalCoursePrice)}</span></span>
                    <span className="text-slate-500">Остаток: <span className={`font-semibold ${totalCoursePrice - totalPaid > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{formatCurrency(Math.max(0, totalCoursePrice - totalPaid))}</span></span>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_payment_date')} *</label>
                <input type="date" value={form.paymentDate} onChange={(e) => set('paymentDate', e.target.value)} required
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_method')} *</label>
                <select value={form.method} onChange={(e) => set('method', e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_amount')}</label>
                <input type="number" min="0" value={form.amount} onChange={(e) => set('amount', e.target.value)} required
                  placeholder="1 200 000"
                  className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.debt_after')}</label>
                <div className={`w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-semibold ${autoDebt > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {totalCoursePrice > 0 ? formatCurrency(autoDebt) : t('paymentForm.calculated_price')}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_next_payment')}</label>
                <input type="date" value={form.nextPaymentDate} onChange={(e) => set('nextPaymentDate', e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Транш №</label>
                <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700">
                  {studentPayments.length + 1}
                </div>
              </div>
            </div>
          </div>

          {/* ═══ SHARED: File Attachments — MANDATORY ═══ */}
          <div className={`rounded-lg p-4 space-y-3 ${files.length === 0 ? 'bg-red-50 border border-red-200' : 'bg-slate-50'}`}>
            <div className="flex items-center justify-between">
              <h4 className={`text-xs font-semibold uppercase tracking-wide ${files.length === 0 ? 'text-red-600' : 'text-slate-500'}`}>
                {t('paymentForm.label_files')} *
              </h4>
              <span className={`text-xs font-medium ${files.length >= MAX_FILES ? 'text-amber-600' : 'text-slate-400'}`}>
                {files.length} / {MAX_FILES}
              </span>
            </div>
            <p className="text-xs text-slate-400">{t('paymentForm.max_file_size')}</p>

            <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx" onChange={handleFileAdd}
              className="hidden" />

            <button type="button" onClick={() => fileInputRef.current?.click()}
              disabled={files.length >= MAX_FILES}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-300 disabled:hover:text-slate-600">
              <Paperclip size={16} />
              {files.length >= MAX_FILES ? t('paymentForm.file_limit_reached_label') : t('paymentForm.attach_files')}
            </button>

            {files.length > 0 && (
              <div className="space-y-2">
                {files.map(f => (
                  <div key={f.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-200">
                    <div className="flex items-center gap-2 min-w-0">
                      {getFileIcon(f.type)}
                      <span className="text-sm text-slate-700 truncate">{f.name}</span>
                      <span className="text-xs text-slate-400 flex-shrink-0">{formatFileSize(f.size)}</span>
                    </div>
                    <button type="button" onClick={() => removeFile(f.id)} className="p-1 hover:bg-red-50 rounded transition-colors flex-shrink-0">
                      <X size={14} className="text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comment */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_comment')}</label>
            <textarea value={form.comment} onChange={(e) => set('comment', e.target.value)}
              rows={2} placeholder="Дополнительная информация..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
      ) : (
        /* Expense form — admin only */
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_branch')}</label>
            <select value={form.branch} onChange={(e) => set('branch', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_method')}</label>
            <select value={form.method} onChange={(e) => set('method', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_expense_desc')}</label>
            <input type="text" value={form.expenseDescription} onChange={(e) => set('expenseDescription', e.target.value)} required
              placeholder="Аренда, зарплата, оборудование..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Дата *</label>
            <input type="date" value={form.paymentDate} onChange={(e) => set('paymentDate', e.target.value)} required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentForm.label_amount')}</label>
            <input type="number" min="1000" value={form.amount} onChange={(e) => set('amount', e.target.value)} required
              placeholder="1 500 000"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      )}

      <div className="flex justify-between items-center pt-4 border-t border-slate-100">
        {form.type === 'income' && !isDoplata && (
          <button type="button" onClick={handleGenerateContract} disabled={generatingContract || !form.clientName}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-40">
            <FileDown size={16} />
            {generatingContract ? t('paymentForm.btn_generating') : t('paymentForm.btn_generate_contract')}
          </button>
        )}
        {(form.type !== 'income' || isDoplata) && <div />}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
            {t('paymentForm.btn_cancel')}
          </button>
          <button type="submit" disabled={submitting || (form.type === 'income' && (files.length === 0 || (isDoplata && !form.studentId)))}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${form.type === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
            {submitting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Receipt size={16} />
            )}
            {submitting
              ? 'Сохранение...'
              : form.type === 'income'
                ? (isDoplata && !form.studentId ? t('paymentForm.select_student') : files.length === 0 ? t('paymentForm.attach_files') : isDoplata ? t('paymentForm.btn_submit') : t('paymentForm.btn_submit'))
                : t('paymentForm.btn_submit_expense')}
          </button>
        </div>
      </div>
    </form>

    {/* Duplicate payment warning modal */}
    <Modal
      isOpen={!!duplicateWarning}
      onClose={() => setDuplicateWarning(null)}
      title="Возможный дубликат"
      size="md"
    >
      {duplicateWarning && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm text-amber-800 font-medium mb-1">
              ⚠ Найдено похожих продаж: {duplicateWarning.matches.length}
            </p>
            <p className="text-xs text-amber-700">
              Совпадает имя/телефон клиента, сумма и дата. Возможно, эта продажа уже была добавлена.
            </p>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {duplicateWarning.matches.map(p => (
              <div key={p.id} className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-slate-900">{p.student}</p>
                  <span className="text-sm font-bold text-emerald-600">{formatCurrency(p.amount)}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {p.date} · {p.method} · {p.course || '—'}
                  {p.createdByName ? ` · ${p.createdByName}` : ''}
                </p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setDuplicateWarning(null)}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => {
                bypassDuplicateRef.current = true
                setDuplicateWarning(null)
                handleSubmit({ preventDefault: () => {} })
              }}
              className="px-5 py-2 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
            >
              Всё равно добавить
            </button>
          </div>
        </div>
      )}
    </Modal>
    </>
  )
}
