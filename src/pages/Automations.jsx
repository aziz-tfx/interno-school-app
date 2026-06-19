import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { db } from '../firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import {
  Zap, Bell, AlertTriangle, Lock, Save, CheckCircle,
  ToggleLeft, ToggleRight, Settings, Play, Loader,
} from 'lucide-react'

const DEFAULT_SETTINGS = {
  paymentReminders: true,
  reminderDaysBefore: 3,
  autoDebtor: true,
  debtorGraceDays: 0,
  autoBlockLms: true,
  blockLmsOnDebt: false,
  managerDoplataAlerts: true,
}

export default function Automations() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const tenantId = user?.tenantId || 'default'

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'automationSettings', tenantId))
        if (snap.exists()) setSettings({ ...DEFAULT_SETTINGS, ...snap.data() })
      } catch (e) { console.error(e) }
      setLoading(false)
    })()
  }, [tenantId])

  const handleSave = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'automationSettings', tenantId), {
        ...settings,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.name || '',
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const secret = prompt('Введите CRON_SECRET (из Vercel env vars):')
      if (!secret) { setTesting(false); return }
      const res = await fetch(`/api/cron/automations?secret=${encodeURIComponent(secret)}&tenantId=${tenantId}`)
      const data = await res.json()
      setTestResult(data)
    } catch (e) {
      setTestResult({ error: e.message })
    }
    setTesting(false)
  }

  const Toggle = ({ value, onChange, label, description }) => (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
      <button onClick={() => onChange(!value)} className="flex-shrink-0 mt-0.5">
        {value ? (
          <ToggleRight size={32} className="text-emerald-500" />
        ) : (
          <ToggleLeft size={32} className="text-slate-300" />
        )}
      </button>
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader size={24} className="animate-spin text-slate-400" />
      </div>
    )
  }

  const rules = [
    {
      id: 'payment',
      icon: Bell,
      color: 'from-amber-500 to-orange-600',
      title: 'Напоминания о платежах',
      description: 'Telegram-уведомление в чат филиала за N дней до срока, в день платежа и при просрочке.',
      enabled: settings.paymentReminders,
      toggle: (v) => setSettings(s => ({ ...s, paymentReminders: v })),
      extra: (
        <div className="mt-3 flex items-center gap-3">
          <label className="text-xs text-slate-500">Напоминать за</label>
          <select value={settings.reminderDaysBefore}
            onChange={e => setSettings(s => ({ ...s, reminderDaysBefore: Number(e.target.value) }))}
            className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-sm w-20">
            {[1, 2, 3, 5, 7].map(d => <option key={d} value={d}>{d} дн.</option>)}
          </select>
          <span className="text-xs text-slate-400">до срока платежа</span>
        </div>
      ),
    },
    {
      id: 'debtor',
      icon: AlertTriangle,
      color: 'from-red-500 to-rose-600',
      title: 'Авто-статус «Должник»',
      description: 'Автоматически переводить учеников в статус «должник» при просроченной оплате.',
      enabled: settings.autoDebtor,
      toggle: (v) => setSettings(s => ({ ...s, autoDebtor: v })),
      extra: (
        <div className="mt-3 flex items-center gap-3">
          <label className="text-xs text-slate-500">Грейс-период</label>
          <select value={settings.debtorGraceDays}
            onChange={e => setSettings(s => ({ ...s, debtorGraceDays: Number(e.target.value) }))}
            className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-sm w-20">
            {[0, 1, 3, 5, 7, 14].map(d => <option key={d} value={d}>{d} дн.</option>)}
          </select>
          <span className="text-xs text-slate-400">после просрочки</span>
        </div>
      ),
    },
    {
      id: 'lms',
      icon: Lock,
      color: 'from-violet-500 to-purple-600',
      title: 'Авто-блокировка LMS',
      description: 'Автоматически блокировать доступ к урокам при истечении срока (6 мес. с оплаты).',
      enabled: settings.autoBlockLms,
      toggle: (v) => setSettings(s => ({ ...s, autoBlockLms: v })),
      extra: (
        <div className="mt-3">
          <Toggle
            value={settings.blockLmsOnDebt}
            onChange={(v) => setSettings(s => ({ ...s, blockLmsOnDebt: v }))}
            label="Блокировать при долге"
            description="Дополнительно блокировать LMS, если ученик в статусе «должник»"
          />
        </div>
      ),
    },
    {
      id: 'managerAlerts',
      icon: Bell,
      color: 'from-blue-500 to-indigo-600',
      title: 'Уведомления менеджерам о доплатах',
      description: 'Каждый менеджер получает в Telegram личную сводку по доплатам своих студентов: просроченные, ближайшие, суммы долгов.',
      enabled: settings.managerDoplataAlerts,
      toggle: (v) => setSettings(s => ({ ...s, managerDoplataAlerts: v })),
      extra: (
        <div className="mt-3 bg-blue-50 rounded-xl p-3 text-xs text-blue-700 space-y-1">
          <p>• Менеджеру приходит персональный список его студентов-должников</p>
          <p>• В чат филиала — сводка срочных доплат (просрочено + ближайшие 3 дня)</p>
          <p>• Для ЛС менеджеру нужно заполнить <b>telegramChatId</b> в профиле сотрудника</p>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Zap size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Автоматизации</h1>
            <p className="text-sm text-slate-500">Правила выполняются ежедневно в 14:00 (UZT)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleTest} disabled={testing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 disabled:opacity-50 transition-colors">
            {testing ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
            Запустить сейчас
          </button>
          <button onClick={handleSave} disabled={saving}
            className={`flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-xl transition-all ${
              saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
            } disabled:opacity-50`}>
            {saved ? <CheckCircle size={14} /> : <Save size={14} />}
            {saving ? 'Сохранение...' : saved ? 'Сохранено' : 'Сохранить'}
          </button>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`glass-card rounded-2xl p-4 ${testResult.error ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
          <p className="text-sm font-semibold text-slate-800 mb-2">Результат запуска:</p>
          {testResult.error ? (
            <p className="text-sm text-red-600">{testResult.error}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div><p className="text-xl font-bold text-slate-900">{testResult.tenants}</p><p className="text-xs text-slate-500">тенантов</p></div>
              <div><p className="text-xl font-bold text-amber-600">{testResult.reminders}</p><p className="text-xs text-slate-500">напоминаний</p></div>
              <div><p className="text-xl font-bold text-red-600">{testResult.debtors}</p><p className="text-xs text-slate-500">→ должники</p></div>
              <div><p className="text-xl font-bold text-violet-600">{testResult.blocked}</p><p className="text-xs text-slate-500">LMS блокировок</p></div>
            </div>
          )}
          {testResult.errors?.length > 0 && (
            <div className="mt-2 text-xs text-red-500">{testResult.errors.join('; ')}</div>
          )}
        </div>
      )}

      {/* Rules */}
      <div className="space-y-4">
        {rules.map(rule => {
          const Icon = rule.icon
          return (
            <div key={rule.id} className="glass-card rounded-2xl overflow-hidden">
              <div className="flex items-start gap-4 p-5">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${rule.color} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={18} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">{rule.title}</h3>
                    <button onClick={() => rule.toggle(!rule.enabled)} className="flex-shrink-0 ml-3">
                      {rule.enabled ? (
                        <ToggleRight size={28} className="text-emerald-500" />
                      ) : (
                        <ToggleLeft size={28} className="text-slate-300" />
                      )}
                    </button>
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">{rule.description}</p>
                  {rule.enabled && rule.extra}
                </div>
              </div>
              {rule.enabled && (
                <div className="px-5 pb-3 flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] text-emerald-600 font-medium">Активно</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Info */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <Settings size={18} className="text-slate-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-slate-700">Как это работает</p>
            <ul className="text-xs text-slate-500 mt-2 space-y-1.5 list-disc list-inside">
              <li>Правила выполняются автоматически каждый день в 14:00 по Ташкенту</li>
              <li>Напоминания отправляются в Telegram-чат филиала (настройте в Интеграциях)</li>
              <li>Авто-должник проверяет дату следующего платежа + грейс-период</li>
              <li>Блокировка LMS срабатывает при истечении 6-месячного срока доступа</li>
              <li>Кнопка «Запустить сейчас» позволяет протестировать (требуется CRON_SECRET)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
