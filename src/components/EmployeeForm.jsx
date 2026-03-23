import { useState, useEffect } from 'react'
import { useAuth, ROLE_LABELS } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'

const ALL_ROLES = Object.entries(ROLE_LABELS)

export default function EmployeeForm({ employee, onClose }) {
  const { addEmployee, updateEmployee } = useAuth()
  const { branches, addTeacher, updateTeacher, teachers, deleteTeacher } = useData()
  const BRANCHES = [{ id: 'all', name: 'Все филиалы (центральный)' }, ...branches.map(b => ({ id: b.id, name: b.name }))]
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
    }
  }, [employee])

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const { subject, salary, ...employeeData } = form

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
          <label className="block text-sm font-medium text-slate-700 mb-1">ФИО сотрудника *</label>
          <input type="text" value={form.name} onChange={e => set('name', e.target.value)} required
            placeholder="Иванов Иван Иванович"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Роль */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Роль *</label>
          <select value={form.role} onChange={e => set('role', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {ALL_ROLES.map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        {/* Филиал */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Филиал *</label>
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
          <label className="block text-sm font-medium text-slate-700 mb-1">Логин *</label>
          <input type="text" value={form.login} onChange={e => set('login', e.target.value)} required
            placeholder="login123"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Пароль */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{isEdit ? 'Пароль' : 'Пароль *'}</label>
          <input type="text" value={form.password} onChange={e => set('password', e.target.value)}
            required={!isEdit} placeholder={isEdit ? 'Оставьте для сохранения текущего' : 'pass123'}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Телефон */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Телефон</label>
          <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
            placeholder="+998 90 123-45-67"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Teacher-specific fields */}
        {form.role === 'teacher' && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Предмет</label>
              <input type="text" value={form.subject} onChange={e => set('subject', e.target.value)}
                placeholder="Английский язык"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Зарплата (сум)</label>
              <input type="number" value={form.salary} onChange={e => set('salary', e.target.value)}
                placeholder="5000000" min="0"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </>
        )}
      </div>

      {/* Info about role */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-700">
          <span className="font-semibold">Роль «{ROLE_LABELS[form.role]}»:</span>{' '}
          {form.role === 'owner' && 'Полный доступ ко всем разделам и настройкам системы.'}
          {form.role === 'admin' && 'Полный доступ ко всем разделам, управление сотрудниками.'}
          {form.role === 'branch_director' && 'Управление филиалом: ученики, учителя, финансы, сотрудники.'}
          {form.role === 'rop' && 'Управление отделом продаж филиала, доступ к ученикам и платежам.'}
          {form.role === 'sales' && 'Работа с учениками и приём платежей в своём филиале.'}
          {form.role === 'accountant' && 'Полный доступ к финансам: P&L, расходы, поступления.'}
          {form.role === 'financier' && 'Доступ к финансовой отчётности и платежам.'}
          {form.role === 'hr' && 'Управление сотрудниками и учителями.'}
          {form.role === 'smm' && 'Просмотр учеников и курсов для маркетинговых целей.'}
          {form.role === 'teacher' && 'Просмотр учеников, курсов и ведение посещаемости.'}
          {form.role === 'student' && 'Просмотр своих курсов и посещаемости.'}
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
          Отмена
        </button>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          {isEdit ? 'Сохранить' : 'Добавить сотрудника'}
        </button>
      </div>
    </form>
  )
}
