import { useState } from 'react'
import { TrendingUp, ArrowUpRight, ArrowDownRight, Plus } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { revenueByMonth, expenseCategories, formatCurrency } from '../data/mockData'
import Modal from '../components/Modal'
import PaymentForm from '../components/PaymentForm'

const profitByMonth = revenueByMonth.map((m) => ({
  month: m.month,
  revenue: m.tashkent + m.samarkand + m.fergana,
  expenses: Math.round((m.tashkent + m.samarkand + m.fergana) * 0.64),
  profit: Math.round((m.tashkent + m.samarkand + m.fergana) * 0.36),
}))

export default function Finance() {
  const { user, hasPermission } = useAuth()
  const { branches, payments } = useData()
  const [branchFilter, setBranchFilter] = useState(user.branch !== 'all' ? user.branch : 'all')
  const [modalOpen, setModalOpen] = useState(false)

  const canFullPnL = hasPermission('finance', 'fullPnL')
  const canExpenses = hasPermission('finance', 'expenses')
  const canPayments = hasPermission('finance', 'payments')

  const filteredPayments = payments.filter(
    (p) => branchFilter === 'all' || p.branch === branchFilter
  )
  const incomePayments = filteredPayments.filter(p => p.type === 'income')
  const expensePayments = filteredPayments.filter(p => p.type === 'expense')
  const totalIncome = incomePayments.reduce((s, p) => s + p.amount, 0)
  const totalExpense = expensePayments.reduce((s, p) => s + p.amount, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">Финансы</h2>
          <p className="text-slate-500 mt-1">
            {canFullPnL ? 'Финансовый обзор всех филиалов' : 'Платежи и поступления'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {user.branch === 'all' && (
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
              className="bg-white border border-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">Все филиалы</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {canPayments && (
            <button onClick={() => setModalOpen(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
              <Plus size={16} /> Новая операция
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className={`grid grid-cols-1 ${canFullPnL ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
        <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-50 rounded-lg"><ArrowUpRight size={20} className="text-emerald-600" /></div>
            <span className="text-sm text-slate-500">Поступления</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalIncome)}</p>
          <p className="text-sm text-slate-400 mt-1">{incomePayments.length} операций</p>
        </div>
        {canExpenses && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-red-50 rounded-lg"><ArrowDownRight size={20} className="text-red-600" /></div>
              <span className="text-sm text-slate-500">Расходы</span>
            </div>
            <p className="text-2xl font-bold text-red-500">{formatCurrency(totalExpense)}</p>
            <p className="text-sm text-slate-400 mt-1">{expensePayments.length} операций</p>
          </div>
        )}
        {canFullPnL && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-50 rounded-lg"><TrendingUp size={20} className="text-blue-600" /></div>
              <span className="text-sm text-slate-500">Чистая прибыль</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalIncome - totalExpense)}</p>
            <p className="text-sm text-blue-500 mt-1">
              Маржа: {totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0}%
            </p>
          </div>
        )}
      </div>

      {/* Charts — admin only */}
      {canFullPnL && (
        <>
          <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-slate-100">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Доходы vs Расходы (млн сум)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={profitByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="#10b981" fillOpacity={0.2} name="Доход" />
                <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} name="Расходы" />
                <Area type="monotone" dataKey="profit" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} name="Прибыль" />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-slate-100">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">P&L по филиалам</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left py-3 px-4 text-slate-500 font-medium">Филиал</th>
                    <th className="text-right py-3 px-4 text-slate-500 font-medium">Доход</th>
                    <th className="text-right py-3 px-4 text-slate-500 font-medium">Расходы</th>
                    <th className="text-right py-3 px-4 text-slate-500 font-medium">Прибыль</th>
                    <th className="text-right py-3 px-4 text-slate-500 font-medium">Маржа</th>
                    <th className="text-right py-3 px-4 text-slate-500 font-medium">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((b) => {
                    const profit = b.monthlyRevenue - b.monthlyExpenses
                    const margin = Math.round((profit / b.monthlyRevenue) * 100)
                    const roi = Math.round((profit / b.monthlyExpenses) * 100)
                    return (
                      <tr key={b.id} className="border-b border-slate-50">
                        <td className="py-3 px-4 font-medium">{b.name}</td>
                        <td className="py-3 px-4 text-right text-emerald-600 font-semibold">{formatCurrency(b.monthlyRevenue)}</td>
                        <td className="py-3 px-4 text-right text-red-500 font-semibold">{formatCurrency(b.monthlyExpenses)}</td>
                        <td className="py-3 px-4 text-right text-blue-600 font-bold">{formatCurrency(profit)}</td>
                        <td className="py-3 px-4 text-right font-semibold">{margin}%</td>
                        <td className="py-3 px-4 text-right font-semibold text-purple-600">{roi}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-slate-100">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Структура расходов (млн сум)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={expenseCategories}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="category" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                <Legend />
                <Bar dataKey="tashkent" fill="#3b82f6" name="Ташкент" radius={[4, 4, 0, 0]} />
                <Bar dataKey="samarkand" fill="#10b981" name="Самарканд" radius={[4, 4, 0, 0]} />
                <Bar dataKey="fergana" fill="#f59e0b" name="Фергана" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Transactions */}
      <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-slate-100">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Последние транзакции</h3>
        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-medium text-emerald-600 mb-2">Поступления ({incomePayments.length})</h4>
            <div className="space-y-2">
              {incomePayments.length === 0 && <p className="text-sm text-slate-400">Нет поступлений</p>}
              {incomePayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-emerald-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{p.student}</p>
                    <p className="text-xs text-slate-500">
                      {branches.find(b => b.id === p.branch)?.name} &middot; {p.date} &middot; {p.method}
                      {p.course ? ` · ${p.course}` : ''}
                      {p.contractNumber ? ` · Договор ${p.contractNumber}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-emerald-600">+{formatCurrency(p.amount)}</span>
                    {p.debt > 0 && <p className="text-xs text-red-500">Долг: {formatCurrency(p.debt)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {canExpenses && (
            <div>
              <h4 className="text-sm font-medium text-red-500 mb-2">Расходы ({expensePayments.length})</h4>
              <div className="space-y-2">
                {expensePayments.length === 0 && <p className="text-sm text-slate-400">Нет расходов</p>}
                {expensePayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-red-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{p.student}</p>
                      <p className="text-xs text-slate-500">{branches.find(b => b.id === p.branch)?.name} &middot; {p.date} &middot; {p.method}</p>
                    </div>
                    <span className="text-sm font-bold text-red-500">-{formatCurrency(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Новая операция" size="lg">
        <PaymentForm onClose={() => setModalOpen(false)} />
      </Modal>
    </div>
  )
}
