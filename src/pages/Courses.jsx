import { useState, useMemo } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { BookOpen, MapPin, Users, ChevronDown, ChevronUp, Tag, Monitor, GraduationCap, Plus, Pencil, Trash2, X, CheckCircle2, Info } from 'lucide-react'
import CourseForm from '../components/CourseForm'

function useRegionLabels() {
  const { t } = useLanguage()
  return {
    tashkent: t('courses.region_tashkent'),
    fergana: t('courses.region_fergana'),
    online: t('courses.region_online'),
  }
}

const TARIFF_LABELS = {
  standard: 'Стандарт',
  vip: 'VIP',
  premium: 'Премиум',
  individual: 'Индивидуальный',
}

const TARIFF_COLORS = {
  standard: 'bg-blue-50 text-blue-700 border-blue-200',
  vip: 'bg-purple-50 text-purple-700 border-purple-200',
  premium: 'bg-amber-50 text-amber-700 border-amber-200',
  individual: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const TARIFF_HEADER_COLORS = {
  standard: 'from-blue-500 to-blue-600',
  vip: 'from-purple-500 to-purple-600',
  premium: 'from-amber-500 to-amber-600',
  individual: 'from-emerald-500 to-emerald-600',
}

function formatPrice(val) {
  if (!val) return '—'
  return new Intl.NumberFormat('ru-RU').format(val)
}

function PricingTable({ pricing, region, tariffFeatures }) {
  const { t } = useLanguage()
  const regionData = pricing?.[region]
  if (!regionData) return <p className="text-sm text-slate-400 py-3">{t('courses.no_data_region')}</p>

  const tariffs = Object.keys(regionData)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {tariffs.map(tariff => {
        const tr = regionData[tariff]
        const features = tariffFeatures?.[tariff] || []
        return (
          <div key={tariff} className="rounded-xl border border-slate-200 overflow-hidden bg-white/60">
            <div className={`bg-gradient-to-r ${TARIFF_HEADER_COLORS[tariff] || 'from-slate-500 to-slate-600'} px-4 py-2.5`}>
              <h5 className="text-white font-semibold text-sm">{TARIFF_LABELS[tariff] || tariff}</h5>
            </div>
            <div className="p-4 space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-slate-500">{t('courses.full_price')}</span>
                <span className="font-bold text-slate-900 text-sm">
                  {formatPrice(tr.full)} {tr.monthly ? t('courses.per_month') : t('courses.sum')}
                </span>
              </div>
              {tr.d10 > 0 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium">-10%</span>
                  <span className="text-sm text-slate-700">{formatPrice(tr.d10)}</span>
                </div>
              )}
              {tr.d15 > 0 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium">-15%</span>
                  <span className="text-sm text-slate-700">{formatPrice(tr.d15)}</span>
                </div>
              )}
              {tr.d20 > 0 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium">-20%</span>
                  <span className="text-sm text-slate-700">{formatPrice(tr.d20)}</span>
                </div>
              )}
              {features.length > 0 && (
                <div className="pt-2 mt-2 border-t border-slate-100 space-y-1.5">
                  {features.map((f, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <CheckCircle2 size={12} className="text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-[11px] text-slate-600">{f}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CourseCard({ course, studentCount, groupCount, isAdmin, onEdit, onDelete }) {
  const { t } = useLanguage()
  const REGION_LABELS = useRegionLabels()
  const [expanded, setExpanded] = useState(false)
  const pricing = course.pricing || {}
  const availableRegions = Object.keys(pricing)
  const [activeRegion, setActiveRegion] = useState(availableRegions[0] || 'tashkent')

  const minPrice = useMemo(() => {
    try {
      const prices = Object.values(pricing).flatMap(r => Object.values(r).map(v => v.full || Infinity))
      return prices.length > 0 ? Math.min(...prices) : 0
    } catch { return 0 }
  }, [pricing])

  return (
    <div className="glass-card rounded-2xl overflow-hidden transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 md:p-5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 md:gap-4 min-w-0 flex-1 text-left"
        >
          <div className="text-2xl md:text-3xl flex-shrink-0">{course.icon || '📚'}</div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 text-base md:text-lg truncate">{course.name}</h3>
            <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-1">
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <BookOpen size={12} /> {course.duration || '—'}
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Users size={12} /> {studentCount} {t('courses.students_count')}
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <GraduationCap size={12} /> {groupCount} {t('courses.groups_count')}
              </span>
              <div className="flex gap-1">
                {availableRegions.map(r => (
                  <span key={r} className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    {r === 'tashkent' ? 'ТАШ' : r === 'fergana' ? 'ФЕР/САМ' : 'ОНЛ'}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </button>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {minPrice > 0 && (
            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-lg hidden sm:block">
              от {formatPrice(minPrice)} {t('courses.sum')}
            </span>
          )}
          {isAdmin && (
            <>
              <button
                onClick={() => onEdit(course)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                title={t('courses.tooltip_edit')}
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => onDelete(course)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title={t('courses.tooltip_delete')}
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
          <button onClick={() => setExpanded(!expanded)} className="p-1">
            {expanded ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 md:px-5 pb-4 md:pb-5 border-t border-slate-100">
          {/* Description */}
          {course.description && (
            <div className="mt-4 mb-4 flex items-start gap-2 bg-blue-50/50 rounded-xl p-3">
              <Info size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-slate-600 leading-relaxed">{course.description}</p>
            </div>
          )}

          {/* Course features */}
          {course.features?.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{t('courses.program_title')}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5">
                {course.features.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                    <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Region tabs */}
          {availableRegions.length > 0 && (
            <>
              <div className="flex gap-2 mt-2 mb-4 flex-wrap">
                {availableRegions.map(r => (
                  <button
                    key={r}
                    onClick={() => setActiveRegion(r)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      activeRegion === r
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {r === 'online' ? <Monitor size={14} /> : <MapPin size={14} />}
                    {REGION_LABELS[r] || r}
                  </button>
                ))}
              </div>

              {/* Pricing table with tariff features */}
              <PricingTable pricing={pricing} region={activeRegion} tariffFeatures={course.tariffFeatures} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function Courses() {
  const { t } = useLanguage()
  const { courses, addCourse, updateCourse, deleteCourse, groups, students } = useData()
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingCourse, setEditingCourse] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const isAdmin = user?.role === 'owner' || user?.role === 'admin'

  // Count students and groups per course from real data
  const courseStats = useMemo(() => {
    const stats = {}
    courses.forEach(c => {
      stats[c.name] = { students: 0, groups: 0 }
    })

    groups.forEach(g => {
      if (stats[g.course]) {
        stats[g.course].groups += 1
      }
    })

    students.forEach(s => {
      const studentGroup = groups.find(g => g.id === s.groupId || g.name === s.group)
      const courseName = studentGroup?.course || s.course
      if (courseName && stats[courseName]) {
        stats[courseName].students += 1
      }
    })

    return stats
  }, [courses, groups, students])

  const filteredCourses = courses.filter(c =>
    c.name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const totalStudents = Object.values(courseStats).reduce((sum, s) => sum + s.students, 0)
  const totalGroups = Object.values(courseStats).reduce((sum, s) => sum + s.groups, 0)

  const handleSave = async (data) => {
    if (editingCourse) {
      await updateCourse(editingCourse.id, data)
    } else {
      await addCourse(data)
    }
    setShowForm(false)
    setEditingCourse(null)
  }

  const handleEdit = (course) => {
    setEditingCourse(course)
    setShowForm(true)
  }

  const handleDelete = async () => {
    if (confirmDelete) {
      await deleteCourse(confirmDelete.id)
      setConfirmDelete(null)
    }
  }

  // Build comparison table from actual course data
  const comparisonData = useMemo(() => {
    const tariffs = ['standard', 'vip', 'premium', 'individual']
    return tariffs.map(tariff => {
      const label = TARIFF_LABELS[tariff]
      // Get Tashkent prices from courses
      const prices = {}
      courses.forEach(c => {
        const t = c.pricing?.tashkent?.[tariff]
        if (t) {
          prices[c.name] = t
        }
      })
      return { tariff, label, prices }
    }).filter(row => Object.keys(row.prices).length > 0)
  }, [courses])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">{t('courses.heading')}</h2>
          <p className="text-slate-500 mt-1">{courses.length} {t('courses.stat_courses')} · {totalGroups} {t('courses.groups_count')} · {totalStudents} {t('courses.students_count')}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={t('courses.search_placeholder')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="px-4 py-2 bg-white/70 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-56"
          />
          {isAdmin && (
            <button
              onClick={() => { setEditingCourse(null); setShowForm(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <Plus size={16} /> {t('courses.btn_new')}
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="glass-card rounded-xl p-4">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mb-1">
            <BookOpen size={16} className="text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{courses.length}</p>
          <p className="text-xs text-slate-500">{t('courses.stat_courses')}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center mb-1">
            <Tag size={16} className="text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">4</p>
          <p className="text-xs text-slate-500">{t('courses.stat_tariffs')}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center mb-1">
            <MapPin size={16} className="text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">3</p>
          <p className="text-xs text-slate-500">{t('courses.stat_regions')}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center mb-1">
            <Users size={16} className="text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{totalStudents}</p>
          <p className="text-xs text-slate-500">{t('courses.stat_students')}</p>
        </div>
      </div>

      {/* Quick price comparison — Tashkent */}
      {comparisonData.length > 0 && (
        <div className="glass-card rounded-2xl p-4 md:p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">{t('courses.comparison_title')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">{t('courses.th_tariff')}</th>
                  {courses.filter(c => c.pricing?.tashkent).map(c => (
                    <th key={c.id} className="text-right py-2 px-3 text-slate-500 font-medium text-xs">{c.icon} {c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((row, i) => (
                  <tr key={row.tariff} className={`${i < comparisonData.length - 1 ? 'border-b border-slate-50' : ''} hover:bg-slate-50/50`}>
                    <td className="py-2.5 px-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-lg border ${TARIFF_COLORS[row.tariff] || ''}`}>{row.label}</span>
                    </td>
                    {courses.filter(c => c.pricing?.tashkent).map(c => {
                      const tp = row.prices[c.name]
                      return (
                        <td key={c.id} className="py-2.5 px-3 text-right font-semibold text-slate-900 text-xs">
                          {tp ? `${formatPrice(tp.full)}${tp.monthly ? ' ' + t('courses.per_month') : ''}` : <span className="text-slate-300">—</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Course list with expandable pricing */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">{t('courses.all_courses')}</h3>
        {filteredCourses.map(course => (
          <CourseCard
            key={course.id}
            course={course}
            studentCount={courseStats[course.name]?.students || 0}
            groupCount={courseStats[course.name]?.groups || 0}
            isAdmin={isAdmin}
            onEdit={handleEdit}
            onDelete={setConfirmDelete}
          />
        ))}
        {filteredCourses.length === 0 && (
          <div className="glass-card rounded-2xl p-8 text-center text-slate-400">
            {t('courses.empty')}
          </div>
        )}
      </div>

      {/* Course Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">
                {editingCourse ? t('courses.modal_edit') : t('courses.modal_new')}
              </h3>
              <button onClick={() => { setShowForm(false); setEditingCourse(null) }} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="p-5">
              <CourseForm
                course={editingCourse}
                onClose={() => { setShowForm(false); setEditingCourse(null) }}
                onSave={handleSave}
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-2">{t('courses.delete_title')}</h3>
            <p className="text-sm text-slate-500 mb-1">
              <span className="text-lg mr-1">{confirmDelete.icon}</span>
              <strong>{confirmDelete.name}</strong>
            </p>
            <p className="text-xs text-red-500 mb-4">
              {t('courses.delete_warning')}
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">
                {t('courses.btn_cancel')}
              </button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">
                {t('courses.btn_delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
