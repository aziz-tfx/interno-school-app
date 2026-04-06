import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useData } from '../../contexts/DataContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  ArrowLeft, BookOpen, CheckCircle2, ChevronDown, ChevronRight,
  Clock, FileText, Lock, Play, Users, Calendar, Award,
  Plus, Pencil, Trash2, X, Save, GripVertical, AlertCircle, Video
} from 'lucide-react'

// ─── Module Form Modal ──────────────────────────────────────────────
function ModuleFormModal({ mod, courseId, onSave, onClose, nextOrder }) {
  const { t } = useLanguage()
  const [title, setTitle] = useState(mod?.title || '')
  const [description, setDescription] = useState(mod?.description || '')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    onSave({
      title: title.trim(),
      description: description.trim(),
      courseId,
      order: mod?.order ?? nextOrder,
      ...(mod ? {} : { createdAt: new Date().toISOString() }),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">
            {mod ? t('lms.edit_module') : t('lms.create_module')}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X size={18} className="text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.module_title')} *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              required autoFocus placeholder="Модуль 1: Введение"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.module_description')}</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={3} placeholder="Описание модуля..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm resize-none" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">
              {t('lms.btn_cancel')}
            </button>
            <button type="submit"
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 flex items-center gap-2">
              <Save size={14} /> {mod ? t('lms.save_module') : t('lms.create_module')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Course View ───────────────────────────────────────────────
export default function LMSCourseView() {
  const { t } = useLanguage()
  const { courseId } = useParams() // This is actually groupId for student navigation
  const navigate = useNavigate()
  const { user, hasPermission } = useAuth()
  const {
    groups, students, courses, teachers,
    lmsLessons, lmsAssignments, lmsSubmissions, lmsModules, lmsProgress,
    addLmsModule, updateLmsModule, deleteLmsModule, addLmsProgress, deleteLmsProgress,
    updateLmsLesson,
  } = useData()

  const isStudent = user?.role === 'student'
  const isTeacher = user?.role === 'teacher'
  const canEdit = hasPermission('lms', 'create_content')

  const [expandedModules, setExpandedModules] = useState(new Set(['unsorted']))
  const [showModuleForm, setShowModuleForm] = useState(false)
  const [editingModule, setEditingModule] = useState(null)
  const [deleteModuleConfirm, setDeleteModuleConfirm] = useState(null)

  // Find group and course
  const group = groups.find(g => g.id === courseId)
  const course = courses.find(c => c.name === group?.course)

  const myStudent = useMemo(() => {
    if (!isStudent) return null
    return students.find(s => s.name === user?.name || s.phone === user?.phone) || null
  }, [students, user, isStudent])

  const teacher = useMemo(() => {
    if (!group?.teacherId) return null
    return teachers.find(t => String(t.id) === String(group.teacherId))
  }, [teachers, group])

  // Lessons for this course (shared across all groups)
  const lessons = useMemo(() => {
    if (!course) return lmsLessons.filter(l => l.groupId === courseId).sort((a, b) => (a.order || 0) - (b.order || 0))
    return lmsLessons
      .filter(l => l.courseId === course.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
  }, [lmsLessons, course, courseId])

  // Modules for this course
  const modules = useMemo(() => {
    if (!course) return []
    return lmsModules
      .filter(m => m.courseId === course.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
  }, [lmsModules, course])

  // Assignments for this group
  const assignments = useMemo(() => {
    return lmsAssignments.filter(a => a.groupId === courseId)
  }, [lmsAssignments, courseId])

  // Student progress
  const completedLessonIds = useMemo(() => {
    if (!myStudent) return new Set()
    return new Set(
      lmsProgress
        .filter(p => p.studentId === myStudent.id && (p.groupId === courseId || p.courseId === course?.id))
        .map(p => p.lessonId)
    )
  }, [lmsProgress, myStudent, courseId, course])

  const completedCount = lessons.filter(l => completedLessonIds.has(l.id)).length
  const progressPercent = lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0

  // Group lessons by module
  const lessonsByModule = useMemo(() => {
    const map = {}
    modules.forEach(m => { map[m.id] = [] })
    map['unsorted'] = []
    lessons.forEach(l => {
      const key = l.moduleId && map[l.moduleId] ? l.moduleId : 'unsorted'
      map[key].push(l)
    })
    return map
  }, [lessons, modules])

  const toggleModule = (id) => {
    setExpandedModules(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleToggleLessonComplete = async (lesson) => {
    if (!myStudent) return
    if (completedLessonIds.has(lesson.id)) {
      const prog = lmsProgress.find(p => p.studentId === myStudent.id && p.lessonId === lesson.id)
      if (prog) await deleteLmsProgress(prog.id)
    } else {
      await addLmsProgress({
        studentId: myStudent.id,
        lessonId: lesson.id,
        groupId: courseId,
        courseId: course?.id || '',
        completedAt: new Date().toISOString(),
      })
    }
  }

  const handleSaveModule = async (data) => {
    if (editingModule) {
      await updateLmsModule(editingModule.id, data)
    } else {
      await addLmsModule(data)
    }
    setShowModuleForm(false)
    setEditingModule(null)
  }

  const handleDeleteModule = async (modId) => {
    // Move lessons to unsorted
    const moduleLessons = lessons.filter(l => l.moduleId === modId)
    for (const l of moduleLessons) {
      await updateLmsLesson(l.id, { moduleId: null })
    }
    await deleteLmsModule(modId)
    setDeleteModuleConfirm(null)
  }

  if (!group) {
    return (
      <div className="text-center py-20">
        <BookOpen size={48} className="mx-auto text-slate-300 mb-4" />
        <p className="text-slate-500">{t('lms.group_not_found')}</p>
        <button onClick={() => navigate('/lms')} className="mt-4 text-blue-600 hover:underline text-sm">{t('lms.go_back')}</button>
      </div>
    )
  }

  const isCompleted = progressPercent === 100 && lessons.length > 0

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button onClick={() => navigate('/lms')}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 transition-colors">
        <ArrowLeft size={16} /> {t('lms.back_to_course')}
      </button>

      {/* Course header */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Course info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">{course?.icon || '📚'}</span>
              <div>
                <h1 className="text-xl font-bold text-slate-900">{group.course}</h1>
                <p className="text-sm text-slate-500">{group.name} · {course?.duration || ''}</p>
              </div>
            </div>

            {course?.description && (
              <p className="text-sm text-slate-600 mb-4 leading-relaxed">{course.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <FileText size={14} className="text-blue-500" />
                {lessons.length} {t('lms.total_lessons')}
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-purple-500" />
                {assignments.length} {t('lms.total_assignments')}
              </span>
              {teacher && (
                <span className="flex items-center gap-1.5">
                  <Users size={14} className="text-emerald-500" />
                  {teacher.name}
                </span>
              )}
              {group.schedule && (
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} className="text-amber-500" />
                  {group.schedule}
                </span>
              )}
            </div>
          </div>

          {/* Progress circle (student only) */}
          {isStudent && (
            <div className="flex flex-col items-center justify-center">
              <div className="relative w-28 h-28">
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 36 36">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none" stroke="#e2e8f0" strokeWidth="2.5"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none" stroke={isCompleted ? '#10b981' : '#3b82f6'}
                    strokeWidth="2.5" strokeDasharray={`${progressPercent}, 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-slate-900">{progressPercent}%</span>
                  <span className="text-[10px] text-slate-400">{t('lms.course_progress')}</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {completedCount}/{lessons.length} {t('lms.completed_lessons')}
              </p>
            </div>
          )}
        </div>

        {/* Course completed banner */}
        {isStudent && isCompleted && (
          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
            <Award size={24} className="text-emerald-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">{t('lms.course_completed')}</p>
              <p className="text-xs text-emerald-600">{t('lms.congratulations')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Module management for admin/teacher */}
      {canEdit && (
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{t('lms.course_content')}</h2>
          <button onClick={() => { setEditingModule(null); setShowModuleForm(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
            <Plus size={14} /> {t('lms.add_module')}
          </button>
        </div>
      )}

      {/* Modules & Lessons */}
      <div className="space-y-3">
        {modules.map((mod, modIdx) => {
          const modLessons = lessonsByModule[mod.id] || []
          const modCompleted = modLessons.filter(l => completedLessonIds.has(l.id)).length
          const modPercent = modLessons.length > 0 ? Math.round((modCompleted / modLessons.length) * 100) : 0
          const isOpen = expandedModules.has(mod.id)

          // Module lock logic: for students, check if group has this module in openModules
          const groupOpenModules = group?.openModules || []
          const isModuleLocked = isStudent && groupOpenModules.length > 0 && !groupOpenModules.includes(mod.id)
          // If group has no openModules set at all (empty array), all modules are open by default for backward compat
          const isLocked = isStudent && modules.length > 0 && groupOpenModules.length > 0 && !groupOpenModules.includes(mod.id)

          return (
            <div key={mod.id} className={`glass-card rounded-2xl overflow-hidden ${isLocked ? 'opacity-60' : ''}`}>
              {/* Module header */}
              <button
                onClick={() => !isLocked && toggleModule(mod.id)}
                className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${isLocked ? 'cursor-not-allowed' : 'hover:bg-slate-50/50'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  isLocked ? 'bg-slate-200' : modPercent === 100 ? 'bg-emerald-100' : 'bg-blue-100'
                }`}>
                  {isLocked ? (
                    <Lock size={18} className="text-slate-400" />
                  ) : modPercent === 100 ? (
                    <CheckCircle2 size={20} className="text-emerald-600" />
                  ) : (
                    <span className="text-sm font-bold text-blue-600">{modIdx + 1}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold text-sm ${isLocked ? 'text-slate-400' : 'text-slate-900'}`}>{mod.title}</h3>
                  <div className="flex items-center gap-3 mt-0.5">
                    {isLocked ? (
                      <span className="text-xs text-slate-400">{t('lms.module_locked')}</span>
                    ) : (
                      <>
                        <span className="text-xs text-slate-400">
                          {modCompleted}/{modLessons.length} {t('lms.completed_lessons')}
                        </span>
                        {isStudent && (
                          <div className="flex-1 max-w-[120px] h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${modPercent === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                              style={{ width: `${modPercent}%` }} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {canEdit && (
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setEditingModule(mod); setShowModuleForm(true) }}
                      className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setDeleteModuleConfirm(mod.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}

                {!isLocked && <ChevronDown size={16} className={`text-slate-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />}
              </button>

              {/* Locked banner */}
              {isLocked && (
                <div className="border-t border-slate-200 bg-slate-100 px-4 py-3 flex items-center gap-2">
                  <Lock size={14} className="text-slate-400" />
                  <p className="text-xs text-slate-500">{t('lms.module_locked_desc')}</p>
                </div>
              )}

              {/* Delete confirmation */}
              {deleteModuleConfirm === mod.id && (
                <div className="border-t border-red-100 bg-red-50 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-red-600">{t('lms.delete_module')}</p>
                    <p className="text-xs text-red-500">{t('lms.delete_module_warning')}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setDeleteModuleConfirm(null)}
                      className="px-3 py-1 text-xs bg-white rounded-lg hover:bg-slate-50">{t('lms.btn_cancel')}</button>
                    <button onClick={() => handleDeleteModule(mod.id)}
                      className="px-3 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">{t('lms.btn_delete')}</button>
                  </div>
                </div>
              )}

              {/* Lessons list — only shown if not locked */}
              {isOpen && !isLocked && (
                <div className="border-t border-slate-100">
                  {modLessons.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-slate-400 text-center">{t('lms.no_lessons')}</p>
                  ) : (
                    modLessons.map((lesson, idx) => {
                      const isDone = completedLessonIds.has(lesson.id)
                      return (
                        <div key={lesson.id}
                          className={`flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors ${
                            isDone ? 'bg-emerald-50/30' : ''
                          }`}
                        >
                          {isStudent ? (
                            <button onClick={() => handleToggleLessonComplete(lesson)}
                              className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                                isDone ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-blue-400'
                              }`}
                            >
                              {isDone && <CheckCircle2 size={14} className="text-white" />}
                            </button>
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-medium text-slate-500">{idx + 1}</span>
                            </div>
                          )}

                          <button
                            onClick={() => navigate(`/lms/lesson/${lesson.id}`)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <p className={`text-sm font-medium ${isDone ? 'text-emerald-700 line-through' : 'text-slate-900'}`}>
                              {lesson.title}
                            </p>
                            {lesson.description && (
                              <p className="text-xs text-slate-400 truncate mt-0.5">{lesson.description}</p>
                            )}
                          </button>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {lesson.videoUrl && (
                              <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">Video</span>
                            )}
                            {lesson.materials?.length > 0 && (
                              <span className="text-xs text-slate-400">{lesson.materials.length} files</span>
                            )}
                            <ChevronRight size={14} className="text-slate-300" />
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Unsorted lessons (no module) */}
        {(lessonsByModule['unsorted']?.length > 0 || modules.length === 0) && (
          <div className="glass-card rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleModule('unsorted')}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50/50 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                <BookOpen size={18} className="text-slate-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-900 text-sm">
                  {modules.length > 0 ? t('lms.unsorted_lessons') : t('lms.course_content')}
                </h3>
                <span className="text-xs text-slate-400">
                  {(lessonsByModule['unsorted'] || []).length} {t('lms.total_lessons')}
                </span>
              </div>
              <ChevronDown size={16} className={`text-slate-400 transition-transform flex-shrink-0 ${
                expandedModules.has('unsorted') ? 'rotate-180' : ''
              }`} />
            </button>

            {expandedModules.has('unsorted') && (
              <div className="border-t border-slate-100">
                {(lessonsByModule['unsorted'] || []).length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-400 text-center">{t('lms.no_lessons')}</p>
                ) : (
                  (lessonsByModule['unsorted'] || []).map((lesson, idx) => {
                    const isDone = completedLessonIds.has(lesson.id)
                    return (
                      <div key={lesson.id}
                        className={`flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors ${
                          isDone ? 'bg-emerald-50/30' : ''
                        }`}
                      >
                        {isStudent ? (
                          <button onClick={() => handleToggleLessonComplete(lesson)}
                            className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                              isDone ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-blue-400'
                            }`}
                          >
                            {isDone && <CheckCircle2 size={14} className="text-white" />}
                          </button>
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-medium text-slate-500">{idx + 1}</span>
                          </div>
                        )}

                        <button onClick={() => navigate(`/lms/lesson/${lesson.id}`)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <p className={`text-sm font-medium ${isDone ? 'text-emerald-700 line-through' : 'text-slate-900'}`}>
                            {lesson.title}
                          </p>
                          {lesson.description && (
                            <p className="text-xs text-slate-400 truncate mt-0.5">{lesson.description}</p>
                          )}
                        </button>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {lesson.videoUrl && (
                            <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">Video</span>
                          )}
                          <ChevronRight size={14} className="text-slate-300" />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {lessons.length === 0 && modules.length === 0 && (
          <div className="glass-card rounded-2xl p-12 text-center">
            <BookOpen size={48} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-400">{t('lms.no_lessons')}</p>
            {canEdit && (
              <p className="text-sm text-slate-400 mt-2">{t('lms.add_first_lesson')}</p>
            )}
          </div>
        )}
      </div>

      {/* Module Form Modal */}
      {showModuleForm && (
        <ModuleFormModal
          mod={editingModule}
          courseId={course?.id || courseId}
          nextOrder={modules.length + 1}
          onSave={handleSaveModule}
          onClose={() => { setShowModuleForm(false); setEditingModule(null) }}
        />
      )}
    </div>
  )
}
