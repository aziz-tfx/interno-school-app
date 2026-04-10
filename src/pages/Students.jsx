import { useState } from 'react'
import { Search, Filter, Pencil, Trash2, Plus, Eye, AlertTriangle, Users, Wifi, Clock, BookOpen, User, Monitor, X, Calendar, DoorOpen, ChevronDown, ChevronUp, Phone, LayoutGrid, CalendarRange, CheckSquare, Square, UserMinus, ArrowRightLeft, Snowflake } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useLanguage } from '../contexts/LanguageContext'
import { formatCurrency } from '../data/mockData'
import Modal from '../components/Modal'
import StudentForm from '../components/StudentForm'
import StudentProfile from '../components/StudentProfile'
import GroupForm from '../components/GroupForm'

export default function Students() {
  const { t } = useLanguage()
  const { user, hasPermission } = useAuth()
  const {
    students, branches, payments, groups, teachers, courses, rooms: dataRooms,
    addStudent, updateStudent, deleteStudent, deleteGroup, updateGroup,
    getGroupOfflineCount, getGroupOnlineCount, getGroupStudents,
    getBranchName,
  } = useData()

  const [activeTab, setActiveTab] = useState('students')
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState(user.branch !== 'all' ? user.branch : 'all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [profileStudent, setProfileStudent] = useState(null)

  // Group modals & state
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(null)
  const [groupSearch, setGroupSearch] = useState('')
  const [groupStatusFilter, setGroupStatusFilter] = useState('all')
  const [expandedGroup, setExpandedGroup] = useState(null)
  const [groupView, setGroupView] = useState('cards') // 'cards' | 'timeline'

  // Bulk actions state (students)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkAction, setBulkAction] = useState(null) // 'status' | 'group' | 'delete' | 'lms'
  const [bulkTarget, setBulkTarget] = useState('')
  const [bulkProcessing, setBulkProcessing] = useState(false)

  // Bulk actions state (groups)
  const [selectedGroupIds, setSelectedGroupIds] = useState(new Set())
  const [groupBulkAction, setGroupBulkAction] = useState(null) // 'status' | 'delete'
  const [groupBulkTarget, setGroupBulkTarget] = useState('')
  const [groupBulkProcessing, setGroupBulkProcessing] = useState(false)

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
    const matchStatus = groupStatusFilter === 'all' || g.status === groupStatusFilter
    return matchSearch && matchBranch && matchStatus
  })

  // Group status counts
  const groupStatusCounts = {
    all: allGroups.length,
    active: allGroups.filter(g => g.status === 'active').length,
    full: allGroups.filter(g => g.status === 'full').length,
    archived: allGroups.filter(g => g.status === 'archived').length,
  }

  const TABS = [
    { id: 'students', label: t('students.tab_students') },
    { id: 'groups', label: t('students.tab_groups') },
  ]

  const statusColors = {
    active: 'bg-emerald-100 text-emerald-700',
    debtor: 'bg-red-100 text-red-700',
    frozen: 'bg-slate-100 text-slate-700',
  }
  const statusLabels = {
    active: t('students.status_active'),
    debtor: t('students.status_debtor'),
    frozen: t('students.status_frozen'),
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
        alert(`Невозможно удалить группу: в ней ${studentsInGroup.length} учеников. Сначала переведите их в другую группу.`)
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
    setSyncResult(`Создано ${created} учеников из ${clientMap.size} уникальных клиентов`)
    setSyncing(false)
  }

  // ─── Bulk Actions ───
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(s => s.id)))
    }
  }
  const clearSelection = () => { setSelectedIds(new Set()); setBulkAction(null) }

  // ─── Group Bulk Actions ───
  const toggleGroupSelect = (id) => {
    setSelectedGroupIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleSelectAllGroups = () => {
    if (selectedGroupIds.size === filteredGroups.length) {
      setSelectedGroupIds(new Set())
    } else {
      setSelectedGroupIds(new Set(filteredGroups.map(g => g.id)))
    }
  }
  const clearGroupSelection = () => { setSelectedGroupIds(new Set()); setGroupBulkAction(null); setGroupBulkTarget('') }

  const executeGroupBulkAction = async () => {
    if (selectedGroupIds.size === 0) return
    setGroupBulkProcessing(true)
    const ids = [...selectedGroupIds]
    try {
      if (groupBulkAction === 'status' && groupBulkTarget) {
        for (const id of ids) await updateGroup(id, { status: groupBulkTarget })
      } else if (groupBulkAction === 'delete') {
        for (const id of ids) {
          const grp = groups.find(g => g.id === id)
          const studentsInGroup = grp ? getGroupStudents(grp.name) : []
          if (studentsInGroup.length === 0) {
            await deleteGroup(id)
          }
        }
      }
    } catch (err) {
      console.error('Group bulk action error:', err)
    }
    setGroupBulkProcessing(false)
    clearGroupSelection()
  }

  const executeBulkAction = async () => {
    if (selectedIds.size === 0) return
    setBulkProcessing(true)
    const ids = [...selectedIds]
    try {
      if (bulkAction === 'status' && bulkTarget) {
        const lmsUpdate = bulkTarget === 'active' ? { lmsAccess: true } : bulkTarget === 'debtor' || bulkTarget === 'frozen' ? { lmsAccess: false } : {}
        for (const id of ids) await updateStudent(id, { status: bulkTarget, ...lmsUpdate })
      } else if (bulkAction === 'group' && bulkTarget) {
        const targetGroup = groups.find(g => g.id === bulkTarget)
        if (targetGroup) {
          for (const id of ids) await updateStudent(id, { group: targetGroup.name, groupId: targetGroup.id, branch: targetGroup.branch, course: targetGroup.course })
        }
      } else if (bulkAction === 'lms') {
        const val = bulkTarget === 'on'
        for (const id of ids) await updateStudent(id, { lmsAccess: val })
      } else if (bulkAction === 'delete') {
        for (const id of ids) await deleteStudent(id)
      }
    } catch (err) {
      console.error('Bulk action error:', err)
    }
    setBulkProcessing(false)
    clearSelection()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">{t('students.heading')}</h2>
          <p className="text-slate-500 mt-1">{allStudents.length} {t('students.count_students')} · {allGroups.length} {t('students.count_groups')}</p>
        </div>
        <div className="flex gap-2">
          {canAdd && activeTab === 'groups' && (
            <button onClick={handleAddGroup}
              className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-purple-700 shadow-lg shadow-purple-500/25 transition-colors flex items-center gap-2">
              <Plus size={16} /> {t('students.btn_new_group')}
            </button>
          )}
          {canAdd && activeTab === 'students' && (
            <button onClick={handleAdd}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25 flex items-center gap-2">
              <Plus size={16} /> {t('students.btn_add_student')}
            </button>
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
              <input type="text" placeholder={t('students.search_placeholder')} value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-slate-400" />
              {user.branch === 'all' && (
                <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
                  className="bg-white/50 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="all">{t('students.filter_all_branches')}</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}
                className="bg-white/50 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">{t('students.filter_all_groups')}</option>
                {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white/50 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">{t('students.filter_all_statuses')}</option>
                <option value="active">{t('students.filter_active')}</option>
                <option value="debtor">{t('students.filter_debtors')}</option>
                <option value="frozen">{t('students.filter_frozen')}</option>
              </select>
            </div>
          </div>

          {/* ── Bulk Actions Bar ── */}
          {selectedIds.size > 0 && canEdit && (
            <div className="glass-card rounded-2xl p-3 flex flex-wrap items-center gap-3 bg-blue-50 border border-blue-200">
              <div className="flex items-center gap-2">
                <CheckSquare size={16} className="text-blue-600" />
                <span className="text-sm font-semibold text-blue-800">
                  Выбрано: {selectedIds.size}
                </span>
                <button onClick={clearSelection} className="text-blue-400 hover:text-blue-600">
                  <X size={14} />
                </button>
              </div>
              <div className="h-5 w-px bg-blue-200" />

              {/* Status Change */}
              <div className="flex items-center gap-1.5">
                <select value={bulkAction === 'status' ? bulkTarget : ''}
                  onChange={(e) => { setBulkAction('status'); setBulkTarget(e.target.value) }}
                  className="text-xs bg-white border border-blue-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">Сменить статус...</option>
                  <option value="active">✅ Активен</option>
                  <option value="debtor">🔴 Должник</option>
                  <option value="frozen">❄️ Заморожен</option>
                </select>
              </div>

              {/* Group Transfer */}
              <div className="flex items-center gap-1.5">
                <select value={bulkAction === 'group' ? bulkTarget : ''}
                  onChange={(e) => { setBulkAction('group'); setBulkTarget(e.target.value) }}
                  className="text-xs bg-white border border-blue-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">Перевести в группу...</option>
                  {allGroups.map(g => <option key={g.id} value={g.id}>{g.name} — {g.course}</option>)}
                </select>
              </div>

              {/* LMS Access */}
              <div className="flex items-center gap-1.5">
                <select value={bulkAction === 'lms' ? bulkTarget : ''}
                  onChange={(e) => { setBulkAction('lms'); setBulkTarget(e.target.value) }}
                  className="text-xs bg-white border border-blue-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">LMS доступ...</option>
                  <option value="on">✅ Включить</option>
                  <option value="off">❌ Отключить</option>
                </select>
              </div>

              {/* Delete */}
              {canDelete && (
                <button onClick={() => { setBulkAction('delete'); setBulkTarget('pending') }}
                  className="text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg px-2.5 py-1.5 hover:bg-red-100 transition-colors flex items-center gap-1">
                  <Trash2 size={12} /> Удалить
                </button>
              )}

              <div className="h-5 w-px bg-blue-200" />

              {/* Execute non-delete actions */}
              {bulkAction && bulkTarget && bulkAction !== 'delete' && (
                <button onClick={executeBulkAction} disabled={bulkProcessing}
                  className="text-xs bg-blue-600 text-white rounded-lg px-4 py-1.5 hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium">
                  {bulkProcessing ? 'Выполняется...' : 'Применить'}
                </button>
              )}

              {/* Delete confirmation */}
              {bulkAction === 'delete' && bulkTarget === 'pending' && (
                <div className="flex items-center gap-2 bg-red-100 border border-red-300 rounded-lg px-3 py-1.5">
                  <span className="text-xs text-red-700 font-medium">Удалить {selectedIds.size} учеников?</span>
                  <button onClick={() => executeBulkAction()} disabled={bulkProcessing}
                    className="text-xs bg-red-600 text-white rounded px-3 py-1 hover:bg-red-700 disabled:opacity-50 font-medium">
                    {bulkProcessing ? '...' : 'Да, удалить'}
                  </button>
                  <button onClick={() => { setBulkAction(null); setBulkTarget('') }}
                    className="text-xs text-red-500 hover:text-red-700">
                    Отмена
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Table */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/40 border-b border-white/30">
                    {canEdit && (
                      <th className="py-3 px-2 w-8">
                        <button onClick={toggleSelectAll} className="text-slate-400 hover:text-blue-600 transition-colors">
                          {selectedIds.size === filtered.length && filtered.length > 0 ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                        </button>
                      </th>
                    )}
                    <th className="text-left py-3 px-4 text-slate-500 font-medium">{t('students.th_name')}</th>
                    <th className="text-left py-3 px-4 text-slate-500 font-medium hidden md:table-cell">{t('students.th_branch')}</th>
                    <th className="text-left py-3 px-4 text-slate-500 font-medium">{t('students.th_group')}</th>
                    <th className="text-center py-3 px-4 text-slate-500 font-medium hidden lg:table-cell">{t('students.th_format')}</th>
                    <th className="text-left py-3 px-4 text-slate-500 font-medium hidden lg:table-cell">{t('students.th_phone')}</th>
                    <th className="text-right py-3 px-4 text-slate-500 font-medium hidden md:table-cell">{t('students.th_paid')}</th>
                    <th className="text-right py-3 px-4 text-slate-500 font-medium hidden md:table-cell">{t('students.th_debt')}</th>
                    <th className="text-center py-3 px-4 text-slate-500 font-medium">{t('students.th_status')}</th>
                    <th className="text-center py-3 px-4 text-slate-500 font-medium">{t('students.th_actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((student) => {
                    const info = getStudentDebtInfo(student)
                    const isOnline = student.learningFormat === 'Онлайн'
                    return (
                      <tr key={student.id}
                        className={`border-b border-slate-50 hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedIds.has(student.id) ? 'bg-blue-50/50' : ''}`}
                        onClick={() => setProfileStudent(student)}>
                        {canEdit && (
                          <td className="py-3 px-2 w-8" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => toggleSelect(student.id)} className="text-slate-400 hover:text-blue-600 transition-colors">
                              {selectedIds.has(student.id) ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                            </button>
                          </td>
                        )}
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900">{student.name}</p>
                          <p className="text-xs text-slate-400">
                            {student.course || '—'}
                            {info.trancheCount > 0 && <span className="ml-1 text-emerald-500">· {info.trancheCount} {t('students.tranches')}</span>}
                          </p>
                          {student.createdByName && (
                            <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                              <User size={10} />
                              <span>{t('students.created_by')}: <span className="text-slate-600 font-medium">{student.createdByName}</span></span>
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 hidden md:table-cell">{getBranchName(student.branch)}</td>
                        <td className="py-3 px-4">
                          <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-mono">{student.group || '—'}</span>
                        </td>
                        <td className="py-3 px-4 text-center hidden lg:table-cell">
                          {isOnline ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                              <Wifi size={10} /> {t('students.format_online')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                              <Users size={10} /> {t('students.format_offline')}
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
                              <span title={t('students.lms_access_title')} className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                <Monitor size={10} className="text-blue-600" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={(e) => { e.stopPropagation(); setProfileStudent(student) }}
                              className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors" title={t('students.tooltip_profile')}>
                              <Eye size={15} className="text-blue-600" />
                            </button>
                            {canEdit && (
                              <button onClick={(e) => handleEdit(e, student)}
                                className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors" title={t('students.tooltip_edit')}>
                                <Pencil size={15} className="text-slate-500" />
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(student.id) }}
                                className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" title={t('students.tooltip_delete')}>
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
              <div className="text-center py-12 text-slate-400">{t('students.empty')}</div>
            )}
          </div>
        </>
      )}

      {/* ═══════ GROUPS TAB ═══════ */}
      {activeTab === 'groups' && (
        <>
          {/* Filters + View Switcher */}
          <div className="glass-card rounded-2xl p-4 flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder={t('students.group_search_placeholder')} value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {user.branch === 'all' && (
              <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
                className="bg-white/50 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">{t('students.filter_all_branches')}</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            {canEdit && (
              <button onClick={toggleSelectAllGroups}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded-lg hover:bg-white/50 transition-colors">
                {selectedGroupIds.size === filteredGroups.length && filteredGroups.length > 0 ? <CheckSquare size={16} className="text-purple-600" /> : <Square size={16} />}
                <span className="hidden sm:inline">{selectedGroupIds.size === filteredGroups.length && filteredGroups.length > 0 ? 'Снять все' : 'Выбрать все'}</span>
              </button>
            )}
            <div className="flex rounded-xl overflow-hidden border border-slate-200">
              <button onClick={() => setGroupView('cards')}
                className={`px-3 py-2 text-xs font-medium flex items-center gap-1.5 transition-colors ${groupView === 'cards' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                <LayoutGrid size={14} /> Карточки
              </button>
              <button onClick={() => setGroupView('timeline')}
                className={`px-3 py-2 text-xs font-medium flex items-center gap-1.5 transition-colors ${groupView === 'timeline' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                <CalendarRange size={14} /> Расписание
              </button>
            </div>
          </div>

          {/* ── Group Status Filter Tabs ── */}
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'all', label: 'Все группы', color: 'bg-slate-100 text-slate-700', activeColor: 'bg-slate-700 text-white' },
              { id: 'active', label: 'Активные', color: 'bg-emerald-50 text-emerald-700', activeColor: 'bg-emerald-600 text-white' },
              { id: 'full', label: 'Набор закрыт', color: 'bg-amber-50 text-amber-700', activeColor: 'bg-amber-500 text-white' },
              { id: 'archived', label: 'Архив', color: 'bg-slate-50 text-slate-500', activeColor: 'bg-slate-500 text-white' },
            ].map(s => (
              <button key={s.id} onClick={() => setGroupStatusFilter(s.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${groupStatusFilter === s.id ? s.activeColor : s.color + ' hover:opacity-80'}`}>
                {s.label} ({groupStatusCounts[s.id]})
              </button>
            ))}
          </div>

          {/* ── Group Bulk Actions Bar ── */}
          {selectedGroupIds.size > 0 && canEdit && (
            <div className="glass-card rounded-2xl p-3 flex flex-wrap items-center gap-3 bg-purple-50 border border-purple-200">
              <div className="flex items-center gap-2">
                <CheckSquare size={16} className="text-purple-600" />
                <span className="text-sm font-semibold text-purple-800">
                  Выбрано: {selectedGroupIds.size}
                </span>
                <button onClick={clearGroupSelection} className="text-purple-400 hover:text-purple-600">
                  <X size={14} />
                </button>
              </div>
              <div className="h-5 w-px bg-purple-200" />

              {/* Status change */}
              {groupBulkAction !== 'delete' && (
                <div className="flex items-center gap-2">
                  <select value={groupBulkAction === 'status' ? groupBulkTarget : ''}
                    onChange={(e) => { setGroupBulkAction('status'); setGroupBulkTarget(e.target.value) }}
                    className="text-sm rounded-lg px-2 py-1.5 border border-purple-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="">Сменить статус...</option>
                    <option value="active">{t('students.group_status_active')}</option>
                    <option value="full">{t('students.group_status_full')}</option>
                    <option value="archived">{t('students.group_status_archived')}</option>
                  </select>
                  {groupBulkAction === 'status' && groupBulkTarget && (
                    <button onClick={executeGroupBulkAction} disabled={groupBulkProcessing}
                      className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
                      {groupBulkProcessing ? '...' : 'Применить'}
                    </button>
                  )}
                </div>
              )}

              <div className="h-5 w-px bg-purple-200" />

              {/* Delete */}
              {groupBulkAction !== 'delete' ? (
                <button onClick={() => setGroupBulkAction('delete')}
                  className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 font-medium">
                  <Trash2 size={14} /> Удалить
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600 font-medium">Удалить {selectedGroupIds.size} групп(ы)?</span>
                  <button onClick={executeGroupBulkAction} disabled={groupBulkProcessing}
                    className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
                    {groupBulkProcessing ? '...' : 'Да, удалить'}
                  </button>
                  <button onClick={() => setGroupBulkAction(null)}
                    className="text-sm text-slate-500 hover:text-slate-700">Отмена</button>
                </div>
              )}
            </div>
          )}

          {/* ── CARDS VIEW ── */}
          {groupView === 'cards' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredGroups.map(group => {
                const offlineCount = getGroupOfflineCount(group.name)
                const onlineCount = getGroupOnlineCount(group.name)
                const totalCount = offlineCount + onlineCount
                const offlinePct = group.maxOffline > 0 ? Math.round((offlineCount / group.maxOffline) * 100) : 0
                const isFull = offlineCount >= group.maxOffline
                const teacher = group.teacherId ? teachers.find(tc => tc.id === group.teacherId) : null
                const isExpanded = expandedGroup === group.id
                const groupStudentsList = getGroupStudents(group.name)
                const groupCourseObj = courses.find(c => c.name === group.course)
                const groupRegion = { tashkent: 'tashkent', samarkand: 'fergana', fergana: 'fergana', bukhara: 'fergana', online: 'online' }[group.branch] || 'tashkent'
                const regionDur = groupCourseObj?.durationByRegion?.[groupRegion]
                const courseDuration = regionDur || groupCourseObj?.duration
                const durationMonths = courseDuration ? parseInt(courseDuration) : 0
                const endDate = group.startDate && durationMonths ? (() => {
                  const d = new Date(group.startDate); d.setMonth(d.getMonth() + durationMonths); return d.toISOString().split('T')[0]
                })() : group.endDate || null
                const courseProgress = group.startDate && endDate ? (() => {
                  const now = Date.now(), start = new Date(group.startDate).getTime(), end = new Date(endDate).getTime()
                  if (now < start) return 0
                  if (now > end) return 100
                  return Math.round(((now - start) / (end - start)) * 100)
                })() : null

                return (
                  <div key={group.id} className="glass-card rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
                    {/* Header */}
                    <div className={`px-5 py-4 ${isFull ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-blue-500 to-blue-600'} text-white cursor-pointer`}
                      onClick={() => setExpandedGroup(isExpanded ? null : group.id)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {canEdit && (
                            <button onClick={(e) => { e.stopPropagation(); toggleGroupSelect(group.id) }}
                              className="text-white/80 hover:text-white transition-colors">
                              {selectedGroupIds.has(group.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                            </button>
                          )}
                          <div>
                            <h3 className="font-bold text-lg">{group.name}</h3>
                            <p className="text-sm opacity-90">{group.course}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {canEdit && (
                            <button onClick={(e) => { e.stopPropagation(); handleEditGroup(group) }}
                              className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors">
                              <Pencil size={14} />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteGroup(group.id) }}
                              className="p-1.5 bg-white/20 hover:bg-red-500/50 rounded-lg transition-colors">
                              <Trash2 size={14} />
                            </button>
                          )}
                          {isExpanded ? <ChevronUp size={18} className="ml-1 opacity-70" /> : <ChevronDown size={18} className="ml-1 opacity-70" />}
                        </div>
                      </div>
                    </div>

                    <div className="p-5 space-y-4">
                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <Users size={13} className="text-blue-600 mx-auto mb-1" />
                          <p className="text-lg font-bold text-slate-900">{offlineCount}</p>
                          <p className="text-[10px] text-slate-500">{t('students.group_offline')}</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-2.5">
                          <Wifi size={13} className="text-purple-600 mx-auto mb-1" />
                          <p className="text-lg font-bold text-slate-900">{onlineCount}</p>
                          <p className="text-[10px] text-slate-500">{t('students.group_online')}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-lg p-2.5">
                          <p className="text-lg font-bold text-slate-900">{totalCount}</p>
                          <p className="text-[10px] text-slate-500">{t('students.group_total')}</p>
                        </div>
                      </div>

                      {/* Offline capacity bar */}
                      <div>
                        <div className="flex justify-between text-xs text-slate-500 mb-1">
                          <span>{t('students.group_offline_seats')}</span>
                          <span className={`font-semibold ${isFull ? 'text-red-500' : 'text-slate-700'}`}>
                            {offlineCount}/{group.maxOffline}
                            {isFull && ` ${t('students.group_full')}`}
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5">
                          <div className={`h-2.5 rounded-full transition-all ${offlinePct >= 100 ? 'bg-red-500' : offlinePct >= 80 ? 'bg-amber-500' : 'bg-blue-500'}`}
                            style={{ width: `${Math.min(offlinePct, 100)}%` }} />
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
                        {group.room && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <DoorOpen size={14} className="text-slate-400" />
                            <span>{group.room}</span>
                          </div>
                        )}
                        {group.startDate && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <Calendar size={14} className="text-slate-400" />
                            <span>{new Date(group.startDate).toLocaleDateString('ru-RU')} → {endDate ? new Date(endDate).toLocaleDateString('ru-RU') : '...'}</span>
                          </div>
                        )}
                      </div>

                      {/* Course Progress */}
                      {courseProgress !== null && (
                        <div>
                          <div className="flex justify-between text-xs text-slate-500 mb-1">
                            <span>Прогресс курса</span>
                            <span className="font-semibold text-slate-700">{courseProgress}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div className={`h-2 rounded-full transition-all ${courseProgress >= 90 ? 'bg-emerald-500' : courseProgress >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                              style={{ width: `${courseProgress}%` }} />
                          </div>
                        </div>
                      )}

                      {/* Status badge */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                          group.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                          group.status === 'full' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {group.status === 'active' ? t('students.group_status_active') : group.status === 'full' ? t('students.group_status_full') : t('students.group_status_archived')}
                        </span>
                        <span className="text-xs text-slate-400">{t('students.group_online_unlimited')}</span>
                      </div>

                      {/* ── Expandable Student List ── */}
                      {isExpanded && (
                        <div className="pt-3 border-t border-slate-200 space-y-2">
                          <p className="text-xs font-semibold text-slate-500 uppercase">Ученики ({groupStudentsList.length})</p>
                          {groupStudentsList.length === 0 ? (
                            <p className="text-xs text-slate-400 py-2">Нет зачисленных учеников</p>
                          ) : (
                            <div className="space-y-1.5 max-h-64 overflow-y-auto">
                              {groupStudentsList.map(s => (
                                <div key={s.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 hover:bg-slate-100 cursor-pointer transition-colors"
                                  onClick={() => setProfileStudent(s)}>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                                      s.status === 'active' ? 'bg-emerald-500' : s.status === 'debtor' ? 'bg-red-500' : 'bg-slate-400'
                                    }`}>
                                      {s.name?.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-slate-800 truncate">{s.name}</p>
                                      <p className="text-[10px] text-slate-400">{s.phone || '—'}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                      s.learningFormat === 'Онлайн' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                    }`}>
                                      {s.learningFormat === 'Онлайн' ? 'ONL' : 'OFF'}
                                    </span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                      s.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                                      s.status === 'debtor' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                                    }`}>
                                      {s.status === 'active' ? '✓' : s.status === 'debtor' ? '₽' : '❄'}
                                    </span>
                                    {s.lmsAccess && <Monitor size={12} className="text-emerald-500" />}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── TIMELINE VIEW ── */}
          {groupView === 'timeline' && (() => {
            // Room name resolver
            const getRoomName = (roomId) => {
              if (!roomId) return 'Без кабинета'
              const found = dataRooms.find(r => r.id === roomId)
              return found ? found.name : roomId
            }

            // Build timeline data
            const timelineGroups = filteredGroups.filter(g => g.startDate).map(g => {
              const courseObj = courses.find(c => c.name === g.course)
              const groupRegion = { tashkent: 'tashkent', samarkand: 'fergana', fergana: 'fergana', bukhara: 'fergana', online: 'online' }[g.branch] || 'tashkent'
              const regionDur = courseObj?.durationByRegion?.[groupRegion]
              const courseDur = regionDur || courseObj?.duration
              const durMonths = courseDur ? parseInt(courseDur) : 6
              const start = new Date(g.startDate)
              const end = g.endDate ? new Date(g.endDate) : new Date(new Date(g.startDate).setMonth(start.getMonth() + durMonths))
              const totalStudents = getGroupOfflineCount(g.name) + getGroupOnlineCount(g.name)
              return { ...g, startD: start, endD: end, durMonths, totalStudents, roomName: getRoomName(g.room) }
            })

            // Get all unique rooms (by resolved name)
            const roomIds = [...new Set(timelineGroups.map(g => g.room || ''))]
            const roomList = roomIds.map(rid => ({ id: rid, name: getRoomName(rid) })).sort((a, b) => a.name.localeCompare(b.name))

            // Timeline range: 2 months back, 10 months forward
            const now = new Date()
            const tlStart = new Date(now.getFullYear(), now.getMonth() - 2, 1)
            const tlEnd = new Date(now.getFullYear(), now.getMonth() + 10, 0)
            const totalDays = (tlEnd - tlStart) / (1000 * 60 * 60 * 24)

            // Generate month labels
            const months = []
            for (let d = new Date(tlStart); d < tlEnd; d.setMonth(d.getMonth() + 1)) {
              months.push({ date: new Date(d), label: d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }) })
            }

            // Course colors
            const courseColors = {}
            const palette = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1']
            const uniqueCourses = [...new Set(timelineGroups.map(g => g.course))]
            uniqueCourses.forEach((c, i) => { courseColors[c] = palette[i % palette.length] })

            // Detect conflicts (same room + overlapping dates + same schedule days/time)
            const getConflicts = (group) => {
              return timelineGroups.filter(other =>
                other.id !== group.id &&
                other.room && group.room &&
                other.room === group.room &&
                other.startD < group.endD &&
                other.endD > group.startD &&
                other.schedule === group.schedule
              )
            }

            // Assign lanes within each room so overlapping groups don't stack
            const assignLanes = (roomGroups) => {
              const sorted = [...roomGroups].sort((a, b) => a.startD - b.startD)
              const lanes = [] // each lane = array of groups
              sorted.forEach(g => {
                let placed = false
                for (let i = 0; i < lanes.length; i++) {
                  const last = lanes[i][lanes[i].length - 1]
                  if (last.endD <= g.startD) {
                    lanes[i].push(g)
                    g._lane = i
                    placed = true
                    break
                  }
                }
                if (!placed) {
                  g._lane = lanes.length
                  lanes.push([g])
                }
              })
              return lanes.length
            }

            const noRoomGroups = timelineGroups.filter(g => !g.room)
            const todayPos = ((now - tlStart) / (1000 * 60 * 60 * 24)) / totalDays * 100
            const LANE_H = 32 // height per lane
            const LANE_GAP = 4

            return (
              <div className="space-y-4">
                {/* Legend + stats */}
                <div className="glass-card rounded-2xl p-4">
                  <div className="flex flex-wrap gap-3 items-center justify-between">
                    <div className="flex flex-wrap gap-3 items-center">
                      <span className="text-xs font-semibold text-slate-500 mr-1">Курсы:</span>
                      {uniqueCourses.map(c => (
                        <span key={c} className="flex items-center gap-1.5 text-xs">
                          <span className="w-3 h-3 rounded" style={{ background: courseColors[c] }} />
                          {c}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1"><span className="w-3 h-px bg-red-400 inline-block" /> Сегодня</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded ring-2 ring-red-400 ring-offset-1 inline-block" style={{background: '#e5e7eb'}} /> Конфликт</span>
                    </div>
                  </div>
                </div>

                {/* Timeline Grid */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <div style={{ minWidth: '1000px' }}>
                      {/* Month headers */}
                      <div className="flex border-b border-slate-200 sticky top-0 z-20 bg-white">
                        <div className="w-40 shrink-0 px-3 py-2.5 bg-slate-50 text-xs font-semibold text-slate-500 border-r border-slate-200">
                          Кабинет
                        </div>
                        <div className="flex-1 flex relative">
                          {months.map((m, i) => {
                            const isCurrentMonth = m.date.getMonth() === now.getMonth() && m.date.getFullYear() === now.getFullYear()
                            return (
                              <div key={i} className={`flex-1 px-2 py-2.5 text-xs text-center border-r border-slate-100 ${isCurrentMonth ? 'bg-blue-50 font-bold text-blue-700' : 'text-slate-400'}`}>
                                {m.label}
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Room rows */}
                      {roomList.map(({ id: roomId, name: roomName }) => {
                        const roomGroups = timelineGroups.filter(g => (g.room || '') === roomId)
                        const laneCount = assignLanes(roomGroups)
                        const rowH = Math.max(44, laneCount * (LANE_H + LANE_GAP) + LANE_GAP * 2)

                        return (
                          <div key={roomId || '_none'} className="flex border-b border-slate-100" style={{ minHeight: `${rowH}px` }}>
                            <div className="w-40 shrink-0 px-3 py-3 bg-slate-50/50 border-r border-slate-200 flex items-start gap-2 pt-3">
                              <DoorOpen size={14} className="text-slate-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="text-xs font-medium text-slate-700 block leading-tight">{roomName}</span>
                                <span className="text-[10px] text-slate-400">{roomGroups.length} групп</span>
                              </div>
                            </div>
                            <div className="flex-1 relative" style={{ height: `${rowH}px` }}>
                              {/* Today marker */}
                              {todayPos > 0 && todayPos < 100 && (
                                <div className="absolute top-0 bottom-0 w-px bg-red-400/60 z-10" style={{ left: `${todayPos}%` }} />
                              )}
                              {/* Month grid lines */}
                              {months.map((m, i) => {
                                const mPos = ((m.date - tlStart) / (1000 * 60 * 60 * 24)) / totalDays * 100
                                return <div key={i} className="absolute top-0 bottom-0 w-px bg-slate-100" style={{ left: `${mPos}%` }} />
                              })}
                              {/* Group bars */}
                              {roomGroups.map(g => {
                                const left = Math.max(0, ((g.startD - tlStart) / (1000 * 60 * 60 * 24)) / totalDays * 100)
                                const right = Math.min(100, ((g.endD - tlStart) / (1000 * 60 * 60 * 24)) / totalDays * 100)
                                const width = right - left
                                const conflicts = getConflicts(g)
                                const hasConflict = conflicts.length > 0
                                const lane = g._lane || 0
                                const topPx = LANE_GAP + lane * (LANE_H + LANE_GAP)
                                const bgColor = courseColors[g.course] || '#64748b'

                                return (
                                  <div key={g.id}
                                    onClick={() => handleEditGroup(g)}
                                    className={`absolute rounded-lg flex items-center gap-1 px-2 text-[10px] font-medium text-white truncate cursor-pointer transition-all hover:brightness-110 hover:shadow-md ${hasConflict ? 'ring-2 ring-red-500 ring-offset-1' : ''}`}
                                    style={{
                                      left: `${left}%`,
                                      width: `${Math.max(width, 3)}%`,
                                      top: `${topPx}px`,
                                      height: `${LANE_H}px`,
                                      background: `linear-gradient(135deg, ${bgColor}, ${bgColor}dd)`,
                                    }}
                                    title={[
                                      `📋 ${g.name} — ${g.course}`,
                                      `📅 ${g.startD.toLocaleDateString('ru-RU')} → ${g.endD.toLocaleDateString('ru-RU')}`,
                                      g.schedule ? `🕐 ${g.schedule}` : '',
                                      `👥 ${g.totalStudents} учеников` + (g.maxOffline ? ` / ${g.maxOffline} мест` : ''),
                                      hasConflict ? `⚠️ Конфликт: ${conflicts.map(c => c.name).join(', ')}` : '',
                                    ].filter(Boolean).join('\n')}
                                  >
                                    {width > 8 && <span className="truncate">{g.name}</span>}
                                    {width > 15 && <span className="opacity-70 text-[9px] shrink-0">({g.totalStudents})</span>}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}

                      {roomList.length === 0 && (
                        <div className="text-center py-8 text-slate-400 text-sm">
                          Нет групп с датой старта. Укажите «Дата старта» и «Кабинет» при создании/редактировании группы.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Groups without room/startDate */}
                {noRoomGroups.length > 0 && (
                  <div className="glass-card rounded-2xl p-4">
                    <p className="text-xs font-semibold text-amber-600 mb-2">⚠ Группы без кабинета/даты старта ({noRoomGroups.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {noRoomGroups.map(g => (
                        <button key={g.id} onClick={() => handleEditGroup(g)}
                          className="text-xs bg-amber-50 text-amber-700 px-2.5 py-1.5 rounded-lg border border-amber-200 hover:bg-amber-100 transition-colors text-left">
                          {g.name} — {g.course}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {filteredGroups.length === 0 && (
            <div className="text-center py-12 text-slate-400 glass-card rounded-2xl">
              {t('students.groups_empty')}
            </div>
          )}
        </>
      )}

      {/* ═══════ MODALS ═══════ */}

      {/* Add/Edit Student */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}
        title={editingStudent ? t('students.modal_edit_student') : t('students.modal_new_student')} size="lg">
        <StudentForm student={editingStudent} onClose={() => setModalOpen(false)} />
      </Modal>

      {/* Confirm Delete Student */}
      <Modal isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} title={t('students.modal_confirm_delete')} size="sm">
        <p className="text-sm text-slate-600 mb-4">{t('students.confirm_delete_student')}</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">{t('students.btn_cancel')}</button>
          <button onClick={() => handleDelete(confirmDelete)} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">{t('students.btn_delete')}</button>
        </div>
      </Modal>

      {/* Student Profile */}
      <Modal isOpen={!!profileStudent} onClose={() => setProfileStudent(null)} title={t('students.modal_student_profile')} size="xl">
        {profileStudent && (
          <StudentProfile
            student={students.find(s => s.id === profileStudent.id) || profileStudent}
            onClose={() => setProfileStudent(null)}
          />
        )}
      </Modal>

      {/* Add/Edit Group */}
      <Modal isOpen={groupModalOpen} onClose={() => setGroupModalOpen(false)}
        title={editingGroup ? t('students.modal_edit_group') : t('students.modal_new_group')} size="lg">
        <GroupForm group={editingGroup} onClose={() => setGroupModalOpen(false)} />
      </Modal>

      {/* Confirm Delete Group */}
      <Modal isOpen={!!confirmDeleteGroup} onClose={() => setConfirmDeleteGroup(null)} title={t('students.modal_delete_group')} size="sm">
        <p className="text-sm text-slate-600 mb-4">{t('students.confirm_delete_group')}</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setConfirmDeleteGroup(null)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">{t('students.btn_cancel')}</button>
          <button onClick={() => handleDeleteGroup(confirmDeleteGroup)} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">{t('students.btn_delete')}</button>
        </div>
      </Modal>
    </div>
  )
}
