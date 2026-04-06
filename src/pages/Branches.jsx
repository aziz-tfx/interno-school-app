import { useState } from 'react'
import { MapPin, Phone, User, Calendar, Users, GraduationCap, BookOpen, TrendingUp, Plus, Pencil, Trash2, DoorOpen, X, ChevronDown, ChevronUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useLanguage } from '../contexts/LanguageContext'
import { expenseCategories, formatCurrency } from '../data/mockData'
import Modal from '../components/Modal'
import BranchForm from '../components/BranchForm'

export default function Branches() {
  const { t } = useLanguage()
  const { hasPermission } = useAuth()
  const { branches, students, teachers, groups, rooms, addBranch, updateBranch, deleteBranch, addRoom, updateRoom, deleteRoom } = useData()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [expandedRooms, setExpandedRooms] = useState(null)
  const [roomForm, setRoomForm] = useState(null) // { branchId, room? }
  const [roomFormData, setRoomFormData] = useState({ name: '', capacity: 20 })
  const [deleteRoomConfirm, setDeleteRoomConfirm] = useState(null)

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
      alert(`${t('branches.heading')}: ${branchStudents} / ${branchTeachers}`)
      setConfirmDelete(null)
      return
    }
    deleteBranch(id)
    setConfirmDelete(null)
  }

  const handleAddRoom = (branchId) => {
    setRoomForm({ branchId })
    setRoomFormData({ name: '', capacity: 20 })
  }

  const handleEditRoom = (branchId, room) => {
    setRoomForm({ branchId, room })
    setRoomFormData({ name: room.name, capacity: room.capacity || 20 })
  }

  const handleSaveRoom = async () => {
    const data = { ...roomFormData, capacity: Number(roomFormData.capacity) || 20, branchId: roomForm.branchId }
    if (roomForm.room) {
      await updateRoom(roomForm.room.id, data)
    } else {
      await addRoom(data)
    }
    setRoomForm(null)
  }

  const handleDeleteRoom = async (id) => {
    await deleteRoom(id)
    setDeleteRoomConfirm(null)
  }

  const getRoomOccupancy = (room) => {
    const roomGroups = groups.filter(g => g.room === room.id && g.status === 'active')
    return roomGroups.length
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
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">{t('branches.heading')}</h2>
          <p className="text-slate-500 mt-1">{t('branches.count', { count: branches.length })}</p>
        </div>
        {canAdd && (
          <button onClick={handleAdd}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25 flex items-center gap-2">
            <Plus size={16} /> {t('branches.btn_add')}
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
            <div key={branch.id} className="glass-card rounded-2xl overflow-hidden">
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
                        className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors" title={t('branches.tooltip_edit')}>
                        <Pencil size={14} />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => setConfirmDelete(branch.id)}
                        className="p-1.5 bg-white/20 hover:bg-red-500/50 rounded-lg transition-colors" title={t('branches.tooltip_delete')}>
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
                      <p className="text-xs text-slate-500">{t('branches.director')}</p>
                      <p className="text-sm font-medium">{branch.director || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone size={16} className="text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">{t('branches.phone')}</p>
                      <p className="text-sm font-medium">{branch.phone || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">{t('branches.opened')}</p>
                      <p className="text-sm font-medium">{branch.openDate || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-500">&#9733;</span>
                    <div>
                      <p className="text-xs text-slate-500">{t('branches.rating')}</p>
                      <p className="text-sm font-medium">{branch.rating > 0 ? `${branch.rating}/5.0` : '—'}</p>
                    </div>
                  </div>
                </div>

                <hr className="border-slate-100" />

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <GraduationCap size={18} className="text-blue-600 mx-auto mb-1" />
                    <p className="text-lg font-bold text-slate-900">{actualStudents}</p>
                    <p className="text-xs text-slate-500">{t('branches.students')}</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <Users size={18} className="text-purple-600 mx-auto mb-1" />
                    <p className="text-lg font-bold text-slate-900">{branchTeacherCount || branch.teachers}</p>
                    <p className="text-xs text-slate-500">{t('branches.teachers')}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-3">
                    <BookOpen size={18} className="text-emerald-600 mx-auto mb-1" />
                    <p className="text-lg font-bold text-slate-900">{branch.groups || 0}</p>
                    <p className="text-xs text-slate-500">{t('branches.groups')}</p>
                  </div>
                </div>

                <hr className="border-slate-100" />

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">{t('branches.income')}</span>
                    <span className="text-sm font-semibold text-emerald-600">{formatCurrency(branch.monthlyRevenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">{t('branches.expenses')}</span>
                    <span className="text-sm font-semibold text-red-500">{formatCurrency(branch.monthlyExpenses)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-2">
                    <span className="text-sm font-medium text-slate-700">{t('branches.profit')}</span>
                    <span className="text-sm font-bold text-blue-600">{formatCurrency(profit)}</span>
                  </div>
                  {branch.monthlyRevenue > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">{t('branches.margin')}</span>
                      <span className="text-sm font-semibold">{margin}%</span>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>{t('branches.occupancy')}</span>
                    <span>{actualStudents}/{branch.capacity} ({occupancy}%)</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all ${occupancy > 85 ? 'bg-red-500' : occupancy > 70 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(occupancy, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Rooms section */}
                <div className="border-t border-slate-100 pt-3">
                  <button onClick={() => setExpandedRooms(expandedRooms === branch.id ? null : branch.id)}
                    className="flex items-center justify-between w-full text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors">
                    <span className="flex items-center gap-2">
                      <DoorOpen size={16} className="text-slate-400" />
                      {t('branches.rooms')} ({rooms.filter(r => r.branchId === branch.id).length})
                    </span>
                    {expandedRooms === branch.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {expandedRooms === branch.id && (
                    <div className="mt-3 space-y-2">
                      {rooms.filter(r => r.branchId === branch.id).map(room => {
                        const occupancy = getRoomOccupancy(room)
                        return (
                          <div key={room.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                <DoorOpen size={14} className="text-blue-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-800">{room.name}</p>
                                <p className="text-[11px] text-slate-400">
                                  {t('branches.room_capacity')}: {room.capacity} · {t('branches.room_groups')}: {occupancy}
                                </p>
                              </div>
                            </div>
                            {canEdit && (
                              <div className="flex gap-1">
                                <button onClick={() => handleEditRoom(branch.id, room)}
                                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                  <Pencil size={13} />
                                </button>
                                <button onClick={() => setDeleteRoomConfirm(room.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {rooms.filter(r => r.branchId === branch.id).length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-2">{t('branches.no_rooms')}</p>
                      )}
                      {canEdit && (
                        <button onClick={() => handleAddRoom(branch.id)}
                          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors">
                          <Plus size={14} /> {t('branches.add_room')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Room Form Modal */}
      <Modal isOpen={!!roomForm} onClose={() => setRoomForm(null)}
        title={roomForm?.room ? t('branches.edit_room') : t('branches.add_room')} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('branches.room_name')}</label>
            <input type="text" value={roomFormData.name} onChange={e => setRoomFormData(p => ({ ...p, name: e.target.value }))}
              placeholder={t('branches.room_name_placeholder')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('branches.room_capacity')}</label>
            <input type="number" min="1" max="200" value={roomFormData.capacity}
              onChange={e => setRoomFormData(p => ({ ...p, capacity: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button onClick={() => setRoomForm(null)}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">{t('branches.btn_cancel')}</button>
            <button onClick={handleSaveRoom} disabled={!roomFormData.name.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{t('branches.btn_save_room')}</button>
          </div>
        </div>
      </Modal>

      {/* Confirm Delete Room Modal */}
      <Modal isOpen={!!deleteRoomConfirm} onClose={() => setDeleteRoomConfirm(null)} title={t('branches.delete_room_title')} size="sm">
        <p className="text-sm text-slate-600 mb-4">{t('branches.delete_room_confirm')}</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteRoomConfirm(null)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">{t('branches.btn_cancel')}</button>
          <button onClick={() => handleDeleteRoom(deleteRoomConfirm)} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">{t('branches.btn_delete')}</button>
        </div>
      </Modal>

      {/* Expense Comparison */}
      {branches.length > 0 && (
        <div className="glass-card rounded-2xl p-4 md:p-6">
          <h3 className="text-base md:text-lg font-semibold text-slate-900 mb-4">{t('branches.expense_chart')}</h3>
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
        title={editingBranch ? t('branches.modal_edit') : t('branches.modal_new')} size="lg">
        <BranchForm branch={editingBranch} onSave={handleSave} onClose={() => setModalOpen(false)} />
      </Modal>

      {/* Confirm Delete Modal */}
      <Modal isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} title={t('branches.modal_confirm_delete')} size="sm">
        <p className="text-sm text-slate-600 mb-4">{t('branches.confirm_delete')}</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">{t('branches.btn_cancel')}</button>
          <button onClick={() => handleDelete(confirmDelete)} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">{t('branches.btn_delete')}</button>
        </div>
      </Modal>
    </div>
  )
}
