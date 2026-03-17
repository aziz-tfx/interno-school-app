import { useState } from 'react'
import { MapPin, Phone, User, Calendar, Users, GraduationCap, BookOpen, TrendingUp, Plus, Pencil, Trash2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { expenseCategories, formatCurrency } from '../data/mockData'
import Modal from '../components/Modal'
import BranchForm from '../components/BranchForm'

export default function Branches() {
  const { hasPermission } = useAuth()
  const { branches, students, teachers, addBranch, updateBranch, deleteBranch } = useData()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const canAdd = hasPermission('branches') // owner/admin
  const canEdit = hasPermission('branches')
  const canDelete = hasPermission('branches')

  const handleAdd = () => {
    setEditingBranch(null)
    setModalOpen(true)
  }

  const handleEdit = (branch) => {
    setEditingBranch(branch)
    setModalOpen(true)
  }

  const handleSave = (data) => {
    if (editingBranch) {
      updateBranch(editingBranch.id, data)
    } else {
      addBranch(data)
    }
    setModalOpen(false)
  }

  const handleDelete = (id) => {
    const branchStudents = students.filter(s => s.branch === id).length
    const branchTeachers = teachers.filter(t => t.branch === id).length
    if (branchStudents > 0 || branchTeachers > 0) {
      alert(`Невозможно удалить филиал: к нему привязано ${branchStudents} учеников и ${branchTeachers} учителей. Сначала переведите их в другой филиал.`)
      setConfirmDelete(null)
      return
    }
    deleteBranch(id)
    setConfirmDelete(null)
  }

  // Dynamic expense chart data — use actual branches
  const dynamicExpenseData = expenseCategories.map(cat => {
    const row = { category: cat.category }
    branches.forEach(b => {
      row[b.id] = cat[b.id] || 0
    })
    return row
  })

  // Colors for chart bars
  const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">Филиалы</h2>
          <p className="text-slate-500 mt-1">Всего {branches.length} филиалов</p>
        </div>
        {canAdd && (
          <button onClick={handleAdd}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
            <Plus size={16} /> Добавить филиал
          </button>
        )}
      </div>

      {/* Branch Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {branches.map((branch, idx) => {
          const profit = branch.monthlyRevenue - branch.monthlyExpenses
          const margin = branch.monthlyRevenue > 0 ? Math.round((profit / branch.monthlyRevenue) * 100) : 0
          const branchStudentCount = students.filter(s => s.branch === branch.id).length
          const branchTeacherCount = teachers.filter(t => t.branch === branch.id).length
          const actualStudents = branchStudentCount || branch.students
          const occupancy = branch.capacity > 0 ? Math.round((actualStudents / branch.capacity) * 100) : 0

          return (
            <div key={branch.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 md:p-6 text-white relative">
                <h3 className="text-xl font-bold">{branch.name}</h3>
                <div className="flex items-center gap-2 mt-2 text-blue-100">
                  <MapPin size={14} />
                  <span className="text-sm">{branch.address}</span>
                </div>
                {/* Edit / Delete buttons */}
                {(canEdit || canDelete) && (
                  <div className="absolute top-4 right-4 flex gap-1">
                    {canEdit && (
                      <button onClick={() => handleEdit(branch)}
                        className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors" title="Редактировать">
                        <Pencil size={14} />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => setConfirmDelete(branch.id)}
                        className="p-1.5 bg-white/20 hover:bg-red-500/50 rounded-lg transition-colors" title="Удалить">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="p-4 md:p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <User size={16} className="text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Директор</p>
                      <p className="text-sm font-medium">{branch.director || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone size={16} className="text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Телефон</p>
                      <p className="text-sm font-medium">{branch.phone || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Открыт</p>
                      <p className="text-sm font-medium">{branch.openDate || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-500">&#9733;</span>
                    <div>
                      <p className="text-xs text-slate-500">Рейтинг</p>
                      <p className="text-sm font-medium">{branch.rating > 0 ? `${branch.rating}/5.0` : '—'}</p>
                    </div>
                  </div>
                </div>

                <hr className="border-slate-100" />

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <GraduationCap size={18} className="text-blue-600 mx-auto mb-1" />
                    <p className="text-lg font-bold text-slate-900">{actualStudents}</p>
                    <p className="text-xs text-slate-500">Ученики</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <Users size={18} className="text-purple-600 mx-auto mb-1" />
                    <p className="text-lg font-bold text-slate-900">{branchTeacherCount || branch.teachers}</p>
                    <p className="text-xs text-slate-500">Учителя</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-3">
                    <BookOpen size={18} className="text-emerald-600 mx-auto mb-1" />
                    <p className="text-lg font-bold text-slate-900">{branch.groups || 0}</p>
                    <p className="text-xs text-slate-500">Группы</p>
                  </div>
                </div>

                <hr className="border-slate-100" />

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Доход</span>
                    <span className="text-sm font-semibold text-emerald-600">{formatCurrency(branch.monthlyRevenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Расходы</span>
                    <span className="text-sm font-semibold text-red-500">{formatCurrency(branch.monthlyExpenses)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-2">
                    <span className="text-sm font-medium text-slate-700">Прибыль</span>
                    <span className="text-sm font-bold text-blue-600">{formatCurrency(profit)}</span>
                  </div>
                  {branch.monthlyRevenue > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">Маржа</span>
                      <span className="text-sm font-semibold">{margin}%</span>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Загруженность</span>
                    <span>{actualStudents}/{branch.capacity} ({occupancy}%)</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all ${occupancy > 85 ? 'bg-red-500' : occupancy > 70 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(occupancy, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Expense Comparison */}
      {branches.length > 0 && (
        <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-slate-100">
          <h3 className="text-base md:text-lg font-semibold text-slate-900 mb-4">Структура расходов по филиалам (млн сум)</h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={dynamicExpenseData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="category" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
              <Legend />
              {branches.map((b, i) => (
                <Bar key={b.id} dataKey={b.id} fill={b.color || CHART_COLORS[i % CHART_COLORS.length]} name={b.name} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}
        title={editingBranch ? 'Редактировать филиал' : 'Новый филиал'} size="lg">
        <BranchForm branch={editingBranch} onSave={handleSave} onClose={() => setModalOpen(false)} />
      </Modal>

      {/* Confirm Delete Modal */}
      <Modal isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Подтвердите удаление" size="sm">
        <p className="text-sm text-slate-600 mb-4">Вы уверены, что хотите удалить этот филиал? Это действие нельзя отменить.</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">Отмена</button>
          <button onClick={() => handleDelete(confirmDelete)} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">Удалить</button>
        </div>
      </Modal>
    </div>
  )
}
