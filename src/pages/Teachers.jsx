import { useState } from 'react'
import { Star, Users, BookOpen, Plus, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { formatCurrency } from '../data/mockData'
import Modal from '../components/Modal'
import TeacherForm from '../components/TeacherForm'

export default function Teachers() {
  const { user, hasPermission } = useAuth()
  const { teachers, branches, deleteTeacher } = useData()
  const [branchFilter, setBranchFilter] = useState(user.branch !== 'all' ? user.branch : 'all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const canAdd = hasPermission('teachers', 'add')
  const canEdit = hasPermission('teachers', 'edit')
  const canDelete = hasPermission('teachers', 'delete')
  const canSeeSalaries = hasPermission('teachers', 'salaries')

  const filtered = teachers.filter(
    (t) => branchFilter === 'all' || t.branch === branchFilter
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Учителя</h2>
          <p className="text-slate-500 mt-1">Всего {teachers.length} учителей</p>
        </div>
        <div className="flex items-center gap-3">
          {user.branch === 'all' && (
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
              className="bg-white border border-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">Все филиалы</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {canAdd && (
            <button onClick={() => { setEditingTeacher(null); setModalOpen(true) }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
              <Plus size={16} /> Добавить учителя
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((teacher) => (
          <div key={teacher.id} className="bg-white rounded-xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-slate-900">{teacher.name}</h3>
                <p className="text-sm text-slate-500">{teacher.subject}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                  {branches.find(b => b.id === teacher.branch)?.name}
                </span>
                {(canEdit || canDelete) && (
                  <div className="flex gap-1">
                    {canEdit && (
                      <button onClick={() => { setEditingTeacher(teacher); setModalOpen(true) }}
                        className="p-1 hover:bg-blue-50 rounded transition-colors"><Pencil size={14} className="text-blue-600" /></button>
                    )}
                    {canDelete && (
                      <button onClick={() => setConfirmDelete(teacher.id)}
                        className="p-1 hover:bg-red-50 rounded transition-colors"><Trash2 size={14} className="text-red-500" /></button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center bg-slate-50 rounded-lg p-2">
                <BookOpen size={16} className="text-slate-400 mx-auto mb-1" />
                <p className="text-lg font-bold">{teacher.groups}</p>
                <p className="text-xs text-slate-500">Группы</p>
              </div>
              <div className="text-center bg-slate-50 rounded-lg p-2">
                <Users size={16} className="text-slate-400 mx-auto mb-1" />
                <p className="text-lg font-bold">{teacher.students}</p>
                <p className="text-xs text-slate-500">Ученики</p>
              </div>
              <div className="text-center bg-slate-50 rounded-lg p-2">
                <Star size={16} className="text-yellow-500 mx-auto mb-1" />
                <p className="text-lg font-bold">{teacher.rating}</p>
                <p className="text-xs text-slate-500">Рейтинг</p>
              </div>
            </div>

            {canSeeSalaries && (
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <span className="text-sm text-slate-500">Зарплата</span>
                <span className="text-sm font-semibold text-slate-900">{formatCurrency(teacher.salary)}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {canSeeSalaries && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Сводка по филиалам</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left py-3 px-4 text-slate-500 font-medium">Филиал</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">Учителей</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">Всего групп</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">Всего учеников</th>
                  <th className="text-right py-3 px-4 text-slate-500 font-medium">ФОТ</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">Ср. рейтинг</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch) => {
                  const bt = teachers.filter(t => t.branch === branch.id)
                  const totalSalary = bt.reduce((s, t) => s + t.salary, 0)
                  const avgRating = bt.length > 0 ? (bt.reduce((s, t) => s + t.rating, 0) / bt.length).toFixed(1) : '—'
                  return (
                    <tr key={branch.id} className="border-b border-slate-50">
                      <td className="py-3 px-4 font-medium">{branch.name}</td>
                      <td className="py-3 px-4 text-center">{bt.length}</td>
                      <td className="py-3 px-4 text-center">{bt.reduce((s, t) => s + t.groups, 0)}</td>
                      <td className="py-3 px-4 text-center">{bt.reduce((s, t) => s + t.students, 0)}</td>
                      <td className="py-3 px-4 text-right font-semibold">{formatCurrency(totalSalary)}</td>
                      <td className="py-3 px-4 text-center"><span className="text-yellow-500">&#9733;</span> {avgRating}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingTeacher ? 'Редактировать учителя' : 'Новый учитель'} size="lg">
        <TeacherForm teacher={editingTeacher} onClose={() => setModalOpen(false)} />
      </Modal>

      <Modal isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Подтвердите удаление" size="sm">
        <p className="text-sm text-slate-600 mb-4">Вы уверены, что хотите удалить этого учителя?</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">Отмена</button>
          <button onClick={() => { deleteTeacher(confirmDelete); setConfirmDelete(null) }} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">Удалить</button>
        </div>
      </Modal>
    </div>
  )
}
