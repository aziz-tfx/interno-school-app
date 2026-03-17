import { useState, useEffect, useMemo } from 'react'
import {
  Shield, ShieldCheck, ShieldX, Save, RotateCcw, ChevronDown, ChevronRight,
  Eye, Plus, Pencil, Trash2, DollarSign, BarChart3, Building2, GraduationCap,
  Users, BookOpen, UserCog, Settings, CheckCircle2, XCircle, AlertTriangle,
  Lock, Unlock,
} from 'lucide-react'
import { useAuth, ROLE_LABELS, ROLE_COLORS, DEFAULT_PERMISSIONS } from '../contexts/AuthContext'

// ─── Permission structure labels ──────────────────────────────────────────────
const SECTION_META = {
  dashboard:  { label: 'Дашборд',     icon: BarChart3,    type: 'boolean' },
  branches:   { label: 'Филиалы',     icon: Building2,    type: 'boolean' },
  students:   { label: 'Ученики',     icon: GraduationCap, type: 'object', actions: ['view', 'add', 'edit', 'delete'] },
  teachers:   { label: 'Учителя',     icon: Users,        type: 'object', actions: ['view', 'add', 'edit', 'delete', 'salaries'] },
  courses:    { label: 'Курсы',       icon: BookOpen,     type: 'object', actions: ['view', 'add', 'edit'] },
  finance:    { label: 'Продажи',     icon: DollarSign,   type: 'object', actions: ['view', 'fullPnL', 'expenses', 'payments'] },
  employees:  { label: 'Сотрудники',  icon: UserCog,      type: 'object', actions: ['view', 'add', 'edit', 'delete'] },
  settings:   { label: 'Настройки',   icon: Settings,     type: 'boolean' },
}

const ACTION_LABELS = {
  view: 'Просмотр',
  add: 'Добавление',
  edit: 'Редактирование',
  delete: 'Удаление',
  salaries: 'Зарплаты',
  fullPnL: 'Полный P&L',
  expenses: 'Расходы',
  payments: 'Платежи',
}

const ROLES_ORDER = [
  'owner', 'admin', 'branch_director', 'rop', 'sales',
  'accountant', 'financier', 'hr', 'smm', 'teacher', 'student',
]

