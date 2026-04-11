import { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import {
  Send, Globe, CheckCircle, XCircle, AlertTriangle,
  Settings, Save, Eye, EyeOff, RefreshCw, Plug, Zap,
  Bell, Inbox, Clock, User as UserIcon,
} from 'lucide-react'
import { pushSaleToTelegram } from '../utils/telegram'

const BRANCH_LABELS = {
  tashkent: 'Ташкент',
  samarkand: 'Самарканд',
  fergana: 'Фергана',
}

export default function Integrations() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const { payments, updatePayment, branches, groups, courses } = useData()

  // ─── Missed Telegram notifications state ───
  const [missedDaysBack, setMissedDaysBack] = useState(7)
  const [resending, setResending] = useState(false)
  const [resendingId, setResendingId] = useState(null)
  const [resendLog, setResendLog] = useState([]) // [{id, ok, error, timestamp}]

  // Compute list of income payments without telegramSent flag for selected period
  const missedSales = (() => {
    const now = new Date()
    const threshold = new Date(now.getTime() - missedDaysBack * 24 * 60 * 60 * 1000)
    const thresholdKey = threshold.toISOString().split('T')[0]
    return payments
      .filter(p => {
        if (p.type !== 'income') return false
        if (p.telegramSent) return false
        const d = p.date || ''
        return d >= thresholdKey
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  })()

  const buildTelegramPayloadFromPayment = (p) => {
    const group = groups.find(g => String(g.id) === String(p.groupId))
    const course = courses.find(c => c.name === p.course)
    return {
      clientName: p.student || p.clientName || '—',
      phone: p.phone || '',
      course: p.course || '',
      group: group?.name || p.group || '',
      amount: Number(p.amount) || 0,
      method: p.method || '',
      date: p.date || '',
      courseStartDate: p.courseStartDate || '',
      branch: p.branch || 'tashkent',
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
      const payload = buildTelegramPayloadFromPayment(p)
      const result = await pushSaleToTelegram(payload)
      if (result.success) {
        await updatePayment(p.id, {
          telegramSent: true,
          telegramSentAt: new Date().toISOString(),
          telegramMessageId: result.messageId || null,
          telegramResent: true,
        })
        setResendLog(prev => [...prev, { id: p.id, ok: true, client: p.student, timestamp: Date.now() }])
      } else {
        setResendLog(prev => [...prev, { id: p.id, ok: false, client: p.student, error: result.error || 'Unknown error', timestamp: Date.now() }])
      }
    } catch (err) {
      setResendLog(prev => [...prev, { id: p.id, ok: false, client: p.student, error: err.message, timestamp: Date.now() }])
    }
    setResendingId(null)
  }

  const resendAll = async () => {
    if (!missedSales.length) return
    if (!confirm(`Отправить ${missedSales.length} уведомлений в Telegram? Это нельзя отменить.`)) return
    setResending(true)
    setResendLog([])
    for (const p of missedSales) {
      await resendOne(p)
      // Small delay between sends to avoid Telegram rate-limit (30 msg/sec)
      await new Promise(r => setTimeout(r, 400))
    }
    setResending(false)
  }

  const formatAmount = (v) => {
    if (!v) return '0'
    return Number(v).toLocaleString('ru-RU').replace(/,/g, ' ')
  }

  // ─── Telegram State ───
  const [tgConfig, setTgConfig] = useState({
    botToken: '',
    chatTashkent: '',
    chatSamarkand: '',
    chatFergana: '',
    enabled: true,
  })
  const [tgStatus, setTgStatus] = useState(null) // null | 'checking' | 'ok' | 'error'
  const [tgBotInfo, setTgBotInfo] = useState(null)
  const [tgSaved, setTgSaved] = useState(false)
  const [tgShowToken, setTgShowToken] = useState(false)
  const [tgTestBranch, setTgTestBranch] = useState('tashkent')
  const [tgTestResult, setTgTestResult] = useState(null)
  const [tgTesting, setTgTesting] = useState(false)

  // ─── amoCRM State ───
  const [amoConfig, setAmoConfig] = useState({
    subdomain: '',
    accessToken: '',
    enabled: false,
  })
  const [amoStatus, setAmoStatus] = useState(null)
  const [amoShowToken, setAmoShowToken] = useState(false)
  const [amoSaved, setAmoSaved] = useState(false)

  // ─── Load saved configs from localStorage ───
  useEffect(() => {
    try {
      const savedTg = localStorage.getItem('interno_tg_config')
      if (savedTg) setTgConfig(JSON.parse(savedTg))
      const savedAmo = localStorage.getItem('interno_amo_config')
      if (savedAmo) setAmoConfig(JSON.parse(savedAmo))
    } catch (e) {
      console.error('Failed to load integration config:', e)
    }
  }, [])

  // ─── Save Telegram Config ───
  const saveTgConfig = () => {
    localStorage.setItem('interno_tg_config', JSON.stringify(tgConfig))
    setTgSaved(true)
    setTimeout(() => setTgSaved(false), 2000)
  }

  // ─── Save amoCRM Config ───
  const saveAmoConfig = () => {
    localStorage.setItem('interno_amo_config', JSON.stringify(amoConfig))
    setAmoSaved(true)
    setTimeout(() => setAmoSaved(false), 2000)
  }

  // ─── Check Telegram Bot ───
  const checkTgBot = async () => {
    if (!tgConfig.botToken) return
    setTgStatus('checking')
    try {
      const res = await fetch(`https://api.telegram.org/bot${tgConfig.botToken}/getMe`)
      const data = await res.json()
      if (data.ok) {
        setTgBotInfo(data.result)
        setTgStatus('ok')
      } else {
        setTgStatus('error')
        setTgBotInfo(null)
      }
    } catch {
      setTgStatus('error')
      setTgBotInfo(null)
    }
  }

  // ─── Test Telegram Message ───
  const testTgMessage = async () => {
    const chatId = tgTestBranch === 'tashkent' ? tgConfig.chatTashkent
      : tgTestBranch === 'samarkand' ? tgConfig.chatSamarkand
      : tgConfig.chatFergana

    if (!tgConfig.botToken || !chatId) {
      setTgTestResult({ success: false, error: 'Токен бота или Chat ID не заполнен' })
      return
    }

    setTgTesting(true)
    setTgTestResult(null)
    try {
      const res = await fetch(`https://api.telegram.org/bot${tgConfig.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅ Тестовое сообщение от INTERNO App\n\n📍 Филиал: ${BRANCH_LABELS[tgTestBranch]}\n⏰ ${new Date().toLocaleString('ru-RU')}\n\nИнтеграция работает корректно!`,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setTgTestResult({ success: true })
      } else {
        setTgTestResult({ success: false, error: data.description })
      }
    } catch (err) {
      setTgTestResult({ success: false, error: err.message })
    }
    setTgTesting(false)
  }

  // ─── Check amoCRM ───
  const checkAmoCRM = async () => {
    setAmoStatus('checking')
    try {
      const res = await fetch('/api/amo/status')
      const data = await res.json()
      setAmoStatus(data.connected ? 'ok' : 'error')
    } catch {
      setAmoStatus('error')
    }
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-slate-900">Интеграции</h2>
        <p className="text-slate-500 mt-1">Подключение внешних сервисов для автоматизации работы</p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TELEGRAM BOT */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Send size={24} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Telegram Bot</h3>
              <p className="text-white/80 text-sm">Уведомления о продажах в группы филиалов</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {tgStatus === 'ok' && (
              <span className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full text-sm text-white">
                <CheckCircle size={14} /> Подключён
              </span>
            )}
            {tgStatus === 'error' && (
              <span className="flex items-center gap-1.5 bg-red-500/30 backdrop-blur-sm px-3 py-1.5 rounded-full text-sm text-white">
                <XCircle size={14} /> Ошибка
              </span>
            )}
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Bot Token */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Токен бота (от @BotFather)</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={tgShowToken ? 'text' : 'password'}
                  value={tgConfig.botToken}
                  onChange={(e) => setTgConfig({ ...tgConfig, botToken: e.target.value })}
                  placeholder="123456789:AABBccDDeeFFggHHiiJJkkLLmmNNooP"
                  className="w-full px-4 py-2.5 pr-10 bg-white border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button onClick={() => setTgShowToken(!tgShowToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {tgShowToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button onClick={checkTgBot}
                className="px-4 py-2.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl text-sm font-medium hover:bg-blue-100 transition-colors flex items-center gap-1.5">
                <RefreshCw size={14} className={tgStatus === 'checking' ? 'animate-spin' : ''} />
                Проверить
              </button>
            </div>
            {tgBotInfo && (
              <div className="mt-2 flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle size={14} />
                <span>Бот: <strong>@{tgBotInfo.username}</strong> ({tgBotInfo.first_name})</span>
              </div>
            )}
            {tgStatus === 'error' && (
              <p className="mt-2 text-sm text-red-500 flex items-center gap-1.5">
                <XCircle size={14} /> Неверный токен бота
              </p>
            )}
          </div>

          {/* Chat IDs */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">Chat ID групп по филиалам</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.entries(BRANCH_LABELS).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs text-slate-500 mb-1">{label}</label>
                  <input
                    type="text"
                    value={key === 'tashkent' ? tgConfig.chatTashkent : key === 'samarkand' ? tgConfig.chatSamarkand : tgConfig.chatFergana}
                    onChange={(e) => {
                      const field = key === 'tashkent' ? 'chatTashkent' : key === 'samarkand' ? 'chatSamarkand' : 'chatFergana'
                      setTgConfig({ ...tgConfig, [field]: e.target.value })
                    }}
                    placeholder="-100123456789"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Чтобы узнать Chat ID: добавьте бота в группу → напишите /start → откройте
              <code className="ml-1 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">api.telegram.org/bot{'<token>'}/getUpdates</code>
            </p>
          </div>

          {/* Test */}
          <div className="bg-slate-50 rounded-xl p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Тест отправки</label>
            <div className="flex gap-2">
              <select value={tgTestBranch} onChange={(e) => setTgTestBranch(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="tashkent">Ташкент</option>
                <option value="samarkand">Самарканд</option>
                <option value="fergana">Фергана</option>
              </select>
              <button onClick={testTgMessage} disabled={tgTesting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1.5">
                <Zap size={14} />
                {tgTesting ? 'Отправка...' : 'Отправить тест'}
              </button>
            </div>
            {tgTestResult && (
              <div className={`mt-2 text-sm flex items-center gap-1.5 ${tgTestResult.success ? 'text-emerald-600' : 'text-red-500'}`}>
                {tgTestResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
                {tgTestResult.success ? 'Сообщение отправлено! Проверьте группу.' : tgTestResult.error}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex gap-2">
              <AlertTriangle size={16} className="text-blue-500 mt-0.5 shrink-0" />
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-1">Настройка через Vercel Environment Variables</p>
                <p className="text-blue-600">
                  Для работы в продакшне добавьте переменные в <strong>Vercel → Settings → Environment Variables</strong>:
                </p>
                <ul className="mt-2 space-y-1 text-xs font-mono text-blue-600">
                  <li>TG_BOT_TOKEN = <span className="text-blue-400">токен бота</span></li>
                  <li>TG_CHAT_TASHKENT = <span className="text-blue-400">Chat ID Ташкент</span></li>
                  <li>TG_CHAT_SAMARKAND = <span className="text-blue-400">Chat ID Самарканд</span></li>
                  <li>TG_CHAT_FERGANA = <span className="text-blue-400">Chat ID Фергана</span></li>
                </ul>
              </div>
            </div>
          </div>

          {/* Save */}
          <div className="flex justify-end">
            <button onClick={saveTgConfig}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                tgSaved
                  ? 'bg-emerald-500 text-white'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25'
              }`}>
              {tgSaved ? <><CheckCircle size={16} /> Сохранено!</> : <><Save size={16} /> Сохранить</>}
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* RESEND MISSED TELEGRAM NOTIFICATIONS */}
      {/* ═══════════════════════════════════════════════════════════════ */}
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
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full text-sm text-white">
              <Inbox size={14} /> {missedSales.length}
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Period selector */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-slate-700">Период поиска:</label>
            <select
              value={missedDaysBack}
              onChange={(e) => setMissedDaysBack(Number(e.target.value))}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value={1}>Сегодня</option>
              <option value={3}>3 дня</option>
              <option value={7}>7 дней</option>
              <option value={14}>14 дней</option>
              <option value={30}>30 дней</option>
            </select>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={resendAll}
                disabled={resending || !missedSales.length}
                className="px-5 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-amber-500/25"
              >
                <Send size={15} className={resending ? 'animate-pulse' : ''} />
                {resending ? 'Отправка...' : `Отправить все (${missedSales.length})`}
              </button>
            </div>
          </div>

          {/* Info banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex gap-2">
              <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-0.5">Что делает этот раздел</p>
                <p className="text-amber-700 text-xs leading-relaxed">
                  Показывает продажи, у которых нет отметки <code className="bg-amber-100 px-1 py-0.5 rounded text-[10px] font-mono">telegramSent</code>.
                  При нажатии на кнопку — повторно отправляет уведомление в Telegram-группу филиала и ставит отметку,
                  чтобы избежать дублей. Работает только с продажами типа «income».
                </p>
              </div>
            </div>
          </div>

          {/* List of missed sales */}
          {missedSales.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <CheckCircle size={40} className="mx-auto mb-2 opacity-40 text-emerald-500" />
              <p className="text-sm font-medium">Все продажи за период отправлены ✓</p>
              <p className="text-xs mt-1">Нет необработанных уведомлений</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                {missedSales.map(p => {
                  const logEntry = resendLog.find(l => l.id === p.id)
                  const branchName = branches.find(b => b.id === p.branch)?.name || p.branch || '—'
                  return (
                    <div key={p.id} className="p-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
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
                          <span>·</span>
                          <span>{branchName}</span>
                          <span>·</span>
                          <span className="font-semibold text-emerald-600">+{formatAmount(p.amount)} сум</span>
                          {p.createdByName && (
                            <>
                              <span>·</span>
                              <span className="text-slate-400">{p.createdByName}</span>
                            </>
                          )}
                        </div>
                        {logEntry && (
                          <p className={`text-[11px] mt-1 flex items-center gap-1 ${logEntry.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                            {logEntry.ok ? <CheckCircle size={11} /> : <XCircle size={11} />}
                            {logEntry.ok ? 'Отправлено' : `Ошибка: ${logEntry.error}`}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => resendOne(p)}
                        disabled={resending || resendingId === p.id || logEntry?.ok}
                        className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-medium hover:bg-amber-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 shrink-0"
                      >
                        {resendingId === p.id ? (
                          <><RefreshCw size={12} className="animate-spin" /> Отправка</>
                        ) : logEntry?.ok ? (
                          <><CheckCircle size={12} /> Готово</>
                        ) : (
                          <><Send size={12} /> Отправить</>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Summary log */}
          {resendLog.length > 0 && !resending && (
            <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600">
              <span className="font-semibold">Результат:</span>{' '}
              <span className="text-emerald-600">{resendLog.filter(l => l.ok).length} успешно</span>
              {resendLog.filter(l => !l.ok).length > 0 && (
                <>
                  {' · '}
                  <span className="text-red-500">{resendLog.filter(l => !l.ok).length} с ошибкой</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* amoCRM */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Globe size={24} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">amoCRM</h3>
              <p className="text-white/80 text-sm">Автоматическое создание контактов и сделок</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full text-sm text-white">
              <AlertTriangle size={14} /> Отложено
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Субдомен amoCRM</label>
              <div className="flex items-center">
                <input
                  type="text"
                  value={amoConfig.subdomain}
                  onChange={(e) => setAmoConfig({ ...amoConfig, subdomain: e.target.value })}
                  placeholder="interno"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-l-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="px-3 py-2.5 bg-slate-100 border border-l-0 border-slate-200 rounded-r-xl text-sm text-slate-500">.amocrm.ru</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Access Token</label>
              <div className="relative">
                <input
                  type={amoShowToken ? 'text' : 'password'}
                  value={amoConfig.accessToken}
                  onChange={(e) => setAmoConfig({ ...amoConfig, accessToken: e.target.value })}
                  placeholder="eyJ0eX..."
                  className="w-full px-4 py-2.5 pr-10 bg-white border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button onClick={() => setAmoShowToken(!amoShowToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {amoShowToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-sm text-amber-700 flex items-center gap-2">
              <AlertTriangle size={14} />
              Интеграция с amoCRM отложена. Настройте позже через Vercel Environment Variables.
            </p>
          </div>

          <div className="flex justify-between items-center">
            <button onClick={checkAmoCRM}
              className="px-4 py-2 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-xl text-sm font-medium hover:bg-indigo-100 transition-colors flex items-center gap-1.5">
              <RefreshCw size={14} className={amoStatus === 'checking' ? 'animate-spin' : ''} />
              Проверить подключение
            </button>
            <button onClick={saveAmoConfig}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                amoSaved
                  ? 'bg-emerald-500 text-white'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}>
              {amoSaved ? <><CheckCircle size={16} /> Сохранено!</> : <><Save size={16} /> Сохранить</>}
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Future Integrations */}
      {/* ═══════════════════════════════════════════════════════════════ */}
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
