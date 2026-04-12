import { useState, useMemo } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import {
  Calendar, Plus, X, Save, Trash2, AlertTriangle,
  Users, MapPin, Clock, ChevronLeft, ChevronRight, Filter
} from 'lucide-react'

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABELS_RU = { mon: 'Пн', tue: 'Вт', wed: 'Ср', thu: 'Чт', fri: 'Пт', sat: 'Сб', sun: 'Вс' }
const DAY_LABELS_FULL_RU = { mon: 'Понедельник', tue: 'Вторник', wed: 'Среда', thu: 'Четверг', fri: 'Пятница', sat: 'Суббота', sun: 'Воскресенье' }

const TIME_SLOTS = []
for (let h = 8; h <= 21; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
}

const COLORS = [
  'bg-blue-100 border-blue-300 text-blue-800',
  'bg-emerald-100 border-emerald-300 text-emerald-800',
  'bg-purple-100 border-purple-300 text-purple-800',
  'bg-amber-100 border-amber-300 text-amber-800',
  'bg-rose-100 border-rose-300 text-rose-800',
  'bg-cyan-100 border-cyan-300 text-cyan-800',
  'bg-indigo-100 border-indigo-300 text-indigo-800',
  'bg-orange-100 border-orange-300 text-orange-800',
]

function getColorForGroup(groupId, allGroups) {
  const idx = allGroups.findIndex(g => g.id === groupId)
  return COLORS[idx % COLORS.length] || COLORS[0]
}

function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function isOverlap(start1, end1, start2, end2) {
  return timeToMinutes(start1) < timeToMinutes(end2) && timeToMinutes(end1) > timeToMinutes(start2)
}

function findConflicts(entry, existingEntries, editId) {
  const conflicts = []
  existingEntries.forEach(e => {
    if (e.id === editId) return
    if (e.dayOfWeek !== entry.dayOfWeek) return
    if (!isOverlap(entry.startTime, entry.endTime, e.startTime, e.endTime)) return
    if (entry.roomId && e.roomId && entry.roomId === e.roomId) {
      conflicts.push({ type: 'room', entry: e })
    }
    if (entry.teacherId && e.teacherId && String(entry.teacherId) === String(e.teacherId)) {
      conflicts.push({ type: 'teacher', entry: e })
    }
  })
  return conflicts
}

