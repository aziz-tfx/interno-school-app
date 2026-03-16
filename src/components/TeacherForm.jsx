import { useState, useEffect } from 'react'
import { useData } from '../contexts/DataContext'

const SUBJECTS = ['Английский', 'Математика', 'IT/Программирование', 'Русский язык', 'Корейский язык', 'IELTS', 'SAT', 'Робототехника']

export default function TeacherForm({ teacher, onClose }) {
  const { branches, addTeacher, updateTeacher } = useData()
  const isEdit = !!teacher

  const [form, setForm] = useState({
    name: '',
    branch: 'tashkent',
    subject: 'Английский',
    groups: 1,
    students: 0,
    salary: 7000000,
    rating: 4.5,
  })

  useEffect(() => {
    if (teacher) {
      setForm({
        name: teacher.name,
        branch: teacher.branch,
        subject: teacher.subject,
        groups: teacher.groups,
        students: teacher.students,
        salary: teacher.salary,
        rating: teacher.rating,
      })
    }
  }, [teacher])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (isEdit) {
      updateTeacher(teacher.id, form)
    } else {
      addTeacher(form)
    }
    onClose()
  }

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">ФИО учителя *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Филиал *</label>
          <select value={form.branch} onChange={(e) => set('branch', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Предмет *</label>
          <select value={form.subject} onChange={(e) => set('subject', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Кол-во групп</label>
          <input type="number" min="0" value={form.groups} onChange={(e) => set('groups', Number(e.target.value))}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Кол-во учеников</label>
          <input type="number" min="0" value={form.students} onChange={(e) => set('students', Number(e.target.value))}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Зарплата (сум)</label>
          <input type="number" min="0" step="100000" value={form.salary} onChange={(e) => set('salary', Number(e.target.value))}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Рейтинг</label>
          <input type="number" min="1" max="5" step="0.1" value={form.rating} onChange={(e) => set('rating', Number(e.target.value))}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
          Отмена
        </button>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          {isEdit ? 'Сохранить' : 'Добавить учителя'}
        </button>
      </div>
    </form>
  )
}
