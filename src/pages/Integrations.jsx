import { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import {
  Send, Globe, CheckCircle, XCircle, AlertTriangle,
  Settings, Save, Eye, EyeOff, RefreshCw, Plug, Zap,
  Bell, Inbox, Clock, User as UserIcon, Phone,
} from 'lucide-react'
import { pushSaleToTelegram } from '../utils/telegram'
import { checkAmoStatus, checkOnpbxStatus, refreshAmoToken } from '../utils/amocrm'
import { loadIntegrations, saveIntegrationSection } from '../utils/tenantIntegrations'
import { DEFAULT_TENANT_ID } from '../utils/tenancy'

const BRANCH_LABELS = {
  tashkent: 'Ташкент',
  samarkand: 'Самарканд',
  fergana: 'Фергана',
}

export default function Integrations() {
  const { t } = useLanguage()
  const { user, employees } = useAuth()
  const { payments, updatePayment, branches, groups, courses } = useData()

  const tenantId = user?.tenantId || DEFAULT_TENANT_ID

  // ─── Missed Telegram notifications state ───
  const [missedDaysBack, setMissedDaysBack] = useState(7)
  const [resending, setResending] = useState(false)
  const [resendingId, setResendingId] = useState(null)
  const [resendLog, setResendLog] = useState([])

  const missedSales = (() => {
    const now = new Date()
    const threshold = new Date(now.getTime() - missedDaysBack * 24 * 60 * 60 * 1000)
    const thresholdKey = threshold.toISOString().split('T')[0]
    return payments
      .filter(p => p.type === 'income' && !p.telegramSent && (p.date || '') >= thresholdKey)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  })()

  const buildTelegramPayloadFromPayment = (p) => {
    const group = groups.find(g => String(g.id) === String(p.groupId))
    // Route to the manager's branch group, not the sale's branch
    const manager = employees.find(e =>
      (p.managerId && e.managerId === p.managerId) ||
      (p.createdBy && e.id === p.createdBy) ||
      (p.createdByName && e.name === p.createdByName)
    )
    const routeBranch = (manager?.branch && manager.branch !== 'all')
      ? manager.branch
      : (p.branch || 'tashkent')
    return {
      clientName: p.student || p.clientName || '—',
      phone: p.phone || '',
      course: p.course || '',
      group: group?.name || p.group || '',
      amount: Number(p.amount) || 0,
      method: p.method || '',
      date: p.date || '',
      courseStartDate: p.courseStartDate || '',
      branch: routeBranch,
      tariff: p.tariff || '',
      discount: p.discount || '',
      contractNumber: p.contractNumber || '',
      debt: p.debt || 0,
      totalCoursePrice: p.totalCoursePrice || 0,
      trancheNumber: p.trancheNumber || 1,
      managerName: p.createdByName || '',
      comment: p.comment || '',
      learningFormat: p.learningFormat || '',
      contractUrl: p.contractUrl || null,
    }
  }

  const resendOne = async (p) => {
    setResendingId(p.id)
    try {
      const result = await pushSaleToTelegram(buildTelegramPayloadFromPayment(p))
      if (result.success) {
        await updatePayment(p.id, {
          telegramSent: true,
          telegramSentAt: new Date().toISOString(),
          telegramMessageId: result.messageId || null,
          telegramResent: true,
        })
        setResendLog(prev => [...prev, { id: p.id, ok: true, client: p.student, timestamp: Date.now() }])
      } else {
        setResendLog(prev => [...prev, { id: p.id, ok: false, client: p.student, error: result.error, timestamp: Date.now() }])
      }
    } catch (err) {
      setResendLog(prev => [...prev, { id: p.id, ok: false, client: p.student, error: err.message, timestamp: Date.now() }])
    }
    setResendingId(null)
  }

  const resendAll = async () => {
    if (!missedSales.length) return
    if (!confirm(`Отправить ${missedSales.length} уведомлений в Telegram?`)) return
    setResending(true)
    setResendLog([])
    for (const p of missedSales) {
      await resendOne(p)
      await new Promise(r => setTimeout(r, 400))
    }
    setResending(false)
  }

  const formatAmount = (v) => !v ? '0' : Number(v).toLocaleString('ru-RU').replace(/,/g, ' ')

  // ─── Integration configs (loaded from Firestore per tenant) ───
  const [cfg, setCfg] = useState(null) // { telegram, amocrm, onpbx }
  const [loading, setLoading] = useState(true)
  const [savingSection, setSavingSection] = useState(null)
  const [savedFlash, setSavedFlash] = useState(null)

  const [tgStatus, setTgStatus] = useState(null)
  const [tgBotInfo, setTgBotInfo] = useState(null)
  const [tgShowToken, setTgShowToken] = useState(false)
  const [tgTestBranch, setTgTestBranch] = useState('tashkent')
  const [tgTestResult, setTgTestResult] = useState(null)
  const [tgTesting, setTgTesting] = useState(false)

  const [amoStatus, setAmoStatus] = useState(null)
  const [amoShowToken, setAmoShowToken] = useState(false)
  const [amoRefreshing, setAmoRefreshing] = useState(false)

  const [pbxStatus, setPbxStatus] = useState(null)
  const [pbxShowKey, setPbxShowKey] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadIntegrations(tenantId)
      .then(data => { if (!cancelled) setCfg(data) })
      .catch(err => console.error('Failed to load integrations:', err))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tenantId])

  const updateSection = (section, patch) => {
    setCfg(prev => ({ ...prev, [section]: { ...prev[section], ...patch } }))
  }
  const updateTelegramChat = (branch, val) => {
    setCfg(prev => ({
      ...prev,
      telegram: { ...prev.telegram, chats: { ...prev.telegram.chats, [branch]: val } },
    }))
  }

  const save = async (section) => {
    setSavingSection(section)
    try {
      await saveIntegrationSection(tenantId, section, cfg[section])
      setSavedFlash(section)
      setTimeout(() => setSavedFlash(null), 2000)
    } catch (err) {
      alert('Ошибка сохранения: ' + err.message)
    }
    setSavingSection(null)
  }

  // ─── Checks / tests ───
  const checkTgBot = async () => {
    const token = cfg?.telegram?.botToken
    if (!token) return
    setTgStatus('checking')
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
      const data = await res.json()
      if (data.ok) { setTgBotInfo(data.result); setTgStatus('ok') }
      else { setTgBotInfo(null); setTgStatus('error') }
    } catch { setTgBotInfo(null); setTgStatus('error') }
  }

  const testTgMessage = async () => {
    const { botToken, chats } = cfg?.telegram || {}
    const chatId = chats?.[tgTestBranch]
    if (!botToken || !chatId) {
      setTgTestResult({ success: false, error: 'Заполните токен бота и Chat ID' })
      return
    }
    setTgTesting(true); setTgTestResult(null)
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅ Тестовое сообщение от INTERNO App\n\n📍 Филиал: ${BRANCH_LABELS[tgTestBranch]}\n⏰ ${new Date().toLocaleString('ru-RU')}\n\nИнтеграция работает корректно!`,
        }),
      })
      const data = await res.json()
      setTgTestResult(data.ok ? { success: true } : { success: false, error: data.description })
    } catch (err) {
      setTgTestResult({ success: false, error: err.message })
    }
    setTgTesting(false)
  }

  const checkAmo = async () => {
    setAmoStatus('checking')
    // Save first so server sees freshest creds
    try { await saveIntegrationSection(tenantId, 'amocrm', cfg.amocrm) } catch {}
    try {
      const data = await checkAmoStatus()
      setAmoStatus(data.connected ? 'ok' : 'error')
    } catch { setAmoStatus('error') }
  }

  const doAmoRefresh = async () => {
    setAmoRefreshing(true)
    try { await saveIntegrationSection(tenantId, 'amocrm', cfg.amocrm) } catch {}
    const result = await refreshAmoToken()
    setAmoRefreshing(false)
    if (result.success) {
      // Reload to pick up persisted tokens
      const fresh = await loadIntegrations(tenantId)
      setCfg(fresh)
      alert('Токены обновлены' + (result.persisted ? ' и сохранены.' : ', но не сохранены автоматически.'))
    } else {
      alert('Не удалось обновить токен: ' + (result.error || result.details || 'Unknown'))
    }
  }

  const checkPbx = async () => {
    setPbxStatus('checking')
    try { await saveIntegrationSection(tenantId, 'onpbx', cfg.onpbx) } catch {}
    try {
      const data = await checkOnpbxStatus()
      setPbxStatus(data.connected ? 'ok' : 'error')
    } catch { setPbxStatus('error') }
  }

  // ─── Permission check ───
  if (user?.role !== 'owner' && user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Settings size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 text-lg font-medium">Доступ ограничен</p>
          <p className="text-slate-400 text-sm mt-1">Настройки интеграций доступны только администраторам</p>
        </div>
      </div>
    )
  }

  if (loading || !cfg) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={32} className="animate-spin text-slate-400" />
      </div>
    )
  }

  const saveBtnColors = {
    blue: 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/25',
    indigo: 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/25',
    emerald: 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/25',
  }
  const saveBtn = (section, color = 'blue') => (
    <button onClick={() => save(section)} disabled={savingSection === section}
      className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 text-white ${
        savedFlash === section ? 'bg-emerald-500' : (saveBtnColors[color] || saveBtnColors.blue)
      }`}>
      {savingSection === section ? <><RefreshCw size={16} className="animate-spin" /> Сохранение...</>
        : savedFlash === section ? <><CheckCircle size={16} /> Сохранено!</>
        : <><Save size={16} /> Сохранить</>}
    </button>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-slate-900">Интеграции</h2>
        <p className="text-slate-500 mt-1">
          Настройки отдельные для каждой школы. Tenant: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">{tenantId}</code>
        </p>
      </div>

      {/* ═══════ TELEGRAM ═══════ */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Send size={24} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Telegram Bot</h3>
              <p className="text-white/80 text-sm">Уведомления о продажах в группы филиалов вашей школы</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-white text-sm cursor-pointer select-none">
            <input type="checkbox" checked={!!cfg.telegram.enabled}
              onChange={(e) => updateSection('telegram', { enabled: e.target.checked })}
              className="w-4 h-4 rounded" />
            Включено
          </label>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Токен бота (от @BotFather)</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input type={tgShowToken ? 'text' : 'password'}
                  value={cfg.telegram.botToken}
                  onChange={(e) => updateSection('telegram', { botToken: e.target.value })}
                  placeholder="123456789:AABBccDDeeFFggHHiiJJkkLLmmNNooP"
                  className="w-full px-4 py-2.5 pr-10 bg-white border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={() => setTgShowToken(!tgShowToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {tgShowToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button onClick={checkTgBot}
                className="px-4 py-2.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl text-sm font-medium hover:bg-blue-100 flex items-center gap-1.5">
                <RefreshCw size={14} className={tgStatus === 'checking' ? 'animate-spin' : ''} /> Проверить
              </button>
            </div>
            {tgBotInfo && (
              <div className="mt-2 flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle size={14} /> Бот: <strong>@{tgBotInfo.username}</strong> ({tgBotInfo.first_name})
              </div>
            )}
            {tgStatus === 'error' && <p className="mt-2 text-sm text-red-500 flex items-center gap-1.5"><XCircle size={14} /> Неверный токен бота</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">Chat ID групп по филиалам</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.entries(BRANCH_LABELS).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs text-slate-500 mb-1">{label}</label>
                  <input type="text" value={cfg.telegram.chats[key] || ''}
                    onChange={(e) => updateTelegramChat(key, e.target.value)}
                    placeholder="-100123456789"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Чтобы узнать Chat ID: добавьте бота в группу → напишите /start → откройте
              <code className="ml-1 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">api.telegram.org/bot{'<token>'}/getUpdates</code>
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Тест отправки</label>
            <div className="flex gap-2">
              <select value={tgTestBranch} onChange={(e) => setTgTestBranch(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {Object.entries(BRANCH_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button onClick={testTgMessage} disabled={tgTesting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                <Zap size={14} /> {tgTesting ? 'Отправка...' : 'Отправить тест'}
              </button>
            </div>
            {tgTestResult && (
              <div className={`mt-2 text-sm flex items-center gap-1.5 ${tgTestResult.success ? 'text-emerald-600' : 'text-red-500'}`}>
                {tgTestResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
                {tgTestResult.success ? 'Сообщение отправлено!' : tgTestResult.error}
              </div>
            )}
          </div>

          <div className="flex justify-end">{saveBtn('telegram', 'blue')}</div>
        </div>
      </div>

      {/* ═══════ RESEND MISSED (unchanged) ═══════ */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Bell size={24} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Повторная отправка уведомлений</h3>
              <p className="text-white/80 text-sm">Продажи без отметки об отправке в Telegram</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full text-sm text-white">
            <Inbox size={14} /> {missedSales.length}
          </span>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-slate-700">Период:</label>
            <select value={missedDaysBack} onChange={(e) => setMissedDaysBack(Number(e.target.value))}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value={1}>Сегодня</option>
              <option value={3}>3 дня</option>
              <option value={7}>7 дней</option>
              <option value={14}>14 дней</option>
              <option value={30}>30 дней</option>
            </select>
            <button onClick={resendAll} disabled={resending || !missedSales.length}
              className="ml-auto px-5 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 disabled:opacity-40 flex items-center gap-2">
              <Send size={15} className={resending ? 'animate-pulse' : ''} />
              {resending ? 'Отправка...' : `Отправить все (${missedSales.length})`}
            </button>
          </div>

          {missedSales.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <CheckCircle size={40} className="mx-auto mb-2 opacity-40 text-emerald-500" />
              <p className="text-sm font-medium">Все продажи за период отправлены ✓</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                {missedSales.map(p => {
                  const logEntry = resendLog.find(l => l.id === p.id)
                  const branchName = branches.find(b => b.id === p.branch)?.name || p.branch || '—'
                  return (
                    <div key={p.id} className="p-3 flex items-center gap-3 hover:bg-slate-50">
                      <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                        <UserIcon size={16} className="text-slate-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {p.student || p.clientName || '—'}
                          {(p.trancheNumber || 1) > 1 && (
                            <span className="ml-2 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                              Транш №{p.trancheNumber}
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                          <span className="flex items-center gap-1"><Clock size={10} />{p.date}</span>
                          <span>·</span><span>{branchName}</span>
                          <span>·</span><span className="font-semibold text-emerald-600">+{formatAmount(p.amount)} сум</span>
                          {p.createdByName && <><span>·</span><span className="text-slate-400">{p.createdByName}</span></>}
                        </div>
                        {logEntry && (
                          <p className={`text-[11px] mt-1 flex items-center gap-1 ${logEntry.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                            {logEntry.ok ? <CheckCircle size={11} /> : <XCircle size={11} />}
                            {logEntry.ok ? 'Отправлено' : `Ошибка: ${logEntry.error}`}
                          </p>
                        )}
                      </div>
                      <button onClick={() => resendOne(p)} disabled={resending || resendingId === p.id || logEntry?.ok}
                        className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-medium hover:bg-amber-100 disabled:opacity-40 flex items-center gap-1 shrink-0">
                        {resendingId === p.id ? <><RefreshCw size={12} className="animate-spin" /> Отправка</>
                          : logEntry?.ok ? <><CheckCircle size={12} /> Готово</>
                          : <><Send size={12} /> Отправить</>}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════ amoCRM ═══════ */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Globe size={24} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">amoCRM</h3>
              <p className="text-white/80 text-sm">OAuth-интеграция для сделок и аналитики</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-white text-sm cursor-pointer select-none">
            <input type="checkbox" checked={!!cfg.amocrm.enabled}
              onChange={(e) => updateSection('amocrm', { enabled: e.target.checked })}
              className="w-4 h-4 rounded" />
            Включено
          </label>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Субдомен</label>
              <div className="flex items-center">
                <input type="text" value={cfg.amocrm.subdomain}
                  onChange={(e) => updateSection('amocrm', { subdomain: e.target.value })}
                  placeholder="myschool"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-l-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <span className="px-3 py-2.5 bg-slate-100 border border-l-0 border-slate-200 rounded-r-xl text-sm text-slate-500">.amocrm.ru</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Access Token</label>
              <div className="relative">
                <input type={amoShowToken ? 'text' : 'password'}
                  value={cfg.amocrm.accessToken}
                  onChange={(e) => updateSection('amocrm', { accessToken: e.target.value })}
                  placeholder="eyJ0eX..."
                  className="w-full px-4 py-2.5 pr-10 bg-white border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <button onClick={() => setAmoShowToken(!amoShowToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {amoShowToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Refresh Token</label>
              <input type="password" value={cfg.amocrm.refreshToken}
                onChange={(e) => updateSection('amocrm', { refreshToken: e.target.value })}
                placeholder="def5..."
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Client ID</label>
              <input type="text" value={cfg.amocrm.clientId}
                onChange={(e) => updateSection('amocrm', { clientId: e.target.value })}
                placeholder="uuid"
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Client Secret</label>
              <input type="password" value={cfg.amocrm.clientSecret}
                onChange={(e) => updateSection('amocrm', { clientSecret: e.target.value })}
                placeholder=""
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Redirect URI</label>
              <input type="text" value={cfg.amocrm.redirectUri}
                onChange={(e) => updateSection('amocrm', { redirectUri: e.target.value })}
                placeholder="https://yourapp.vercel.app"
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Pipeline ID</label>
              <input type="text" value={cfg.amocrm.pipelineId}
                onChange={(e) => updateSection('amocrm', { pipelineId: e.target.value })}
                placeholder="1234567"
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Status ID (этап воронки)</label>
              <input type="text" value={cfg.amocrm.statusId}
                onChange={(e) => updateSection('amocrm', { statusId: e.target.value })}
                placeholder="123456789"
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          {amoStatus === 'ok' && <div className="text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle size={14} /> Подключено</div>}
          {amoStatus === 'error' && <div className="text-sm text-red-500 flex items-center gap-1.5"><XCircle size={14} /> Ошибка подключения. Проверьте токен.</div>}

          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="flex gap-2">
              <button onClick={checkAmo}
                className="px-4 py-2 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-xl text-sm font-medium hover:bg-indigo-100 flex items-center gap-1.5">
                <RefreshCw size={14} className={amoStatus === 'checking' ? 'animate-spin' : ''} /> Проверить
              </button>
              <button onClick={doAmoRefresh} disabled={amoRefreshing}
                className="px-4 py-2 bg-purple-50 text-purple-600 border border-purple-200 rounded-xl text-sm font-medium hover:bg-purple-100 disabled:opacity-50 flex items-center gap-1.5">
                <RefreshCw size={14} className={amoRefreshing ? 'animate-spin' : ''} /> Обновить токен
              </button>
            </div>
            {saveBtn('amocrm', 'indigo')}
          </div>
        </div>
      </div>

      {/* ═══════ OnlinePBX ═══════ */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Phone size={24} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">OnlinePBX</h3>
              <p className="text-white/80 text-sm">Статистика звонков вашей АТС</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-white text-sm cursor-pointer select-none">
            <input type="checkbox" checked={!!cfg.onpbx.enabled}
              onChange={(e) => updateSection('onpbx', { enabled: e.target.checked })}
              className="w-4 h-4 rounded" />
            Включено
          </label>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Клиентский домен</label>
              <input type="text" value={cfg.onpbx.domain}
                onChange={(e) => updateSection('onpbx', { domain: e.target.value })}
                placeholder="pbx14950.onpbx.ru"
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <p className="text-xs text-slate-400 mt-1">Ваш домен, НЕ api.onlinepbx.ru</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">API Key</label>
              <div className="relative">
                <input type={pbxShowKey ? 'text' : 'password'}
                  value={cfg.onpbx.apiKey}
                  onChange={(e) => updateSection('onpbx', { apiKey: e.target.value })}
                  placeholder=""
                  className="w-full px-4 py-2.5 pr-10 bg-white border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <button onClick={() => setPbxShowKey(!pbxShowKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {pbxShowKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          {pbxStatus === 'ok' && <div className="text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle size={14} /> Подключено</div>}
          {pbxStatus === 'error' && <div className="text-sm text-red-500 flex items-center gap-1.5"><XCircle size={14} /> Ошибка подключения</div>}

          <div className="flex justify-between items-center">
            <button onClick={checkPbx}
              className="px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl text-sm font-medium hover:bg-emerald-100 flex items-center gap-1.5">
              <RefreshCw size={14} className={pbxStatus === 'checking' ? 'animate-spin' : ''} /> Проверить
            </button>
            {saveBtn('onpbx', 'emerald')}
          </div>
        </div>
      </div>

      {/* Future */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { name: 'Hik-Connect', desc: 'Камеры видеонаблюдения', color: 'from-slate-400 to-slate-500', status: 'Скоро' },
          { name: 'SMS рассылка', desc: 'Уведомления по SMS', color: 'from-green-400 to-emerald-500', status: 'Скоро' },
        ].map(item => (
          <div key={item.name} className="glass rounded-2xl overflow-hidden opacity-60">
            <div className={`bg-gradient-to-r ${item.color} p-4 flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <Plug size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white">{item.name}</h3>
                  <p className="text-white/80 text-xs">{item.desc}</p>
                </div>
              </div>
              <span className="bg-white/20 px-3 py-1 rounded-full text-xs text-white font-medium">{item.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
