import { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import {
  Send, Globe, CheckCircle, XCircle, AlertTriangle,
  Settings, Save, Eye, EyeOff, RefreshCw, Plug, Zap,
} from 'lucide-react'

const BRANCH_LABELS = {
  tashkent: 'Ташкент',
  samarkand: 'Самарканд',
  fergana: 'Фергана',
}

export default function Integrations() {
  const { t } = useLanguage()
  const { user } = useAuth()

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
