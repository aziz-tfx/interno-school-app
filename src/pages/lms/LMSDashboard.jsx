import { useState, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useData } from '../../contexts/DataContext'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, Clock, CheckCircle2, FileText, Users, Bell,
  ChevronRight, Calendar, Award, TrendingUp, Plus, AlertCircle
} from 'lucide-react'

export default function LMSDashboard() {
  const { user } = useAuth()
  const { groups, students, courses, lmsLessons, lmsAssignments, lmsSubmissions, lmsAnnouncements } = useData()
  const navigate = useNavigate()
  const isTeacher = user?.role === 'teacher'
  const isStudent = user?.role === 'student'

  // Get user's groups
  const myGroups = useMemo(() => {
    if (isTeacher) {
      return groups.filter(g => String(g.teacherId) === String(user?.teacherId) && g.status === 'active')
    }
    if (isStudent) {
      const myStudent = students.find(s => s.name === user?.name || s.phone === user?.phone)
      if (!myStudent) return []
      return groups.filter(g => g.name === myStudent.group || g.id === myStudent.groupId)
    }
    // Admin sees all
    return groups.filter(g => g.status === 'active')
  }, [groups, students, user, isTeacher, isStudent])

  const myGroupIds = myGroups.map(g => g.id)
  const myGroupNames = myGroups.map(g => g.name)

  // My lessons
  const myLessons = useMemo(() => {
    return lmsLessons
      .filter(l => myGroupIds.includes(l.groupId))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  }, [lmsLessons, myGroupIds])

  // My assignments
  const myAssignments = useMemo(() => {
    return lmsAssignments
      .filter(a => myGroupIds.includes(a.groupId))
      .sort((a, b) => (b.deadline || '').localeCompare(a.deadline || ''))
  }, [lmsAssignments, myGroupIds])

  // My submissions (for students)
  const mySubmissions = useMemo(() => {
    if (!isStudent) return []
    const myStudent = students.find(s => s.name === user?.name || s.phone === user?.phone)
    if (!myStudent) return []
    return lmsSubmissions.filter(s => s.studentId === myStudent.id)
  }, [lmsSubmissions, students, user, isStudent])

  // Pending assignments (for students — not yet submitted)
  const pendingAssignments = useMemo(() => {
    if (!isStudent) return []
    const submittedIds = new Set(mySubmissions.map(s => s.assignmentId))
    return myAssignments.filter(a => !submittedIds.has(a.id) && (!a.deadline || a.deadline >= new Date().toISOString().split('T')[0]))
  }, [myAssignments, mySubmissions, isStudent])

  // Announcements
  const myAnnouncements = useMemo(() => {
    return lmsAnnouncements
      .filter(a => myGroupIds.includes(a.groupId) || a.groupId === 'all')
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5)
  }, [lmsAnnouncements, myGroupIds])

  // Stats
  const totalLessons = myLessons.length
  const totalAssignments = myAssignments.length
  const completedSubmissions = mySubmissions.filter(s => s.grade !== undefined && s.grade !== null).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">
            {isTeacher ? 'Панель учителя' : isStudent ? 'Мое обучение' : 'LMS — Управление обучением'}
          </h2>
          <p className="text-slate-500 mt-1">
            {isTeacher
              ? `${myGroups.length} групп · ${myLessons.length} уроков`
              : isStudent
                ? `${myGroups.length} курсов · ${pendingAssignments.length} заданий ожидают`
                : `${groups.filter(g => g.status === 'active').length} активных групп`
            }
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card rounded-xl p-4">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mb-2">
            <BookOpen size={16} className="text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{myGroups.length}</p>
          <p className="text-xs text-slate-500">{isTeacher ? 'Моих групп' : 'Курсов'}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center mb-2">
            <FileText size={16} className="text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{totalLessons}</p>
          <p className="text-xs text-slate-500">Уроков</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center mb-2">
            <Clock size={16} className="text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {isStudent ? pendingAssignments.length : totalAssignments}
          </p>
          <p className="text-xs text-slate-500">{isStudent ? 'Ожидают сдачи' : 'Заданий'}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center mb-2">
            <Award size={16} className="text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {isStudent ? completedSubmissions : myAnnouncements.length}
          </p>
          <p className="text-xs text-slate-500">{isStudent ? 'Оценено' : 'Объявлений'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* My Groups / Courses */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {isTeacher ? 'Мои группы' : 'Мои курсы'}
          </h3>
          {myGroups.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center text-slate-400">
              {isStudent ? 'Вы пока не записаны на курсы' : 'Нет назначенных групп'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {myGroups.map(group => {
                const course = courses.find(c => c.name === group.course)
                const groupLessons = myLessons.filter(l => l.groupId === group.id)
                const groupAssignments = myAssignments.filter(a => a.groupId === group.id)
                const groupStudents = students.filter(s => s.group === group.name || s.groupId === group.id)

                return (
                  <button
                    key={group.id}
                    onClick={() => navigate(`/lms/group/${group.id}`)}
                    className="glass-card rounded-xl p-4 text-left hover:shadow-lg transition-all group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="text-2xl">{course?.icon || '📚'}</div>
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm mb-0.5">{group.course}</h4>
                    <p className="text-xs text-slate-500 mb-3">{group.name} · {group.schedule || 'Нет расписания'}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <FileText size={12} /> {groupLessons.length} уроков
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle2 size={12} /> {groupAssignments.length} заданий
                      </span>
                      {isTeacher && (
                        <span className="flex items-center gap-1">
                          <Users size={12} /> {groupStudents.length}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Recent Lessons */}
          {myLessons.length > 0 && (
            <>
              <h3 className="text-lg font-semibold text-slate-900 mt-6">Последние уроки</h3>
              <div className="space-y-2">
                {myLessons.slice(0, 5).map(lesson => {
                  const group = groups.find(g => g.id === lesson.groupId)
                  return (
                    <button
                      key={lesson.id}
                      onClick={() => navigate(`/lms/group/${lesson.groupId}?lesson=${lesson.id}`)}
                      className="w-full glass-card rounded-xl p-3 flex items-center gap-3 text-left hover:shadow-md transition-all"
                    >
                      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <BookOpen size={18} className="text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{lesson.title}</p>
                        <p className="text-xs text-slate-400">{group?.course} · {group?.name}</p>
                      </div>
                      <span className="text-xs text-slate-400">{lesson.date || ''}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Pending Assignments (for students) */}
          {isStudent && pendingAssignments.length > 0 && (
            <div className="glass-card rounded-2xl p-4">
              <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-500" />
                Нужно сдать
              </h4>
              <div className="space-y-2">
                {pendingAssignments.slice(0, 5).map(a => {
                  const group = groups.find(g => g.id === a.groupId)
                  return (
                    <button
                      key={a.id}
                      onClick={() => navigate(`/lms/group/${a.groupId}?tab=assignments`)}
                      className="w-full text-left p-2 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <p className="text-sm font-medium text-slate-900 truncate">{a.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-400">{group?.name}</span>
                        {a.deadline && (
                          <span className="text-xs text-red-500 flex items-center gap-0.5">
                            <Calendar size={10} /> до {a.deadline}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Announcements */}
          <div className="glass-card rounded-2xl p-4">
            <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Bell size={16} className="text-blue-500" />
              Объявления
            </h4>
            {myAnnouncements.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Нет объявлений</p>
            ) : (
              <div className="space-y-3">
                {myAnnouncements.map(a => (
                  <div key={a.id} className="border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                    <p className="text-sm font-medium text-slate-900">{a.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{a.content}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{a.createdAt?.split('T')[0] || ''}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions (for teachers) */}
          {isTeacher && myGroups.length > 0 && (
            <div className="glass-card rounded-2xl p-4">
              <h4 className="font-semibold text-slate-900 mb-3">Быстрые действия</h4>
              <div className="space-y-2">
                <button
                  onClick={() => navigate(`/lms/group/${myGroups[0]?.id}?action=newLesson`)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <Plus size={14} /> Добавить урок
                </button>
                <button
                  onClick={() => navigate(`/lms/group/${myGroups[0]?.id}?action=newAssignment`)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                >
                  <Plus size={14} /> Создать задание
                </button>
                <button
                  onClick={() => navigate(`/lms/group/${myGroups[0]?.id}?action=newAnnouncement`)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  <Bell size={14} /> Объявление
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
