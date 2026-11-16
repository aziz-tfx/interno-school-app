import { useState, useEffect } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { toast } from './Toaster'
import { parseScheduleLine, groupSlots } from '../utils/roomGrid'
import { scheduleLine } from '../utils/roomSheet'

const WEEKDAYS = [
  { key: 'mon', label: 'Пн' },
  { key: 'tue', label: 'Вт' },
  { key: 'wed', label: 'Ср' },
  { key: 'thu', label: 'Чт' },
  { key: 'fri', label: 'Пт' },
  { key: 'sat', label: 'Сб' },
  { key: 'sun', label: 'Вс' },
]

// every half hour 07:00–23:00 (lessons start at 18:30, 19:30 …)
const TIME_PRESETS = Array.from({ length: 33 }, (_, i) => {
  const m = 7 * 60 + i * 30
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
})

const BRANCH_TO_REGION = {
  tashkent: 'tashkent',
  samarkand: 'fergana',
  fergana: 'fergana',
  bukhara: 'fergana',
  online: 'online',
}

export default function GroupForm({ group, onClose }) {
  const { branches, teachers, courses, rooms, groups, addGroup, updateGroup } = useData()
  const { user } = useAuth()
  const { t } = useLanguage()
  const isEdit = !!group

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
    format: 'offline',
    language: 'ru',
  })

  const [selectedDays, setSelectedDays] = useState([])
  const [timeFrom, setTimeFrom] = useState('14:00')
  const [timeTo, setTimeTo] = useState('16:00')
  const [errors, setErrors] = useState({})
  // the user changed days / time / room / format (not just the form loading the group)
  const [scheduleTouched, setScheduleTouched] = useState(false)
  const [saving, setSaving] = useState(false)

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
        format: group.format || 'offline',
        language: group.language || 'ru',
      })
      // Parse existing schedule into days/time ("Пн, Ср, Пт 18:30-20:30")
      const [first] = parseScheduleLine(group.schedule)
      if (first) {
        setTimeFrom(first.start)
        setTimeTo(first.end)
        if (first.days.length > 0) setSelectedDays(first.days)
      }
    }
  }, [group])

  // Auto-generate group name when course changes (only for new groups)
  useEffect(() => {
    if (isEdit) return
    if (!form.course) return

    // Count existing groups for this course to generate sequential number
    const courseGroups = groups.filter(g => g.course === form.course)
    const nextNum = String(courseGroups.length + 1).padStart(2, '0')

    // Build short course code: first letters of each word, uppercase
    const words = form.course.split(/\s+/)
    const code = words.length > 1
      ? words.map(w => w[0]?.toUpperCase()).filter(Boolean).join('')
      : form.course.substring(0, 3).toUpperCase()

    set('name', `${code}-${nextNum}`)
  }, [form.course, isEdit])

  // Auto-fill maxOffline when the user picks a room (not when an existing
  // group's data loads — that would overwrite its saved limit).
  const handleRoomChange = (roomId) => {
    const selectedRoom = rooms.find(r => r.id === roomId)
    setScheduleTouched(true)
    setForm(prev => ({
      ...prev,
      room: roomId,
      ...(selectedRoom?.capacity ? { maxOffline: selectedRoom.capacity } : {}),
    }))
    if (errors.room) setErrors(p => ({ ...p, room: null }))
  }

  // Build schedule string from selected days + time
  useEffect(() => {
    if (selectedDays.length === 0) return
    const dayLabels = WEEKDAYS.filter(d => selectedDays.includes(d.key)).map(d => d.label)
    const scheduleStr = `${dayLabels.join(', ')} ${timeFrom}-${timeTo}`
    set('schedule', scheduleStr)
  }, [selectedDays, timeFrom, timeTo])

  // Auto-calculate endDate from startDate + course duration (region-aware)
  const selectedCourse = courses.find(c => c.name === form.course)
  const region = BRANCH_TO_REGION[form.branch] || 'tashkent'
  const regionDuration = selectedCourse?.durationByRegion?.[region]
  const courseDuration = regionDuration
    ? parseInt(regionDuration)
    : (selectedCourse?.duration ? parseInt(selectedCourse.duration) : 0)
  const computedEndDate = form.startDate && courseDuration
    ? (() => {
        const d = new Date(form.startDate)
        d.setMonth(d.getMonth() + courseDuration)
        return d.toISOString().split('T')[0]
      })()
    : ''
  // A group's own end date (e.g. moved from the Google Sheet) stays until its
  // start date or course is changed here.
  const keepsOwnEnd = isEdit && group.endDate && form.startDate === (group.startDate || '') && form.course === (group.course || '')
  const endDate = keepsOwnEnd ? group.endDate : computedEndDate

  // Groups moved from the sheet may meet in several rooms / at several times
  const multiSlots = isEdit && Array.isArray(group.slots) && group.slots.length > 1 ? groupSlots(group) : null
  const slotsChanged = isEdit && scheduleTouched

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const branchTeachers = teachers.filter(t => t.branch === form.branch)
  const branchRooms = rooms.filter(r => r.branchId === form.branch)

  const toggleDay = (dayKey) => {
    setScheduleTouched(true)
    setSelectedDays(prev =>
      prev.includes(dayKey) ? prev.filter(d => d !== dayKey) : [...prev, dayKey]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return
    // ─── Required: start date always; room for offline/hybrid groups ───
    const nextErrors = {}
    if (!form.startDate) nextErrors.startDate = 'Укажите дату старта'
    // Online groups have no physical room; everything else needs one.
    if (form.format !== 'online' && !form.room) nextErrors.room = 'Выберите кабинет'
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }
    setErrors({})

    const data = {
      ...form,
      // numeric legacy ids stay numbers (compared with === elsewhere); string ids as-is (Number() made them NaN → null)
      teacherId: form.teacherId ? (/^\d+$/.test(String(form.teacherId)) ? Number(form.teacherId) : form.teacherId) : null,
      maxOffline: Number(form.maxOffline) || 15,
      endDate: endDate || null,
      // days / time / room changed here → the form's single slot replaces the sheet's slots;
      // untouched, a multi-slot group keeps its full schedule line
      ...(slotsChanged && group.slots ? { slots: null } : {}),
      ...(multiSlots && !slotsChanged ? { schedule: group.schedule } : {}),
    }
    setSaving(true)
    try {
      if (isEdit) {
        await updateGroup(group.id, data)
      } else {
        await addGroup(data)
      }
      onClose()
    } catch (err) {
      console.error('Group save failed:', err)
      toast.error('Не удалось сохранить группу. Попробуйте ещё раз.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">

        {/* Course — first, so name auto-generates */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('groupForm.label_course')}</label>
          <select value={form.course} onChange={e => set('course', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {courseNames.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Name — auto-generated, editable */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('groupForm.label_name')}</label>
          <input type="text" value={form.name} onChange={e => set('name', e.target.value)} required
            placeholder={t('groupForm.placeholder_name')}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {!isEdit && <p className="text-[10px] text-slate-400 mt-1">Авто из курса, можно изменить</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('groupForm.label_branch')}</label>
          <select value={form.branch} onChange={e => { set('branch', e.target.value); set('teacherId', ''); set('room', '') }}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
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
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('groupForm.label_format')}</label>
          <select value={form.format} onChange={e => { set('format', e.target.value); setScheduleTouched(true) }}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="offline">{t('groupForm.format_offline')}</option>
            <option value="online">{t('groupForm.format_online')}</option>
            <option value="hybrid">{t('groupForm.format_hybrid')}</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('groupForm.label_language')}</label>
          <select value={form.language} onChange={e => set('language', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="ru">{t('groupForm.lang_ru')}</option>
            <option value="uz">{t('groupForm.lang_uz')}</option>
            <option value="en">{t('groupForm.lang_en')}</option>
          </select>
        </div>

        {form.format !== 'online' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('groupForm.label_room')} <span className="text-red-500">*</span></label>
            <select value={form.room} onChange={e => handleRoomChange(e.target.value)}
              className={`w-full px-3 py-2 bg-slate-50 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.room ? 'border-red-400' : 'border-slate-200'}`}>
              <option value="">{t('groupForm.no_room')}</option>
              {branchRooms.map(r => (
                <option key={r.id} value={r.id}>{r.name} ({t('groupForm.capacity')}: {r.capacity})</option>
              ))}
            </select>
            {errors.room && <p className="text-[11px] text-red-500 mt-1">{errors.room}</p>}
            {!errors.room && branchRooms.length === 0 && (
              <p className="text-[10px] text-amber-500 mt-1">{t('groupForm.no_rooms_hint')}</p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('groupForm.label_max_offline')}</label>
          <input type="number" min="1" max="200" value={form.maxOffline} onChange={e => set('maxOffline', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {form.room && (
            <p className="text-[10px] text-slate-400 mt-1">Авто из кабинета, можно изменить</p>
          )}
          {!form.room && (
            <p className="text-[10px] text-slate-400 mt-1">{t('groupForm.online_unlimited')}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Дата старта <span className="text-red-500">*</span></label>
          <input type="date" value={form.startDate} onChange={e => { set('startDate', e.target.value); if (errors.startDate) setErrors(p => ({ ...p, startDate: null })) }}
            className={`w-full px-3 py-2 bg-slate-50 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.startDate ? 'border-red-400' : 'border-slate-200'}`} />
          {errors.startDate && <p className="text-[11px] text-red-500 mt-1">{errors.startDate}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Дата окончания</label>
          <input type="date" value={endDate} disabled
            className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-500" />
          {keepsOwnEnd ? (
            <p className="text-[10px] text-slate-400 mt-1">Из карточки группы; пересчитается при смене даты старта или курса</p>
          ) : courseDuration > 0 && (
            <p className="text-[10px] text-slate-400 mt-1">Авто: {courseDuration} мес ({selectedCourse?.name})</p>
          )}
        </div>

        {/* Schedule: day picker + time */}
        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-2">{t('groupForm.label_schedule')}</label>

          {multiSlots && (
            <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${slotsChanged ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
              <p className="font-medium">Сейчас у группы несколько слотов: {scheduleLine(multiSlots)}</p>
              <p className="mt-0.5">{slotsChanged
                ? 'Вы изменили дни, время или кабинет: после сохранения останется один слот из формы.'
                : 'Если изменить дни, время или кабинет, останется один слот из формы.'}</p>
            </div>
          )}

          {/* Day buttons */}
          <div className="flex gap-1.5 mb-3">
            {WEEKDAYS.map(day => (
              <button key={day.key} type="button" onClick={() => toggleDay(day.key)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedDays.includes(day.key)
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}>
                {day.label}
              </button>
            ))}
          </div>

          {/* Time range */}
          <div className="flex items-center gap-2">
            <select value={timeFrom} onChange={e => { setTimeFrom(e.target.value); setScheduleTouched(true) }}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {TIME_PRESETS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className="text-slate-400 text-sm">—</span>
            <select value={timeTo} onChange={e => { setTimeTo(e.target.value); setScheduleTouched(true) }}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {TIME_PRESETS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Preview */}
          {selectedDays.length > 0 && (
            <p className="text-xs text-blue-600 mt-2 bg-blue-50 px-2.5 py-1.5 rounded-lg inline-block">
              {WEEKDAYS.filter(d => selectedDays.includes(d.key)).map(d => d.label).join(', ')} {timeFrom}-{timeTo}
            </p>
          )}

          {/* Manual override */}
          {selectedDays.length === 0 && (
            <input type="text" value={form.schedule} onChange={e => { set('schedule', e.target.value); setScheduleTouched(true) }}
              placeholder="Пн, Ср, Пт 14:00-16:00"
              className="w-full mt-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          )}
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
        <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? 'Сохранение...' : isEdit ? t('groupForm.btn_save') : t('groupForm.btn_create')}
        </button>
      </div>
    </form>
  )
}