// ─── Toggle Switch ──────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled, size = 'md' }) {
  const sizes = {
    sm: { track: 'w-8 h-4', thumb: 'w-3 h-3', translate: 'translate-x-4' },
    md: { track: 'w-10 h-5', thumb: 'w-4 h-4', translate: 'translate-x-5' },
  }
  const s = sizes[size]
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex items-center rounded-full transition-colors ${s.track} ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
    >
      <span className={`inline-block rounded-full bg-white shadow transform transition-transform ${s.thumb} ${
        checked ? s.translate : 'translate-x-0.5'
      }`} />
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function AccessControl() {
  const { user, getPermissions, updatePermissions, resetPermissions } = useAuth()

  const [permissions, setPermissions] = useState({})
  const [selectedRole, setSelectedRole] = useState('branch_director')
  const [expandedSections, setExpandedSections] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Load current permissions
  useEffect(() => {
    const current = getPermissions()
    setPermissions(JSON.parse(JSON.stringify(current)))
  }, [getPermissions])

  // Check for unsaved changes
  const originalPerms = useMemo(() => JSON.stringify(getPermissions()), [getPermissions])
  useEffect(() => {
    setHasChanges(JSON.stringify(permissions) !== originalPerms)
    setSaved(false)
  }, [permissions, originalPerms])

  // ── Handlers ──────────────────────────────────────────────────────────
  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const updateBooleanPerm = (role, section, value) => {
    if (role === 'owner') return // Owner permissions are immutable
    setPermissions(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      next[role][section] = value
      return next
    })
  }

  const updateObjectPerm = (role, section, action, value) => {
    if (role === 'owner') return
    setPermissions(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      // If section was boolean false, convert to object
      if (typeof next[role][section] !== 'object') {
        const meta = SECTION_META[section]
        next[role][section] = {}
        meta.actions.forEach(a => { next[role][section][a] = false })
      }
      next[role][section][action] = value
      // If all false, set section to false
      const allFalse = Object.values(next[role][section]).every(v => !v)
      if (allFalse) {
        next[role][section] = false
      }
      return next
    })
  }

  const toggleEntireSection = (role, section, value) => {
    if (role === 'owner') return
    setPermissions(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const meta = SECTION_META[section]
      if (meta.type === 'boolean') {
        next[role][section] = value
      } else {
        if (value) {
          next[role][section] = {}
          meta.actions.forEach(a => { next[role][section][a] = true })
        } else {
          next[role][section] = false
        }
      }
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updatePermissions(permissions)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      console.error('Failed to save permissions:', e)
    }
    setSaving(false)
  }

  const handleReset = async () => {
    if (!confirm('Сбросить все права доступа к значениям по умолчанию?')) return
    await resetPermissions()
    setPermissions(JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS)))
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  const getSectionEnabled = (role, section) => {
    const perm = permissions[role]?.[section]
    if (typeof perm === 'boolean') return perm
    if (typeof perm === 'object' && perm !== null) return Object.values(perm).some(v => v)
    return false
  }

  const getActionValue = (role, section, action) => {
    const perm = permissions[role]?.[section]
    if (typeof perm === 'object' && perm !== null) return !!perm[action]
    return false
  }

  const getEnabledCount = (role) => {
    const perms = permissions[role]
    if (!perms) return 0
    return Object.keys(SECTION_META).filter(s => getSectionEnabled(role, s)).length
  }

  const isOwner = selectedRole === 'owner'

  if (!permissions || Object.keys(permissions).length === 0) {
    return <div className="flex items-center justify-center h-64 text-slate-400">Загрузка...</div>
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Shield className="text-blue-600" size={28} />
            Управление доступом
          </h2>
          <p className="text-slate-500 mt-1 text-sm">
            Настройте права доступа для каждой роли сотрудников
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RotateCcw size={16} />
            Сбросить
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={`flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-all ${
              saved
                ? 'bg-emerald-600 text-white'
                : hasChanges
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {saving ? 'Сохранение...' : saved ? 'Сохранено!' : 'Сохранить'}
          </button>
        </div>
      </div>

      {/* ── Change indicator ── */}
      {hasChanges && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={18} className="text-amber-500 shrink-0" />
          <p className="text-sm text-amber-700">Есть несохранённые изменения. Нажмите «Сохранить» для применения.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ── Roles sidebar ── */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Роли</h3>
            </div>
            <div className="divide-y divide-slate-50">
              {ROLES_ORDER.map(role => {
                const enabled = getEnabledCount(role)
                const total = Object.keys(SECTION_META).length
                return (
                  <button
                    key={role}
                    onClick={() => setSelectedRole(role)}
                    className={`w-full text-left px-4 py-3 transition-all flex items-center gap-3 ${
                      selectedRole === role
                        ? 'bg-blue-50 border-l-4 border-blue-600'
                        : 'hover:bg-slate-50 border-l-4 border-transparent'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${ROLE_COLORS[role]} text-white flex items-center justify-center text-xs font-bold`}>
                      {ROLE_LABELS[role]?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${selectedRole === role ? 'text-blue-900' : 'text-slate-700'}`}>
                        {ROLE_LABELS[role]}
                      </p>
                      <p className="text-[10px] text-slate-400">{enabled} из {total} разделов</p>
                    </div>
                    {role === 'owner' && <Lock size={12} className="text-amber-500" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Permissions editor ── */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            {/* Role header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${ROLE_COLORS[selectedRole]} text-white flex items-center justify-center text-lg font-bold`}>
                  {ROLE_LABELS[selectedRole]?.charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{ROLE_LABELS[selectedRole]}</h3>
                  <p className="text-xs text-slate-400">
                    {getEnabledCount(selectedRole)} из {Object.keys(SECTION_META).length} разделов активны
                  </p>
                </div>
              </div>
              {isOwner && (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
                  <Lock size={14} />
                  <span className="text-xs font-medium">Права владельца нельзя изменить</span>
                </div>
              )}
            </div>

            {/* Sections */}
            <div className="divide-y divide-slate-100">
              {Object.entries(SECTION_META).map(([section, meta]) => {
                const SectionIcon = meta.icon
                const enabled = getSectionEnabled(selectedRole, section)
                const expanded = expandedSections[section]

                return (
                  <div key={section} className={`transition-colors ${enabled ? '' : 'bg-slate-50/50'}`}>
                    {/* Section header */}
                    <div className="px-6 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        {meta.type === 'object' ? (
                          <button
                            onClick={() => toggleSection(section)}
                            className="p-1 hover:bg-slate-100 rounded-md transition-colors"
                          >
                            {expanded
                              ? <ChevronDown size={16} className="text-slate-400" />
                              : <ChevronRight size={16} className="text-slate-400" />
                            }
                          </button>
                        ) : (
                          <div className="w-6" />
                        )}
                        <div className={`p-2 rounded-lg ${enabled ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                          <SectionIcon size={18} />
                        </div>
                        <div>
                          <p className={`text-sm font-semibold ${enabled ? 'text-slate-900' : 'text-slate-400'}`}>
                            {meta.label}
                          </p>
                          {meta.type === 'object' && (
                            <p className="text-[10px] text-slate-400">
                              {meta.actions.filter(a => getActionValue(selectedRole, section, a)).length} из {meta.actions.length} действий
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Quick toggle all */}
                        {!isOwner && meta.type === 'object' && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleEntireSection(selectedRole, section, true)}
                              className="text-[10px] text-emerald-600 hover:text-emerald-700 font-medium px-2 py-1 rounded hover:bg-emerald-50 transition-colors"
                            >
                              Все вкл
                            </button>
                            <button
                              onClick={() => toggleEntireSection(selectedRole, section, false)}
                              className="text-[10px] text-red-500 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                            >
                              Все выкл
                            </button>
                          </div>
                        )}
                        <Toggle
                          checked={enabled}
                          onChange={(val) => {
                            if (meta.type === 'boolean') {
                              updateBooleanPerm(selectedRole, section, val)
                            } else {
                              toggleEntireSection(selectedRole, section, val)
                            }
                          }}
                          disabled={isOwner}
                        />
                      </div>
                    </div>

                    {/* Expanded actions */}
                    {meta.type === 'object' && expanded && enabled && (
                      <div className="px-6 pb-4 pl-16">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {meta.actions.map(action => {
                            const actionEnabled = getActionValue(selectedRole, section, action)
                            return (
                              <div
                                key={action}
                                className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all ${
                                  actionEnabled
                                    ? 'border-blue-200 bg-blue-50'
                                    : 'border-slate-200 bg-white'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  {actionEnabled
                                    ? <ShieldCheck size={14} className="text-blue-600" />
                                    : <ShieldX size={14} className="text-slate-300" />
                                  }
                                  <span className={`text-sm ${actionEnabled ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>
                                    {ACTION_LABELS[action] || action}
                                  </span>
                                </div>
                                <Toggle
                                  checked={actionEnabled}
                                  onChange={(val) => updateObjectPerm(selectedRole, section, action, val)}
                                  disabled={isOwner}
                                  size="sm"
                                />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Permission Matrix Overview ── */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 mt-6 overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Матрица доступа — Обзор</h3>
              <p className="text-xs text-slate-400 mt-0.5">Быстрый просмотр прав всех ролей</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-3 px-4 font-semibold text-slate-500 sticky left-0 bg-white z-10">Раздел</th>
                    {ROLES_ORDER.map(role => (
                      <th
                        key={role}
                        onClick={() => setSelectedRole(role)}
                        className={`text-center py-3 px-2 font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                          selectedRole === role ? 'text-blue-600 bg-blue-50' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {ROLE_LABELS[role]?.split(' ')[0]?.slice(0, 6)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(SECTION_META).map(([section, meta]) => (
                    <tr key={section} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 px-4 font-medium text-slate-700 sticky left-0 bg-white z-10">
                        <div className="flex items-center gap-2">
                          <meta.icon size={13} className="text-slate-400" />
                          {meta.label}
                        </div>
                      </td>
                      {ROLES_ORDER.map(role => {
                        const on = getSectionEnabled(role, section)
                        return (
                          <td key={role} className="text-center py-2.5 px-2">
                            <span className={`inline-flex w-5 h-5 items-center justify-center rounded-full ${
                              on ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-300'
                            }`}>
                              {on ? '✓' : '—'}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
