import { useState, useEffect } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { AlertTriangle, Users, Wifi } from 'lucide-react'

const STATUSES = [
  { value: 'active', key: 'studentForm.status_active' },
  { value: 'debtor', key: 'studentForm.status_debtor' },
  { value: 'frozen', key: 'studentForm.status_frozen' },
]

const FORMATS = [
  { value: 'Оффлайн', key: 'studentForm.format_offline' },
  { value: 'Онлайн', key: 'studentForm.format_online' },
]

export default function StudentForm({ student, onClose }) {
  const { branches, groups, addStudent, updateStudent, getGroupOfflineCount } = useData()
  const { user } = useAuth()
  const { t } = useLanguage()
  const isEdit = !!student

  const [form, setForm] = useState({
    name: '',
    branch: user?.branch !== 'all' ? user.branch : branches[0]?.id || '',
    group: '',
    learningFormat: 'Оффлайн',
    phone: '',
    balance: 0,
    status: 'active',
    totalCoursePrice: '',
    contractNumber: '',
  })

  const [capacityWarning, setCapacityWarning] = useState('')

  useEffect(() => {
    if (student) {
      setForm({
        name: student.name,
        branch: student.branch,
        group: student.group || '',
        learningFormat: student.learningFormat || 'Оффлайн',
        phone: student.phone,
        balance: student.balance,
        status: student.status,
        totalCoursePrice: student.totalCoursePrice || '',
        contractNumber: student.contractNumber || '',
      })
    }
  }, [student])

  // Filter groups by selected branch
  const branchGroups = groups.filter(g => g.branch === form.branch && g.status !== 'archived')

  // Selected group object
  const selectedGroup = branchGroups.find(g => g.name === form.group)

  // Check capacity when group or format changes
  useEffect(() => {
    setCapacityWarning('')
    if (form.group && form.learningFormat === 'Оффлайн' && selectedGroup) {
      const currentOffline = getGroupOfflineCount(form.group)
      const adjustedCount = isEdit && student?.group === form.group && student?.learningFormat !== 'Онлайн'
        ? currentOffline - 1
        : currentOffline
      if (adjustedCount >= selectedGroup.maxOffline) {
        setCapacityWarning(t('studentForm.capacity_warning').replace('{current}', adjustedCount).replace('{max}', selectedGroup.maxOffline))
      }
    }
  }, [form.group, form.learningFormat, selectedGroup])

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleBranchChange = (branchId) => {
    setForm(prev => ({ ...prev, branch: branchId, group: '' }))
  }

  const handleGroupChange = (groupName) => {
    const grp = groups.find(g => g.name === groupName)
    setForm(prev => ({
      ...prev,
      group: groupName,
      course: grp?.course || prev.course,
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (capacityWarning && form.learningFormat === 'Оффлайн') return

    const data = {
      ...form,
      course: selectedGroup?.course || form.group,
      totalCoursePrice: Number(form.totalCoursePrice) || 0,
    }
    if (isEdit) {
      updateStudent(student.id, data)
    } else {
      addStudent({
        ...data,
        createdBy: user?.id || null,
        createdByName: user?.name || '',
        createdAt: new Date().toISOString(),
      })
    }
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('studentForm.label_fullname')}</label>
          <input type="text" value={form.name} onChange={e => set('name', e.target.value)} required
            placeholder={t('studentForm.placeholder_fullname')}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('studentForm.label_branch')}</label>
          <select value={form.branch} onChange={e => handleBranchChange(e.target.value)}
            disabled={user?.branch !== 'all'}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('studentForm.label_group')}</label>
          <select value={form.group} onChange={e => handleGroupChange(e.target.value)} required
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">{t('studentForm.select_group')}</option>
            {branchGroups.map(g => {
              const offCount = getGroupOfflineCount(g.name)
              const isFull = offCount >= g.maxOffline
              return (
                <option key={g.id} value={g.name}>
                  {g.name} — {g.course} ({offCount}/{g.maxOffline} офф){isFull ? ` ${t('studentForm.group_full')}` : ''}
                </option>
              )
            })}
          </select>
          {selectedGroup && (
            <div className="mt-1.5 flex items-center gap-3 text-[11px]">
              <span className="text-slate-500">{t('studentForm.label_course')} <span className="font-semibold text-slate-700">{selectedGroup.course}</span></span>
              <span className="text-slate-500">{t('studentForm.label_schedule')} <span className="font-semibold text-slate-700">{selectedGroup.schedule || '—'}</span></span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('studentForm.label_format')}</label>
          <div className="flex gap-2">
            {FORMATS.map(f => (
              <button key={f.value} type="button" onClick={() => set('learningFormat', f.value)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                  form.learningFormat === f.value
                    ? f.value === 'Оффлайн'
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-purple-50 border-purple-300 text-purple-700'
                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}>
                {f.value === 'Онлайн' ? <Wifi size={14} /> : <Users size={14} />}
                {t(f.key)}
              </button>
            ))}
          </div>
          {form.learningFormat === 'Онлайн' && (
            <p className="text-[10px] text-purple-500 mt-1">{t('studentForm.online_note')}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('studentForm.label_phone')}</label>
          <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} required
            placeholder={t('studentForm.placeholder_phone')}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {capacityWarning && (
          <div className="col-span-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">{capacityWarning}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('studentForm.label_course_price')}</label>
          <input type="number" value={form.totalCoursePrice} onChange={e => set('totalCoursePrice', e.target.value)}
            placeholder={t('studentForm.placeholder_course_price')}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('studentForm.label_contract')}</label>
          <input type="text" value={form.contractNumber} onChange={e => set('contractNumber', e.target.value)}
            placeholder={t('studentForm.placeholder_contract')}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('studentForm.label_balance')}</label>
          <input type="number" value={form.balance} onChange={e => set('balance', Number(e.target.value))}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('studentForm.label_status')}</label>
          <select value={form.status} onChange={e => set('status', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {STATUSES.map(s => <option key={s.value} value={s.value}>{t(s.key)}</option>)}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
          {t('studentForm.btn_cancel')}
        </button>
        <button type="submit"
          disabled={!!(capacityWarning && form.learningFormat === 'Оффлайн')}
          className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
            capacityWarning && form.learningFormat === 'Оффлайн'
              ? 'bg-slate-300 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}>
          {isEdit ? t('studentForm.btn_save') : t('studentForm.btn_add')}
        </button>
      </div>
    </form>
  )
}
