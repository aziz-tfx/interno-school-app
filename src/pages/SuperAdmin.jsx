import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import {
  Shield, Database, Play, CheckCircle, AlertTriangle,
  Plus, Building2, Users, X, Save, Trash2, Settings
} from 'lucide-react'
import { migrateExistingData, getTenants, createTenant, updateTenant, DEFAULT_TENANT_ID } from '../utils/tenancy'

const PLAN_COLORS = {
  free: 'bg-slate-100 text-slate-700',
  pro: 'bg-blue-100 text-blue-700',
  enterprise: 'bg-purple-100 text-purple-700',
}

export default function SuperAdmin() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [migrating, setMigrating] = useState(false)
  const [migrationResult, setMigrationResult] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', plan: 'free' })
  const [saving, setSaving] = useState(false)

  const loadTenants = async () => {
    setLoading(true)
    try {
      const list = await getTenants()
      setTenants(list)
    } catch (err) {
      console.error('Failed to load tenants:', err)
    }
    setLoading(false)
  }

  useEffect(() => { loadTenants() }, [])

  const handleMigrate = async () => {
    if (migrating) return
    setMigrating(true)
    setMigrationResult(null)
    try {
      const result = await migrateExistingData(DEFAULT_TENANT_ID)
      setMigrationResult(result)
      await loadTenants()
    } catch (err) {
      setMigrationResult({ error: err.message })
    }
    setMigrating(false)
  }

  const handleCreateTenant = async (e) => {
    e.preventDefault()
    if (!formData.name.trim()) return
    setSaving(true)
    try {
      await createTenant({
        name: formData.name.trim(),
        plan: formData.plan,
      })
      setFormData({ name: '', plan: 'free' })
      setShowForm(false)
      await loadTenants()
    } catch (err) {
      console.error('Failed to create tenant:', err)
    }
    setSaving(false)
  }

  const handleToggleStatus = async (tenant) => {
    const newStatus = tenant.status === 'active' ? 'suspended' : 'active'
    await updateTenant(tenant.id, { status: newStatus })
    await loadTenants()
  }

  if (!user?.isSuperAdmin && user?.role !== 'owner') {
    return (
      <div className="text-center py-20">
        <Shield size={48} className="mx-auto text-red-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">Доступ запрещён</h2>
        <p className="text-slate-500 text-sm">Эта страница доступна только суперадминистратору платформы.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center">
          <Shield size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Суперадмин-панель</h1>
          <p className="text-sm text-slate-500">Управление тенантами и платформой</p>
        </div>
      </div>

      {/* Migration */}
      <div className="glass-card rounded-2xl p-5">
        <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
          <Database size={18} className="text-amber-500" />
          Миграция данных
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          Добавить <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">tenantId: "default"</code> ко всем
          существующим документам. Безопасно запускать повторно — уже помеченные документы пропускаются.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleMigrate}
            disabled={migrating}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white text-sm font-medium rounded-xl hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {migrating ? (
              <><Settings size={16} className="animate-spin" /> Миграция...</>
            ) : (
              <><Play size={16} /> Запустить миграцию</>
            )}
          </button>
          {migrationResult && !migrationResult.error && (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle size={16} />
              Обновлено: {migrationResult.updated}, пропущено: {migrationResult.skipped}
              {migrationResult.errors > 0 && <span className="text-red-500">, ошибок: {migrationResult.errors}</span>}
            </div>
          )}
          {migrationResult?.error && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle size={16} />
              {migrationResult.error}
            </div>
          )}
        </div>
      </div>

      {/* Tenants */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Тенанты (школы)</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} /> Новый тенант
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{tenants.length}</p>
          <p className="text-xs text-slate-500">Всего тенантов</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{tenants.filter(t => t.status === 'active').length}</p>
          <p className="text-xs text-slate-500">Активных</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{tenants.filter(t => t.plan === 'pro').length}</p>
          <p className="text-xs text-slate-500">Pro</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">{tenants.filter(t => t.plan === 'enterprise').length}</p>
          <p className="text-xs text-slate-500">Enterprise</p>
        </div>
      </div>

      {/* Tenant list */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Загрузка...</div>
        ) : tenants.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 size={48} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-400">Нет тенантов. Запустите миграцию для создания тенанта по умолчанию.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tenants.map(tenant => (
              <div key={tenant.id} className="flex items-center gap-4 p-4 hover:bg-slate-50/50 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Building2 size={18} className="text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">{tenant.name}</p>
                    {tenant.id === DEFAULT_TENANT_ID && (
                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-bold">ВАШ</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                    <span>ID: {tenant.id}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${PLAN_COLORS[tenant.plan] || PLAN_COLORS.free}`}>
                      {tenant.plan?.toUpperCase()}
                    </span>
                    {tenant.limits && (
                      <span className="flex items-center gap-1">
                        <Users size={10} />
                        до {tenant.limits.students} студ.
                      </span>
                    )}
                    <span>{tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString('ru-RU') : ''}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${
                    tenant.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {tenant.status === 'active' ? 'Активен' : 'Приостановлен'}
                  </span>
                  {tenant.id !== DEFAULT_TENANT_ID && (
                    <button
                      onClick={() => handleToggleStatus(tenant)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        tenant.status === 'active'
                          ? 'bg-red-50 text-red-600 hover:bg-red-100'
                          : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                      }`}
                    >
                      {tenant.status === 'active' ? 'Приостановить' : 'Активировать'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create tenant modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Новый тенант</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleCreateTenant} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Название школы *</label>
                <input type="text" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  required autoFocus placeholder="Название учебного центра"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Тарифный план</label>
                <select value={formData.plan} onChange={e => setFormData(p => ({ ...p, plan: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                  <option value="free">Free (50 студентов, 10 сотрудников)</option>
                  <option value="pro">Pro (500 студентов, 50 сотрудников)</option>
                  <option value="enterprise">Enterprise (без лимитов)</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">Отмена</button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                  <Save size={14} /> Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
