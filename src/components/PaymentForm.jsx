import { useState, useEffect, useRef } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency } from '../data/mockData'
import { Receipt, Printer, Paperclip, X, FileText, Image } from 'lucide-react'

const METHODS = ['Наличные', 'Перевод', 'Карта']
const COURSES = ['Интерьер Дизайн', 'Английский', 'Подготовка к IELTS', 'Математика', 'IT/Программирование', 'Русский язык', 'Корейский язык', 'Подготовка к SAT', 'Робототехника']
const TARIFFS = ['Стандарт Тариф', 'Премиум Тариф', 'VIP Тариф', 'Онлайн', 'Оффлайн']

export default function PaymentForm({ onClose, preselectedStudentId }) {
  const { branches, students, payments, addPayment } = useData()
  const { user, hasPermission } = useAuth()

  const canExpenses = hasPermission('finance', 'expenses')
  const fileInputRef = useRef(null)

  const [form, setForm] = useState({
    type: 'income',
    studentId: preselectedStudentId ? String(preselectedStudentId) : '',
    clientName: '',
    phone: '',
    course: 'Интерьер Дизайн',
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
  })

  const [files, setFiles] = useState([])
  const [showReceipt, setShowReceipt] = useState(false)
  const [savedPayment, setSavedPayment] = useState(null)

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

  // Auto-fill from selected student
  useEffect(() => {
    if (form.studentId) {
      const student = students.find(s => s.id === Number(form.studentId))
      if (student) {
        setForm(prev => ({
          ...prev,
          clientName: student.name,
          phone: student.phone,
          course: student.course,
          contractNumber: student.contractNumber || prev.contractNumber,
        }))
      }
    }
  }, [form.studentId, students])

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

  const handleSubmit = (e) => {
    e.preventDefault()

    const paymentData = {
      type: form.type,
      student: form.type === 'income' ? form.clientName : form.expenseDescription,
      studentId: form.type === 'income' ? Number(form.studentId) || null : null,
      branch: form.branch,
      amount: Number(form.amount),
      method: form.method,
      date: form.paymentDate,
      course: form.course,
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
    setSavedPayment({ ...paymentData, id: saved.id })
    setShowReceipt(true)
  }

  const handlePrint = () => {
    window.print()
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
            <h4 className="text-lg font-bold text-slate-900">INTERNO School</h4>
            <p className="text-slate-500 text-xs">{branches.find(b => b.id === savedPayment.branch)?.name} — Квитанция об оплате</p>
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

        <div className="flex justify-end gap-3 pt-2">
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
      {/* Type selector — only show expense tab if user has permission */}
      {canExpenses ? (
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

          {/* Section: Course Info */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Информация о курсе</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Курс *</label>
                <select value={form.course} onChange={(e) => set('course', e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {COURSES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Старт курса</label>
                <input type="date" value={form.courseStartDate} onChange={(e) => set('courseStartDate', e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Формат обучения</label>
                <select value={form.learningFormat} onChange={(e) => set('learningFormat', e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="Оффлайн">Оффлайн</option>
                  <option value="Онлайн">Онлайн</option>
                  <option value="Гибрид">Гибрид</option>
                </select>
              </div>
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Филиал</label>
                <select value={form.branch} onChange={(e) => set('branch', e.target.value)}
                  disabled={user?.branch !== 'all'}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Section: Payment Info */}
          <div className="bg-emerald-50 rounded-lg p-4 space-y-3">
            <h4 className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Информация об оплате</h4>

            {/* Show previous tranches info */}
            {form.studentId && studentPayments.length > 0 && (
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

          {/* Section: File Attachments */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Прикрепить файлы</h4>
            <p className="text-xs text-slate-400">Договор, чек, фото оплаты или другие документы (макс. 10MB каждый)</p>

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

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
          Отмена
        </button>
        <button type="submit" className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors flex items-center gap-2 ${form.type === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
          <Receipt size={16} />
          {form.type === 'income' ? 'Принять оплату' : 'Записать расход'}
        </button>
      </div>
    </form>
  )
}
