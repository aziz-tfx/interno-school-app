import { useState } from 'react'
import { Search, Filter, Plus, Pencil, Trash2, Shield, Users, ShieldCheck } from 'lucide-react'
import { useAuth, ROLE_LABELS, ROLE_COLORS } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useLanguage } from '../contexts/LanguageContext'
import Modal from '../components/Modal'
import EmployeeForm from '../components/EmployeeForm'
import AccessControl from './AccessControl'

export default function Employees() {
  const { user, employees, hasPermission, deleteEmployee } = useAuth()
  const { getBranchNames, teachers, deleteTeacher } = useData()
  const { t } = useLanguage()
  const BRANCH_LABELS = { all: t('common.allBranches'), ...getBranchNames() }
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEmp, setEditingEmp] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [activeTab, setActiveTab] = useState('employees')

  const canAdd = hasPermission('employees', 'add')
  const canEdit = hasPermission('employees', 'edit')
  const canDelete = hasPermission('employees', 'delete')
  const canSettings = hasPermission('settings')

  // Branch directors only see their branch
  const visibleEmployees = user.branch !== 'all'
    ? employees.filter(e => e.branch === user.branch || e.branch === 'all')
    : employees

  const filtered = visibleEmployees.filter(e => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.login.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'all' || e.role === roleFilter
    const matchBranch = branchFilter === 'all' || e.branch === branchFilter
    return matchSearch && matchRole && matchBranch
  })

  const handleEdit = (emp) => {
    setEditingEmp(emp)
    setModalOpen(true)
  }

  const handleAdd = () => {
    setEditingEmp(null)
    setModalOpen(true)
  }

  const handleDelete = async (id) => {
    const emp = employees.find(e => e.id === id)
    if (emp?.role === 'teacher') {
      const linkedTeacher = teachers.find(t => t.employeeId === emp.id || t.name === emp.name)
      if (linkedTeacher) await deleteTeacher(linkedTeacher.id)
    }
    await deleteEmployee(id)
    setConfirmDelete(null)
  }

  const usedRoles = [...new Set(visibleEmployees.map(e => e.role))]

  const tabs = [
    { id: 'employees', label: t('employees.tabs.employees'), icon: Users },
    ...(canSettings ? [{ id: 'access', label: t('employees.tabs.access'), icon: ShieldCheck }] : []),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">{t('employees.title')}</h2>
          <p className="text-slate-500 mt-1">{t('employees.count', { count: visibleEmployees.length })}</p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'employees' && canAdd && (
            <button onClick={handleAdd}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25 flex items-center gap-2">
              <Plus size={16} /> <span className="hidden sm:inline">{t('employees.addEmployee')}</span><span className="sm:hidden">{t('employees.add')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex gap-1 glass rounded-xl p-1 w-fit">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Employees tab */}
      {activeTab === 'employees' && (
        <>
          {/* Filters */}
          <div className="glass-card rounded-2xl p-4 flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder={t('employees.searchPlaceholder')} value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-slate-400" />
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
                className="bg-white/50 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">{t('common.allRoles')}</option>
                {usedRoles.map(r => <option key={r} value={r}>{t('roles.' + r)}</option>)}
              </select>
              {user.branch === 'all' && (
                <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                  className="bg-white/50 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="all">{t('common.allBranches')}</option>
                  {Object.entries(BRANCH_LABELS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/40 border-b border-white/30">
                    <th className="text-left py-3 px-4 text-slate-500 font-medium">{t('employees.table.employee')}</th>
                    <th className="text-left py-3 px-4 text-slate-500 font-medium">{t('employees.table.role')}</th>
                    <th className="text-left py-3 px-4 text-slate-500 font-medium hidden md:table-cell">{t('employees.table.branch')}</th>
                    <th className="text-left py-3 px-4 text-slate-500 font-medium hidden lg:table-cell">{t('employees.table.login')}</th>
                    <th className="text-left py-3 px-4 text-slate-500 font-medium hidden lg:table-cell">{t('employees.table.phone')}</th>
                    <th className="text-center py-3 px-4 text-slate-500 font-medium">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(emp => (
                    <tr key={emp.id} className="border-b border-slate-50 hover:bg-blue-50/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 ${ROLE_COLORS[emp.role] || 'bg-slate-500'} rounded-full flex items-center justify-center text-white text-xs font-bold`}>
                            {emp.avatar || '?'}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{emp.name}</p>
                            {emp.id === user.id && <span className="text-xs text-blue-500">({t('common.you')})</span>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[emp.role] || 'bg-slate-500'} text-white`}>
                          <Shield size={10} />
                          {t('roles.' + emp.role)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 hidden md:table-cell">{BRANCH_LABELS[emp.branch] || emp.branch}</td>
                      <td className="py-3 px-4 hidden lg:table-cell">
                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-mono">{emp.login}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 hidden lg:table-cell">{emp.phone || '—'}</td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <button onClick={() => handleEdit(emp)}
                              className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors" title={t('common.edit')}>
                              <Pencil size={15} className="text-slate-500" />
                            </button>
                          )}
                          {canDelete && emp.id !== user.id && emp.role !== 'owner' && (
                            <button onClick={() => setConfirmDelete(emp.id)}
                              className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" title={t('common.delete')}>
                              <Trash2 size={15} className="text-red-500" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-slate-400">{t('employees.notFound')}</div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {usedRoles.map(role => {
              const count = visibleEmployees.filter(e => e.role === role).length
              return (
                <div key={role} className="glass-card rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-slate-900">{count}</p>
                  <p className="text-xs text-slate-500">{t('roles.' + role)}</p>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Access Control tab */}
      {activeTab === 'access' && <AccessControl embedded />}

      {/* Add/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}
        title={editingEmp ? t('employees.editModal') : t('employees.newModal')} size="lg">
        <EmployeeForm employee={editingEmp} onClose={() => setModalOpen(false)} />
      </Modal>

      {/* Confirm Delete */}
      <Modal isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} title={t('common.confirmDelete')} size="sm">
        <p className="text-sm text-slate-600 mb-4">{t('employees.deleteConfirm')}</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">{t('common.cancel')}</button>
          <button onClick={() => handleDelete(confirmDelete)} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">{t('common.delete')}</button>
        </div>
      </Modal>
    </div>
  )
}
