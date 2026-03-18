import { useState, useEffect } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'

export default function GroupForm({ group, onClose }) {
  const { branches, teachers, courses, addGroup, updateGroup } = useData()
  const { user } = useAuth()
  const isEdit = !!group

  // Get course names from Firestore courses collection
  const courseNames = courses.map(c => c.name)

  const [form, setForm] = useState({
    name: '',
    branch: user?.branch !== 'all' ? user.branch : branches[0]?.id || '',
    course: courseNames[0] || '',
    teacherId: '',
    maxOffline: 15,
    schedule: '',
    status: 'active',
  })

  useEffect(() => {
    if (group) {
      setForm({
        name: group.name || '',
        branch: group.branch || '',
        course: group.course || '',
        teacherId: group.teacherId || '',
        maxOffline: group.maxOffline || 15,
        schedule: group.schedule || '',
        status: group.status || 'active',
      })
    }
  }, [group])

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  // Filter teachers by selected branch
  const branchTeachers = teachers.filter(t => t.branch === form.branch)

  const handleSubmit = (e) => {
    e.preventDefault()
    const data = {
      ...form,
      teacherId: form.teacherId ? Number(form.teacherId) : null,
      maxOffline: Number(form.maxOffline) || 15,
    }
    if (isEdit) {
      updateGroup(group.id, data)
    } else {
      addGroup(data)
    }
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Название группы *</label>
          <input type="text" value={form.name} onChange={e => set('name', e.target.value)} required
            placeholder="ENG-A1-01"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Филиал *</label>
          <select value={form.branch} onChange={e => { set('branch', e.target.value); set('teacherId', '') }}
            disabled={user?.branch !== 'all'}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Курс *</label>
          <select value={form.course} onChange={e => set('course', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {courseNames.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Учитель</label>
          <select value={form.teacherId} onChange={e => set('teacherId', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Не назначен —</option>
            {branchTeachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.subject})</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Макс. оффлайн учеников *</label>
          <input type="number" min="1" max="100" value={form.maxOffline} onChange={e => set('maxOffline', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p className="text-[10px] text-slate-400 mt-1">Онлайн учеников — без ограничений</p>
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Расписание</label>
          <input type="text" value={form.schedule} onChange={e => set('schedule', e.target.value)}
            placeholder="Пн/Ср/Пт 09:00-10:30"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {isEdit && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Статус</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="active">Активная</option>
              <option value="full">Набор закрыт (оффлайн)</option>
              <option value="archived">Архивная</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
          Отмена
        </button>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          {isEdit ? 'Сохранить' : 'Создать группу'}
        </button>
      </div>
    </form>
  )
}
