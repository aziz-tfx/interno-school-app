import { useState, useMemo } from 'react'
import { Check, X, Clock, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useLanguage } from '../contexts/LanguageContext'

export default function Attendance() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const { students, teachers, branches, markAttendance, getAttendanceByGroup, getAttendanceStats } = useData()
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedGroup, setSelectedGroup] = useState('')

  // Get groups based on role
  const availableGroups = useMemo(() => {
    let relevantStudents
    if (user.role === 'teacher') {
      // Teacher sees only their branch students
      relevantStudents = students.filter(s => s.branch === user.branch)
    } else {
      relevantStudents = user.branch === 'all' ? students : students.filter(s => s.branch === user.branch)
    }
    const groups = [...new Set(relevantStudents.map(s => s.group))].sort()
    return groups
  }, [students, user])

  // Auto-select first group
  const activeGroup = selectedGroup || availableGroups[0] || ''

  const groupStudents = students.filter(s => s.group === activeGroup)
  const currentAttendance = getAttendanceByGroup(activeGroup, selectedDate)

  const getStudentStatus = (studentId) => {
    const record = currentAttendance.find(a => a.studentId === studentId)
    return record ? record.status : null
  }

  const handleMark = (studentId, status) => {
    markAttendance({
      date: selectedDate,
      groupName: activeGroup,
      studentId,
      status,
      teacherId: user.teacherId || user.id,
    })
  }

  const statusIcons = {
    present: { icon: Check, color: 'bg-emerald-100 text-emerald-700 border-emerald-300', label: t('attendance.status_present') },
    absent: { icon: X, color: 'bg-red-100 text-red-700 border-red-300', label: t('attendance.status_absent') },
    late: { icon: Clock, color: 'bg-yellow-100 text-yellow-700 border-yellow-300', label: t('attendance.status_late') },
  }

  const summary = {
    total: groupStudents.length,
    present: groupStudents.filter(s => getStudentStatus(s.id) === 'present').length,
    late: groupStudents.filter(s => getStudentStatus(s.id) === 'late').length,
    absent: groupStudents.filter(s => getStudentStatus(s.id) === 'absent').length,
    unmarked: groupStudents.filter(s => !getStudentStatus(s.id)).length,
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-slate-900">{t('attendance.heading')}</h2>
        <p className="text-slate-500 mt-1">{t('attendance.subtitle')}</p>
      </div>

      {/* Controls */}
      <div className="glass-card rounded-2xl p-4 flex flex-col md:flex-row flex-wrap gap-4 items-start md:items-center">
        <div>
          <label className="block text-xs text-slate-500 mb-1">{t('attendance.label_date')}</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 bg-white/50 border border-white/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">{t('attendance.label_group')}</label>
          <select
            value={activeGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="px-3 py-2 bg-white/50 border border-white/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {availableGroups.length === 0 && <option value="">{t('attendance.no_groups')}</option>}
            {availableGroups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Summary badges */}
        <div className="flex gap-2 flex-wrap md:ml-auto">
          <span className="flex items-center gap-1 bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-sm">
            <Users size={14} /> {summary.total}
          </span>
          <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-sm">
            <Check size={14} /> {summary.present}
          </span>
          <span className="flex items-center gap-1 bg-yellow-100 text-yellow-700 px-3 py-1.5 rounded-lg text-sm">
            <Clock size={14} /> {summary.late}
          </span>
          <span className="flex items-center gap-1 bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-sm">
            <X size={14} /> {summary.absent}
          </span>
        </div>
      </div>

      {/* Student List */}
      {activeGroup && groupStudents.length > 0 ? (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/40 border-b border-white/30">
                  <th className="text-left py-3 px-4 text-slate-500 font-medium w-8">{t('attendance.th_number')}</th>
                  <th className="text-left py-3 px-4 text-slate-500 font-medium">{t('attendance.th_student')}</th>
                  <th className="text-left py-3 px-4 text-slate-500 font-medium hidden md:table-cell">{t('attendance.th_course')}</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium hidden md:table-cell">{t('attendance.th_overall')}</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">{t('attendance.th_mark')}</th>
                </tr>
              </thead>
              <tbody>
                {groupStudents.map((student, idx) => {
                  const currentStatus = getStudentStatus(student.id)
                  const stats = getAttendanceStats(student.id)
                  return (
                    <tr key={student.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{student.name}</p>
                        <p className="text-xs text-slate-400">{student.phone}</p>
                      </td>
                      <td className="py-3 px-4 text-slate-600 hidden md:table-cell">{student.course}</td>
                      <td className="py-3 px-4 text-center hidden md:table-cell">
                        {stats.total > 0 ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 bg-slate-200 rounded-full h-1.5">
                              <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${stats.rate}%` }} />
                            </div>
                            <span className="text-xs text-slate-500">{stats.rate}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center justify-center gap-2">
                          {Object.entries(statusIcons).map(([status, { icon: Icon, color, label }]) => (
                            <button
                              key={status}
                              onClick={() => handleMark(student.id, status)}
                              className={`flex items-center gap-1 px-2 md:px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                currentStatus === status
                                  ? `${color} border-current shadow-sm scale-105`
                                  : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <Icon size={14} />
                              <span className="hidden md:inline">{label}</span>
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Users size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">
            {availableGroups.length === 0
              ? t('attendance.no_groups_available')
              : t('attendance.select_group')
            }
          </p>
        </div>
      )}
    </div>
  )
}
