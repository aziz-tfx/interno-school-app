import { useState } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency } from '../data/mockData'
import {
  User, Phone, BookOpen, Calendar, CreditCard, FileText,
  Image, Download, AlertTriangle, CheckCircle, Clock, Plus,
  ChevronDown, ChevronUp, Paperclip, Eye, Monitor, ToggleLeft, ToggleRight,
} from 'lucide-react'
import Modal from './Modal'
import PaymentForm from './PaymentForm'

export default function StudentProfile({ student, onClose }) {
  const { payments, branches, updateStudent } = useData()
  const { hasPermission } = useAuth()
  const canPayments = hasPermission('finance', 'payments')

  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [expandedPayment, setExpandedPayment] = useState(null)
  const [viewingFile, setViewingFile] = useState(null)
  const [editingPrice, setEditingPrice] = useState(false)
  const [coursePrice, setCoursePrice] = useState(student.totalCoursePrice || '')

  // Get all payments for this student
  const studentPayments = payments
    .filter(p => p.type === 'income' && String(p.studentId) === String(student.id))
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  const totalPaid = studentPayments.reduce((sum, p) => sum + p.amount, 0)
  const totalCoursePrice = student.totalCoursePrice || 0
  const remainingDebt = totalCoursePrice > 0 ? Math.max(0, totalCoursePrice - totalPaid) : 0

  // Next payment date from latest payment
  const nextPaymentDate = studentPayments.find(p => p.nextPaymentDate)?.nextPaymentDate
  const isOverdue = nextPaymentDate && new Date(nextPaymentDate) < new Date()

  // All files from all payments
  const allFiles = studentPayments.flatMap(p =>
    (p.files || []).map(f => ({ ...f, paymentId: p.id, paymentDate: p.date, tranche: p.trancheNumber }))
  )

  const handleSaveCoursePrice = () => {
    updateStudent(student.id, { totalCoursePrice: Number(coursePrice) || 0 })
    setEditingPrice(false)
  }

  const getFileIcon = (type) => {
    if (type && type.startsWith('image/')) return <Image size={16} className="text-blue-500" />
    return <FileText size={16} className="text-orange-500" />
  }

  const branchName = branches.find(b => b.id === student.branch)?.name || student.branch

  return (
    <div className="space-y-6">
      {/* Student Header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
          {student.name.charAt(0)}
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-slate-900">{student.name}</h3>
          <div className="flex flex-wrap gap-3 mt-1 text-sm text-slate-500">
            <span className="flex items-center gap-1"><Phone size={13} />{student.phone}</span>
            <span className="flex items-center gap-1"><BookOpen size={13} />{student.course}</span>
            <span className="flex items-center gap-1"><Calendar size={13} />с {student.startDate}</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{branchName}</span>
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">{student.group}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              student.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
              student.status === 'debtor' ? 'bg-red-100 text-red-700' :
              'bg-slate-100 text-slate-600'
            }`}>
              {student.status === 'active' ? 'Активен' : student.status === 'debtor' ? 'Должник' : 'Заморожен'}
            </span>
          </div>
        </div>
      </div>

      {/* LMS Access Toggle */}
      <div className={`flex items-center justify-between rounded-xl p-4 ${student.lmsAccess ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${student.lmsAccess ? 'bg-emerald-100' : 'bg-red-100'}`}>
            <Monitor size={18} className={student.lmsAccess ? 'text-emerald-600' : 'text-red-500'} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Доступ к LMS</p>
            <p className="text-xs text-slate-500">
              {student.lmsAccess
                ? student.status === 'active' ? 'Активен — студент имеет доступ к курсу' : 'Выдан, но заблокирован из-за статуса'
                : 'Не активирован — выдаётся после первой оплаты'}
            </p>
          </div>
        </div>
        {canPayments && (
          <button
            onClick={() => updateStudent(student.id, { lmsAccess: !student.lmsAccess })}
            className="flex-shrink-0"
            title={student.lmsAccess ? 'Отключить доступ' : 'Включить доступ'}
          >
            {student.lmsAccess ? (
              <ToggleRight size={36} className="text-emerald-500 hover:text-emerald-600 transition-colors" />
            ) : (
              <ToggleLeft size={36} className="text-slate-300 hover:text-blue-500 transition-colors" />
            )}
          </button>
        )}
      </div>

      {/* LMS Credentials (if account exists) */}
      {student.lmsLogin && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Monitor size={16} className="text-blue-600" />
            <p className="text-sm font-semibold text-blue-800">Данные для входа в LMS</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-slate-500">Логин:</span>
            <span className="font-mono font-bold text-slate-900">{student.lmsLogin}</span>
            <span className="text-slate-500">Пароль:</span>
            <span className="font-mono font-bold text-slate-900">{student.lmsPassword}</span>
          </div>
        </div>
      )}

      {/* Financial Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-500 mb-1">Стоимость курса</p>
          {editingPrice ? (
            <div className="flex gap-1">
              <input type="number" value={coursePrice} onChange={(e) => setCoursePrice(e.target.value)}
                className="w-full px-2 py-1 border border-blue-300 rounded text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="7 200 000" autoFocus />
              <button onClick={handleSaveCoursePrice} className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">OK</button>
            </div>
          ) : (
            <p className="text-sm font-bold text-slate-900 cursor-pointer hover:text-blue-600" onClick={() => setEditingPrice(true)}>
              {totalCoursePrice > 0 ? formatCurrency(totalCoursePrice) : <span className="text-blue-500 text-xs">Нажмите чтобы указать</span>}
            </p>
          )}
        </div>
        <div className="bg-emerald-50 rounded-lg p-3">
          <p className="text-xs text-emerald-600 mb-1">Всего оплачено</p>
          <p className="text-sm font-bold text-emerald-700">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-emerald-500">{studentPayments.length} транш(ей)</p>
        </div>
        <div className={`${remainingDebt > 0 ? 'bg-red-50' : 'bg-emerald-50'} rounded-lg p-3`}>
          <p className={`text-xs ${remainingDebt > 0 ? 'text-red-500' : 'text-emerald-600'} mb-1`}>Дебиторка</p>
          <p className={`text-sm font-bold ${remainingDebt > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
            {totalCoursePrice > 0 ? formatCurrency(remainingDebt) : '—'}
          </p>
        </div>
        <div className={`${isOverdue ? 'bg-amber-50' : 'bg-blue-50'} rounded-lg p-3`}>
          <p className={`text-xs ${isOverdue ? 'text-amber-600' : 'text-blue-500'} mb-1`}>
            {isOverdue ? 'Просрочена!' : 'След. оплата'}
          </p>
          <p className={`text-sm font-bold ${isOverdue ? 'text-amber-700' : 'text-blue-700'}`}>
            {nextPaymentDate || '—'}
          </p>
          {isOverdue && <AlertTriangle size={12} className="text-amber-500 mt-0.5" />}
        </div>
      </div>

      {/* Progress Bar */}
      {totalCoursePrice > 0 && (
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Оплата курса</span>
            <span>{Math.min(100, Math.round((totalPaid / totalCoursePrice) * 100))}%</span>
          </div>
          <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${totalPaid >= totalCoursePrice ? 'bg-emerald-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(100, (totalPaid / totalCoursePrice) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Payment History (Tranches) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-slate-900">История оплат (транши)</h4>
          {canPayments && (
            <button onClick={() => setPaymentModalOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors">
              <Plus size={14} />
              Новый транш
            </button>
          )}
        </div>

        {studentPayments.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-lg">
            <CreditCard size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">Оплат ещё не было</p>
            {canPayments && (
              <button onClick={() => setPaymentModalOpen(true)}
                className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium">
                Добавить первый транш
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {studentPayments.map((p, idx) => {
              const isExpanded = expandedPayment === p.id
              return (
                <div key={p.id} className="border border-slate-200 rounded-lg overflow-hidden">
                  {/* Summary row */}
                  <button
                    onClick={() => setExpandedPayment(isExpanded ? null : p.id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {p.trancheNumber || studentPayments.length - idx}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{p.date}</p>
                        <p className="text-xs text-slate-500">{p.method}{p.contractNumber ? ` · Договор ${p.contractNumber}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-emerald-600">+{formatCurrency(p.amount)}</p>
                        {p.files && p.files.length > 0 && (
                          <span className="text-xs text-slate-400 flex items-center gap-0.5 justify-end">
                            <Paperclip size={10} /> {p.files.length}
                          </span>
                        )}
                      </div>
                      {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-slate-500">Вид оплаты:</div>
                        <div className="font-medium">{p.method}</div>

                        {p.course && (
                          <>
                            <div className="text-slate-500">Курс:</div>
                            <div className="font-medium">{p.course}</div>
                          </>
                        )}

                        {p.tariff && (
                          <>
                            <div className="text-slate-500">Тариф:</div>
                            <div className="font-medium">{p.learningFormat} ({p.tariff})</div>
                          </>
                        )}

                        {p.debt > 0 && (
                          <>
                            <div className="text-slate-500">Остаток на момент оплаты:</div>
                            <div className="font-medium text-red-500">{formatCurrency(p.debt)}</div>
                          </>
                        )}

                        {p.nextPaymentDate && (
                          <>
                            <div className="text-slate-500">Дата след. оплаты:</div>
                            <div className={`font-medium ${new Date(p.nextPaymentDate) < new Date() ? 'text-red-500' : 'text-blue-600'}`}>
                              {p.nextPaymentDate}
                              {new Date(p.nextPaymentDate) < new Date() && ' (просрочена)'}
                            </div>
                          </>
                        )}

                        {p.comment && (
                          <>
                            <div className="text-slate-500">Комментарий:</div>
                            <div className="font-medium">{p.comment}</div>
                          </>
                        )}
                      </div>

                      {/* Attached files */}
                      {p.files && p.files.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-slate-500 uppercase">Прикреплённые файлы</p>
                          {p.files.map(f => (
                            <div key={f.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-200">
                              <div className="flex items-center gap-2 min-w-0">
                                {getFileIcon(f.type)}
                                <span className="text-sm text-slate-700 truncate">{f.name}</span>
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                {f.type && f.type.startsWith('image/') && (
                                  <button onClick={() => setViewingFile(f)} className="p-1.5 hover:bg-blue-50 rounded transition-colors" title="Просмотр">
                                    <Eye size={14} className="text-blue-500" />
                                  </button>
                                )}
                                <a href={f.data} download={f.name} className="p-1.5 hover:bg-emerald-50 rounded transition-colors" title="Скачать">
                                  <Download size={14} className="text-emerald-600" />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* All Documents section */}
      {allFiles.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Все документы ({allFiles.length})</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {allFiles.map(f => (
              <div key={f.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                <div className="flex items-center gap-2 min-w-0">
                  {getFileIcon(f.type)}
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 truncate">{f.name}</p>
                    <p className="text-xs text-slate-400">Транш {f.tranche} · {f.paymentDate}</p>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {f.type && f.type.startsWith('image/') && (
                    <button onClick={() => setViewingFile(f)} className="p-1.5 hover:bg-blue-50 rounded transition-colors">
                      <Eye size={14} className="text-blue-500" />
                    </button>
                  )}
                  <a href={f.data} download={f.name} className="p-1.5 hover:bg-emerald-50 rounded transition-colors">
                    <Download size={14} className="text-emerald-600" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Close */}
      <div className="flex justify-end pt-4 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
          Закрыть
        </button>
      </div>

      {/* New Payment Modal */}
      <Modal isOpen={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} title="Новый транш оплаты" size="lg">
        <PaymentForm
          onClose={() => setPaymentModalOpen(false)}
          preselectedStudentId={student.id}
        />
      </Modal>

      {/* File Preview Modal */}
      <Modal isOpen={!!viewingFile} onClose={() => setViewingFile(null)} title={viewingFile?.name || 'Просмотр'} size="xl">
        {viewingFile && viewingFile.type && viewingFile.type.startsWith('image/') && (
          <div className="flex justify-center">
            <img src={viewingFile.data} alt={viewingFile.name} className="max-w-full max-h-[70vh] rounded-lg" />
          </div>
        )}
      </Modal>
    </div>
  )
}
