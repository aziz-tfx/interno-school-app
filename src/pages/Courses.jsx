import { useState, useMemo } from 'react'
import { useData } from '../contexts/DataContext'
import { BookOpen, MapPin, Users, ChevronDown, ChevronUp, Tag, Monitor, GraduationCap } from 'lucide-react'

// ─── Pricing Data from official price list ──────────────────────────
const PRICING = {
  // Все курсы кроме Дата Аналитика
  general: {
    tashkent: {
      standard:  { full: 8000000,  d10: 7200000,  d15: 6800000,  d20: 6400000 },
      vip:       { full: 12000000, d10: 10800000, d15: 10200000, d20: 9600000 },
      premium:   { full: 18000000, d10: 16200000, d15: 15300000, d20: 14400000 },
      individual:{ full: 6000000,  d10: 5400000,  monthly: true },
    },
    fergana: {
      standard:  { full: 4000000,  d10: 3600000,  d15: 3400000,  d20: 3200000 },
      vip:       { full: 6600000,  d10: 5940000,  d15: 5610000,  d20: 5280000 },
      premium:   { full: 10500000, d10: 9450000,  d15: 8925000,  d20: 8400000 },
      individual:{ full: 4000000,  d10: 3600000,  monthly: true },
    },
    online: {
      standard:  { full: 4000000,  d10: 3600000,  d15: 3400000,  d20: 3200000 },
      vip:       { full: 6000000,  d10: 5400000,  d15: 5100000,  d20: 4800000 },
    },
  },
  // Дата Аналитика — отдельный прайс
  dataAnalytics: {
    tashkent: {
      standard:  { full: 6000000,  d10: 5400000,  d15: 5100000,  d20: 4800000 },
      vip:       { full: 9200000,  d10: 8280000,  d15: 7820000,  d20: 7360000 },
    },
    online: {
      standard:  { full: 1000000, monthly: true },
      vip:       { full: 1500000, monthly: true },
    },
  },
}

const COURSES = [
  { id: 'interior', name: 'Интерьер Дизайн', icon: '🎨', duration: '6 мес', pricingKey: 'general' },
  { id: 'english', name: 'Английский', icon: '🇬🇧', duration: '6 мес', pricingKey: 'general' },
  { id: 'ielts', name: 'Подготовка к IELTS', icon: '📝', duration: '4 мес', pricingKey: 'general' },
  { id: 'math', name: 'Математика', icon: '📐', duration: '9 мес', pricingKey: 'general' },
  { id: 'it', name: 'IT/Программирование', icon: '💻', duration: '8 мес', pricingKey: 'general' },
  { id: 'russian', name: 'Русский язык', icon: '🇷🇺', duration: '6 мес', pricingKey: 'general' },
  { id: 'korean', name: 'Корейский язык', icon: '🇰🇷', duration: '6 мес', pricingKey: 'general' },
  { id: 'sat', name: 'Подготовка к SAT', icon: '🎓', duration: '5 мес', pricingKey: 'general' },
  { id: 'robotics', name: 'Робототехника', icon: '🤖', duration: '9 мес', pricingKey: 'general' },
  { id: 'data', name: 'Дата Аналитика', icon: '📊', duration: '6 мес', pricingKey: 'dataAnalytics' },
]

