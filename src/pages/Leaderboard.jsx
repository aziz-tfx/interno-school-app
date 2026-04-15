import { useState, useMemo } from 'react'
import {
  Trophy, Crown, Medal, TrendingUp, TrendingDown, Target, DollarSign,
  ShoppingCart, Zap, Flame, Star, Filter, ChevronLeft, ChevronRight,
  Award, Sparkles, Users, BarChart3,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useLanguage } from '../contexts/LanguageContext'

// ─── Constants ──────────────────────────────────────────────────────────────

const BRANCH_OPTIONS = [
  { slug: 'all',       name: { ru: 'Все филиалы', uz: 'Barcha filiallar' } },
  { slug: 'tashkent',  name: { ru: 'Ташкент',      uz: 'Toshkent' } },
  { slug: 'samarkand', name: { ru: 'Самарканд',    uz: 'Samarqand' } },
  { slug: 'fergana',   name: { ru: 'Фергана',      uz: "Fargʻona" } },
  { slug: 'bukhara',   name: { ru: 'Бухара',       uz: 'Buxoro' } },
]

// Rank tier colors (gold / silver / bronze / regular)
const TIER_COLORS = {
  1: { bg: 'from-amber-400 via-yellow-500 to-amber-600', ring: 'ring-amber-400/40', icon: 'text-amber-100', badge: 'bg-amber-500' },
  2: { bg: 'from-slate-300 via-slate-400 to-slate-500',  ring: 'ring-slate-400/40', icon: 'text-slate-100', badge: 'bg-slate-400' },
  3: { bg: 'from-orange-400 via-orange-500 to-amber-700', ring: 'ring-orange-400/40', icon: 'text-orange-100', badge: 'bg-orange-500' },
}

