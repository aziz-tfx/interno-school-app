import { useState } from 'react'
import { Search, Filter, Pencil, Trash2, Plus, Eye, AlertTriangle, Users, Wifi, Clock, BookOpen, User, Monitor, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useLanguage } from '../contexts/LanguageContext'
import { formatCurrency } from '../data/mockData'
import Modal from '../components/Modal'
import StudentForm from '../components/StudentForm'
import StudentProfile from '../components/StudentProfile'
import GroupForm from '../components/GroupForm'

export default function Students() {
  const { user, hasPermission } = useAuth()
  const {
    students, branches, payments, groups, teachers,
    addStudent, deleteStudent, deleteGroup,
    getGroupOfflineCount, getGroupOnlineCount, getGroupStudents,
    getBranchName,
  } = useData()
  const { t } = useLanguage()

  const TABS = [
    { id: 'students', label: t('students.tabs.students') },
    { id: 'groups', label: t('students.tabs.groups') },
  ]

  const [activeTab, setActiveTab] = useState('students')
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState(user.branch !== 'all' ? user.branch : 'all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [profileStudent, setProfileStudent] = useState(null)

  // Group modals
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(null)
  const [groupSearch, setGroupSearch] = useState('')

  const canAdd = hasPermission('students', 'add')
  const canEdit = hasPermission('students', 'edit')
  const canDelete = hasPermission('students', 'delete')

  // ── Scoped data ──
  const allStudents = user.branch !== 'all'
    ? students.filter(s => s.branch === user.branch)
    : students

  const allGroups = user.branch !== 'all'
    ? groups.filter(g => g.branch === user.branch)
    : groups

  // ── Student filters ──
  const filtered = allStudents.filter((s) => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.course || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.group || '').toLowerCase().includes(search.toLowerCase())
    const matchBranch = branchFilter === 'all' || s.branch === branchFilter
    const matchStatus = statusFilter === 'all' || s.status === statusFilter
    const matchGroup = groupFilter === 'all' || s.group === groupFilter
    return matchSearch && matchBranch && matchStatus && matchGroup
  })

  // ── Group filters ──
  const filteredGroups = allGroups.filter(g => {
    const matchSearch = g.name.toLowerCase().includes(groupSearch.toLowerCase()) ||
      (g.course || '').toLowerCase().includes(groupSearch.toLowerCase())
    const matchBranch = branchFilter === 'all' || g.branch === branchFilter
    return matchSearch && matchBranch
  })

  const statusColors = {
    active: 'bg-emerald-100 text-emerald-700',
    debtor: 'bg-red-100 text-red-700',
    frozen: 'bg-slate-100 text-slate-700',
  }
  const statusLabels = {
    active: t('students.status.active'),
    debtor: t('students.status.debtor'),
    frozen: t('students.status.frozen'),
  }

  // ── Handlers ──
  const handleEdit = (e, student) => {
    e.stopPropagation()
    setEditingStudent(student)
    setModalOpen(true)
  }

  const handleAdd = () => {
    setEditingStudent(null)
    setModalOpen(true)
  }

  const handleDelete = (id) => {
    deleteStudent(id)
    setConfirmDelete(null)
  }

  const handleAddGroup = () => {
    setEditingGroup(null)
    setGroupModalOpen(true)
  }

  const handleEditGroup = (group) => {
    setEditingGroup(group)
    setGroupModalOpen(true)
  }

  const handleDeleteGroup = (id) => {
    const grp = groups.find(g => g.id === id)
    if (grp) {
      const studentsInGroup = getGroupStudents(grp.name)
      if (studentsInGroup.length > 0) {
        alert(t('students.cannotDeleteGroup', { count: studentsInGroup.length }))
        setConfirmDeleteGroup(null)
        return
      }
    }
    deleteGroup(id)
    setConfirmDeleteGroup(null)
  }

  const getStudentDebtInfo = (student) => {
    const studentPays = payments.filter(p => p.type === 'income' && String(p.studentId) === String(student.id))
    const totalPaid = studentPays.reduce((sum, p) => sum + p.amount, 0)
    const totalCoursePrice = student.totalCoursePrice || 0
    const debt = totalCoursePrice > 0 ? Math.max(0, totalCoursePrice - totalPaid) : 0
    const lastPayment = studentPays.sort((a, b) => new Date(b.date) - new Date(a.date))[0]
    const nextPaymentDate = lastPayment?.nextPaymentDate
    const isOverdue = nextPaymentDate && new Date(nextPaymentDate) < new Date()
    return { totalPaid, debt, nextPaymentDate, isOverdue, trancheCount: studentPays.length }
  }

  // Unique groups for dropdown
  const uniqueGroups = [...new Set(allStudents.map(s => s.group).filter(Boolean))]

  // ─── Sync orphan payments → create missing student records ───
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  const orphanPayments = payments.filter(p => {
    if (p.type !== 'income' || !p.student) return false
    // No studentId at all, or studentId doesn't match any student
    if (!p.studentId) return true
    return !students.find(s => String(s.id) === String(p.studentId))
  })

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    let created = 0
    // Group orphan payments by student name + phone to avoid duplicates
    const clientMap = new Map()
    for (const p of orphanPayments) {
      const key = `${p.student}__${p.phone || ''}`
      if (!clientMap.has(key)) {
        clientMap.set(key, p)
      }
    }
    for (const [, p] of clientMap) {
      // Check if student already exists by name + phone
      const existing = students.find(s =>
        s.name === p.student && (s.phone === p.phone || (!s.phone && !p.phone))
      )
      if (!existing) {
        try {
          await addStudent({
            name: p.student,
            phone: p.phone || '',
            course: p.course || '',
            branch: p.branch || 'tashkent',
            group: p.group || '',
            status: 'active',
            balance: 0,
            totalCoursePrice: 0,
            learningFormat: p.learningFormat || 'Оффлайн',
            tariff: p.tariff || '',
            contractNumber: p.contractNumber || '',
          })
          created++
        } catch (err) {
          console.error('Sync error:', err)
        }
      }
    }
    setSyncResult(t('students.syncResult', { created, total: clientMap.size }))
    setSyncing(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">{t('students.title')}</h2>
          <p className="text-slate-500 mt-1">{allStudents.length} {t('students.studentsCount')} · {allGroups.length} {t('students.groupsCount')}</p>
        </div>
        <div className="flex gap-2">
          {canAdd && activeTab === 'groups' && (
            <button onClick={handleAddGroup}
              className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-purple-700 shadow-lg shadow-purple-500/25 transition-colors flex items-center gap-2">
              <Plus size={16} /> {t('students.newGroup')}
            </button>
          )}
          {canAdd && activeTab === 'students' && (
            <>
              {orphanPayments.length > 0 && (
                <button onClick={handleSync} disabled={syncing}
                  className="bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors flex items-center gap-2 disabled:opacity-50">
                  <Users size={16} /> {syncing ? t('students.syncing') : `${t('students.sync')} (${orphanPayments.length})`}
                </button>
              )}
              <button onClick={handleAdd}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25 flex items-center gap-2">
                <Plus size={16} /> {t('students.addStudent')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Sync Result */}
      {syncResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
          <p className="text-sm text-emerald-700">{syncResult}</p>
          <button onClick={() => setSyncResult(null)} className="text-emerald-400 hover:text-emerald-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 glass rounded-xl p-1">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════ STUDENTS TAB ═══════ */}
      {activeTab === 'students' && (
        <>
          {/* Filters */}
          <div className="glass-card rounded-2xl p-4 flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder={t('students.searchPlaceholder')} value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-slate-400" />
              {user.branch === 'all' && (
                <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
                  className="bg-white/50 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="all">{t('students.allBranches')}</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}
                className="bg-white/50 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">{t('students.allGroups')}</option>
                {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white/50 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">{t('students.allStatuses')}</option>
                <option value="active">{t('students.filter.active')}</option>
                <option value="debtor">{t('students.filter.debtors')}</option>
                <option value="frozen">{t('students.filter.frozen')}</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/40 border-b border-white/30">
                    <th className="text-left py-3 px-4 text-slate-500 font-medium">{t('students.table.name')}</th>
                    <th className="text-left py-3 px-4 text-slate-500 font-medium hidden md:table-cell">{t('students.table.branch')}</th>
                    <th className="text-left py-3 px-4 text-slate-500 font-medium">{t('students.table.group')}</th>
                    <th className="text-center py-3 px-4 text-slate-500 font-medium hidden lg:table-cell">{t('students.table.format')}</th>
                    <th className="text-left py-3 px-4 text-slate-500 font-medium hidden lg:table-cell">{t('students.table.phone')}</th>
                    <th className="text-right py-3 px-4 text-slate-500 font-medium hidden md:table-cell">{t('students.table.paid')}</th>
                    <th className="text-right py-3 px-4 text-slate-500 font-medium hidden md:table-cell">{t('students.table.debt')}</th>
                    <th className="text-center py-3 px-4 text-slate-500 font-medium">{t('students.table.status')}</th>
                    <th className="text-center py-3 px-4 text-slate-500 font-medium">{t('students.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((student) => {
                    const info = getStudentDebtInfo(student)
                    const isOnline = student.learningFormat === 'Онлайн'
                    return (
                      <tr key={student.id}
                        className="border-b border-slate-50 hover:bg-blue-50/30 transition-colors cursor-pointer"
                        onClick={() => setProfileStudent(student)}>
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900">{student.name}</p>
                          <p className="text-xs text-slate-400">
                            {student.course || '—'}
                            {info.trancheCount > 0 && <span className="ml-1 text-emerald-500">· {info.trancheCount} {t('students.tranches')}</span>}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-slate-600 hidden md:table-cell">{getBranchName(student.branch)}</td>
                        <td className="py-3 px-4">
                          <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-mono">{student.group || '—'}</span>
                        </td>
                        <td className="py-3 px-4 text-center hidden lg:table-cell">
                          {isOnline ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                              <Wifi size={10} /> {t('students.format.online')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                              <Users size={10} /> {t('students.format.offline')}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 hidden lg:table-cell">{student.phone}</td>
                        <td className={`py-3 px-4 text-right font-semibold hidden md:table-cell ${info.totalPaid > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {info.totalPaid > 0 ? formatCurrency(info.totalPaid) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right hidden md:table-cell">
                          {info.debt > 0 ? (
                            <div>
                              <span className="font-semibold text-red-500">{formatCurrency(info.debt)}</span>
                              {info.isOverdue && (
                                <div className="flex items-center justify-end gap-1 mt-0.5">
                                  <AlertTriangle size={11} className="text-amber-500" />
                                  <span className="text-xs text-amber-500">{t('students.overdue')}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[student.status]}`}>
                              {statusLabels[student.status]}
                            </span>
                            {student.lmsAccess && (
                              <span title={t('students.lmsActive')} className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                <Monitor size={10} className="text-blue-600" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={(e) => { e.stopPropagation(); setProfileStudent(student) }}
                              className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors" title={t('students.profile')}>
                              <Eye size={15} className="text-blue-600" />
                            </button>
                            {canEdit && (
                              <button onClick={(e) => handleEdit(e, student)}
                                className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors" title={t('students.edit')}>
                                <Pencil size={15} className="text-slate-500" />
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(student.id) }}
                                className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" title={t('students.delete')}>
                                <Trash2 size={15} className="text-red-500" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-slate-400">{t('students.notFound')}</div>
            )}
          </div>
        </>
      )}

      {/* ═══════ GROUPS TAB ═══════ */}
      {activeTab === 'groups' && (
        <>
          {/* Filters */}
          <div className="glass-card rounded-2xl p-4 flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder={t('students.searchGroupPlaceholder')} value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {user.branch === 'all' && (
              <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
                className="bg-white/50 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">{t('students.allBranches')}</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          </div>

          {/* Group Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGroups.map(group => {
              const offlineCount = getGroupOfflineCount(group.name)
              const onlineCount = getGroupOnlineCount(group.name)
              const totalCount = offlineCount + onlineCount
              const offlinePct = group.maxOffline > 0 ? Math.round((offlineCount / group.maxOffline) * 100) : 0
              const isFull = offlineCount >= group.maxOffline
              const teacher = group.teacherId ? teachers.find(t => t.id === group.teacherId) : null

              return (
                <div key={group.id} className="glass-card rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
                  {/* Header */}
                  <div className={`px-5 py-4 ${isFull ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-blue-500 to-blue-600'} text-white`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-lg">{group.name}</h3>
                        <p className="text-sm opacity-90">{group.course}</p>
                      </div>
                      <div className="flex gap-1">
                        {canEdit && (
                          <button onClick={() => handleEditGroup(group)}
                            className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors">
                            <Pencil size={14} />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => setConfirmDeleteGroup(group.id)}
                            className="p-1.5 bg-white/20 hover:bg-red-500/50 rounded-lg transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-blue-50 rounded-lg p-2.5">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Users size={13} className="text-blue-600" />
                        </div>
                        <p className="text-lg font-bold text-slate-900">{offlineCount}</p>
                        <p className="text-[10px] text-slate-500">{t('students.format.offline')}</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-2.5">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Wifi size={13} className="text-purple-600" />
                        </div>
                        <p className="text-lg font-bold text-slate-900">{onlineCount}</p>
                        <p className="text-[10px] text-slate-500">{t('students.format.online')}</p>
                      </div>
                      <div className="bg-emerald-50 rounded-lg p-2.5">
                        <p className="text-lg font-bold text-slate-900">{totalCount}</p>
                        <p className="text-[10px] text-slate-500">{t('students.total')}</p>
                      </div>
                    </div>

                    {/* Offline capacity bar */}
                    <div>
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>{t('students.offlineSeats')}</span>
                        <span className={`font-semibold ${isFull ? 'text-red-500' : 'text-slate-700'}`}>
                          {offlineCount}/{group.maxOffline}
                          {isFull && ` ${t('students.full')}`}
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5">
                        <div className={`h-2.5 rounded-full transition-all ${
                          offlinePct >= 100 ? 'bg-red-500' : offlinePct >= 80 ? 'bg-amber-500' : 'bg-blue-500'
                        }`} style={{ width: `${Math.min(offlinePct, 100)}%` }} />
                      </div>
                    </div>

                    {/* Details */}
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-slate-600">
                        <BookOpen size={14} className="text-slate-400" />
                        <span>{getBranchName(group.branch)}</span>
                      </div>
                      {teacher && (
                        <div className="flex items-center gap-2 text-slate-600">
                          <User size={14} className="text-slate-400" />
                          <span>{teacher.name}</span>
                        </div>
                      )}
                      {group.schedule && (
                        <div className="flex items-center gap-2 text-slate-600">
                          <Clock size={14} className="text-slate-400" />
                          <span>{group.schedule}</span>
                        </div>
                      )}
                    </div>

                    {/* Status badge */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        group.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                        group.status === 'full' ? 'bg-amber-50 text-amber-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {group.status === 'active' ? t('students.groupStatus.active') : group.status === 'full' ? t('students.groupStatus.full') : t('students.groupStatus.archived')}
                      </span>
                      <span className="text-xs text-slate-400">
                        {t('students.onlineNoLimit')}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {filteredGroups.length === 0 && (
            <div className="text-center py-12 text-slate-400 glass-card rounded-2xl">
              {t('students.groupsNotFound')}
            </div>
          )}
        </>
      )}

      {/* ═══════ MODALS ═══════ */}

      {/* Add/Edit Student */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}
        title={editingStudent ? t('students.modal.editStudent') : t('students.modal.newStudent')} size="lg">
        <StudentForm student={editingStudent} onClose={() => setModalOpen(false)} />
      </Modal>

      {/* Confirm Delete Student */}
      <Modal isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} title={t('students.modal.confirmDelete')} size="sm">
        <p className="text-sm text-slate-600 mb-4">{t('students.modal.confirmDeleteText')}</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">{t('students.modal.cancel')}</button>
          <button onClick={() => handleDelete(confirmDelete)} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">{t('students.modal.delete')}</button>
        </div>
      </Modal>

      {/* Student Profile */}
      <Modal isOpen={!!profileStudent} onClose={() => setProfileStudent(null)} title={t('students.modal.profile')} size="xl">
        {profileStudent && (
          <StudentProfile
            student={students.find(s => s.id === profileStudent.id) || profileStudent}
            onClose={() => setProfileStudent(null)}
          />
        )}
      </Modal>

      {/* Add/Edit Group */}
      <Modal isOpen={groupModalOpen} onClose={() => setGroupModalOpen(false)}
        title={editingGroup ? t('students.modal.editGroup') : t('students.modal.newGroup')} size="lg">
        <GroupForm group={editingGroup} onClose={() => setGroupModalOpen(false)} />
      </Modal>

      {/* Confirm Delete Group */}
      <Modal isOpen={!!confirmDeleteGroup} onClose={() => setConfirmDeleteGroup(null)} title={t('students.modal.deleteGroup')} size="sm">
        <p className="text-sm text-slate-600 mb-4">{t('students.modal.confirmDeleteGroupText')}</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setConfirmDeleteGroup(null)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">{t('students.modal.cancel')}</button>
          <button onClick={() => handleDeleteGroup(confirmDeleteGroup)} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">{t('students.modal.delete')}</button>
        </div>
      </Modal>
    </div>
  )
}