const REGION_LABELS = {
  tashkent: 'Ташкент',
  fergana: 'Фергана / Самарканд',
  online: 'Онлайн',
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

function PricingTable({ pricing, region }) {
  const regionData = pricing[region]
  if (!regionData) return <p className="text-sm text-slate-400 py-3">Нет данных для этого региона</p>

  const tariffs = Object.keys(regionData)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {tariffs.map(tariff => {
        const t = regionData[tariff]
        return (
          <div key={tariff} className="rounded-xl border border-slate-200 overflow-hidden bg-white/60">
            <div className={`bg-gradient-to-r ${TARIFF_HEADER_COLORS[tariff] || 'from-slate-500 to-slate-600'} px-4 py-2.5`}>
              <h5 className="text-white font-semibold text-sm">{TARIFF_LABELS[tariff] || tariff}</h5>
            </div>
            <div className="p-4 space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-slate-500">Полная цена</span>
                <span className="font-bold text-slate-900 text-sm">
                  {formatPrice(t.full)} {t.monthly ? '/ мес' : 'сум'}
                </span>
              </div>
              {t.d10 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium">-10%</span>
                  <span className="text-sm text-slate-700">{formatPrice(t.d10)}</span>
                </div>
              )}
              {t.d15 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium">-15%</span>
                  <span className="text-sm text-slate-700">{formatPrice(t.d15)}</span>
                </div>
              )}
              {t.d20 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium">-20%</span>
                  <span className="text-sm text-slate-700">{formatPrice(t.d20)}</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CourseCard({ course, studentCount, groupCount }) {
  const [expanded, setExpanded] = useState(false)
  const [activeRegion, setActiveRegion] = useState('tashkent')
  const pricing = PRICING[course.pricingKey]
  const availableRegions = Object.keys(pricing)

  return (
    <div className="glass-card rounded-2xl overflow-hidden transition-all duration-300">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-white/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <div className="text-2xl md:text-3xl flex-shrink-0">{course.icon}</div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 text-base md:text-lg truncate">{course.name}</h3>
            <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-1">
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <BookOpen size={12} /> {course.duration}
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Users size={12} /> {studentCount} учеников
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <GraduationCap size={12} /> {groupCount} групп
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
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-lg hidden sm:block">
            от {formatPrice(
              Math.min(...Object.values(pricing).flatMap(r => Object.values(r).map(t => t.full || Infinity)))
            )} сум
          </span>
          {expanded ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
        </div>
      </button>

      {/* Expanded pricing */}
      {expanded && (
        <div className="px-4 md:px-5 pb-4 md:pb-5 border-t border-slate-100">
          {/* Region tabs */}
          <div className="flex gap-2 mt-4 mb-4 flex-wrap">
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
                {REGION_LABELS[r]}
              </button>
            ))}
          </div>

          {/* Pricing table */}
          <PricingTable pricing={pricing} region={activeRegion} />
        </div>
      )}
    </div>
  )
}

export default function Courses() {
  const { groups, students } = useData()
  const [searchQuery, setSearchQuery] = useState('')

  // Count students and groups per course from real data
  const courseStats = useMemo(() => {
    const stats = {}
    COURSES.forEach(c => {
      stats[c.name] = { students: 0, groups: 0 }
    })

    groups.forEach(g => {
      const courseName = g.course
      if (stats[courseName]) {
        stats[courseName].groups += 1
      }
    })

    students.forEach(s => {
      // Find the group of this student and get its course
      const studentGroup = groups.find(g => g.id === s.groupId || g.name === s.group)
      const courseName = studentGroup?.course || s.course
      if (courseName && stats[courseName]) {
        stats[courseName].students += 1
      }
    })

    return stats
  }, [groups, students])

  const filteredCourses = COURSES.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const totalStudents = Object.values(courseStats).reduce((sum, s) => sum + s.students, 0)
  const totalGroups = Object.values(courseStats).reduce((sum, s) => sum + s.groups, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">Курсы и тарифы</h2>
          <p className="text-slate-500 mt-1">{COURSES.length} курсов · {totalGroups} групп · {totalStudents} учеников</p>
        </div>
        <input
          type="text"
          placeholder="Поиск курса..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="px-4 py-2 bg-white/70 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <BookOpen size={16} className="text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">{COURSES.length}</p>
          <p className="text-xs text-slate-500">Курсов</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <Tag size={16} className="text-purple-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">4</p>
          <p className="text-xs text-slate-500">Тарифа</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <MapPin size={16} className="text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">3</p>
          <p className="text-xs text-slate-500">Региона</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Users size={16} className="text-amber-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">{totalStudents}</p>
          <p className="text-xs text-slate-500">Учеников</p>
        </div>
      </div>

      {/* Quick price comparison */}
      <div className="glass-card rounded-2xl p-4 md:p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Сравнение тарифов — Ташкент (полная цена)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Тариф</th>
                <th className="text-right py-2 px-3 text-slate-500 font-medium">Основные курсы</th>
                <th className="text-right py-2 px-3 text-slate-500 font-medium">Дата Аналитика</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="py-2.5 px-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-lg border ${TARIFF_COLORS.standard}`}>Стандарт</span>
                </td>
                <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatPrice(8000000)} сум</td>
                <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatPrice(6000000)} сум</td>
              </tr>
              <tr className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="py-2.5 px-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-lg border ${TARIFF_COLORS.vip}`}>VIP</span>
                </td>
                <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatPrice(12000000)} сум</td>
                <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatPrice(9200000)} сум</td>
              </tr>
              <tr className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="py-2.5 px-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-lg border ${TARIFF_COLORS.premium}`}>Премиум</span>
                </td>
                <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatPrice(18000000)} сум</td>
                <td className="py-2.5 px-3 text-right text-slate-400">—</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="py-2.5 px-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-lg border ${TARIFF_COLORS.individual}`}>Индивидуальный</span>
                </td>
                <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatPrice(6000000)} / мес</td>
                <td className="py-2.5 px-3 text-right text-slate-400">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Course list with expandable pricing */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">Все курсы</h3>
        {filteredCourses.map(course => (
          <CourseCard
            key={course.id}
            course={course}
            studentCount={courseStats[course.name]?.students || 0}
            groupCount={courseStats[course.name]?.groups || 0}
          />
        ))}
        {filteredCourses.length === 0 && (
          <div className="glass-card rounded-2xl p-8 text-center text-slate-400">
            Курс не найден
          </div>
        )}
      </div>
    </div>
  )
}
