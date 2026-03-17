import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { useData } from '../contexts/DataContext'
import { courseDistribution } from '../data/mockData'

const coursesDetail = [
  { name: 'Английский (General)', level: 'A1-C2', duration: '6 мес', price: 1500000, studentsTotal: 185, branches: ['tashkent', 'samarkand', 'fergana'] },
  { name: 'Подготовка к IELTS', level: 'B2+', duration: '4 мес', price: 2500000, studentsTotal: 52, branches: ['tashkent', 'samarkand'] },
  { name: 'Математика', level: 'Все', duration: '9 мес', price: 1200000, studentsTotal: 145, branches: ['tashkent', 'samarkand', 'fergana'] },
  { name: 'IT/Программирование', level: 'Начальный-Продвинутый', duration: '8 мес', price: 2000000, studentsTotal: 118, branches: ['tashkent', 'samarkand', 'fergana'] },
  { name: 'Русский язык', level: 'A1-B2', duration: '6 мес', price: 1000000, studentsTotal: 78, branches: ['tashkent', 'fergana'] },
  { name: 'Корейский язык', level: 'A1-B1', duration: '6 мес', price: 1300000, studentsTotal: 35, branches: ['tashkent'] },
  { name: 'Подготовка к SAT', level: 'Все', duration: '5 мес', price: 2200000, studentsTotal: 28, branches: ['tashkent'] },
  { name: 'Робототехника', level: '7-14 лет', duration: '9 мес', price: 1800000, studentsTotal: 42, branches: ['tashkent', 'samarkand'] },
]

const revenueByCourseBranch = [
  { course: 'Англ.', tashkent: 95, samarkand: 55, fergana: 35 },
  { course: 'IELTS', tashkent: 48, samarkand: 22, fergana: 0 },
  { course: 'Матем.', tashkent: 52, samarkand: 38, fergana: 28 },
  { course: 'IT', tashkent: 55, samarkand: 32, fergana: 24 },
  { course: 'Рус. яз', tashkent: 18, samarkand: 0, fergana: 15 },
  { course: 'Другие', tashkent: 17, samarkand: 29, fergana: 22 },
]

export default function Courses() {
  const { branches } = useData()
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-slate-900">Курсы</h2>
        <p className="text-slate-500 mt-1">{coursesDetail.length} курсов в системе</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Course Distribution */}
        <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Доля учеников по курсам</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={courseDistribution}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}%`}
              >
                {courseDistribution.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue by Course & Branch */}
        <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-slate-100 lg:col-span-2">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Доход по курсам и филиалам (млн сум)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={revenueByCourseBranch}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="course" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="tashkent" fill="#3b82f6" name="Ташкент" radius={[4, 4, 0, 0]} />
              <Bar dataKey="samarkand" fill="#10b981" name="Самарканд" radius={[4, 4, 0, 0]} />
              <Bar dataKey="fergana" fill="#f59e0b" name="Фергана" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Course List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left py-3 px-4 text-slate-500 font-medium">Курс</th>
                <th className="text-left py-3 px-4 text-slate-500 font-medium hidden md:table-cell">Уровень</th>
                <th className="text-center py-3 px-4 text-slate-500 font-medium hidden md:table-cell">Длительность</th>
                <th className="text-right py-3 px-4 text-slate-500 font-medium">Цена/мес</th>
                <th className="text-center py-3 px-4 text-slate-500 font-medium">Учеников</th>
                <th className="text-left py-3 px-4 text-slate-500 font-medium hidden lg:table-cell">Филиалы</th>
              </tr>
            </thead>
            <tbody>
              {coursesDetail.map((course, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-medium text-slate-900">{course.name}</td>
                  <td className="py-3 px-4 text-slate-600 hidden md:table-cell">{course.level}</td>
                  <td className="py-3 px-4 text-center text-slate-600 hidden md:table-cell">{course.duration}</td>
                  <td className="py-3 px-4 text-right font-semibold">
                    {new Intl.NumberFormat('uz-UZ').format(course.price)} сум
                  </td>
                  <td className="py-3 px-4 text-center font-semibold">{course.studentsTotal}</td>
                  <td className="py-3 px-4 hidden lg:table-cell">
                    <div className="flex gap-1 flex-wrap">
                      {course.branches.map(bId => (
                        <span key={bId} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                          {branches.find(b => b.id === bId)?.name}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
