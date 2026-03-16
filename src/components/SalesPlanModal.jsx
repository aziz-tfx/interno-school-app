import { useState, useEffect } from 'react'
import { Target, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency } from '../data/mockData'

export default function SalesPlanModal({ onClose }) {
  const { getSalesPlan, setSalesPlan, branches } = useData()
  const { getSalesStaff } = useAuth()
  const managers = getSalesStaff('all')

  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [drafts, setDrafts] = useState({})
  const [saved, setSaved] = useState(false)
  const [openBranch, setOpenBranch] = useState(branches[0]?.id || null)

  useEffect(() => {
    const init = {}
    managers.forEach(m => {
      const v = getSalesPlan(m.managerId, month)
      init[m.managerId] = v > 0 ? String(v) : ''
    })
    setDrafts(init)
    setSaved(false)
  }, [month, managers.length])

  const setDraft = (id, val) => setDrafts(prev => ({ ...prev, [id]: val }))

  const handleSave = () => {
    managers.forEach(m => {
      const num = Number(drafts[m.managerId])
      setSalesPlan(m.managerId, num >= 0 ? num : 0, month)
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const branchTotal = (branchId) =>
    managers.filter(m => m.branch === branchId).reduce((s, m) => s + (Number(drafts[m.managerId]) || 0), 0)
  const grandTotal = managers.reduce((s, m) => s + (Number(drafts[m.managerId]) || 0), 0)

  const branchIds = branches.map(b => b.id)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg"><Target size={20} className="text-blue-600" /></div>
        <div>
          <h3 className="text-base font-semibold text-slate-900">Плановые показатели</h3>
          <p className="text-xs text-slate-500">Установите план по каждому менеджеру</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700">Период:</label>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <span className="ml-auto text-sm text-slate-500">
          Общий план: <span className="font-bold text-slate-800">{formatCurrency(grandTotal)}</span>
        </span>
      </div>

      <div className="space-y-3">
        {branches.map(branch => {
          const branchId = branch.id
          const branchManagers = managers.filter(m => m.branch === branchId)
          if (branchManagers.length === 0) return null
          const isOpen = openBranch === branchId
          return (
            <div key={branchId} className="border border-slate-200 rounded-xl overflow-hidden">
              <button type="button" onClick={() => setOpenBranch(isOpen ? null : branchId)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{branch.name}</span>
                  <span className="text-xs text-slate-500">{branchManagers.length} менеджеров</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-blue-600">{formatCurrency(branchTotal(branchId))}</span>
                  {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </div>
              </button>
              {isOpen && (
                <div className="divide-y divide-slate-100">
                  {branchManagers.map(m => (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">{m.avatar}</div>
                      <span className="flex-1 text-sm font-medium text-slate-800">{m.name}</span>
                      <div className="flex items-center gap-2">
                        <input type="number" min="0" step="500000" value={drafts[m.managerId] || ''} onChange={e => setDraft(m.managerId, e.target.value)}
                          placeholder="0" className="w-36 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <span className="text-xs text-slate-400 w-6">сум</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Закрыть</button>
        <button onClick={handleSave}
          className={`flex items-center gap-2 px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors ${saved ? 'bg-emerald-500' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {saved ? <><Check size={15} /> Сохранено</> : 'Сохранить план'}
        </button>
      </div>
    </div>
  )
}
