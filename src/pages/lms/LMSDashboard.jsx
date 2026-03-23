import { useState, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useData } from '../../contexts/DataContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, Clock, CheckCircle2, FileText, Users, Bell,
  ChevronRight, Calendar, Award, TrendingUp, Plus, AlertCircle,
  Lock, CreditCard, ShieldX, Settings, Pencil, Trash2, X,
  Save, Search, Eye, GraduationCap, Layers, DollarSign, CheckCircle
} from 'lucide-react'

// ─── LMS Course Form (Constructor) ─────────────────────────────────
function LMSCourseForm({ course, onSave, onClose }) {
  const { t } = useLanguage()
  const [form, setForm] = useState({
    name: course?.name || '',
    icon: course?.icon || '📚',
    duration: course?.duration || '6 мес',
    description: course?.description || '',
    featuresText: course?.features?.join('\n') || '',
    pricingEnabled: !!course?.pricing,
    // Pricing: tashkent
    tashkent_standard: course?.pricing?.tashkent?.standard?.full || '',
    tashkent_vip: course?.pricing?.tashkent?.vip?.full || '',
    tashkent_premium: course?.pricing?.tashkent?.premium?.full || '',
    tashkent_individual: course?.pricing?.tashkent?.individual?.full || '',
    // Pricing: fergana
    fergana_standard: course?.pricing?.fergana?.standard?.full || '',
    fergana_vip: course?.pricing?.fergana?.vip?.full || '',
    fergana_premium: course?.pricing?.fergana?.premium?.full || '',
    fergana_individual: course?.pricing?.fergana?.individual?.full || '',
    // Pricing: online
    online_standard: course?.pricing?.online?.standard?.full || '',
    online_vip: course?.pricing?.online?.vip?.full || '',
    online_premium: course?.pricing?.online?.premium?.full || '',
    online_individual: course?.pricing?.online?.individual?.full || '',
  })
  const [activeRegion, setActiveRegion] = useState('tashkent')

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const ICONS = ['📚', '🎨', '💻', '📊', '🇬🇧', '🧮', '📐', '🎭', '🧠', '📸', '🎬', '🏗️', '🎯', '🔬', '✏️', '🌐']
  const REGIONS = [
    { id: 'tashkent', label: t('lms.region_tashkent') },
    { id: 'fergana', label: t('lms.region_fergana') },
    { id: 'online', label: t('lms.region_online') },
  ]
  const TARIFFS = [
    { id: 'standard', label: t('lms.tariff_standard') },
    { id: 'vip', label: 'VIP' },
    { id: 'premium', label: t('lms.tariff_premium') },
    { id: 'individual', label: t('lms.tariff_individual') },
  ]

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return

    const features = form.featuresText
      ? form.featuresText.split('\n').map(f => f.trim()).filter(Boolean)
      : []

    // Build pricing object
    let pricing = undefined
    if (form.pricingEnabled) {
      pricing = {}
      for (const region of REGIONS) {
        pricing[region.id] = {}
        for (const tariff of TARIFFS) {
          const val = Number(form[`${region.id}_${tariff.id}`])
          if (val > 0) {
            pricing[region.id][tariff.id] = {
              full: val,
              monthly: Math.round(val / parseInt(form.duration) || 6),
            }
          }
        }
      }
    }

    const data = {
      name: form.name.trim(),
      icon: form.icon,
      duration: form.duration,
      description: form.description.trim(),
      features,
      ...(pricing ? { pricing } : {}),
    }

    onSave(data)
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h3 className="text-lg font-bold text-slate-900">
            {course ? t('lms.courseForm_edit') : t('lms.courseForm_create')}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Name + Icon */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.courseForm_name')}</label>
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                required placeholder={t('lms.courseForm_name_placeholder')}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.courseForm_icon')}</label>
              <div className="flex flex-wrap gap-1">
                {ICONS.map(icon => (
                  <button key={icon} type="button" onClick={() => set('icon', icon)}
                    className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                      form.icon === icon ? 'bg-blue-100 ring-2 ring-blue-500' : 'bg-slate-50 hover:bg-slate-100'
                    }`}>{icon}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.courseForm_duration')}</label>
            <select value={form.duration} onChange={e => set('duration', e.target.value)}
              className="w-full sm:w-48 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                <option key={m} value={`${m} мес`}>{m} мес</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.courseForm_description')}</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={3} placeholder={t('lms.courseForm_description')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm resize-none" />
          </div>

          {/* Features */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('lms.courseForm_program')} <span className="text-slate-400 font-normal">{t('lms.courseForm_program_hint')}</span>
            </label>
            <textarea value={form.featuresText} onChange={e => set('featuresText', e.target.value)}
              rows={4} placeholder={"Планировка и зонирование\n3D-визуализация\nРабота с заказчиком"}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm resize-none font-mono" />
            {form.featuresText && (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {form.featuresText.split('\n').filter(f => f.trim()).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                    <CheckCircle size={12} className="text-emerald-500 flex-shrink-0" /> {f.trim()}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pricing Toggle */}
          <div className="border-t border-slate-100 pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.pricingEnabled}
                onChange={e => set('pricingEnabled', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded" />
              <span className="text-sm font-medium text-slate-700">{t('lms.courseForm_pricing_toggle')}</span>
            </label>
          </div>

          {/* Pricing Editor */}
          {form.pricingEnabled && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-4">
              <div className="flex gap-1 bg-white rounded-lg p-1">
                {REGIONS.map(r => (
                  <button key={r.id} type="button" onClick={() => setActiveRegion(r.id)}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      activeRegion === r.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}>{r.label}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {TARIFFS.map(t => (
                  <div key={t.id}>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t.label}</label>
                    <div className="relative">
                      <input type="number" min="0"
                        value={form[`${activeRegion}_${t.id}`]}
                        onChange={e => set(`${activeRegion}_${t.id}`, e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 pr-16 bg-white border border-slate-200 rounded-lg text-sm" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{t('lms.courseForm_sum')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">
              {t('lms.courseForm_btn_cancel')}
            </button>
            <button type="submit"
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 flex items-center gap-2">
              <Save size={14} /> {course ? t('lms.courseForm_btn_save') : t('lms.courseForm_btn_create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Dashboard ─────────────────────────────────────────────────
export default function LMSDashboard() {
  const { t } = useLanguage()
  const { user, hasPermission } = useAuth()
  const {
    groups, students, courses, lmsLessons, lmsAssignments, lmsSubmissions, lmsAnnouncements,
    addCourse, updateCourse, deleteCourse,
  } = useData()
  const navigate = useNavigate()
  const isTeacher = user?.role === 'teacher'
  const isStudent = user?.role === 'student'
  const canManage = hasPermission('lms', 'manage')
  const canEdit = hasPermission('lms', 'create_content')

  const [activeView, setActiveView] = useState('groups') // 'groups' | 'courses'
  const [showCourseForm, setShowCourseForm] = useState(false)
  const [editingCourse, setEditingCourse] = useState(null)
  const [searchCourse, setSearchCourse] = useState('')
  const [expandedCourse, setExpandedCourse] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // Find current student record
  const myStudent = useMemo(() => {
    if (!isStudent) return null
    return students.find(s => s.name === user?.name || s.phone === user?.phone) || null
  }, [students, user, isStudent])

  // Check LMS access for students
  const hasLmsAccess = useMemo(() => {
    if (!isStudent) return true
    if (!myStudent) return false
    return myStudent.lmsAccess === true && myStudent.status === 'active'
  }, [isStudent, myStudent])

  const isBlocked = isStudent && !hasLmsAccess
  const blockReason = useMemo(() => {
    if (!isStudent || !myStudent) return 'no_student'
    if (!myStudent.lmsAccess) return 'no_payment'
    if (myStudent.status === 'debtor') return 'debtor'
    if (myStudent.status === 'frozen') return 'frozen'
    return 'unknown'
  }, [isStudent, myStudent])

  // Get user's groups
  const myGroups = useMemo(() => {
    if (isTeacher) {
      return groups.filter(g => String(g.teacherId) === String(user?.teacherId) && g.status === 'active')
    }
    if (isStudent) {
      if (!myStudent || !hasLmsAccess) return []
      return groups.filter(g => g.name === myStudent.group || g.id === myStudent.groupId)
    }
    return groups.filter(g => g.status === 'active')
  }, [groups, students, user, isTeacher, isStudent, myStudent, hasLmsAccess])

  const myGroupIds = myGroups.map(g => g.id)

  const myLessons = useMemo(() => {
    return lmsLessons
      .filter(l => myGroupIds.includes(l.groupId))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  }, [lmsLessons, myGroupIds])

  const myAssignments = useMemo(() => {
    return lmsAssignments
      .filter(a => myGroupIds.includes(a.groupId))
      .sort((a, b) => (b.deadline || '').localeCompare(a.deadline || ''))
  }, [lmsAssignments, myGroupIds])

  const mySubmissions = useMemo(() => {
    if (!isStudent) return []
    const ms = students.find(s => s.name === user?.name || s.phone === user?.phone)
    if (!ms) return []
    return lmsSubmissions.filter(s => s.studentId === ms.id)
  }, [lmsSubmissions, students, user, isStudent])

  const pendingAssignments = useMemo(() => {
    if (!isStudent) return []
    const submittedIds = new Set(mySubmissions.map(s => s.assignmentId))
    return myAssignments.filter(a => !submittedIds.has(a.id) && (!a.deadline || a.deadline >= new Date().toISOString().split('T')[0]))
  }, [myAssignments, mySubmissions, isStudent])

  const myAnnouncements = useMemo(() => {
    return lmsAnnouncements
      .filter(a => myGroupIds.includes(a.groupId) || a.groupId === 'all')
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5)
  }, [lmsAnnouncements, myGroupIds])

  // Filtered courses
  const filteredCourses = useMemo(() => {
    if (!searchCourse.trim()) return courses
    const q = searchCourse.toLowerCase()
    return courses.filter(c => c.name?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q))
  }, [courses, searchCourse])

  const totalLessons = myLessons.length
  const totalAssignments = myAssignments.length
  const completedSubmissions = mySubmissions.filter(s => s.grade !== undefined && s.grade !== null).length

  // Course CRUD handlers
  const handleSaveCourse = async (data) => {
    if (editingCourse) {
      await updateCourse(editingCourse.id, data)
    } else {
      await addCourse(data)
    }
    setShowCourseForm(false)
    setEditingCourse(null)
  }

  const handleDeleteCourse = async (courseId) => {
    await deleteCourse(courseId)
    setDeleteConfirm(null)
  }

  // ─── Blocked Screen for Students ────────────────────────────────────
  if (isBlocked) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">{t('lms.my_learning')}</h2>
          <p className="text-slate-500 mt-1">{t('lms.access_restricted')}</p>
        </div>

        <div className="max-w-lg mx-auto text-center py-12">
          <div className={`w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center ${
            blockReason === 'debtor' ? 'bg-red-100' : blockReason === 'frozen' ? 'bg-blue-100' : 'bg-amber-100'
          }`}>
            {blockReason === 'debtor' ? (
              <CreditCard size={36} className="text-red-500" />
            ) : blockReason === 'frozen' ? (
              <ShieldX size={36} className="text-blue-500" />
            ) : (
              <Lock size={36} className="text-amber-500" />
            )}
          </div>

          <h3 className="text-xl font-bold text-slate-900 mb-2">
            {blockReason === 'debtor' ? t('lms.access_suspended') :
             blockReason === 'frozen' ? t('lms.learning_frozen') :
             t('lms.access_not_activated')}
          </h3>

          <p className="text-slate-500 mb-6 leading-relaxed">
            {blockReason === 'debtor' ? (
              <>{t('lms.suspended_reason')}</>
            ) : blockReason === 'frozen' ? (
              <>{t('lms.frozen_reason')}</>
            ) : (
              <>{t('lms.not_activated_reason')}</>
            )}
          </p>

          <div className="glass-card rounded-2xl p-5 text-left space-y-3">
            <h4 className="text-sm font-semibold text-slate-700">{t('lms.info')}</h4>
            {myStudent && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">{t('lms.student_label')}</span>
                  <span className="font-medium">{myStudent.name}</span>
                </div>
                {myStudent.course && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t('lms.course_label')}</span>
                    <span className="font-medium">{myStudent.course}</span>
                  </div>
                )}
                {myStudent.group && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t('lms.group_label')}</span>
                    <span className="font-medium">{myStudent.group}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">{t('lms.status_label')}</span>
                  <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${
                    myStudent.status === 'debtor' ? 'bg-red-100 text-red-600' :
                    myStudent.status === 'frozen' ? 'bg-blue-100 text-blue-600' :
                    'bg-amber-100 text-amber-600'
                  }`}>
                    {myStudent.status === 'debtor' ? t('lms.status_debtor') :
                     myStudent.status === 'frozen' ? t('lms.status_frozen') : t('lms.status_pending')}
                  </span>
                </div>
                {myStudent.nextPaymentDate && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t('lms.next_payment_date')}</span>
                    <span className="font-medium text-red-500">{myStudent.nextPaymentDate}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400 mt-6">
            {t('lms.error_contact')} <span className="font-medium text-slate-600">+998 95 387 79 27</span>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">
            {isTeacher ? t('lms.teacher_panel') : isStudent ? t('lms.my_learning') : t('lms.admin_title')}
          </h2>
          <p className="text-slate-500 mt-1">
            {isTeacher
              ? `${myGroups.length} ${t('lms.groups_count')} · ${myLessons.length} ${t('lms.lessons_count')}`
              : isStudent
                ? `${myGroups.length} ${t('lms.courses_count')} · ${pendingAssignments.length} ${t('lms.assignments_pending')}`
                : `${groups.filter(g => g.status === 'active').length} ${t('lms.active_groups')}`
            }
          </p>
        </div>

        {/* Admin/Manager: Toggle between Groups and Course Constructor */}
        {!isStudent && !isTeacher && (
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-xl p-1">
              <button onClick={() => setActiveView('groups')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeView === 'groups' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <div className="flex items-center gap-1.5">
                  <Layers size={14} /> {t('lms.tab_groups')}
                </div>
              </button>
              <button onClick={() => setActiveView('courses')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeView === 'courses' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <div className="flex items-center gap-1.5">
                  <GraduationCap size={14} /> {t('lms.tab_courses')}
                </div>
              </button>
            </div>
            {activeView === 'courses' && canManage && (
              <button onClick={() => { setEditingCourse(null); setShowCourseForm(true) }}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700">
                <Plus size={14} /> {t('lms.btn_create_course')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card rounded-xl p-4">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mb-2">
            <BookOpen size={16} className="text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{activeView === 'courses' ? courses.length : myGroups.length}</p>
          <p className="text-xs text-slate-500">{activeView === 'courses' ? t('lms.stat_courses') : isTeacher ? t('lms.stat_my_groups') : t('lms.stat_courses')}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center mb-2">
            <FileText size={16} className="text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{totalLessons}</p>
          <p className="text-xs text-slate-500">{t('lms.stat_lessons')}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center mb-2">
            <Clock size={16} className="text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {isStudent ? pendingAssignments.length : totalAssignments}
          </p>
          <p className="text-xs text-slate-500">{isStudent ? t('lms.stat_pending_submissions') : t('lms.stat_assignments')}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center mb-2">
            <Award size={16} className="text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {isStudent ? completedSubmissions : myAnnouncements.length}
          </p>
          <p className="text-xs text-slate-500">{isStudent ? t('lms.stat_graded') : t('lms.announcements')}</p>
        </div>
      </div>

      {/* ─── COURSES VIEW (Constructor) ─── */}
      {activeView === 'courses' && !isStudent && !isTeacher && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={searchCourse} onChange={e => setSearchCourse(e.target.value)}
              placeholder={t('lms.search_courses')}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm" />
          </div>

          {/* Courses Grid */}
          {filteredCourses.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <GraduationCap size={40} className="mx-auto mb-3 text-slate-300" />
              <p className="text-slate-400">{t('lms.no_courses')}</p>
              {canManage && (
                <button onClick={() => { setEditingCourse(null); setShowCourseForm(true) }}
                  className="mt-3 text-sm text-blue-600 hover:underline">+ {t('lms.btn_create_course')}</button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredCourses.map(course => {
                const courseGroups = groups.filter(g => g.course === course.name)
                const courseStudents = students.filter(s => s.course === course.name)
                const isExpanded = expandedCourse === course.id

                return (
                  <div key={course.id} className="glass-card rounded-2xl overflow-hidden">
                    {/* Card Header */}
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{course.icon || '📚'}</span>
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm">{course.name}</h4>
                            <p className="text-xs text-slate-500">{course.duration || '—'}</p>
                          </div>
                        </div>
                        {canManage && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => { setEditingCourse(course); setShowCourseForm(true) }}
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => setDeleteConfirm(course.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Description */}
                      {course.description && (
                        <p className="text-xs text-slate-500 mb-3 line-clamp-2">{course.description}</p>
                      )}

                      {/* Stats */}
                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Layers size={12} /> {courseGroups.length} {t('lms.groups_count')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users size={12} /> {courseStudents.length} {t('lms.students_count')}
                        </span>
                        {course.pricing && (
                          <span className="flex items-center gap-1">
                            <DollarSign size={12} /> {t('lms.tariffs_label')}
                          </span>
                        )}
                      </div>

                      {/* Expand */}
                      <button onClick={() => setExpandedCourse(isExpanded ? null : course.id)}
                        className="w-full mt-3 text-xs text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1">
                        <Eye size={12} /> {isExpanded ? t('lms.hide_details') : t('lms.show_details')}
                      </button>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 p-4 bg-slate-50/50 space-y-3">
                        {/* Features */}
                        {course.features?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-1.5">{t('lms.courseForm_program')}</p>
                            <div className="space-y-1">
                              {course.features.map((f, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                                  <CheckCircle size={12} className="text-emerald-500 flex-shrink-0" /> {f}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Pricing Preview */}
                        {course.pricing && (
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-1.5">{t('lms.tariffs_label')}</p>
                            <div className="grid grid-cols-1 gap-2">
                              {Object.entries(course.pricing).map(([region, tariffs]) => (
                                <div key={region} className="bg-white rounded-lg p-2">
                                  <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">
                                    {region === 'tashkent' ? t('lms.region_tashkent') : region === 'fergana' ? t('lms.region_fergana') : t('lms.region_online')}
                                  </p>
                                  <div className="space-y-0.5">
                                    {Object.entries(tariffs).map(([tariff, prices]) => (
                                      <div key={tariff} className="flex justify-between text-xs">
                                        <span className="text-slate-500 capitalize">
                                          {tariff === 'standard' ? t('lms.tariff_standard') : tariff === 'vip' ? 'VIP' : tariff === 'premium' ? t('lms.tariff_premium') : t('lms.tariff_individual')}
                                        </span>
                                        <span className="font-semibold text-slate-800">
                                          {new Intl.NumberFormat('ru-RU').format(prices.full)} {t('lms.courseForm_sum')}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Groups list */}
                        {courseGroups.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-1.5">{t('lms.tab_groups')} ({courseGroups.length})</p>
                            <div className="space-y-1">
                              {courseGroups.map(g => (
                                <button key={g.id} onClick={() => navigate(`/lms/group/${g.id}`)}
                                  className="w-full flex items-center justify-between p-2 bg-white rounded-lg hover:bg-blue-50 transition-colors text-xs">
                                  <span className="font-medium text-slate-700">{g.name}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400">{g.schedule || '—'}</span>
                                    <ChevronRight size={12} className="text-slate-300" />
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Delete Confirmation */}
                    {deleteConfirm === course.id && (
                      <div className="border-t border-red-100 bg-red-50 p-3 flex items-center justify-between">
                        <p className="text-xs text-red-600">{t('lms.delete_course_title')}</p>
                        <div className="flex gap-2">
                          <button onClick={() => setDeleteConfirm(null)}
                            className="px-3 py-1 text-xs bg-white rounded-lg hover:bg-slate-50 text-slate-600">{t('lms.btn_cancel')}</button>
                          <button onClick={() => handleDeleteCourse(course.id)}
                            className="px-3 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">{t('lms.btn_delete')}</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── GROUPS VIEW (default) ─── */}
      {(activeView === 'groups' || isStudent || isTeacher) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* My Groups / Courses */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">
              {isTeacher ? t('lms.my_groups') : t('lms.tab_courses')}
            </h3>
            {myGroups.length === 0 ? (
              <div className="glass-card rounded-2xl p-8 text-center text-slate-400">
                {isStudent ? t('lms.no_enrolled') : t('lms.no_assigned_groups')}
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
                      <p className="text-xs text-slate-500 mb-3">{group.name} · {group.schedule || t('lms.no_schedule')}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <FileText size={12} /> {groupLessons.length} {t('lms.lessons_count')}
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 size={12} /> {groupAssignments.length} {t('lms.stat_assignments')}
                        </span>
                        {(isTeacher || canEdit) && (
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
                <h3 className="text-lg font-semibold text-slate-900 mt-6">{t('lms.recent_lessons')}</h3>
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
                  {t('lms.pending_assignments')}
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
                {t('lms.announcements')}
              </h4>
              {myAnnouncements.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">{t('lms.no_announcements')}</p>
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
                <h4 className="font-semibold text-slate-900 mb-3">{t('lms.quick_actions')}</h4>
                <div className="space-y-2">
                  <button
                    onClick={() => navigate(`/lms/group/${myGroups[0]?.id}?action=newLesson`)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <Plus size={14} /> {t('lms.btn_add_lesson')}
                  </button>
                  <button
                    onClick={() => navigate(`/lms/group/${myGroups[0]?.id}?action=newAssignment`)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                  >
                    <Plus size={14} /> {t('lms.btn_add_assignment')}
                  </button>
                  <button
                    onClick={() => navigate(`/lms/group/${myGroups[0]?.id}?action=newAnnouncement`)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                  >
                    <Bell size={14} /> {t('lms.btn_add_announcement')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Course Form Modal */}
      {showCourseForm && (
        <LMSCourseForm
          course={editingCourse}
          onSave={handleSaveCourse}
          onClose={() => { setShowCourseForm(false); setEditingCourse(null) }}
        />
      )}
    </div>
  )
}
