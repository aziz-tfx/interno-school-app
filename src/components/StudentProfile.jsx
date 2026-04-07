import { useState } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency } from '../data/mockData'
import {
  User, Phone, BookOpen, Calendar, CreditCard, FileText,
  Image, Download, AlertTriangle, CheckCircle, Clock, Plus,
  ChevronDown, ChevronUp, Paperclip, Eye, Monitor, ToggleLeft, ToggleRight,
  FileDown, ExternalLink,
} from 'lucide-react'
import Modal from './Modal'
import PaymentForm from './PaymentForm'
import { useLanguage } from '../contexts/LanguageContext'
import { generateContract } from '../utils/generateContract'

export default function StudentProfile({ student, onClose }) {
  const { payments, branches, updateStudent } = useData()
  const { hasPermission } = useAuth()
  const { t } = useLanguage()
  const canPayments = hasPermission('finance', 'payments')

  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [expandedPayment, setExpandedPayment] = useState(null)
  const [viewingFile, setViewingFile] = useState(null)
  const [viewingContract, setViewingContract] = useState(null)
  const [generatingDocx, setGeneratingDocx] = useState(false)
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

  // Payments with contracts
  const contractPayments = studentPayments.filter(p => p.contractNumber)

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
            <span className="flex items-center gap-1"><Calendar size={13} />{t('studentProfile.since')} {student.startDate}</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{branchName}</span>
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">{student.group}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              student.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
              student.status === 'debtor' ? 'bg-red-100 text-red-700' :
              'bg-slate-100 text-slate-600'
            }`}>
              {student.status === 'active' ? t('studentProfile.status_active') : student.status === 'debtor' ? t('studentProfile.status_debtor') : t('studentProfile.status_frozen')}
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
            <p className="text-sm font-semibold text-slate-900">{t('studentProfile.lms_access')}</p>
            <p className="text-xs text-slate-500">
              {student.lmsAccess
                ? student.status === 'active' ? t('studentProfile.lms_active') : t('studentProfile.lms_blocked')
                : t('studentProfile.lms_inactive')}
            </p>
          </div>
        </div>
        {canPayments && (
          <button
            onClick={() => updateStudent(student.id, { lmsAccess: !student.lmsAccess })}
            className="flex-shrink-0"
            title={student.lmsAccess ? t('studentProfile.lms_disable') : t('studentProfile.lms_enable')}
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
            <p className="text-sm font-semibold text-blue-800">{t('studentProfile.lms_credentials')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-slate-500">{t('studentProfile.lms_login')}</span>
            <span className="font-mono font-bold text-slate-900">{student.lmsLogin}</span>
            <span className="text-slate-500">{t('studentProfile.lms_password')}</span>
            <span className="font-mono font-bold text-slate-900">{student.lmsPassword}</span>
          </div>
        </div>
      )}

      {/* Financial Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-500 mb-1">{t('studentProfile.course_price')}</p>
          {editingPrice ? (
            <div className="flex gap-1">
              <input type="number" value={coursePrice} onChange={(e) => setCoursePrice(e.target.value)}
                className="w-full px-2 py-1 border border-blue-300 rounded text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="7 200 000" autoFocus />
              <button onClick={handleSaveCoursePrice} className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">OK</button>
            </div>
          ) : (
            <p className="text-sm font-bold text-slate-900 cursor-pointer hover:text-blue-600" onClick={() => setEditingPrice(true)}>
              {totalCoursePrice > 0 ? formatCurrency(totalCoursePrice) : <span className="text-blue-500 text-xs">{t('studentProfile.click_to_set')}</span>}
            </p>
          )}
        </div>
        <div className="bg-emerald-50 rounded-lg p-3">
          <p className="text-xs text-emerald-600 mb-1">{t('studentProfile.total_paid')}</p>
          <p className="text-sm font-bold text-emerald-700">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-emerald-500">{studentPayments.length} транш(ей)</p>
        </div>
        <div className={`${remainingDebt > 0 ? 'bg-red-50' : 'bg-emerald-50'} rounded-lg p-3`}>
          <p className={`text-xs ${remainingDebt > 0 ? 'text-red-500' : 'text-emerald-600'} mb-1`}>{t('studentProfile.debt')}</p>
          <p className={`text-sm font-bold ${remainingDebt > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
            {totalCoursePrice > 0 ? formatCurrency(remainingDebt) : '—'}
          </p>
        </div>
        <div className={`${isOverdue ? 'bg-amber-50' : 'bg-blue-50'} rounded-lg p-3`}>
          <p className={`text-xs ${isOverdue ? 'text-amber-600' : 'text-blue-500'} mb-1`}>
            {isOverdue ? t('studentProfile.overdue') : t('studentProfile.next_payment')}
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
            <span>{t('studentProfile.course_payment')}</span>
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
          <h4 className="text-sm font-semibold text-slate-900">{t('studentProfile.payment_history')}</h4>
          {canPayments && (
            <button onClick={() => setPaymentModalOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors">
              <Plus size={14} />
              {t('studentProfile.new_tranche')}
            </button>
          )}
        </div>

        {studentPayments.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-lg">
            <CreditCard size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">{t('studentProfile.no_payments')}</p>
            {canPayments && (
              <button onClick={() => setPaymentModalOpen(true)}
                className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium">
                {t('studentProfile.add_first_tranche')}
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
                        <p className="text-xs text-slate-500">{p.method}{p.contractNumber ? ` · ${t('studentProfile.contract_label')} ${p.contractNumber}` : ''}</p>
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
                        <div className="text-slate-500">{t('studentProfile.payment_type')}</div>
                        <div className="font-medium">{p.method}</div>

                        {p.course && (
                          <>
                            <div className="text-slate-500">{t('studentProfile.course_label')}</div>
                            <div className="font-medium">{p.course}</div>
                          </>
                        )}

                        {p.tariff && (
                          <>
                            <div className="text-slate-500">{t('studentProfile.tariff_label')}</div>
                            <div className="font-medium">{p.learningFormat} ({p.tariff})</div>
                          </>
                        )}

                        {p.debt > 0 && (
                          <>
                            <div className="text-slate-500">{t('studentProfile.remaining_at_payment')}</div>
                            <div className="font-medium text-red-500">{formatCurrency(p.debt)}</div>
                          </>
                        )}

                        {p.nextPaymentDate && (
                          <>
                            <div className="text-slate-500">{t('studentProfile.next_payment_date')}</div>
                            <div className={`font-medium ${new Date(p.nextPaymentDate) < new Date() ? 'text-red-500' : 'text-blue-600'}`}>
                              {p.nextPaymentDate}
                              {new Date(p.nextPaymentDate) < new Date() && ` ${t('studentProfile.overdue_marker')}`}
                            </div>
                          </>
                        )}

                        {p.comment && (
                          <>
                            <div className="text-slate-500">{t('studentProfile.comment_label')}</div>
                            <div className="font-medium">{p.comment}</div>
                          </>
                        )}
                      </div>

                      {/* Attached files */}
                      {p.files && p.files.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-slate-500 uppercase">{t('studentProfile.attached_files')}</p>
                          {p.files.map(f => (
                            <div key={f.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-200">
                              <div className="flex items-center gap-2 min-w-0">
                                {getFileIcon(f.type)}
                                <span className="text-sm text-slate-700 truncate">{f.name}</span>
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                {f.type && f.type.startsWith('image/') && (
                                  <button onClick={() => setViewingFile(f)} className="p-1.5 hover:bg-blue-50 rounded transition-colors" title={t('studentProfile.view')}>
                                    <Eye size={14} className="text-blue-500" />
                                  </button>
                                )}
                                <a href={f.data} download={f.name} className="p-1.5 hover:bg-emerald-50 rounded transition-colors" title={t('studentProfile.download')}>
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
          <h4 className="text-sm font-semibold text-slate-900 mb-3">{t('studentProfile.all_documents')} ({allFiles.length})</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {allFiles.map(f => (
              <div key={f.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                <div className="flex items-center gap-2 min-w-0">
                  {getFileIcon(f.type)}
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 truncate">{f.name}</p>
                    <p className="text-xs text-slate-400">{t('studentProfile.tranche_label')} {f.tranche} · {f.paymentDate}</p>
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

      {/* Signed Contracts */}
      {contractPayments.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Договоры ({contractPayments.length})</h4>
          <div className="space-y-2">
            {contractPayments.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3 border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                    <FileText size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Шартнома №{p.contractNumber}</p>
                    <p className="text-xs text-slate-500">{p.date} · {p.course} · {formatCurrency(p.amount)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {p.signatureData && (
                    <button onClick={() => setViewingContract(p)}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors">
                      <ExternalLink size={12} /> Открыть
                    </button>
                  )}
                  <button onClick={async () => {
                    setGeneratingDocx(true)
                    try {
                      await generateContract({
                        clientName: p.student,
                        passport: p.passport || '',
                        phone: p.phone || '',
                        course: p.course,
                        amount: p.totalCoursePrice || p.amount,
                        tariff: p.tariff,
                        contractNumber: p.contractNumber,
                        contractDate: p.date,
                        courseStartDate: p.courseStartDate,
                        durationMonths: Number(p.durationMonths) || 3,
                        schedule: p.schedule || '',
                        learningFormat: p.learningFormat || '',
                        lang: p.contractLang || 'uz',
                      })
                    } catch (err) { console.error(err) }
                    setGeneratingDocx(false)
                  }}
                    disabled={generatingDocx}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
                    <FileDown size={12} /> .docx
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Close */}
      <div className="flex justify-end pt-4 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
          {t('studentProfile.close')}
        </button>
      </div>

      {/* New Payment Modal */}
      <Modal isOpen={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} title={t('studentProfile.new_tranche_modal')} size="lg">
        <PaymentForm
          onClose={() => setPaymentModalOpen(false)}
          preselectedStudentId={student.id}
        />
      </Modal>

      {/* File Preview Modal */}
      <Modal isOpen={!!viewingFile} onClose={() => setViewingFile(null)} title={viewingFile?.name || t('studentProfile.view')} size="xl">
        {viewingFile && viewingFile.type && viewingFile.type.startsWith('image/') && (
          <div className="flex justify-center">
            <img src={viewingFile.data} alt={viewingFile.name} className="max-w-full max-h-[70vh] rounded-lg" />
          </div>
        )}
      </Modal>

      {/* Contract View Modal */}
      <Modal isOpen={!!viewingContract} onClose={() => setViewingContract(null)} title={`${(viewingContract?.contractLang === 'ru' ? 'Договор' : 'Шартнома')} №${viewingContract?.contractNumber || ''}`} size="xl">
        {viewingContract && (() => {
          const isRu = viewingContract.contractLang === 'ru'
          return (
          <div className="bg-white p-6 space-y-3 text-sm leading-relaxed" style={{ fontFamily: 'Times New Roman, serif' }}>
            <h2 className="text-center font-bold text-base">{isRu ? 'ДОГОВОР' : 'SHARTNOMA'} №{viewingContract.contractNumber}</h2>
            <p className="text-center text-sm">{isRu ? 'Об оказании платных образовательных услуг' : "Pullik ta'lim xizmatlari ko'rsatish to'g'risida"}</p>
            <div className="flex justify-between text-sm">
              <span>{isRu ? 'г. Ташкент' : 'Toshkent shahri'}</span>
              <span>{viewingContract.date}</span>
            </div>
            <p className="text-justify">
              {isRu ? (
                <>ООО "Interno Edu", в лице генерального директора Тошпулатова А.А., действующего на основании Устава (далее – <b>"Исполнитель"</b>), с одной стороны, и <b>{viewingContract.student}</b>, паспорт <b>{viewingContract.passport || '___'}</b> (далее – <b>"Заказчик"</b>), с другой стороны, заключили настоящий договор о нижеследующем:</>
              ) : (
                <>"Interno Edu" MCHJ, Ustav asosida faoliyat yuritayotgan bosh direktor Toshpulatov A.A. (keyingi o'rinlarda – <b>"Bajaruvchi"</b>), bir tomondan, <b>{viewingContract.student}</b> va pasport <b>{viewingContract.passport || '___'}</b> (keyingi o'rinlarda – <b>"Buyurtmachi"</b>) ikkinchi tomondan, quyidagicha shartnoma tuzdilar:</>
              )}
            </p>

            <p><b>{isRu ? 'Предмет договора' : 'Shartnoma predmeti'}</b></p>
            <p className="text-justify">{isRu
              ? <>Исполнитель предоставляет учебные курсы по направлению "{viewingContract.course}" в формате групповых занятий, а Заказчик осуществляет оплату за данные услуги.</>
              : <>Bajaruvchi "{viewingContract.course}" yo'nalishi bo'yicha guruhli mashg'ulotlar tarzida o'quv kurslarini taqdim etadi, Buyurtmachi esa ushbu xizmatlar uchun to'lovni amalga oshiradi.</>
            }</p>
            <p>{isRu ? `Продолжительность учебной программы – ${viewingContract.durationMonths || 3} месяцев` : `Ta'lim dasturining davomiyligi – ${viewingContract.durationMonths || 3} oy`}</p>
            {viewingContract.courseStartDate && <p>{isRu ? 'Дата начала курса' : 'Kurs boshlanish sanasi'}: {viewingContract.courseStartDate}{viewingContract.schedule ? ` ( ${viewingContract.schedule} )` : ''}</p>}

            <p className="pt-1"><b>{isRu ? 'Права Исполнителя и Заказчика' : "Bajaruvchi va Buyurtmachining huquqlari"}</b></p>
            {isRu ? (<>
              <p className="text-justify">Исполнитель имеет право самостоятельно вести образовательный процесс, устанавливать систему оценивания, её форму, порядок и сроки промежуточной и итоговой аттестации (оценки).</p>
              <p className="text-justify">В случае невыполнения Заказчиком следующих учебных требований: невыполнение домашних заданий, нежелание участвовать в образовательном процессе, пропуск занятий без уважительных причин – Исполнитель имеет право прекратить выполнение своих обязательств по настоящему договору.</p>
              <p className="text-justify">Заказчик имеет право требовать от Исполнителя своевременного предоставления информации по вопросам надлежащего и качественного оказания услуг, указанных в разделе 1 настоящего договора.</p>
              <p className="text-justify">Кроме того, Заказчик имеет следующие права:</p>
              <p className="text-justify">-Обращаться к сотрудникам Исполнителя по вопросам учебного процесса на курсе;</p>
              <p className="text-justify">-Получать полную и достоверную информацию об уровне знаний в рамках изучаемой программы;</p>
              <p className="text-justify">-Пользоваться принадлежащими Исполнителю материалами и оборудованием, необходимыми для проведения учебного процесса во время занятий, указанных в учебном расписании;</p>
              <p className="text-justify">-Участвовать в культурных и коллективных мероприятиях, организованных Исполнителем.</p>
            </>) : (<>
              <p className="text-justify">Bajaruvchi ta'lim jarayonini mustaqil ravishda olib borish, baholash tizimi, shakli, tartibi va oraliq hamda yakuniy attestatsiya (baholash) muddatlarini belgilash huquqiga ega.</p>
              <p className="text-justify">Buyurtmachi quyidagi o'quv shartlarini bajarmagan taqdirda: uyga vazifa topshiriqlarini bajarmaslik, ta'lim jarayonida ishtirok etishga istak bildirmaslik, asosli sabablarsiz darslarni qoldirish – Bajaruvchi mazkur shartnoma bo'yicha o'z majburiyatlarini bajarishni to'xtatish huquqiga ega.</p>
              <p className="text-justify">Buyurtmachi Bajaruvchidan ushbu shartnomaning 1-bo'limida ko'rsatilgan xizmatlarni to'g'ri va sifatli bajarilishiga doir masalalar bo'yicha o'z vaqtida axborot berilishini talab qilish huquqiga ega.</p>
              <p className="text-justify">Shuningdek, Buyurtmachi quyidagi huquqlarga ega:</p>
              <p className="text-justify">-Kursdagi o'quv jarayoni bo'yicha Bajaruvchining xodimlariga murojaat qilish;</p>
              <p className="text-justify">-O'rganilayotgan dastur doirasidagi bilim darajasi haqida to'liq va ishonchli ma'lumot olish;</p>
              <p className="text-justify">-O'quv jadvalida belgilangan darslar davomida ta'lim jarayonini amalga oshirish uchun zarur bo'lgan Bajaruvchiga tegishli ashyolar va jihozlardan foydalanish;</p>
              <p className="text-justify">-Bajaruvchi tomonidan tashkil etilgan madaniy va jamoaviy tadbirlarda ishtirok etish.</p>
            </>)}

            <p className="pt-1"><b>{isRu ? 'Обязанности Исполнителя:' : "Bajaruvchining majburiyatlari:"}</b></p>
            {isRu ? (<>
              <p className="text-justify">Исполнитель обязан:</p>
              <p className="text-justify">Принять Заказчика на Курсы при выполнении условий приёма, установленных Исполнителем.</p>
              <p className="text-justify">Организовать и обеспечить качественное оказание услуг, указанных в разделе 1 настоящего договора, в соответствии с учебной программой, учебным планом и расписанием занятий, разработанными Исполнителем.</p>
              <p className="text-justify">Создать необходимые условия для освоения Заказчиком выбранной учебной программы:</p>
              <p className="text-justify">-вручить Заказчику сертификат установленного образца с указанием учебной программы, количества пройденных часов и степени освоения программы;</p>
              <p className="text-justify">-в случае досрочного завершения обучения Заказчиком — выдать справку о пройденных часах.</p>
              <p className="text-justify">-3.4. Исполнитель имеет право изменить дату начала курса, предварительно уведомив об этом Заказчика.</p>
              <p className="text-justify">-3.5. Использовать современные методы обучения, учебные материалы и технические средства в целях повышения эффективности образования.</p>
            </>) : (<>
              <p className="text-justify">Bajaruvchi quyidagilarga majbur:</p>
              <p className="text-justify">Bajaruvchi tomonidan belgilangan qabul shartlarini bajargan Buyurtmachini Kurslarga qabul qilish.</p>
              <p className="text-justify">Ushbu shartnomaning 1-bo'limida ko'rsatilgan xizmatlarni ta'lim dasturi, o'quv rejasi va Bajaruvchi tomonidan ishlab chiqilgan dars jadvaliga muvofiq ravishda tashkil qilish va sifatli bajarilishini ta'minlash.</p>
              <p className="text-justify">Buyurtmachi tanlagan ta'lim dasturini o'zlashtirishi uchun zarur sharoitlarni yaratish:</p>
              <p className="text-justify">-o'quv dasturi, o'tilgan soatlar soni va dasturni egallash darajasi ko'rsatilgan namunadagi sertifikatni Buyurtmachiga topshirish;</p>
              <p className="text-justify">-agar Buyurtmachi o'qishni belgilangan muddatdan oldin tugatsa — o'tilgan soatlar to'g'risida ma'lumotnoma berish.</p>
              <p className="text-justify">-3.4. Bajaruvchi kurs boshlanish sanasini o'zgartirish huquqiga ega, bu haqda Buyurtmachini oldindan xabardor qilgan holda.</p>
              <p className="text-justify">-3.5. Ta'lim samaradorligini oshirish maqsadida zamonaviy o'qitish uslublari, o'quv materiallari va texnik vositalardan foydalanish.</p>
            </>)}

            <p className="pt-1"><b>{isRu ? 'Обязанности Заказчика. Заказчик обязан:' : "Buyurtmachining majburiyatlari Buyurtmachi quyidagilarga majbur:"}</b></p>
            {isRu ? (<>
              <p className="text-justify">Своевременно осуществлять оплату за услуги, указанные в разделе 1 настоящего договора.</p>
              <p className="text-justify">Своевременно предоставить Исполнителю необходимые документы при зачислении на Курсы.</p>
              <p className="text-justify">При наличии уважительных причин неявки на занятия уведомить об этом Исполнителя.</p>
              <p className="text-justify">Проявлять уважение к преподавателям и учебно-вспомогательному персоналу Исполнителя.</p>
              <p className="text-justify">Регулярно посещать занятия, указанные в расписании.</p>
              <p className="text-justify mt-1">Соблюдать внутренние правила Исполнителя, учебную дисциплину и общепринятые нормы поведения, проявлять уважение к участникам курса.</p>
              <p className="text-justify">Принять на себя полную ответственность за утрату или повреждение имущества, принадлежащего Исполнителю.</p>
            </>) : (<>
              <p className="text-justify">Ushbu shartnomaning 1-bo'limida ko'rsatilgan xizmatlar uchun to'lovni o'z vaqtida amalga oshirish.</p>
              <p className="text-justify">Kurslarga qabul qilinishda Bajaruvchiga zarur hujjatlarni o'z vaqtida taqdim etish.</p>
              <p className="text-justify">Darslarga qatnashmaslik sabablari jiddiy bo'lsa, bu haqda Bajaruvchini xabardor qilish.</p>
              <p className="text-justify">Bajaruvchining o'qituvchilari va o'quv yordamchi xodimlariga hurmat bilan munosabatda bo'lish.</p>
              <p className="text-justify">Dars jadvalida ko'rsatilgan mashg'ulotlarda muntazam qatnashish.</p>
              <p className="text-justify mt-1">Bajaruvchining ichki tartib-qoidalariga, o'quv intizomiga va umumiy odob-axloq me'yorlariga rioya qilish, kurs ishtirokchilariga nisbatan hurmatni saqlash.</p>
              <p className="text-justify">Bajaruvchiga tegishli bo'lgan mol-mulkning yo'qolishi yoki shikastlanishi uchun to'liq javobgarlikni o'z zimmasiga olish.</p>
            </>)}

            <p className="pt-1"><b>{isRu ? 'Стоимость услуг' : 'Xizmatlar qiymati'}</b></p>
            <p className="text-justify">{isRu ? 'Стоимость образовательных услуг по настоящему договору устанавливается в согласованном порядке.' : "Ushbu shartnoma bo'yicha ta'lim xizmatlarining qiymati kelishilgan tartibda belgilanadi."}</p>
            <p className="text-justify">{isRu
              ? <>Общая сумма оплаты по договору составляет: <b>{formatCurrency(viewingContract.totalCoursePrice || viewingContract.amount)}</b> сум {viewingContract.tariff ? `( ${viewingContract.tariff} )` : ''}</>
              : <>Shartnoma bo'yicha umumiy to'lov summasi: <b>{formatCurrency(viewingContract.totalCoursePrice || viewingContract.amount)}</b> so'mni tashkil qiladi {viewingContract.tariff ? `( ${viewingContract.tariff} )` : ''}</>
            }</p>
            <p className="text-justify">{isRu ? 'Оплата производится Заказчиком через банк или в кассу учебного центра.' : "To'lov buyurtmachi tomonidan bank orqali yoki o'quv markazi kassasiga amalga oshiriladi."}</p>
            <p className="text-justify">{isRu ? 'Факт оплаты подтверждается квитанцией, выданной Исполнителем.' : "To'lov amalga oshirilgani Bajaruvchi tomonidan berilgan kvitansiya bilan tasdiqlanadi."}</p>

            <p className="pt-1"><b>{isRu ? 'Порядок сдачи и приёмки услуг' : "Xizmatlarni topshirish va qabul qilish tartibi"}</b></p>
            <p className="text-justify">{isRu ? 'По завершении оплаченного учебного периода и после защиты проекта Исполнитель вручает Заказчику сертификат об окончании учебного курса.' : "To'lov qilingan o'quv davri yakunlangandan so'ng va loyiha taqdimotidan keyin Bajaruvchi Buyurtmachiga o'quv kursini tamomlaganligi haqida sertifikat topshiradi."}</p>

            <p className="pt-1"><b>{isRu ? 'Порядок разрешения споров и ответственность сторон' : "Tomonlarning nizolarni hal etish tartibi va javobgarligi"}</b></p>
            <p className="text-justify">{isRu ? 'Споры и разногласия, возникшие между сторонами, разрешаются путём переговоров.' : "Tomonlar o'rtasida yuzaga kelgan nizolar va kelishmovchiliklar muzokaralar orqali hal qilinadi."}</p>
            <p className="text-justify">{isRu ? 'Споры, не урегулированные путём переговоров, передаются на рассмотрение в арбитражный суд по месту нахождения Исполнителя.' : "Muzokaralar natijasida hal etilmagan nizolar Bajaruvchi joylashgan hududdagi arbitraj sudiga ko'rib chiqishga yuboriladi."}</p>
            <p className="text-justify">{isRu ? 'В случае неисполнения или ненадлежащего исполнения условий договора стороны несут ответственность в соответствии с действующим законодательством Республики Узбекистан.' : "Shartnoma shartlariga amal qilinmasa yoki noto'g'ri bajarilsa, tomonlar O'zbekiston Respublikasi amaldagi qonunchiligiga muvofiq javobgar bo'ladi."}</p>

            <p className="pt-1"><b>{isRu ? 'Срок действия договора' : "Shartnomaning amal qilish muddati"}</b></p>
            <p className="text-justify">{isRu ? 'Настоящий договор вступает в силу с момента подписания обеими сторонами и действует до полного выполнения сторонами своих обязательств.' : "Ushbu shartnoma ikki tomon tomonidan imzolangan paytdan kuchga kiradi va tomonlar o'z majburiyatlarini to'liq bajargunga qadar amal qiladi."}</p>
            <p className="text-justify">{isRu ? 'Заказчик имеет право расторгнуть договор в любое время после окончания оплаченного учебного периода. Если Заказчик добровольно прекращает обучение до истечения установленного срока, оплаченные средства не возвращаются.' : "Buyurtmachi to'langan o'quv davri tugagach, istalgan vaqtda shartnomani bekor qilish huquqiga ega. Agar Buyurtmachi o'qishni belgilangan muddat tugamasidan oldin o'z ixtiyori bilan to'xtatsa, to'langan mablag' qaytarilmaydi."}</p>

            <p className="pt-1"><b>{isRu ? 'Заключительные положения' : 'Yakuniy qoidalar'}</b></p>
            <p className="text-justify">{isRu ? 'Настоящий договор составлен в двух экземплярах, по одному для каждой стороны. Оба экземпляра имеют одинаковую юридическую силу.' : "Ushbu shartnoma ikki nusxada tuzilgan bo'lib, har bir tomon uchun bittadan nusxasi mavjud. Har ikkala nusxa teng yuridik kuchga ega."}</p>

            {/* Signature Section */}
            <div className="grid grid-cols-2 gap-6 mt-8 pt-4 border-t border-slate-200">
              <div className="border border-slate-200 rounded-lg p-3">
                <p className="font-bold text-center mb-3">{isRu ? 'Исполнитель "Interno Edu"' : 'Bajaruvchi "Interno Edu"'}</p>
                <p className="text-xs text-slate-600">{isRu ? 'Адрес: г. Ташкент, Мирзо-Улугбекский район, ул. Хирмонтепа, дом 34Б' : "Manzil: Toshkent shahri, Mirzo Ulug'bek tumani, Xirmontepa ko'chasi, 34B-uy"}</p>
                <p className="text-xs text-slate-600">{isRu ? 'Расчётный счёт' : 'Hisob raqami'}: 2020 8000 7053 5951 4001</p>
                <p className="text-xs text-slate-600">{isRu ? 'Банк: АТБ "Ориент Финанс", МФО: 01071' : 'Bank: ATB "Orient Finans", MFO: 01071'}</p>
                <p className="text-xs text-slate-600">{isRu ? 'ИНН' : 'STIR (INN)'}: 308 290 853</p>
                <p className="text-xs text-slate-600">{isRu ? 'ОКЭД' : 'SOEID (OKED)'}: 85590</p>
                <p className="text-xs text-slate-600 mt-1">{isRu ? 'Телефон' : 'Telefon'}: +998 94 676 88 58</p>
                <div className="mt-3 pt-2 border-t border-slate-100">
                  <p className="text-xs text-slate-600">{isRu ? 'Генеральный директор' : 'Bosh direktor'}</p>
                  <p className="text-xs text-slate-600 font-medium">{isRu ? 'Тошпулатов А.А.' : 'Toshpulatov A.A.'}</p>
                </div>
              </div>
              <div className="border border-slate-200 rounded-lg p-3">
                <p className="font-bold text-center mb-3">{isRu ? 'Заказчик' : 'Buyurtmachi'}</p>
                <p className="text-xs font-medium">{viewingContract.student}</p>
                <p className="text-xs text-slate-600">{isRu ? 'Адрес' : 'Manzil'}: {isRu ? 'Ташкент' : 'Toshkent'}</p>
                <p className="text-xs text-slate-600">{isRu ? 'Паспорт' : 'Pasport'}: {viewingContract.passport || '___'}</p>
                <p className="text-xs text-slate-600">{isRu ? 'Тел' : 'Tel'}: {viewingContract.phone || '___'}</p>
                {viewingContract.signatureData ? (
                  <div className="mt-3 p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                    <img src={viewingContract.signatureData} alt="Imzo" className="h-14 object-contain mx-auto" />
                    <p className="text-xs text-emerald-600 font-semibold text-center mt-1">{isRu ? '✓ Электронная подпись поставлена' : "✓ Elektron imzo qo'yilgan"}</p>
                    {viewingContract.signedAt && (
                      <p className="text-[10px] text-emerald-500 text-center">{new Date(viewingContract.signedAt).toLocaleString('ru-RU')}</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 pt-2 border-t border-slate-100">
                    <p className="text-xs text-slate-400">_______________________</p>
                    <p className="text-xs">{viewingContract.student}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          )
        })()}
      </Modal>
    </div>
  )
}
