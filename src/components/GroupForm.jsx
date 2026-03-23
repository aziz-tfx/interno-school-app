import { useState, useEffect } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'

export default function GroupForm({ group, onClose }) {
  const { branches, teachers, courses, addGroup, updateGroup } = useData()
  const { user } = useAuth()
  const { t } = useLanguage()
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
    startDate: '',
    room: '',
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
        startDate: group.startDate || '',
        room: group.room || '',
      })
    }
  }, [group])

  // Auto-calculate endDate from startDate + course duration
  const selectedCourse = courses.find(c => c.name === form.course)
  const courseDuration = selectedCourse?.duration ? parseInt(selectedCourse.duration) : 0
  const endDate = form.startDate && courseDuration
    ? (() => {
        const d = new Date(form.startDate)
        d.setMonth(d.getMonth() + courseDuration)
        return d.toISOString().split('T')[0]
      })()
    : ''

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  // Filter teachers by selected branch
  const branchTeachers = teachers.filter(t => t.branch === form.branch)

  const handleSubmit = (e) => {
    e.preventDefault()
    const data = {
      ...form,
      teacherId: form.teacherId ? Number(form.teacherId) : null,
      maxOffline: Number(form.maxOffline) || 15,
      endDate: endDate || null,
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
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('groupForm.label_name')}</label>
          <input type="text" value={form.name} onChange={e => set('name', e.target.value)} required
            placeholder={t('groupForm.placeholder_name')}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('groupForm.label_branch')}</label>
          <select value={form.branch} onChange={e => { set('branch', e.target.value); set('teacherId', '') }}
            disabled={user?.branch !== 'all'}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('groupForm.label_course')}</label>
          <select value={form.course} onChange={e => set('course', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {courseNames.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('groupForm.label_teacher')}</label>
          <select value={form.teacherId} onChange={e => set('teacherId', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">{t('groupForm.no_teacher')}</option>
            {branchTeachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.subject})</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('groupForm.label_max_offline')}</label>
          <input type="number" min="1" max="100" value={form.maxOffline} onChange={e => set('maxOffline', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p className="text-[10px] text-slate-400 mt-1">{t('groupForm.online_unlimited')}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Дата старта</label>
          <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Дата окончания</label>
          <input type="date" value={endDate} disabled
            className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-500" />
          {courseDuration > 0 && (
            <p className="text-[10px] text-slate-400 mt-1">Авто: {courseDuration} мес ({selectedCourse?.name})</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Кабинет</label>
          <input type="text" value={form.room} onChange={e => set('room', e.target.value)}
            placeholder="Кабинет 1"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('groupForm.label_schedule')}</label>
          <input type="text" value={form.schedule} onChange={e => set('schedule', e.target.value)}
            placeholder={t('groupForm.placeholder_schedule')}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {isEdit && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('groupForm.label_status')}</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="active">{t('groupForm.status_active')}</option>
              <option value="full">{t('groupForm.status_full')}</option>
              <option value="archived">{t('groupForm.status_archived')}</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
          {t('groupForm.btn_cancel')}
        </button>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          {isEdit ? t('groupForm.btn_save') : t('groupForm.btn_create')}
        </button>
      </div>
    </form>
  )
}
