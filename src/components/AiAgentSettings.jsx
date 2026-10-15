import { useState, useRef, useEffect } from 'react'
import {
  Bot, Eye, EyeOff, Copy, CheckCircle, Download, Send, RefreshCw,
  RotateCcw, ChevronDown, ChevronUp, Wrench, XCircle,
} from 'lucide-react'

const MODEL_SUGGESTIONS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1']

const inputCls = 'w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500'

// Settings + test chat for the Instagram AI agent (amoCRM Salesbot).
// `value` is cfg.aiAgent; `persist` saves the section before a test so the
// server uses exactly what's on screen.
export default function AiAgentSettings({ tenantId, value, onChange, persist, saveButton }) {
  const [showKey, setShowKey] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showSetup, setShowSetup] = useState(false)

  const [chat, setChat] = useState([]) // { role, text, actions? }
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [testError, setTestError] = useState(null)
  const chatEndRef = useRef(null)

  useEffect(() => { chatEndRef.current?.scrollIntoView({ block: 'nearest' }) }, [chat, sending])

  const endpoint = `${window.location.origin}/api/ai/amo-agent?tenantId=${encodeURIComponent(tenantId)}`

  const copyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(endpoint)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  const sendTest = async () => {
    const message = draft.trim()
    if (!message || sending) return
    setDraft('')
    setTestError(null)
    const history = chat.map(({ role, text }) => ({ role, text }))
    setChat(prev => [...prev, { role: 'user', text: message }])
    setSending(true)
    try {
      await persist()
      const res = await fetch('/api/ai/amo-agent?mode=test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, message, history }),
      })
      const data = await res.json().catch(() => ({}))
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setChat(prev => [...prev, { role: 'assistant', text: data.reply || '(без текста)', actions: data.actions || [] }])
    } catch (err) {
      setTestError(err.message)
    }
    setSending(false)
  }

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="bg-gradient-to-r from-fuchsia-500 to-pink-500 p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <Bot size={24} className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">ИИ-агент для Instagram</h3>
            <p className="text-white/80 text-sm">ChatGPT отвечает на заявки в чатах amoCRM через Salesbot</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-white text-sm cursor-pointer select-none">
          <input type="checkbox" checked={!!value.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            className="w-4 h-4 rounded" />
          Включено
        </label>
      </div>

      <div className="p-5 space-y-5">
        {/* Connection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">OpenAI API key</label>
            <div className="relative">
              <input type={showKey ? 'text' : 'password'} value={value.openaiKey}
                onChange={(e) => onChange({ openaiKey: e.target.value.trim() })}
                placeholder="sk-..."
                className={`${inputCls} pr-10 font-mono`} />
              <button onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Модель</label>
            <input type="text" list="ai-agent-models" value={value.model}
              onChange={(e) => onChange({ model: e.target.value.trim() })}
              placeholder="gpt-4o-mini"
              className={`${inputCls} font-mono`} />
            <datalist id="ai-agent-models">
              {MODEL_SUGGESTIONS.map(m => <option key={m} value={m} />)}
            </datalist>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Адрес агента для виджета amoCRM</label>
          <div className="flex gap-2">
            <input readOnly value={endpoint}
              className={`${inputCls} font-mono text-xs bg-slate-50`} />
            <button onClick={copyEndpoint}
              className="px-4 py-2.5 bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200 rounded-xl text-sm font-medium hover:bg-fuchsia-100 flex items-center gap-1.5 shrink-0">
              {copied ? <CheckCircle size={14} /> : <Copy size={14} />} {copied ? 'Скопировано' : 'Копировать'}
            </button>
            <a href="/amo-widget.zip" download
              className="px-4 py-2.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-100 flex items-center gap-1.5 shrink-0">
              <Download size={14} /> Виджет
            </a>
          </div>
          <button onClick={() => setShowSetup(!showSetup)}
            className="mt-2 text-xs text-fuchsia-600 hover:text-fuchsia-700 flex items-center gap-1">
            {showSetup ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Как подключить к amoCRM
          </button>
          {showSetup && (
            <ol className="mt-2 text-xs text-slate-600 space-y-1.5 list-decimal pl-5 bg-slate-50 rounded-xl p-4">
              <li>amoCRM → Настройки → Интеграции → ваша интеграция (та же, чьи Client ID / Secret указаны в ERP: «Интеграции» → amoCRM) → загрузите архив «Виджет».</li>
              <li>Установите виджет и вставьте в его настройки адрес агента из поля выше.</li>
              <li>Создайте Salesbot: единственный шаг — «Ответ ИИ-агента» (из раздела виджетов).</li>
              <li>В воронке, на этапах для новых заявок из Instagram, добавьте триггер «Salesbot» с запуском при входящем сообщении.</li>
              <li>Чтобы остановить бота в конкретной сделке, поставьте ей тег из поля «Тег паузы» ниже.</li>
              <li>Сначала проверьте ответы в тестовом чате внизу, затем отключите nextbot на этих этапах, чтобы клиенту не отвечали два бота.</li>
            </ol>
          )}
        </div>

        {/* Behaviour */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Инструкции для агента</label>
          <textarea rows={4} value={value.systemPrompt}
            onChange={(e) => onChange({ systemPrompt: e.target.value })}
            placeholder="Например: обращайся на «вы», в конце предлагай бесплатный пробный урок, не называй цены без уточнения города…"
            className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">База знаний</label>
          <textarea rows={8} value={value.knowledge}
            onChange={(e) => onChange({ knowledge: e.target.value })}
            placeholder={'Акции, график работы, условия рассрочки, частые вопросы и ответы…\n\nВ: Есть ли рассрочка?\nО: Да, до 6 месяцев без переплаты.'}
            className={`${inputCls} font-mono text-xs`} />
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={value.includeCourses !== false}
              onChange={(e) => onChange({ includeCourses: e.target.checked })}
              className="w-4 h-4 rounded" />
            Автоматически добавлять курсы, цены и филиалы из ERP
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Этап при передаче менеджеру (Status ID)</label>
            <input type="text" value={value.handoffStatusId}
              onChange={(e) => onChange({ handoffStatusId: e.target.value.trim() })}
              placeholder="не менять"
              className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Тег при передаче менеджеру</label>
            <input type="text" value={value.handoffTag}
              onChange={(e) => onChange({ handoffTag: e.target.value })}
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Тег паузы (бот молчит)</label>
            <input type="text" value={value.pauseTag}
              onChange={(e) => onChange({ pauseTag: e.target.value })}
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Макс. ответов в одной сделке</label>
            <input type="number" min={1} value={value.maxRepliesPerLead}
              onChange={(e) => onChange({ maxRepliesPerLead: Number(e.target.value) || 1 })}
              className={inputCls} />
          </div>
        </div>

        {/* Test chat */}
        <div className="bg-slate-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-slate-700">Тестовый чат</label>
            <button onClick={() => { setChat([]); setTestError(null) }} disabled={!chat.length}
              className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-40 flex items-center gap-1">
              <RotateCcw size={12} /> Начать заново
            </button>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Пишите как клиент. Действия в amoCRM здесь только показываются, но не выполняются.
          </p>
          <div className="bg-white border border-slate-200 rounded-xl p-3 h-72 overflow-y-auto space-y-2">
            {chat.length === 0 && !sending && (
              <p className="text-center text-sm text-slate-400 mt-24">Например: «Здравствуйте, сколько стоит курс?»</p>
            )}
            {chat.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%]">
                  <div className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                    m.role === 'user' ? 'bg-fuchsia-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                  }`}>
                    {m.text}
                  </div>
                  {m.actions?.map((a, j) => (
                    <div key={j} className="mt-1 text-[11px] text-slate-500 flex items-start gap-1">
                      <Wrench size={11} className="mt-0.5 shrink-0" />
                      <span className="whitespace-pre-wrap">{a.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-2xl bg-slate-100 text-slate-400 text-sm flex items-center gap-1.5">
                  <RefreshCw size={12} className="animate-spin" /> печатает…
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          {testError && (
            <p className="mt-2 text-sm text-red-500 flex items-center gap-1.5"><XCircle size={14} /> {testError}</p>
          )}
          <div className="mt-3 flex gap-2">
            <input type="text" value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendTest() }}
              placeholder="Сообщение от клиента…"
              className={inputCls} />
            <button onClick={sendTest} disabled={sending || !draft.trim() || !value.openaiKey}
              className="px-4 py-2.5 bg-fuchsia-600 text-white rounded-xl text-sm font-medium hover:bg-fuchsia-700 disabled:opacity-50 flex items-center gap-1.5 shrink-0">
              <Send size={14} /> Отправить
            </button>
          </div>
        </div>

        <div className="flex justify-end">{saveButton}</div>
      </div>
    </div>
  )
}
