import { Bell, Search, Shield, Menu } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'

export default function Header({ onMenuClick }) {
  const { user, getRoleLabel } = useAuth()
  const { getDebtors, getBranchName } = useData()

  const today = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const debtorCount = getDebtors(user?.branch).length

  return (
    <header className="h-14 md:h-16 bg-white border-b border-slate-200 flex items-center justify-between px-3 md:px-6 shrink-0">
      <div className="flex items-center gap-2 md:gap-4">
        <button onClick={onMenuClick} className="p-2 hover:bg-slate-100 rounded-lg md:hidden">
          <Menu size={20} className="text-slate-600" />
        </button>
        <p className="text-xs md:text-sm text-slate-500 capitalize truncate">{today}</p>
        {user?.branch !== 'all' && (
          <span className="hidden md:inline text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full font-medium">
            {getBranchName(user.branch)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 md:gap-4">
        <div className="relative hidden md:block">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск..."
            className="pl-10 pr-4 py-2 bg-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 lg:w-64"
          />
        </div>
        <button className="relative p-2 hover:bg-slate-100 rounded-lg transition-colors" title={`${debtorCount} должников`}>
          <Bell size={20} className="text-slate-600" />
          {debtorCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center px-1">
              {debtorCount}
            </span>
          )}
        </button>
        <div className="hidden md:flex items-center gap-1 text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">
          <Shield size={12} />
          {getRoleLabel()}
        </div>
      </div>
    </header>
  )
}
