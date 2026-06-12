import { Bell, Shield, Menu } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useLanguage } from '../contexts/LanguageContext'
import GlobalSearch from './GlobalSearch'

export default function Header({ onMenuClick }) {
  const { user, getRoleLabel } = useAuth()
  const { getDebtors, getBranchName } = useData()
  const { t, language, setLanguage } = useLanguage()

  const locale = language === 'uz' ? 'uz-UZ' : 'ru-RU'
  const today = new Date().toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const debtorCount = getDebtors(user?.branch).length

  return (
    <header className="h-14 md:h-16 glass-strong sticky top-0 z-30 flex items-center justify-between px-3 md:px-6 shrink-0">
      <div className="flex items-center gap-2 md:gap-4">
        <button onClick={onMenuClick} className="p-2 hover:bg-white/60 rounded-xl md:hidden transition-colors">
          <Menu size={20} className="text-slate-600" />
        </button>
        <p className="text-xs md:text-sm text-slate-500 capitalize truncate">{today}</p>
        {user?.branch !== 'all' && (
          <span className="hidden md:inline text-xs bg-blue-500/10 text-blue-700 px-2.5 py-1 rounded-full font-medium backdrop-blur-sm">
            {getBranchName(user.branch)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 md:gap-3">
        <GlobalSearch />

        {/* RU / UZ Language Toggle */}
        <div className="flex items-center rounded-xl overflow-hidden border border-slate-200/60 bg-white/40 backdrop-blur-sm">
          <button
            onClick={() => setLanguage('ru')}
            className={`px-2.5 py-1.5 text-xs font-bold transition-all ${
              language === 'ru'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
            }`}
          >
            RU
          </button>
          <button
            onClick={() => setLanguage('uz')}
            className={`px-2.5 py-1.5 text-xs font-bold transition-all ${
              language === 'uz'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
            }`}
          >
            UZ
          </button>
        </div>

        <button className="relative p-2.5 glass-btn rounded-xl transition-all" title={`${debtorCount} ${t('header.debtors_tooltip')}`}>
          <Bell size={18} className="text-slate-600" />
          {debtorCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-lg shadow-red-200">
              {debtorCount}
            </span>
          )}
        </button>
        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 glass-btn px-3 py-1.5 rounded-xl font-medium">
          <Shield size={12} />
          {getRoleLabel()}
        </div>
      </div>
    </header>
  )
}
