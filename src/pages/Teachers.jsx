import { useState } from 'react'
import { Star, Users, BookOpen, Plus, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useLanguage } from '../contexts/LanguageContext'
import { formatCurrency } from '../data/mockData'
import Modal from '../components/Modal'
import TeacherForm from '../components/TeacherForm'

export default function Teachers() {
  const { user, hasPermission } = useAuth()
  const { teachers, branches, deleteTeacher } = useData()
  const { t } = useLanguage()
  const [branchFilter, setBranchFilter] = useState(user.branch !== 'all' ? user.branch : 'all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const canAdd = hasPermission('teachers', 'add')
  const canEdit = hasPermission('teachers', 'edit')
  const canDelete = hasPermission('teachers', 'delete')
  const canSeeSalaries = hasPermission('teachers', 'salaries')

  const filtered = teachers.filter(
    (tc) => branchFilter === 'all' || tc.branch === branchFilter
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">{t('teachers.title')}</h2>
          <p className="text-slate-500 mt-1">{t('teachers.count', { count: teachers.length })}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {user.branch === 'all' && (
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
              className="glass-input text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">{t('common.allBranches')}</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {canAdd && (
            <button onClick={() => { setEditingTeacher(null); setModalOpen(true) }}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25 flex items-center gap-2">
              <Plus size={16} /> {t('teachers.addTeacher')}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((teacher) => (
          <div key={teacher.id} className="glass-card rounded-2xl p-4 md:p-6 hover:shadow-md transition-shadow">
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
              <div className="text-center bg-white/40 rounded-xl p-2">
                <BookOpen size={16} className="text-slate-400 mx-auto mb-1" />
                <p className="text-lg font-bold">{teacher.groups}</p>
                <p className="text-xs text-slate-500">{t('teachers.groups')}</p>
              </div>
              <div className="text-center bg-white/40 rounded-xl p-2">
                <Users size={16} className="text-slate-400 mx-auto mb-1" />
                <p className="text-lg font-bold">{teacher.students}</p>
                <p className="text-xs text-slate-500">{t('teachers.students')}</p>
              </div>
              <div className="text-center bg-white/40 rounded-xl p-2">
                <Star size={16} className="text-yellow-500 mx-auto mb-1" />
                <p className="text-lg font-bold">{teacher.rating}</p>
                <p className="text-xs text-slate-500">{t('teachers.rating')}</p>
              </div>
            </div>

            {canSeeSalaries && (
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <span className="text-sm text-slate-500">{t('teachers.salary')}</span>
                <span className="text-sm font-semibold text-slate-900">{formatCurrency(teacher.salary)}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {canSeeSalaries && (
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">{t('teachers.branchSummary')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/40 border-b border-white/30">
                  <th className="text-left py-3 px-4 text-slate-500 font-medium">{t('teachers.branchCol')}</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">{t('teachers.teachersCol')}</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium hidden md:table-cell">{t('teachers.totalGroups')}</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium hidden md:table-cell">{t('teachers.totalStudents')}</th>
                  <th className="text-right py-3 px-4 text-slate-500 font-medium">{t('teachers.fot')}</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium hidden md:table-cell">{t('teachers.avgRating')}</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch) => {
                  const bt = teachers.filter(tc => tc.branch === branch.id)
                  const totalSalary = bt.reduce((s, tc) => s + tc.salary, 0)
                  const avgRating = bt.length > 0 ? (bt.reduce((s, tc) => s + tc.rating, 0) / bt.length).toFixed(1) : '—'
                  return (
                    <tr key={branch.id} className="border-b border-slate-50">
                      <td className="py-3 px-4 font-medium">{branch.name}</td>
                      <td className="py-3 px-4 text-center">{bt.length}</td>
                      <td className="py-3 px-4 text-center hidden md:table-cell">{bt.reduce((s, tc) => s + tc.groups, 0)}</td>
                      <td className="py-3 px-4 text-center hidden md:table-cell">{bt.reduce((s, tc) => s + tc.students, 0)}</td>
                      <td className="py-3 px-4 text-right font-semibold">{formatCurrency(totalSalary)}</td>
                      <td className="py-3 px-4 text-center hidden md:table-cell"><span className="text-yellow-500">&#9733;</span> {avgRating}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingTeacher ? t('teachers.editTeacher') : t('teachers.newTeacher')} size="lg">
        <TeacherForm teacher={editingTeacher} onClose={() => setModalOpen(false)} />
      </Modal>

      <Modal isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} title={t('common.confirmDelete')} size="sm">
        <p className="text-sm text-slate-600 mb-4">{t('teachers.deleteConfirm')}</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">{t('common.cancel')}</button>
          <button onClick={() => { deleteTeacher(confirmDelete); setConfirmDelete(null) }} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">{t('common.delete')}</button>
        </div>
      </Modal>
    </div>
  )
}