// ─── Schedule Entry Form Modal ────────────────��─────────────────────
function EntryFormModal({ entry, onSave, onClose, groups, teachers, rooms, branches, schedule, branchFilter }) {
  const [groupId, setGroupId] = useState(entry?.groupId || '')
  const [teacherId, setTeacherId] = useState(entry?.teacherId || '')
  const [roomId, setRoomId] = useState(entry?.roomId || '')
  const [dayOfWeek, setDayOfWeek] = useState(entry?.dayOfWeek || 'mon')
  const [startTime, setStartTime] = useState(entry?.startTime || '09:00')
  const [endTime, setEndTime] = useState(entry?.endTime || '10:30')
  const [saving, setSaving] = useState(false)

  const filteredGroups = branchFilter && branchFilter !== 'all'
    ? groups.filter(g => g.branch === branchFilter)
    : groups
  const filteredTeachers = branchFilter && branchFilter !== 'all'
    ? teachers.filter(t => t.branch === branchFilter)
    : teachers
  const filteredRooms = branchFilter && branchFilter !== 'all'
    ? rooms.filter(r => r.branch === branchFilter)
    : rooms

  const selectedGroup = groups.find(g => g.id === groupId)

  // Auto-set teacher when group selected
  const handleGroupChange = (gid) => {
    setGroupId(gid)
    const g = groups.find(g => g.id === gid)
    if (g?.teacherId) setTeacherId(String(g.teacherId))
  }

  const newEntry = { groupId, teacherId: String(teacherId), roomId, dayOfWeek, startTime, endTime }
  const conflicts = findConflicts(newEntry, schedule, entry?.id)

  const isValid = groupId && dayOfWeek && startTime && endTime &&
    timeToMinutes(endTime) > timeToMinutes(startTime) && conflicts.length === 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isValid) return
    setSaving(true)
    try {
      const group = groups.find(g => g.id === groupId)
      const teacher = teachers.find(t => String(t.id) === String(teacherId))
      const room = rooms.find(r => r.id === roomId)
      await onSave({
        groupId,
        groupName: group?.name || '',
        teacherId: String(teacherId),
        teacherName: teacher?.name || '',
        roomId: roomId || '',
        roomName: room?.name || '',
        branchId: group?.branch || branchFilter || '',
        courseName: group?.course || '',
        dayOfWeek,
        startTime,
        endTime,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">
            {entry ? 'Редактировать занятие' : 'Добавить занятие'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Group */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Группа *</label>
            <select value={groupId} onChange={e => handleGroupChange(e.target.value)} required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
              <option value="">Выберите группу</option>
              {filteredGroups.filter(g => g.status === 'active').map(g => (
                <option key={g.id} value={g.id}>{g.name} — {g.course}</option>
              ))}
            </select>
          </div>

          {/* Teacher */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Преподаватель</label>
            <select value={teacherId} onChange={e => setTeacherId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
              <option value="">Не указан</option>
              {filteredTeachers.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Room */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Кабинет</label>
            <select value={roomId} onChange={e => setRoomId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
              <option value="">Не указан</option>
              {filteredRooms.map(r => (
                <option key={r.id} value={r.id}>{r.name} {r.capacity ? `(${r.capacity} мест)` : ''}</option>
              ))}
            </select>
          </div>

          {/* Day of week */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">День недели *</label>
            <div className="flex gap-1.5">
              {DAYS.map(d => (
                <button key={d} type="button" onClick={() => setDayOfWeek(d)}
                  className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                    dayOfWeek === d
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>
                  {DAY_LABELS_RU[d]}
                </button>
              ))}
            </div>
          </div>

          {/* Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Начало *</label>
              <select value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Конец *</label>
              <select value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Time validation */}
          {startTime && endTime && timeToMinutes(endTime) <= timeToMinutes(startTime) && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertTriangle size={12} /> Время окончания должно быть позже начала
            </p>
          )}

          {/* Conflicts */}
          {conflicts.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1.5">
              <p className="text-xs font-semibold text-red-700 flex items-center gap-1">
                <AlertTriangle size={14} /> Обнаружены конф��икты:
              </p>
              {conflicts.map((c, i) => (
                <p key={i} className="text-xs text-red-600">
                  {c.type === 'room' ? '🏫 Кабинет занят' : '👨‍🏫 Преподаватель занят'}:
                  {' '}{c.entry.groupName} ({c.entry.startTime}–{c.entry.endTime})
                </p>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">
              Отмена
            </button>
            <button type="submit" disabled={!isValid || saving}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              <Save size={14} /> {entry ? 'Сохранить' : 'Добавить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Schedule Page ─────────────────────���───────────────────────
export default function Schedule() {
  const { t } = useLanguage()
  const { user, hasPermission } = useAuth()
  const { groups, teachers, rooms, branches, students, schedule, addScheduleEntry, updateScheduleEntry, deleteScheduleEntry } = useData()

  const canEdit = hasPermission('schedule', 'edit')
  const isStudent = user?.role === 'student'
  const isTeacher = user?.role === 'teacher'

  const [viewMode, setViewMode] = useState('all') // all | teacher | room | group
  const [branchFilter, setBranchFilter] = useState(user?.branch === 'all' ? 'all' : user?.branch || 'all')
  const [selectedEntity, setSelectedEntity] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // Find student's group for auto-filter
  const myStudent = useMemo(() => {
    if (!isStudent) return null
    return students.find(s => s.name === user?.name || s.phone === user?.phone) || null
  }, [students, user, isStudent])

  // Filter schedule entries
  const filteredSchedule = useMemo(() => {
    let entries = [...schedule]

    // Student: only their group
    if (isStudent && myStudent) {
      return entries.filter(e => e.groupName === myStudent.group || e.groupId === myStudent.groupId)
    }

    // Teacher: only their entries
    if (isTeacher && user?.teacherId) {
      return entries.filter(e => String(e.teacherId) === String(user.teacherId))
    }

    // Branch filter
    if (branchFilter && branchFilter !== 'all') {
      entries = entries.filter(e => e.branchId === branchFilter)
    }

    // View mode filter
    if (viewMode === 'teacher' && selectedEntity) {
      entries = entries.filter(e => String(e.teacherId) === String(selectedEntity))
    } else if (viewMode === 'room' && selectedEntity) {
      entries = entries.filter(e => e.roomId === selectedEntity)
    } else if (viewMode === 'group' && selectedEntity) {
      entries = entries.filter(e => e.groupId === selectedEntity)
    }

    return entries
  }, [schedule, branchFilter, viewMode, selectedEntity, isStudent, isTeacher, myStudent, user])

  // Entries grouped by day
  const entriesByDay = useMemo(() => {
    const map = {}
    DAYS.forEach(d => { map[d] = [] })
    filteredSchedule.forEach(e => {
      if (map[e.dayOfWeek]) map[e.dayOfWeek].push(e)
    })
    // Sort each day by start time
    DAYS.forEach(d => {
      map[d].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
    })
    return map
  }, [filteredSchedule])

  const handleSave = async (data) => {
    if (editingEntry) {
      await updateScheduleEntry(editingEntry.id, data)
    } else {
      await addScheduleEntry(data)
    }
    setEditingEntry(null)
    setShowForm(false)
  }

  const handleDelete = async (id) => {
    await deleteScheduleEntry(id)
    setDeleteConfirm(null)
  }

  const branchOptions = branchFilter === 'all' ? groups : groups.filter(g => g.branch === branchFilter)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Calendar size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('schedule.title')}</h1>
            <p className="text-sm text-slate-500">{t('schedule.subtitle')}</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={() => { setEditingEntry(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors">
            <Plus size={16} /> {t('schedule.add_entry')}
          </button>
        )}
      </div>

      {/* Filters */}
      {!isStudent && !isTeacher && (
        <div className="glass-card rounded-2xl p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Branch filter */}
            {user?.branch === 'all' && (
              <select value={branchFilter} onChange={e => { setBranchFilter(e.target.value); setSelectedEntity('') }}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                <option value="all">{t('schedule.all_branches')}</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}

            {/* View mode */}
            <div className="flex gap-1.5">
              {[
                { key: 'all', label: t('schedule.view_all') },
                { key: 'teacher', label: t('schedule.view_by_teacher') },
                { key: 'room', label: t('schedule.view_by_room') },
                { key: 'group', label: t('schedule.view_by_group') },
              ].map(vm => (
                <button key={vm.key}
                  onClick={() => { setViewMode(vm.key); setSelectedEntity('') }}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                    viewMode === vm.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>
                  {vm.label}
                </button>
              ))}
            </div>

            {/* Entity selector */}
            {viewMode === 'teacher' && (
              <select value={selectedEntity} onChange={e => setSelectedEntity(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                <option value="">{t('schedule.select_teacher')}</option>
                {(branchFilter !== 'all' ? teachers.filter(t => t.branch === branchFilter) : teachers).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            {viewMode === 'room' && (
              <select value={selectedEntity} onChange={e => setSelectedEntity(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                <option value="">{t('schedule.select_room')}</option>
                {(branchFilter !== 'all' ? rooms.filter(r => r.branch === branchFilter) : rooms).map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            )}
            {viewMode === 'group' && (
              <select value={selectedEntity} onChange={e => setSelectedEntity(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                <option value="">{t('schedule.select_group')}</option>
                {branchOptions.filter(g => g.status === 'active').map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {/* Weekly grid */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {DAYS.map(day => {
          const dayEntries = entriesByDay[day] || []
          const isToday = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase().slice(0, 3) === day
          return (
            <div key={day} className={`glass-card rounded-2xl overflow-hidden ${isToday ? 'ring-2 ring-blue-400' : ''}`}>
              {/* Day header */}
              <div className={`px-3 py-2.5 text-center border-b border-slate-100 ${isToday ? 'bg-blue-50' : 'bg-slate-50'}`}>
                <p className={`text-xs font-bold uppercase ${isToday ? 'text-blue-600' : 'text-slate-500'}`}>
                  {DAY_LABELS_FULL_RU[day]}
                </p>
                {isToday && (
                  <span className="text-[10px] text-blue-500 font-medium">Сегодня</span>
                )}
              </div>

              {/* Entries */}
              <div className="p-2 space-y-1.5 min-h-[120px]">
                {dayEntries.length === 0 ? (
                  <p className="text-xs text-slate-300 text-center py-6">—</p>
                ) : (
                  dayEntries.map(entry => {
                    const colorClass = getColorForGroup(entry.groupId, groups)
                    return (
                      <div key={entry.id}
                        className={`relative rounded-xl p-2.5 border ${colorClass} transition-all hover:shadow-md cursor-pointer group`}
                        onClick={() => {
                          if (canEdit) { setEditingEntry(entry); setShowForm(true) }
                        }}
                      >
                        {/* Delete button */}
                        {canEdit && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(entry.id) }}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100"
                          >
                            <X size={10} className="text-red-500" />
                          </button>
                        )}
                        <div className="flex items-center gap-1 mb-1">
                          <Clock size={10} />
                          <span className="text-[10px] font-bold">{entry.startTime}–{entry.endTime}</span>
                        </div>
                        <p className="text-xs font-semibold truncate">{entry.groupName || 'Группа'}</p>
                        {entry.courseName && (
                          <p className="text-[10px] opacity-75 truncate">{entry.courseName}</p>
                        )}
                        {entry.teacherName && (
                          <p className="text-[10px] opacity-75 flex items-center gap-0.5 mt-0.5 truncate">
                            <Users size={8} /> {entry.teacherName}
                          </p>
                        )}
                        {entry.roomName && (
                          <p className="text-[10px] opacity-75 flex items-center gap-0.5 truncate">
                            <MapPin size={8} /> {entry.roomName}
                          </p>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{filteredSchedule.length}</p>
          <p className="text-xs text-slate-500">{t('schedule.total_entries')}</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">
            {new Set(filteredSchedule.map(e => e.groupId)).size}
          </p>
          <p className="text-xs text-slate-500">{t('schedule.unique_groups')}</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">
            {new Set(filteredSchedule.filter(e => e.teacherId).map(e => e.teacherId)).size}
          </p>
          <p className="text-xs text-slate-500">{t('schedule.unique_teachers')}</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">
            {new Set(filteredSchedule.filter(e => e.roomId).map(e => e.roomId)).size}
          </p>
          <p className="text-xs text-slate-500">{t('schedule.unique_rooms')}</p>
        </div>
      </div>

      {/* Empty state */}
      {filteredSchedule.length === 0 && (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Calendar size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400">{t('schedule.no_entries')}</p>
          {canEdit && (
            <button onClick={() => { setEditingEntry(null); setShowForm(true) }}
              className="mt-3 text-sm text-blue-600 hover:underline">
              {t('schedule.add_first')}
            </button>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <Trash2 size={32} className="mx-auto text-red-500 mb-3" />
            <h3 className="font-bold text-slate-900 mb-1">{t('schedule.delete_confirm')}</h3>
            <p className="text-sm text-slate-500 mb-4">{t('schedule.delete_warning')}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm bg-slate-100 rounded-xl hover:bg-slate-200">
                Отмена
              </button>
              <button onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700">
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entry form */}
      {showForm && (
        <EntryFormModal
          entry={editingEntry}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingEntry(null) }}
          groups={groups}
          teachers={teachers}
          rooms={rooms}
          branches={branches}
          schedule={schedule}
          branchFilter={branchFilter}
        />
      )}
    </div>
  )
}
