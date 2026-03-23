import { useState } from 'react'
import { TrendingUp, Award, AlertTriangle, Settings } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { formatCurrency } from '../data/mockData'
import Modal from './Modal'
import SalesPlanModal from './SalesPlanModal'

// ─── helpers ──────────────────────────────────────────────────────────────────
const STATUS = {
  done: { tKey: 'salesDashboard.status_done',   bg: 'bg-emerald-100', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  good: { tKey: 'salesDashboard.status_good',   bg: 'bg-blue-100',    text: 'text-blue-700',    bar: 'bg-blue-500'    },
  risk: { tKey: 'salesDashboard.status_risk',    bg: 'bg-amber-100',   text: 'text-amber-700',   bar: 'bg-amber-500'   },
  low:  { tKey: 'salesDashboard.status_low',     bg: 'bg-red-100',     text: 'text-red-700',     bar: 'bg-red-400'     },
}

function StatusBadge({ status }) {
  const { t } = useLanguage()
  const s = STATUS[status] || STATUS.low
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{t(s.tKey)}</span>
}

function ProgressBar({ pct, status, height = 'h-2' }) {
  const s = STATUS[status] || STATUS.low
  return (
    <div className={`w-full bg-slate-200 rounded-full ${height} overflow-hidden`}>
      <div className={`${height} rounded-full ${s.bar} transition-all duration-500`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function SummaryCard({ title, perf, accent = 'blue' }) {
  const { t } = useLanguage()
  const rings = { blue: 'ring-blue-100', violet: 'ring-violet-100', teal: 'ring-teal-100', orange: 'ring-orange-100' }
  return (
    <div className={`bg-white rounded-xl p-5 shadow-sm border border-slate-100 ring-1 ${rings[accent] || rings.blue}`}>
      <p className="text-sm font-medium text-slate-500 mb-3">{title}</p>
      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-xs text-slate-400 mb-0.5">{t('salesDashboard.achieved')}</p>
          <p className="text-xl font-bold text-slate-900">{formatCurrency(perf.achieved)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400 mb-0.5">{t('salesDashboard.plan')}</p>
          <p className="text-sm font-semibold text-slate-600">{formatCurrency(perf.plan)}</p>
        </div>
      </div>
      <ProgressBar pct={perf.percentage} status={perf.status} height="h-2.5" />
      <div className="flex items-center justify-between mt-2">
        <StatusBadge status={perf.status} />
        <span className="text-base font-bold text-slate-800">{perf.percentage}%</span>
      </div>
    </div>
  )
}

function ManagerCard({ manager, perf, isMe }) {
  const { t } = useLanguage()
  const s = STATUS[perf.status] || STATUS.low
  return (
    <div className={`bg-white rounded-xl p-4 shadow-sm border transition-shadow hover:shadow-md ${isMe ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-100'}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${isMe ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
          {manager.avatar}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {manager.name}
            {isMe && <span className="ml-1 text-xs text-blue-500 font-normal">{t('finance.you')}</span>}
          </p>
          {perf.plan === 0 && <p className="text-xs text-slate-400">{t('salesDashboard.no_plan_label')}</p>}
        </div>
        <StatusBadge status={perf.status} />
      </div>
      <ProgressBar pct={perf.percentage} status={perf.status} />
      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <div><p className="text-xs text-slate-400">{t('salesDashboard.plan')}</p><p className="text-xs font-semibold text-slate-700">{perf.plan > 0 ? formatCurrency(perf.plan) : '—'}</p></div>
        <div><p className="text-xs text-slate-400">{t('salesDashboard.fact')}</p><p className="text-xs font-semibold text-emerald-600">{perf.achieved > 0 ? formatCurrency(perf.achieved) : '—'}</p></div>
        <div><p className="text-xs text-slate-400">%</p><p className={`text-sm font-bold ${s.text}`}>{perf.percentage}%</p></div>
      </div>
      {perf.plan > 0 && perf.remaining > 0 && (
        <p className="mt-2 text-xs text-slate-400 text-center">{t('salesDashboard.remaining')}: <span className="font-medium text-slate-600">{formatCurrency(perf.remaining)}</span></p>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SalesDashboard() {
  const { getManagerPerf, getBranchPerf, branches, getBranchName } = useData()
  const { user, getSalesStaff } = useAuth()
  const { t } = useLanguage()
  const isAdmin = user.role === 'owner' || user.role === 'admin' || user.role === 'branch_director'
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [planModalOpen, setPlanModalOpen] = useState(false)
  const [branchFilter, setBranchFilter] = useState(isAdmin ? 'all' : user.branch)

  const allSalesStaff = getSalesStaff('all')
  const visibleManagers = getSalesStaff(branchFilter)

  const teamPerf = getBranchPerf('all', month, allSalesStaff)
  const branchPerfs = {}
  branches.forEach(b => {
    branchPerfs[b.id] = getBranchPerf(b.id, month, allSalesStaff)
  })

  const sortedManagers = [...visibleManagers].sort((a, b) => {
    if (a.managerId === user.managerId) return -1
    if (b.managerId === user.managerId) return 1
    return getManagerPerf(b.managerId, month).achieved - getManagerPerf(a.managerId, month).achieved
  })

  const noPlan = allSalesStaff.every(m => getManagerPerf(m.managerId, month).plan === 0)

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">{t('salesDashboard.period_label')}</span>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">{t('salesDashboard.branch_label')}</span>
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">{t('salesDashboard.all_branches')}</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <div className="ml-auto">
          {isAdmin && (
            <button onClick={() => setPlanModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
              <Settings size={15} /> {t('salesDashboard.btn_set_plan')}
            </button>
          )}
        </div>
      </div>

      {noPlan && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">{t('salesDashboard.no_plan_title')}</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {isAdmin ? t('salesDashboard.no_plan_admin') : t('salesDashboard.no_plan_user')}
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      {isAdmin ? (
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${Math.min(branches.length + 1, 4)} gap-4`}>
          <SummaryCard title={t('salesDashboard.whole_department')} perf={teamPerf} accent="blue" />
          {branches.map((b, i) => {
            const accents = ['violet', 'teal', 'orange', 'blue']
            return <SummaryCard key={b.id} title={b.name} perf={branchPerfs[b.id] || teamPerf} accent={accents[i % accents.length]} />
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SummaryCard title={`${t('salesDashboard.branch_prefix')} ${getBranchName(user.branch)}`} perf={branchPerfs[user.branch] || teamPerf} accent="blue" />
          {user.managerId && (() => {
            const perf = getManagerPerf(user.managerId, month)
            return (
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5 text-white shadow-sm">
                <div className="flex items-center gap-2 mb-3"><Award size={18} className="opacity-80" /><p className="text-sm font-medium opacity-90">{t('salesDashboard.my_metrics')}</p></div>
                <div className="flex items-end justify-between mb-3">
                  <div><p className="text-xs opacity-70 mb-0.5">{t('salesDashboard.achieved')}</p><p className="text-2xl font-bold">{formatCurrency(perf.achieved)}</p></div>
                  <div className="text-right"><p className="text-xs opacity-70 mb-0.5">{t('salesDashboard.plan')}</p><p className="text-base font-semibold opacity-90">{perf.plan > 0 ? formatCurrency(perf.plan) : '—'}</p></div>
                </div>
                <div className="w-full bg-white/20 rounded-full h-2.5 mb-2">
                  <div className="h-2.5 rounded-full bg-white transition-all duration-500" style={{ width: `${Math.min(perf.percentage, 100)}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs opacity-80">{perf.remaining > 0 ? `${t('salesDashboard.remaining')} ${formatCurrency(perf.remaining)}` : t('salesDashboard.plan_done')}</span>
                  <span className="text-xl font-bold">{perf.percentage}%</span>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Manager grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <TrendingUp size={18} className="text-slate-500" />
            {isAdmin ? t('salesDashboard.manager_metrics') : t('salesDashboard.team')}
          </h3>
          <span className="text-xs text-slate-400">{visibleManagers.length} {t('salesDashboard.employees_count')}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedManagers.map(mgr => (
            <ManagerCard
              key={mgr.id}
              manager={mgr}
              perf={getManagerPerf(mgr.managerId, month)}
              isMe={mgr.managerId === user.managerId}
            />
          ))}
        </div>
      </div>

      <Modal isOpen={planModalOpen} onClose={() => setPlanModalOpen(false)} title="" size="lg">
        <SalesPlanModal onClose={() => setPlanModalOpen(false)} />
      </Modal>
    </div>
  )
}
