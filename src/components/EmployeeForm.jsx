import { useState, useEffect } from 'react'
import { useAuth, ROLE_LABELS, DEFAULT_PERMISSIONS } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useLanguage } from '../contexts/LanguageContext'
import { Shield, ChevronDown, ChevronUp } from 'lucide-react'

const ALL_ROLES = Object.entries(ROLE_LABELS)

const SECTION_LABELS = {
  dashboard: 'Дашборд', branches: 'Филиалы', students: 'Студенты',
  teachers: 'Учителя', courses: 'Курсы', finance: 'Финансы',
  employees: 'Сотрудники', attendance: 'Посещаемость', lms: 'LMS', settings: 'Настройки',
}
const ACTION_LABELS = {
  view: 'Просмотр', add: 'Добавление', edit: 'Редактирование', delete: 'Удаление',
  salaries: 'Зарплаты', fullPnL: 'Полная PnL', expenses: 'Расходы', payments: 'Продажи',
  mark: 'Отметка', create_content: 'Контент', grade: 'Оценки', manage: 'Управление',
}

export default function EmployeeForm({ employee, onClose }) {
  const { addEmployee, updateEmployee } = useAuth()
  const { branches, addTeacher, updateTeacher, teachers, deleteTeacher } = useData()
  const { t } = useLanguage()
  const BRANCHES = [{ id: 'all', name: t('employeeForm.all_branches') }, ...branches.map(b => ({ id: b.id, name: b.name }))]
  const isEdit = !!employee

  const [form, setForm] = useState({
    name: '',
    login: '',
    password: '',
    role: 'sales',
    branch: 'tashkent',
    phone: '',
    subject: '',
    salary: '',
  })
  const [customPermissions, setCustomPermissions] = useState(null) // null = use role defaults
  const [showPermissions, setShowPermissions] = useState(false)

  useEffect(() => {
    if (employee) {
      // If editing a teacher, find linked teacher record for subject/salary
      let subject = ''
      let salary = ''
      if (employee.role === 'teacher') {
        const linked = teachers.find(t => t.employeeId === employee.id || t.name === employee.name)
        if (linked) {
          subject = linked.subject || ''
          salary = linked.salary != null ? String(linked.salary) : ''
        }
      }
      setForm({
        name: employee.name || '',
        login: employee.login || '',
        password: employee.password || '',
        role: employee.role || 'sales',
        branch: employee.branch || 'tashkent',
        phone: employee.phone || '',
        subject,
        salary,
      })
      // Load individual custom permissions if they exist
      if (employee.customPermissions) {
        setCustomPermissions(employee.customPermissions)
        setShowPermissions(true)
      } else {
        setCustomPermissions(null)
      }
    }
  }, [employee])

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const { subject, salary, ...employeeData } = form

    // Attach individual permissions if customized
    if (customPermissions) {
      employeeData.customPermissions = customPermissions
    } else {
      employeeData.customPermissions = null
    }

    if (isEdit) {
      await updateEmployee(employee.id, employeeData)

      // Sync teacher record
      const linkedTeacher = teachers.find(t => t.employeeId === employee.id || t.name === employee.name)
      if (form.role === 'teacher') {
        const teacherData = {
          name: form.name,
          branch: form.branch,
          subject: subject || '',
          salary: Number(salary) || 0,
          employeeId: employee.id,
        }
        if (linkedTeacher) {
          await updateTeacher(linkedTeacher.id, teacherData)
        } else {
          await addTeacher({ ...teacherData, groups: 0, students: 0, rating: 0 })
        }
      } else if (linkedTeacher && employee.role === 'teacher') {
        // Role changed from teacher to something else — remove teacher record
        await deleteTeacher(linkedTeacher.id)
      }
    } else {
      const newEmp = await addEmployee(employeeData)
      // If new employee is a teacher, create teacher record
      if (form.role === 'teacher') {
        await addTeacher({
          name: form.name,
          branch: form.branch,
          subject: subject || '',
          salary: Number(salary) || 0,
          groups: 0,
          students: 0,
          rating: 0,
          employeeId: newEmp.id,
        })
      }
    }
    onClose()
  }

  // Roles that are typically company-wide
  const companyWideRoles = ['owner', 'admin', 'accountant', 'financier', 'hr', 'smm']
  const needsBranch = !companyWideRoles.includes(form.role)

  useEffect(() => {
    if (!needsBranch && form.branch !== 'all') {
      set('branch', 'all')
    }
    if (needsBranch && form.branch === 'all') {
      set('branch', 'tashkent')
    }
  }, [form.role])

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* ФИО */}
        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('employeeForm.label_fullname')}</label>
          <input type="text" value={form.name} onChange={e => set('name', e.target.value)} required
            placeholder={t('employeeForm.placeholder_fullname')}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Роль */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('employeeForm.label_role')}</label>
          <select value={form.role} onChange={e => set('role', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {ALL_ROLES.map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        {/* Филиал */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('employeeForm.label_branch')}</label>
          <select value={form.branch} onChange={e => set('branch', e.target.value)}
            disabled={!needsBranch}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60">
            {BRANCHES.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Логин */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('employeeForm.label_login')}</label>
          <input type="text" value={form.login} onChange={e => set('login', e.target.value)} required
            placeholder={t('employeeForm.placeholder_login')}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Пароль */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{isEdit ? t('employeeForm.label_password_edit') : t('employeeForm.label_password')}</label>
          <input type="text" value={form.password} onChange={e => set('password', e.target.value)}
            required={!isEdit} placeholder={isEdit ? t('employeeForm.placeholder_password_edit') : t('employeeForm.placeholder_password_new')}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Телефон */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('employeeForm.label_phone')}</label>
          <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
            placeholder={t('employeeForm.placeholder_phone')}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Teacher-specific fields */}
        {form.role === 'teacher' && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('employeeForm.label_subject')}</label>
              <input type="text" value={form.subject} onChange={e => set('subject', e.target.value)}
                placeholder={t('employeeForm.placeholder_subject')}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('employeeForm.label_salary')}</label>
              <input type="number" value={form.salary} onChange={e => set('salary', e.target.value)}
                placeholder={t('employeeForm.placeholder_salary')} min="0"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </>
        )}
      </div>

      {/* Individual permissions override */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <button type="button" onClick={() => setShowPermissions(!showPermissions)}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Shield size={16} className="text-blue-600" />
            Индивидуальные права доступа
          </div>
          <div className="flex items-center gap-2">
            {customPermissions && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Настроено</span>
            )}
            {showPermissions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </button>

        {showPermissions && (
          <div className="p-4 space-y-3 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">
                {customPermissions
                  ? 'Используются индивидуальные права (переопределяют роль)'
                  : `Используются стандартные права роли «${ROLE_LABELS[form.role]}»`}
              </p>
              {customPermissions ? (
                <button type="button" onClick={() => setCustomPermissions(null)}
                  className="text-xs text-red-600 hover:text-red-700 font-medium">
                  Сбросить
                </button>
              ) : (
                <button type="button" onClick={() => {
                  // Initialize custom permissions from current role defaults
                  const rolePerms = DEFAULT_PERMISSIONS[form.role] || {}
                  setCustomPermissions(JSON.parse(JSON.stringify(rolePerms)))
                }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  Настроить
                </button>
              )}
            </div>

            {customPermissions && (
              <div className="space-y-2">
                {Object.entries(SECTION_LABELS).map(([section, label]) => {
                  const perm = customPermissions[section]
                  const isBool = typeof perm === 'boolean' || perm === undefined || perm === null
                  const isEnabled = isBool ? !!perm : true

                  return (
                    <div key={section} className="bg-white border border-slate-100 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700">{label}</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" checked={isEnabled} onChange={() => {
                            setCustomPermissions(prev => {
                              const next = { ...prev }
                              if (isBool || !isEnabled) {
                                // Toggle entire section on/off
                                next[section] = !isEnabled
                              } else {
                                // Disable entire section
                                next[section] = false
                              }
                              return next
                            })
                          }} className="sr-only peer" />
                          <div className="w-9 h-5 bg-slate-200 peer-checked:bg-blue-600 rounded-full transition-colors
                            after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full
                            after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                        </label>
                      </div>

                      {/* Sub-actions if section has granular permissions */}
                      {isEnabled && typeof perm === 'object' && perm !== null && (
                        <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-2">
                          {Object.entries(perm).map(([action, val]) => (
                            <label key={action} className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={!!val} onChange={() => {
                                setCustomPermissions(prev => {
                                  const next = { ...prev }
                                  next[section] = { ...prev[section], [action]: !val }
                                  return next
                                })
                              }} className="w-3.5 h-3.5 rounded text-blue-600 border-slate-300 focus:ring-blue-500" />
                              <span className="text-xs text-slate-600">{ACTION_LABELS[action] || action}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      {/* When toggling ON a section that was boolean, offer to expand to granular */}
                      {isEnabled && isBool && perm === true && DEFAULT_PERMISSIONS[form.role]?.[section] && typeof DEFAULT_PERMISSIONS[form.role][section] === 'object' && (
                        <div className="mt-2 pt-2 border-t border-slate-100">
                          <button type="button" onClick={() => {
                            setCustomPermissions(prev => ({
                              ...prev,
                              [section]: JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS[form.role][section]))
                            }))
                          }} className="text-xs text-blue-600 hover:text-blue-700">
                            Настроить детально →
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info about role */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-700">
          <span className="font-semibold">{t('employeeForm.role_info_prefix')} «{ROLE_LABELS[form.role]}»:</span>{' '}
          {t(`employeeForm.role_desc_${form.role}`)}
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
          {t('employeeForm.btn_cancel')}
        </button>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          {isEdit ? t('employeeForm.btn_save') : t('employeeForm.btn_add')}
        </button>
      </div>
    </form>
  )
}
