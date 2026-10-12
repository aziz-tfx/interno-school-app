import { useState, useEffect, useCallback } from 'react'
import {
  MessagesSquare, RefreshCw, XCircle, ExternalLink, PauseCircle, PlayCircle,
  UserCheck, Phone, Wrench, ArrowLeft,
} from 'lucide-react'

const API = '/api/ai/amo-agent'

const fmtDate = (iso) => iso
  ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—'
const fmtCost = (v) => v == null ? '—' : `$${v < 0.01 ? v.toFixed(4) : v.toFixed(2)}`

// Conversation log of the Instagram AI agent (data: aiAgentConversations via API)
export default function AiAgentLog({ tenantId, amoSubdomain }) {
  const [days, setDays] = useState(7)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [toggling, setToggling] = useState(false)

  const q = (extra) => `${API}?mode=log&tenantId=${encodeURIComponent(tenantId)}${extra}`

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(q(`&days=${days}`))
      const json = await res.json().catch(() => ({}))
      if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [tenantId, days])

  useEffect(() => { load() }, [load])

  const openConversation = async (id) => {
    setOpenId(id)
    setDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(q(`&id=${encodeURIComponent(id)}`))
      const json = await res.json().catch(() => ({}))
      if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setDetail(json.conversation)
    } catch (err) {
      setError(err.message)
      setOpenId(null)
    }
    setDetailLoading(false)
  }

  const togglePause = async () => {
    if (!detail) return
    setToggling(true)
    try {
      const res = await fetch(`${API}?mode=log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, id: detail.id, paused: !detail.paused }),
      })
      const json = await res.json().catch(() => ({}))
      if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setDetail(d => ({ ...d, paused: json.paused, handoffReason: json.paused ? d.handoffReason : null }))
      load()
    } catch (err) {
      alert('Не удалось изменить статус: ' + err.message)
    }
    setToggling(false)
  }

  const leadUrl = (leadId) => amoSubdomain && leadId
    ? `https://${amoSubdomain}.amocrm.ru/leads/detail/${leadId}`
    : null

  const stats = data?.stats
  const statCards = stats ? [
    { label: 'Диалогов', value: stats.conversations },
    { label: 'Ответов бота', value: stats.replies },
    { label: 'Получено телефонов', value: stats.phones },
    { label: 'Передано менеджеру', value: stats.handoffs },
    { label: `Расходы OpenAI (${data.model})`, value: fmtCost(stats.cost), hint: `${(stats.promptTokens + stats.completionTokens).toLocaleString('ru-RU')} токенов` },
  ] : []

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="bg-gradient-to-r from-pink-500 to-rose-500 p-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <MessagesSquare size={24} className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Журнал ИИ-агента</h3>
            <p className="text-white/80 text-sm">Переписки бота с клиентами из Instagram</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-2 bg-white/20 text-white border border-white/30 rounded-lg text-sm focus:outline-none [&>option]:text-slate-900">
            <option value={1}>Сегодня</option>
            <option value={7}>7 дней</option>
            <option value={30}>30 дней</option>
            <option value={90}>90 дней</option>
          </select>
          <button onClick={load} disabled={loading}
            className="p-2 bg-white/20 text-white rounded-lg hover:bg-white/30 disabled:opacity-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {error && <p className="text-sm text-red-500 flex items-center gap-1.5"><XCircle size={14} /> {error}</p>}

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {statCards.map(s => (
              <div key={s.label} className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className="text-xl font-bold text-slate-900 mt-0.5">{s.value}</p>
                {s.hint && <p className="text-[11px] text-slate-400">{s.hint}</p>}
              </div>
            ))}
          </div>
        )}

        {openId ? (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-3 bg-slate-50 flex items-center justify-between gap-2 flex-wrap">
              <button onClick={() => { setOpenId(null); setDetail(null) }}
                className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1">
                <ArrowLeft size={14} /> Все диалоги
              </button>
              {detail && (
                <div className="flex items-center gap-2">
                  {leadUrl(detail.leadId) && (
                    <a href={leadUrl(detail.leadId)} target="_blank" rel="noreferrer"
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 flex items-center gap-1">
                      <ExternalLink size={12} /> Сделка в amoCRM
                    </a>
                  )}
                  <button onClick={togglePause} disabled={toggling}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 disabled:opacity-50 ${
                      detail.paused
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                        : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                    }`}>
                    {detail.paused ? <><PlayCircle size={12} /> Возобновить бота</> : <><PauseCircle size={12} /> Остановить бота</>}
                  </button>
                </div>
              )}
            </div>
            {detailLoading && <div className="p-10 flex justify-center"><RefreshCw size={24} className="animate-spin text-slate-400" /></div>}
            {detail && (
              <div className="p-4 space-y-2 max-h-[32rem] overflow-y-auto">
                <p className="text-sm font-semibold text-slate-900">
                  {detail.contactName || 'Клиент'}{detail.leadId && <span className="text-slate-400 font-normal"> · сделка #{detail.leadId}</span>}
                </p>
                {detail.handoffReason && (
                  <p className="text-xs bg-amber-50 text-amber-700 rounded-lg px-3 py-2 flex items-center gap-1.5">
                    <UserCheck size={12} /> Передано менеджеру: {detail.handoffReason}
                  </p>
                )}
                {(detail.messages || []).map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                    <div className="max-w-[80%]">
                      <div className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                        m.role === 'user' ? 'bg-slate-100 text-slate-800 rounded-bl-sm' : 'bg-fuchsia-600 text-white rounded-br-sm'
                      }`}>
                        {m.text}
                      </div>
                      <p className={`text-[10px] text-slate-400 mt-0.5 ${m.role === 'user' ? '' : 'text-right'}`}>
                        {m.role === 'user' ? 'Клиент' : 'Бот'} · {fmtDate(m.at)}
                      </p>
                      {(m.actions || []).map((a, j) => (
                        <div key={j} className="mt-1 text-[11px] text-slate-500 flex items-start gap-1 justify-end">
                          <Wrench size={11} className="mt-0.5 shrink-0" />
                          <span className="whitespace-pre-wrap">{a.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : data && data.conversations.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <MessagesSquare size={40} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">За выбранный период переписок нет</p>
          </div>
        ) : data && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="max-h-[32rem] overflow-y-auto divide-y divide-slate-100">
              {data.conversations.map(c => (
                <button key={c.id} onClick={() => openConversation(c.id)}
                  className="w-full p-3 flex items-center gap-3 hover:bg-slate-50 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900 truncate">{c.contactName || 'Клиент'}</span>
                      {c.leadId && <span className="text-xs text-slate-400">#{c.leadId}</span>}
                      {c.phoneCaptured && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <Phone size={9} /> телефон
                        </span>
                      )}
                      {c.handoffReason ? (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">у менеджера</span>
                      ) : c.paused && (
                        <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">бот на паузе</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {c.lastRole === 'assistant' ? 'Бот: ' : ''}{c.lastText}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-slate-500">{fmtDate(c.updatedAt)}</p>
                    <p className="text-[11px] text-slate-400">{c.replies} отв. · {fmtCost(c.cost)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
