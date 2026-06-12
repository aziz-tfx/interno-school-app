import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, GraduationCap, Users, DollarSign, UserCog, X, ArrowRight } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'

// Global search across students, groups, payments and employees.
// Desktop: inline input with dropdown. Mobile: icon opens fullscreen overlay.
export default function GlobalSearch() {
  const navigate = useNavigate()
  const { students, groups, payments } = useData()
  const { user, employees, hasPermission } = useAuth()
  const { t } = useLanguage()

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const boxRef = useRef(null)
  const mobileInputRef = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Autofocus mobile overlay input
  useEffect(() => {
    if (mobileOpen) setTimeout(() => mobileInputRef.current?.focus(), 50)
  }, [mobileOpen])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const out = []

    if (hasPermission('students', 'view')) {
      students
        .filter(s => (s.name || '').toLowerCase().includes(q) || (s.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '~'))
        .slice(0, 5)
        .forEach(s => out.push({
          type: 'student', icon: GraduationCap, color: 'bg-emerald-100 text-emerald-600',
          title: s.name, subtitle: `${s.course || ''} · ${s.group || '—'}`,
          to: `/students?q=${encodeURIComponent(s.name)}`,
        }))

      groups
        .filter(g => (g.name || '').toLowerCase().includes(q) || (g.course || '').toLowerCase().includes(q))
        .slice(0, 4)
        .forEach(g => out.push({
          type: 'group', icon: Users, color: 'bg-blue-100 text-blue-600',
          title: g.name, subtitle: g.course || 'Группа',
          to: `/students?tab=groups&q=${encodeURIComponent(g.name)}`,
        }))
    }

    if (hasPermission('finance', 'view')) {
      payments
        .filter(p => p.type === 'income' && (
          (p.student || '').toLowerCase().includes(q) ||
          (p.contractNumber || '').toLowerCase().includes(q)
        ))
        .slice(0, 4)
        .forEach(p => out.push({
          type: 'payment', icon: DollarSign, color: 'bg-amber-100 text-amber-600',
          title: `${p.student || 'Платёж'} — ${(p.amount || 0).toLocaleString('ru-RU')} сум`,
          subtitle: `${p.date || ''}${p.contractNumber ? ` · №${p.contractNumber}` : ''}`,
          to: '/finance',
        }))
    }

    if (hasPermission('employees', 'view')) {
      employees
        .filter(e => !e.deleted && (e.name || '').toLowerCase().includes(q))
        .slice(0, 3)
        .forEach(e => out.push({
          type: 'employee', icon: UserCog, color: 'bg-violet-100 text-violet-600',
          title: e.name, subtitle: e.role || '',
          to: '/employees',
        }))
    }

    return out.slice(0, 12)
  }, [query, students, groups, payments, employees, hasPermission])

  const go = (item) => {
    setOpen(false)
    setMobileOpen(false)
    setQuery('')
    navigate(item.to)
  }

  const ResultsList = ({ compact = false }) => (
    results.length === 0 ? (
      <div className="py-10 text-center">
        <Search size={24} className="mx-auto text-slate-300 mb-2" />
        <p className="text-sm text-slate-400">
          {query.trim().length < 2 ? 'Введите минимум 2 символа' : 'Ничего не найдено'}
        </p>
      </div>
    ) : (
      <div className={compact ? 'max-h-[420px] overflow-auto' : ''}>
        {results.map((r, i) => {
          const Icon = r.icon
          return (
            <button key={`${r.type}-${i}`} onClick={() => go(r)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-left transition-colors">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${r.color}`}>
                <Icon size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{r.title}</p>
                <p className="text-xs text-slate-400 truncate">{r.subtitle}</p>
              </div>
              <ArrowRight size={14} className="text-slate-300 flex-shrink-0" />
            </button>
          )
        })}
      </div>
    )
  )

  return (
    <>
      {/* Desktop inline search */}
      <div ref={boxRef} className="relative hidden md:block">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={t('header.search_placeholder')}
          className="pl-10 pr-4 py-2 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-48 lg:w-64 placeholder:text-slate-400"
        />
        {open && query.trim().length >= 1 && (
          <div className="absolute top-full mt-2 left-0 right-0 lg:w-96 bg-white rounded-2xl shadow-2xl shadow-black/15 border border-slate-100 p-2 z-50 animate-[scaleIn_150ms_ease-out]">
            <ResultsList compact />
          </div>
        )}
      </div>

      {/* Mobile: icon button → fullscreen overlay */}
      <button onClick={() => setMobileOpen(true)}
        className="md:hidden p-2.5 glass-btn rounded-xl transition-all">
        <Search size={18} className="text-slate-600" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-[150] bg-white flex flex-col md:hidden">
          <div className="flex items-center gap-2 p-3 border-b border-slate-100">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={mobileInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('header.search_placeholder')}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <button onClick={() => { setMobileOpen(false); setQuery('') }}
              className="p-2.5 rounded-xl hover:bg-slate-100">
              <X size={20} className="text-slate-500" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-2">
            <ResultsList />
          </div>
        </div>
      )}
    </>
  )
}