// Achievements earned by managers
const ACHIEVEMENTS = [
  { id: 'gold',       icon: '🥇', labelKey: 'leaderboard.badge_gold',       test: (m, ctx) => ctx.rank === 1 },
  { id: 'silver',     icon: '🥈', labelKey: 'leaderboard.badge_silver',     test: (m, ctx) => ctx.rank === 2 },
  { id: 'bronze',     icon: '🥉', labelKey: 'leaderboard.badge_bronze',     test: (m, ctx) => ctx.rank === 3 },
  { id: 'plan_done',  icon: '🎯', labelKey: 'leaderboard.badge_plan_done',  test: (m) => m.perf.percentage >= 100 },
  { id: 'overachieve',icon: '🚀', labelKey: 'leaderboard.badge_overachieve',test: (m) => m.perf.percentage >= 150 },
  { id: 'big_deal',   icon: '💎', labelKey: 'leaderboard.badge_big_deal',   test: (m) => m.maxDeal >= 10000000 },
  { id: 'volume',     icon: '🔥', labelKey: 'leaderboard.badge_volume',     test: (m) => m.dealsCount >= 10 },
  { id: 'high_avg',   icon: '⭐', labelKey: 'leaderboard.badge_high_avg',   test: (m) => m.avgCheck >= 5000000 },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMoney(val) {
  if (!val) return '0'
  if (Math.abs(val) >= 1_000_000) {
    const m = val / 1_000_000
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`
  }
  if (Math.abs(val) >= 1000) return `${Math.round(val / 1000)}K`
  return String(val)
}

function formatMoneyFull(val) {
  if (val == null) return '0'
  return val.toLocaleString('ru-RU')
}

function addMonths(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getMonthLabel(monthKey, locale = 'ru') {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString(locale === 'uz' ? 'uz-UZ' : 'ru-RU', { month: 'long', year: 'numeric' })
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function Leaderboard() {
  const { employees, user, hasPermission } = useAuth()
  const { payments, getManagerPerf } = useData()
  const { t, language } = useLanguage()
  const lang = language

  const [monthKey, setMonthKey] = useState(() => new Date().toISOString().slice(0, 7))
  const [branchFilter, setBranchFilter] = useState(() => {
    // Auto-scope by role
    if (user?.role === 'rop' || user?.role === 'branch_director') return user.branch || 'all'
    return 'all'
  })
  const [sortBy, setSortBy] = useState('revenue') // revenue | deals | percentage | avg

  // Get managers list
  const managers = useMemo(() => {
    return employees.filter(e =>
      (e.role === 'sales' || e.role === 'rop') &&
      !e.deleted &&
      e.status !== 'pending' &&
      e.status !== 'rejected' &&
      e.managerId
    )
  }, [employees])

  // Compute stats per manager
  const leaderboard = useMemo(() => {
    const filtered = managers.filter(m => branchFilter === 'all' || m.branch === branchFilter)

    const rows = filtered.map(m => {
      const managerSales = payments.filter(p =>
        p.type === 'income' &&
        (p.date || '').startsWith(monthKey) &&
        (p.managerId === m.managerId || p.createdBy === m.id)
      )
      const revenue = managerSales.reduce((s, p) => s + (Number(p.amount) || 0), 0)
      const dealsCount = managerSales.length
      const avgCheck = dealsCount > 0 ? Math.round(revenue / dealsCount) : 0
      const maxDeal = managerSales.reduce((mx, p) => Math.max(mx, Number(p.amount) || 0), 0)
      const perf = getManagerPerf(m.managerId, monthKey)
      // Previous month for trend
      const prevMonthKey = addMonths(monthKey, -1)
      const prevRevenue = payments
        .filter(p =>
          p.type === 'income' &&
          (p.date || '').startsWith(prevMonthKey) &&
          (p.managerId === m.managerId || p.createdBy === m.id)
        )
        .reduce((s, p) => s + (Number(p.amount) || 0), 0)
      const trend = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : (revenue > 0 ? 100 : 0)

      return {
        manager: m,
        revenue,
        dealsCount,
        avgCheck,
        maxDeal,
        perf,
        prevRevenue,
        trend,
      }
    })

    // Sort
    const sorted = [...rows].sort((a, b) => {
      if (sortBy === 'deals') return b.dealsCount - a.dealsCount
      if (sortBy === 'percentage') return b.perf.percentage - a.perf.percentage
      if (sortBy === 'avg') return b.avgCheck - a.avgCheck
      return b.revenue - a.revenue
    })

    // Assign ranks
    return sorted.map((row, i) => ({ ...row, rank: i + 1 }))
  }, [managers, payments, monthKey, branchFilter, sortBy, getManagerPerf])

  // Totals
  const totals = useMemo(() => {
    const totalRevenue = leaderboard.reduce((s, r) => s + r.revenue, 0)
    const totalDeals = leaderboard.reduce((s, r) => s + r.dealsCount, 0)
    const totalPlan = leaderboard.reduce((s, r) => s + r.perf.plan, 0)
    const avgCheck = totalDeals > 0 ? Math.round(totalRevenue / totalDeals) : 0
    const totalPct = totalPlan > 0 ? Math.round((totalRevenue / totalPlan) * 100) : 0
    return { totalRevenue, totalDeals, avgCheck, totalPlan, totalPct }
  }, [leaderboard])

  // Top 3 for podium (only rendered if there are at least 3 managers with data)
  const podium = leaderboard.slice(0, 3)

  // Highlight current user in ranking
  const currentUserRank = leaderboard.find(r => r.manager.id === user?.id)

  // Achievements per manager
  const getAchievementsFor = (row) => {
    return ACHIEVEMENTS.filter(a => a.test(row, { rank: row.rank }))
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Trophy className="text-amber-500" size={26} />
            {t('leaderboard.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('leaderboard.subtitle')}</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Month selector */}
          <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 px-2 py-1.5 shadow-sm">
            <button
              onClick={() => setMonthKey(addMonths(monthKey, -1))}
              className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="px-2 text-sm font-medium text-slate-700 capitalize min-w-[130px] text-center">
              {getMonthLabel(monthKey, lang)}
            </div>
            <button
              onClick={() => setMonthKey(addMonths(monthKey, 1))}
              className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Branch filter */}
          {user?.role !== 'rop' && user?.role !== 'branch_director' && (
            <select
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {BRANCH_OPTIONS.map(b => (
                <option key={b.slug} value={b.slug}>{b.name[lang] || b.name.ru}</option>
              ))}
            </select>
          )}

          {/* Sort by */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="revenue">{t('leaderboard.sort_revenue')}</option>
            <option value="deals">{t('leaderboard.sort_deals')}</option>
            <option value="percentage">{t('leaderboard.sort_percentage')}</option>
            <option value="avg">{t('leaderboard.sort_avg')}</option>
          </select>
        </div>
      </div>

      {/* Summary KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<DollarSign size={18} />}
          color="emerald"
          label={t('leaderboard.kpi_total_revenue')}
          value={`${formatMoney(totals.totalRevenue)} сум`}
          hint={`${t('leaderboard.plan')}: ${formatMoney(totals.totalPlan)}`}
        />
        <KpiCard
          icon={<Target size={18} />}
          color="violet"
          label={t('leaderboard.kpi_plan_completion')}
          value={`${totals.totalPct}%`}
          hint={totals.totalPct >= 100 ? t('leaderboard.plan_done') : `${t('leaderboard.to_plan')}: ${formatMoney(Math.max(0, totals.totalPlan - totals.totalRevenue))}`}
        />
        <KpiCard
          icon={<ShoppingCart size={18} />}
          color="blue"
          label={t('leaderboard.kpi_total_deals')}
          value={totals.totalDeals}
          hint={`${t('leaderboard.avg_check')}: ${formatMoney(totals.avgCheck)}`}
        />
        <KpiCard
          icon={<Users size={18} />}
          color="amber"
          label={t('leaderboard.kpi_managers')}
          value={leaderboard.length}
          hint={currentUserRank ? `${t('leaderboard.your_rank')}: #${currentUserRank.rank}` : ''}
        />
      </div>

      {/* Podium for top-3 */}
      {podium.length > 0 && (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
          {/* Decorative glow */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-1/4 w-64 h-64 bg-amber-500 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-violet-500 rounded-full blur-3xl" />
          </div>

          <div className="relative">
            <div className="flex items-center gap-2 mb-6">
              <Sparkles className="text-amber-400" size={18} />
              <h3 className="text-white/90 font-semibold text-sm uppercase tracking-wider">
                {t('leaderboard.top_performers')}
              </h3>
            </div>

            <div className="grid grid-cols-3 gap-3 md:gap-6 items-end">
              {/* 2nd place */}
              <PodiumCard row={podium[1]} rank={2} height="h-28 md:h-36" t={t} />
              {/* 1st place */}
              <PodiumCard row={podium[0]} rank={1} height="h-36 md:h-48" t={t} highlighted />
              {/* 3rd place */}
              <PodiumCard row={podium[2]} rank={3} height="h-20 md:h-28" t={t} />
            </div>
          </div>
        </div>
      )}

      {/* Ranking list + chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Ranking list */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <BarChart3 size={18} className="text-violet-600" />
              {t('leaderboard.full_ranking')}
            </h3>
            <span className="text-xs text-slate-400">{leaderboard.length} {t('leaderboard.participants')}</span>
          </div>

          {leaderboard.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <Trophy size={36} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('leaderboard.no_data')}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {leaderboard.map(row => {
                const isCurrent = row.manager.id === user?.id
                const achievements = getAchievementsFor(row)
                return (
                  <RankingRow
                    key={row.manager.id}
                    row={row}
                    achievements={achievements}
                    isCurrent={isCurrent}
                    t={t}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* Revenue chart */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <TrendingUp size={18} className="text-emerald-600" />
              {t('leaderboard.revenue_chart')}
            </h3>
          </div>
          <div className="p-3">
            {leaderboard.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(220, leaderboard.length * 36)}>
                <BarChart
                  data={leaderboard.slice(0, 10).map(r => ({
                    name: r.manager.name.split(' ')[0],
                    revenue: r.revenue,
                    rank: r.rank,
                  }))}
                  layout="vertical"
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    width={70}
                  />
                  <Tooltip
                    formatter={(v) => [`${formatMoneyFull(v)} сум`, t('leaderboard.revenue')]}
                    cursor={{ fill: 'rgba(139, 92, 246, 0.08)' }}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Bar dataKey="revenue" radius={[0, 8, 8, 0]}>
                    {leaderboard.slice(0, 10).map((r, i) => (
                      <Cell
                        key={i}
                        fill={
                          r.rank === 1 ? '#f59e0b' :
                          r.rank === 2 ? '#94a3b8' :
                          r.rank === 3 ? '#f97316' :
                          '#8b5cf6'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-12 text-center text-slate-400 text-sm">{t('leaderboard.no_data')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function KpiCard({ icon, color, label, value, hint }) {
  const palette = {
    emerald: 'from-emerald-500 to-teal-600 text-emerald-50',
    violet:  'from-violet-500 to-purple-600 text-violet-50',
    blue:    'from-blue-500 to-indigo-600 text-blue-50',
    amber:   'from-amber-500 to-orange-600 text-amber-50',
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-start gap-3 hover:shadow-md transition-shadow">
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${palette[color]} flex items-center justify-center shrink-0 shadow-md`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-slate-500 uppercase tracking-wide font-medium truncate">{label}</p>
        <p className="text-xl font-bold text-slate-900 mt-0.5 truncate">{value}</p>
        {hint && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{hint}</p>}
      </div>
    </div>
  )
}

function PodiumCard({ row, rank, height, t, highlighted }) {
  if (!row) return <div />
  const tier = TIER_COLORS[rank]
  return (
    <div className="flex flex-col items-center">
      {/* Avatar + name */}
      <div className="flex flex-col items-center mb-2">
        <div className="relative">
          <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br ${tier.bg} flex items-center justify-center text-white text-xl md:text-2xl font-bold shadow-xl ring-4 ${tier.ring}`}>
            {row.manager.avatar || row.manager.name?.[0]}
          </div>
          <div className={`absolute -top-1.5 -right-1.5 w-6 h-6 ${tier.badge} rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg border-2 border-slate-900`}>
            {rank}
          </div>
          {rank === 1 && (
            <Crown className="absolute -top-6 left-1/2 -translate-x-1/2 text-amber-400 drop-shadow-lg" size={22} fill="currentColor" />
          )}
        </div>
        <p className="text-white text-xs md:text-sm font-semibold mt-2 text-center line-clamp-1 max-w-[100px]">
          {row.manager.name?.split(' ').slice(0, 2).join(' ')}
        </p>
        <p className="text-white/60 text-[10px] md:text-xs">
          {formatMoney(row.revenue)} сум
        </p>
        <p className="text-white/40 text-[10px] mt-0.5">
          {row.dealsCount} {t('leaderboard.deals_short')}
        </p>
      </div>

      {/* Podium block */}
      <div className={`w-full ${height} bg-gradient-to-b ${tier.bg} rounded-t-2xl flex items-start justify-center pt-2 relative overflow-hidden ${highlighted ? 'shadow-2xl' : ''}`}>
        <span className="text-white/90 text-2xl md:text-4xl font-black drop-shadow-lg">#{rank}</span>
        {highlighted && (
          <div className="absolute inset-0 bg-gradient-to-t from-white/0 via-white/10 to-white/20 pointer-events-none" />
        )}
      </div>
    </div>
  )
}

function RankingRow({ row, achievements, isCurrent, t }) {
  const { manager, rank, revenue, dealsCount, avgCheck, perf, trend } = row
  const tier = TIER_COLORS[rank]
  const pctColor =
    perf.percentage >= 100 ? 'text-emerald-600' :
    perf.percentage >= 75 ? 'text-blue-600' :
    perf.percentage >= 40 ? 'text-amber-600' :
    'text-red-600'
  const pctBg =
    perf.percentage >= 100 ? 'bg-emerald-50' :
    perf.percentage >= 75 ? 'bg-blue-50' :
    perf.percentage >= 40 ? 'bg-amber-50' :
    'bg-red-50'

  return (
    <div className={`px-5 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors ${isCurrent ? 'bg-violet-50/60' : ''}`}>
      {/* Rank */}
      <div className="w-10 flex items-center justify-center shrink-0">
        {tier ? (
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${tier.bg} flex items-center justify-center text-white font-bold text-sm shadow-md`}>
            {rank}
          </div>
        ) : (
          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-semibold text-sm">
            {rank}
          </div>
        )}
      </div>

      {/* Avatar + name */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-white font-bold text-base shrink-0 shadow-sm">
          {manager.avatar || manager.name?.[0]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-semibold text-slate-900 truncate text-sm">
              {manager.name}
            </p>
            {isCurrent && (
              <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-md font-medium">
                {t('leaderboard.you')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[11px] text-slate-500 capitalize">
              {manager.role === 'rop' ? t('role.rop') : t('role.sales')}
            </span>
            {achievements.length > 0 && (
              <div className="flex items-center gap-0.5" title={achievements.map(a => t(a.labelKey)).join(', ')}>
                {achievements.slice(0, 5).map(a => (
                  <span key={a.id} className="text-sm">{a.icon}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="hidden md:flex items-center gap-4 text-right shrink-0">
        <div className="w-20">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">{t('leaderboard.deals_short')}</p>
          <p className="font-semibold text-slate-800 text-sm">{dealsCount}</p>
        </div>
        <div className="w-24">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">{t('leaderboard.avg_check')}</p>
          <p className="font-semibold text-slate-800 text-sm">{formatMoney(avgCheck)}</p>
        </div>
      </div>

      {/* Revenue */}
      <div className="text-right shrink-0 w-24 md:w-28">
        <p className="text-[10px] text-slate-400 uppercase tracking-wide">{t('leaderboard.revenue')}</p>
        <p className="font-bold text-slate-900 text-sm md:text-base">{formatMoney(revenue)}</p>
        {trend !== 0 && (
          <div className={`flex items-center justify-end gap-0.5 text-[10px] font-medium ${trend > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {trend > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {trend > 0 ? '+' : ''}{trend}%
          </div>
        )}
      </div>

      {/* Plan % badge */}
      <div className={`shrink-0 px-2.5 py-1 rounded-lg ${pctBg} ${pctColor} text-xs font-bold w-14 text-center`}>
        {perf.percentage}%
      </div>
    </div>
  )
}
