import { useState, useMemo } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import {
  Shield, Search, Filter, ChevronDown, ChevronRight,
  Plus, Pencil, Trash2, User, Clock, Database, X
} from 'lucide-react'

const ACTION_COLORS = {
  create: 'bg-emerald-100 text-emerald-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
}

const ACTION_ICONS = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
}

const COLLECTION_LABELS = {
  students: 'Студенты',
  teachers: 'Преподаватели',
  courses: 'Курсы',
  groups: 'Группы',
  branches: 'Филиалы',
  payments: 'Платежи',
  rooms: 'Комнаты',
  schedule: 'Расписание',
  lmsLessons: 'LMS Уроки',
  lmsAssignments: 'LMS Задания',
  lmsSubmissions: 'LMS Работы',
  lmsModules: 'LMS Модули',
}

export default function AuditLog() {
  const { t } = useLanguage()
  const { auditLogs } = useData()
  const { employees } = useAuth()

  const [search, setSearch] = useState('')
  const [filterAction, setFilterAction] = useState('all')
  const [filterCollection, setFilterCollection] = useState('all')
  const [filterUser, setFilterUser] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [showFilters, setShowFilters] = useState(false)

  // Sort by timestamp desc
  const sortedLogs = useMemo(() => {
    return [...auditLogs].sort((a, b) => {
      const ta = a.timestamp || ''
      const tb = b.timestamp || ''
      return tb.localeCompare(ta)
    })
  }, [auditLogs])

  // Unique users from logs
  const logUsers = useMemo(() => {
    const map = new Map()
    sortedLogs.forEach(log => {
      if (log.userName && !map.has(log.userId)) {
        map.set(log.userId, log.userName)
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [sortedLogs])

  // Unique collections from logs
  const logCollections = useMemo(() => {
    const set = new Set()
    sortedLogs.forEach(log => {
      if (log.collection) set.add(log.collection)
    })
    return Array.from(set).sort()
  }, [sortedLogs])

  // Apply filters
  const filtered = useMemo(() => {
    return sortedLogs.filter(log => {
      if (filterAction !== 'all' && log.action !== filterAction) return false
      if (filterCollection !== 'all' && log.collection !== filterCollection) return false
      if (filterUser !== 'all' && String(log.userId) !== filterUser) return false
      if (dateFrom && (log.timestamp || '').slice(0, 10) < dateFrom) return false
      if (dateTo && (log.timestamp || '').slice(0, 10) > dateTo) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          (log.description || '').toLowerCase().includes(q) ||
          (log.userName || '').toLowerCase().includes(q) ||
          (log.collection || '').toLowerCase().includes(q) ||
          (log.documentId || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [sortedLogs, filterAction, filterCollection, filterUser, dateFrom, dateTo, search])

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  const renderDiff = (before, after) => {
    if (!before && !after) return null
    const allKeys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
    const changes = []
    allKeys.forEach(key => {
      if (key === 'id' || key === '_docId') return
      const bVal = before?.[key]
      const aVal = after?.[key]
      if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
        changes.push({ key, before: bVal, after: aVal })
      }
    })
    if (changes.length === 0) return <p className="text-xs text-slate-400 italic">Нет изменений в данных</p>
    return (
      <div className="space-y-1.5">
        {changes.slice(0, 20).map(({ key, before: bv, after: av }) => (
          <div key={key} className="flex items-start gap-2 text-xs">
            <span className="font-mono font-medium text-slate-600 min-w-[100px]">{key}:</span>
            {bv !== undefined && (
              <span className="text-red-500 line-through max-w-[200px] truncate">
                {typeof bv === 'object' ? JSON.stringify(bv) : String(bv ?? '')}
              </span>
            )}
            {av !== undefined && (
              <span className="text-emerald-600 max-w-[200px] truncate">
                {typeof av === 'object' ? JSON.stringify(av) : String(av ?? '')}
              </span>
            )}
          </div>
        ))}
        {changes.length > 20 && (
          <p className="text-xs text-slate-400">+{changes.length - 20} ещё...</p>
        )}
      </div>
    )
  }

  const activeFiltersCount = [
    filterAction !== 'all',
    filterCollection !== 'all',
    filterUser !== 'all',
    !!dateFrom,
    !!dateTo,
  ].filter(Boolean).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('audit.title')}</h1>
            <p className="text-sm text-slate-500">{t('audit.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Search and filters bar */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('audit.search_placeholder')}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              showFilters || activeFiltersCount > 0
                ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Filter size={16} />
            {t('audit.filters')}
            {activeFiltersCount > 0 && (
              <span className="w-5 h-5 bg-amber-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('audit.filter_action')}</label>
              <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                <option value="all">{t('audit.all')}</option>
                <option value="create">{t('audit.action_create')}</option>
                <option value="update">{t('audit.action_update')}</option>
                <option value="delete">{t('audit.action_delete')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('audit.filter_collection')}</label>
              <select value={filterCollection} onChange={e => setFilterCollection(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                <option value="all">{t('audit.all')}</option>
                {logCollections.map(c => (
                  <option key={c} value={c}>{COLLECTION_LABELS[c] || c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('audit.filter_user')}</label>
              <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                <option value="all">{t('audit.all')}</option>
                {logUsers.map(u => (
                  <option key={u.id} value={String(u.id)}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('audit.date_from')}</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('audit.date_to')}</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{filtered.length}</p>
          <p className="text-xs text-slate-500">{t('audit.total_events')}</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{filtered.filter(l => l.action === 'create').length}</p>
          <p className="text-xs text-slate-500">{t('audit.action_create')}</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{filtered.filter(l => l.action === 'update').length}</p>
          <p className="text-xs text-slate-500">{t('audit.action_update')}</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{filtered.filter(l => l.action === 'delete').length}</p>
          <p className="text-xs text-slate-500">{t('audit.action_delete')}</p>
        </div>
      </div>

      {/* Logs list */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Shield size={48} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-400">{t('audit.no_logs')}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.slice(0, 200).map(log => {
              const ActionIcon = ACTION_ICONS[log.action] || Database
              const isExpanded = expandedId === log.id
              return (
                <div key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className="w-full flex items-center gap-3 p-4 text-left"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${ACTION_COLORS[log.action] || 'bg-slate-100 text-slate-500'}`}>
                      <ActionIcon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {log.description || `${log.action} ${log.collection} #${log.documentId}`}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <User size={10} />
                          {log.userName || 'Система'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {formatTime(log.timestamp)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Database size={10} />
                          {COLLECTION_LABELS[log.collection] || log.collection}
                        </span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${ACTION_COLORS[log.action] || ''}`}>
                      {log.action}
                    </span>
                    <ChevronRight size={14} className={`text-slate-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 ml-11">
                      <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <span className="text-slate-400">ID документа:</span>
                            <span className="ml-2 font-mono text-slate-600">{log.documentId}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Роль:</span>
                            <span className="ml-2 text-slate-600">{log.userRole}</span>
                          </div>
                        </div>
                        {(log.before || log.after) && (
                          <div>
                            <p className="text-xs font-medium text-slate-500 mb-2">{t('audit.changes')}:</p>
                            {renderDiff(log.before, log.after)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {filtered.length > 200 && (
              <div className="p-4 text-center text-sm text-slate-400">
                {t('audit.showing_first')} 200 {t('audit.of')} {filtered.length}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
