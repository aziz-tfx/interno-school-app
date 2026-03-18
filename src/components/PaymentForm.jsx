import { useState, useEffect, useRef } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency } from '../data/mockData'
import { Receipt, Printer, Paperclip, X, FileText, Image, FileDown } from 'lucide-react'
import { generateContract } from '../utils/generateContract'
import { pushSaleToAmo } from '../utils/amocrm'
import { db } from '../firebase'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import Logo from './Logo'

const METHODS = ['Наличные', 'Payme', 'Click', 'Uzum']
const TARIFFS = ['Стандарт Тариф', 'Премиум Тариф', 'VIP Тариф', 'Онлайн', 'Оффлайн']

export default function PaymentForm({ onClose, preselectedStudentId, mode = 'new' }) {
  const isDoplata = mode === 'doplata'
  const { branches, students, payments, addPayment, groups } = useData()
  const { user, hasPermission } = useAuth()

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
    tariff: 'Стандарт Тариф',
    learningFormat: 'Оффлайн',
    comment: '',
    branch: user?.branch !== 'all' ? user.branch : 'tashkent',
    nextPaymentDate: '',
    expenseDescription: '',
    passport: '',
    durationMonths: '3',
    schedule: '',
  })

  const [files, setFiles] = useState([])
  const [showReceipt, setShowReceipt] = useState(false)
  const [savedPayment, setSavedPayment] = useState(null)
  const [generatingContract, setGeneratingContract] = useState(false)

  const branchStudents = students.filter(s =>
    user?.branch !== 'all' ? s.branch === user.branch : s.branch === form.branch
  )

  // Calculate student's previous payments and remaining debt
  const selectedStudent = form.studentId ? students.find(s => s.id === Number(form.studentId)) : null
  const studentPayments = form.studentId
    ? payments.filter(p => p.type === 'income' && p.studentId === Number(form.studentId))
    : []
  const totalPaid = studentPayments.reduce((sum, p) => sum + p.amount, 0)
  const totalCoursePrice = selectedStudent?.totalCoursePrice || 0
  const currentAmount = Number(form.amount) || 0
  const autoDebt = totalCoursePrice > 0 ? Math.max(0, totalCoursePrice - totalPaid - currentAmount) : 0

  // Filter groups by branch
  const branchGroups = groups.filter(g =>
    g.status !== 'archived' && (user?.branch !== 'all' ? g.branch === user.branch : g.branch === form.branch)
  )

  // Auto-fill from selected student
  useEffect(() => {
    if (form.studentId) {
      const student = students.find(s => s.id === Number(form.studentId))
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

  // Auto-fill from selected group
  useEffect(() => {
    if (form.groupId) {
      const group = groups.find(g => g.id === form.groupId)
      if (group) {
        setForm(prev => ({
          ...prev,
          course: group.course,
          schedule: group.schedule || prev.schedule,
          branch: group.branch || prev.branch,
        }))
      }
    }
  }, [form.groupId, groups])

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleFileAdd = (e) => {
    const selectedFiles = Array.from(e.target.files)
    selectedFiles.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        alert(`Файл "${file.name}" слишком большой (макс. 10MB)`)
        return
      }
      const reader = new FileReader()
      reader.onload = (ev) => {
        setFiles(prev => [...prev, {
          id: Date.now() + Math.random(),
          name: file.name,
          type: file.type,
          size: file.size,
          data: ev.target.result,
        }])
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

  const handleSubmit = async (e) => {
    e.preventDefault()

    const selectedGroup = groups.find(g => g.id === form.groupId)

    const paymentData = {
      type: form.type,
      student: form.type === 'income' ? form.clientName : form.expenseDescription,
      studentId: form.type === 'income' ? Number(form.studentId) || null : null,
      branch: form.branch,
      amount: Number(form.amount),
      method: form.method,
      date: form.paymentDate,
      course: form.course,
      group: selectedGroup?.name || '',
      courseStartDate: form.courseStartDate,
      debt: autoDebt,
      contractNumber: form.contractNumber,
      tariff: form.tariff,
      learningFormat: form.learningFormat,
      comment: form.comment,
      phone: form.phone,
      nextPaymentDate: form.nextPaymentDate,
      files: files.map(f => ({ id: f.id, name: f.name, type: f.type, size: f.size, data: f.data })),
      trancheNumber: studentPayments.length + 1,
      managerId: user?.managerId || null,
    }

    const saved = addPayment(paymentData)

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
          const docId = `${monthKey}_${managerName}_${day}`
          const dailyRef = doc(db, 'reportDaily', docId)
          const existing = await getDoc(dailyRef)
          const existingData = existing.exists() ? existing.data() : {}

          await setDoc(dailyRef, {
            monthKey,
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

    setSavedPayment({ ...paymentData, id: saved.id })
    setShowReceipt(true)

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
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleGenerateContract = async () => {
    setGeneratingContract(true)
    try {
      const payment = savedPayment || {}
      await generateContract({
        clientName: payment.student || form.clientName,
        passport: form.passport || '',
        phone: payment.phone || form.phone,
        course: payment.course || form.course,
        courseDetails: '',
        amount: payment.amount || Number(form.amount) || 0,
        tariff: payment.tariff || form.tariff,
        contractNumber: payment.contractNumber || form.contractNumber,
        contractDate: payment.date || form.paymentDate,
        courseStartDate: payment.courseStartDate || form.courseStartDate,
        durationMonths: Number(form.durationMonths) || 3,
        schedule: form.schedule || '',
        learningFormat: payment.learningFormat || form.learningFormat,
      })
    } catch (err) {
      console.error('Contract generation failed:', err)
      alert('Ошибка при генерации договора')
    }
    setGeneratingContract(false)
  }

  // ========== Receipt View ==========
  if (showReceipt && savedPayment) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-emerald-600 mb-2">
          <Receipt size={20} />
          <span className="font-semibold">Оплата записана успешно!</span>
        </div>

        <div id="payment-receipt" className="border border-slate-200 rounded-xl p-6 bg-white space-y-3 text-sm">
          <div className="text-center border-b border-slate-200 pb-3 mb-3">
            <Logo size="md" variant="dark" />
            <p className="text-slate-500 text-xs mt-1">{branches.find(b => b.id === savedPayment.branch)?.name} — Квитанция об оплате</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="text-slate-500">Дата оплаты:</div>
            <div className="font-medium">{savedPayment.date}</div>

            {savedPayment.courseStartDate && (
              <>
                <div className="text-slate-500">Старт курса:</div>
                <div className="font-medium">{savedPayment.courseStartDate}</div>
              </>
            )}

            <div className="text-slate-500">Имя клиента:</div>
            <div className="font-medium">{savedPayment.student}</div>

            <div className="text-slate-500">Группа:</div>
            <div className="font-medium">{savedPayment.group || '—'}</div>

            <div className="text-slate-500">Курс:</div>
            <div className="font-medium">{savedPayment.course}</div>

            <div className="text-slate-500">Вид оплаты:</div>
            <div className="font-medium">{savedPayment.method}</div>

            <div className="text-slate-500">Транш №:</div>
            <div className="font-medium">{savedPayment.trancheNumber}</div>

            <div className="text-slate-500">Сумма:</div>
            <div className="font-bold text-emerald-600">{formatCurrency(savedPayment.amount)}</div>

            {totalCoursePrice > 0 && (
              <>
                <div className="text-slate-500">Стоимость курса:</div>
                <div className="font-medium">{formatCurrency(totalCoursePrice)}</div>

                <div className="text-slate-500">Всего оплачено:</div>
                <div className="font-medium">{formatCurrency(totalPaid + savedPayment.amount)}</div>
              </>
            )}

            {savedPayment.debt > 0 && (
              <>
                <div className="text-slate-500">Остаток долга:</div>
                <div className="font-bold text-red-500">{formatCurrency(savedPayment.debt)}</div>
              </>
            )}

            {savedPayment.nextPaymentDate && (
              <>
                <div className="text-slate-500">Следующая оплата:</div>
                <div className="font-medium text-blue-600">{savedPayment.nextPaymentDate}</div>
              </>
            )}

            {savedPayment.contractNumber && (
              <>
                <div className="text-slate-500">Номер договора:</div>
                <div className="font-medium">{savedPayment.contractNumber}</div>
              </>
            )}

            {savedPayment.phone && (
              <>
                <div className="text-slate-500">Номер телефона:</div>
                <div className="font-medium">{savedPayment.phone}</div>
              </>
            )}

            {(savedPayment.learningFormat || savedPayment.tariff) && (
              <>
                <div className="text-slate-500">Формат:</div>
                <div className="font-medium">{savedPayment.learningFormat} ({savedPayment.tariff})</div>
              </>
            )}

            {savedPayment.comment && (
              <>
                <div className="text-slate-500">Комментарий:</div>
                <div className="font-medium">{savedPayment.comment}</div>
              </>
            )}
          </div>

          {savedPayment.files && savedPayment.files.length > 0 && (
            <div className="border-t border-slate-200 pt-3 mt-3">
              <p className="text-xs text-slate-500 mb-2">Прикреплённые файлы: {savedPayment.files.length}</p>
              <div className="flex flex-wrap gap-1">
                {savedPayment.files.map(f => (
                  <span key={f.id} className="text-xs bg-slate-100 px-2 py-1 rounded">{f.name}</span>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-dashed border-slate-300 pt-3 mt-3 text-center text-xs text-slate-400">
            Квитанция #{savedPayment.id} &middot; {new Date().toLocaleString('ru-RU')}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 flex-wrap">
          <button onClick={handleGenerateContract} disabled={generatingContract}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-700 bg-purple-100 rounded-lg hover:bg-purple-200 transition-colors disabled:opacity-50">
            <FileDown size={16} />
            {generatingContract ? 'Генерация...' : 'Скачать договор'}
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
            <Printer size={16} />
            Печать
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            Готово
          </button>
        </div>
      </div>
    )
  }

  // ========== Form View ==========
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type selector — only show expense tab if user has permission & not doplata */}
      {isDoplata ? (
        <div className="bg-blue-50 rounded-lg py-2.5 px-4 text-sm font-medium text-blue-700 text-center">
          Доплата по существующей продаже
        </div>
      ) : canExpenses ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => set('type', 'income')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${form.type === 'income' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'}`}>
            Оплата от ученика
          </button>
          <button type="button" onClick={() => set('type', 'expense')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${form.type === 'expense' ? 'bg-red-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'}`}>
            Расход
          </button>
        </div>
      ) : (
        <div className="bg-emerald-50 rounded-lg py-2.5 px-4 text-sm font-medium text-emerald-700 text-center">
          Оплата от ученика
        </div>
      )}

      {form.type === 'income' ? (
        <div className="space-y-4">

          {/* ═══ DOPLATA MODE: simplified — just pick student ═══ */}
          {isDoplata ? (
            <>
              {/* Student selector — required */}
              <div className="bg-blue-50 rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Выберите ученика для доплаты</h4>
                <select value={form.studentId} onChange={(e) => set('studentId', e.target.value)} required
                  className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Выберите ученика —</option>
                  {branchStudents.map(s => (
                    <option key={s.id} value={s.id}>{s.name} — {s.course} ({s.group})</option>
                  ))}
                </select>

                {/* Student info card */}
                {selectedStudent && (
                  <div className="bg-white rounded-lg p-3 border border-blue-100 text-sm space-y-1">
                    <div className="flex justify-between"><span className="text-slate-500">Ученик:</span><span className="font-semibold">{selectedStudent.name}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Курс:</span><span className="font-medium">{selectedStudent.course}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Группа:</span><span className="font-medium">{selectedStudent.group || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Телефон:</span><span className="font-medium">{selectedStudent.phone || '—'}</span></div>
                  </div>
                )}
              </div>

              {/* Tranche history */}
              {form.studentId && (
                <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    История оплат ({studentPayments.length} {studentPayments.length === 1 ? 'транш' : studentPayments.length < 5 ? 'транша' : 'траншей'})
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
                    <p className="text-sm text-slate-400 italic">Оплат пока нет</p>
                  )}

                  {/* Summary */}
                  <div className="bg-white rounded-lg p-3 border border-emerald-200 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Всего оплачено:</span>
                      <span className="font-bold text-emerald-600">{formatCurrency(totalPaid)}</span>
                    </div>
                    {totalCoursePrice > 0 && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Стоимость курса:</span>
                          <span className="font-medium">{formatCurrency(totalCoursePrice)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Остаток долга:</span>
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
                            {Math.round((totalPaid / totalCoursePrice) * 100)}% оплачено
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
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Информация о клиенте</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Выбрать из базы</label>
                    <select value={form.studentId} onChange={(e) => set('studentId', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Новый клиент —</option>
                      {branchStudents.map(s => (
                        <option key={s.id} value={s.id}>{s.name} — {s.course} ({s.group})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Имя клиента *</label>
                    <input type="text" value={form.clientName} onChange={(e) => set('clientName', e.target.value)} required
                      placeholder="Малика"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Номер телефона *</label>
                    <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} required
                      placeholder="+998 95 387 79 27"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>

              {/* Section: Group & Course */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Группа</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Выбрать группу *</label>
                    <select value={form.groupId} onChange={(e) => set('groupId', e.target.value)} required
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Выберите группу —</option>
                      {branchGroups.map(g => (
                        <option key={g.id} value={g.id}>{g.name} — {g.course} ({g.schedule || 'без расписания'})</option>
                      ))}
                    </select>
                  </div>
                  {form.groupId && (() => {
                    const selectedGroup = groups.find(g => g.id === form.groupId)
                    return selectedGroup ? (
                      <div className="col-span-2 bg-white rounded-lg p-3 border border-blue-100 text-sm space-y-1">
                        <div className="flex justify-between"><span className="text-slate-500">Курс:</span><span className="font-medium">{selectedGroup.course}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Расписание:</span><span className="font-medium">{selectedGroup.schedule || '—'}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Филиал:</span><span className="font-medium">{branches.find(b => b.id === selectedGroup.branch)?.name || selectedGroup.branch}</span></div>
                      </div>
                    ) : null
                  })()}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Тариф</label>
                    <select value={form.tariff} onChange={(e) => set('tariff', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {TARIFFS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Паспорт клиента</label>
                    <input type="text" value={form.passport} onChange={(e) => set('passport', e.target.value)}
                      placeholder="AD 1234567"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Срок обучения (мес.)</label>
                    <input type="number" min="1" max="24" value={form.durationMonths} onChange={(e) => set('durationMonths', e.target.value)}
                      placeholder="3"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Расписание</label>
                    <input type="text" value={form.schedule} onChange={(e) => set('schedule', e.target.value)}
                      placeholder="16:00 - 18:00, Пн/Ср/Пт"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Дата оплаты *</label>
                <input type="date" value={form.paymentDate} onChange={(e) => set('paymentDate', e.target.value)} required
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Вид оплаты *</label>
                <select value={form.method} onChange={(e) => set('method', e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Сумма оплаты (сум) *</label>
                <input type="number" min="0" value={form.amount} onChange={(e) => set('amount', e.target.value)} required
                  placeholder="1 200 000"
                  className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Остаток долга (авто)</label>
                <div className={`w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-semibold ${autoDebt > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {totalCoursePrice > 0 ? formatCurrency(autoDebt) : 'Укажите стоимость курса в профиле ученика'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Дата след. оплаты</label>
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
            <h4 className={`text-xs font-semibold uppercase tracking-wide ${files.length === 0 ? 'text-red-600' : 'text-slate-500'}`}>
              Чек об оплате * (обязательно)
            </h4>
            <p className="text-xs text-slate-400">Приложите скриншот или фото чека: Payme, Click, Uzum или наличные (макс. 10MB)</p>

            <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx" onChange={handleFileAdd}
              className="hidden" />

            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors w-full justify-center">
              <Paperclip size={16} />
              Добавить файл
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Комментарий</label>
            <textarea value={form.comment} onChange={(e) => set('comment', e.target.value)}
              rows={2} placeholder="Дополнительная информация..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
      ) : (
        /* Expense form — admin only */
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Филиал</label>
            <select value={form.branch} onChange={(e) => set('branch', e.target.value)}
              disabled={user?.branch !== 'all'}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Метод оплаты</label>
            <select value={form.method} onChange={(e) => set('method', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Описание расхода *</label>
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Сумма (сум) *</label>
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
            {generatingContract ? 'Генерация...' : 'Договор'}
          </button>
        )}
        {(form.type !== 'income' || isDoplata) && <div />}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
            Отмена
          </button>
          <button type="submit" disabled={form.type === 'income' && (files.length === 0 || (isDoplata && !form.studentId))}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${form.type === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
            <Receipt size={16} />
            {form.type === 'income'
              ? (isDoplata && !form.studentId ? 'Выберите ученика' : files.length === 0 ? 'Приложите чек' : isDoplata ? 'Записать доплату' : 'Принять оплату')
              : 'Записать расход'}
          </button>
        </div>
      </div>
    </form>
  )
}
