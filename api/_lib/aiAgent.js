// AI sales agent for Instagram chats that live in amoCRM (native Instagram
// integration). No amo widget is needed (a private integration would require
// a passport statement and waiving amo support), so the loop is:
//
//   amo webhook «Входящее сообщение добавлено»
//     ─▶ POST /api/ai/amo-agent?mode=webhook&tenantId=…&key=…
//     ↳ we reply 200 immediately (amo disables slow webhooks)
//     ↳ background: debounce bursts → OpenAI (+ tools) → amo actions
//     ↳ write the reply into the lead field «Ответ ИИ» (replyFieldId)
//     ↳ POST /api/v2/salesbot/run → a plain Salesbot whose only step sends
//       {{lead.cf.<replyFieldId>}} to the client
//
// Channels: Instagram Direct, Instagram comments and Telegram (including the
// bare «/start» a client sends by pressing Start in the bot). The channel is
// taken from the webhook's `origin` and changes the prompt (e.g. comment replies
// are public, so they stay short and invite the client to Direct).
//
// Follow-ups: when the client goes silent after a bot reply, the bot nudges
// them after cfg.followUpHours (e.g. "2, 20" → 2 h and 20 h after that reply).
// Due conversations carry followUpDueAt; runFollowUps() sends them. Vercel Hobby
// crons run only daily, so the sweep also runs (throttled) on every webhook and
// via ?mode=followups, which an external cron can hit every 15 minutes.
//
// Managers get a Telegram message on handoff, and on errors (throttled), since
// a failing bot is otherwise silent.
//
// Conversation history is stored in Firestore: aiAgentConversations/{tenantId}__lead_{leadId}

import crypto from 'node:crypto'
import { waitUntil } from '@vercel/functions'
import { getDb, getTenantId, resolveAmo, resolveAiAgent, resolveTelegram, saveTenantIntegration } from './tenantConfig.js'
import { createAmoClient } from './amoClient.js'

const HISTORY_LIMIT = 40          // messages kept in Firestore
const HISTORY_TO_MODEL = 20       // messages sent to the model
const MAX_TOOL_ROUNDS = 3
const OPENAI_TIMEOUT_MS = 40000
const DEBOUNCE_MS = 6000          // wait for the client to finish a burst of messages
const PROCESSED_IDS_LIMIT = 50    // amo may redeliver a webhook — dedupe by message id
const FOLLOWUP_BATCH = 10         // follow-ups per sweep, sent in parallel (function limit is 60 s)
const SWEEP_INTERVAL_MS = 5 * 60_000
const IG_WINDOW_MS = 23 * 3600_000 // Instagram allows business messages only 24 h after the client's last one
const WORK_HOURS = [9, 21]        // follow-ups only in the daytime, Tashkent time (UTC+5)
const ALERT_COOLDOWN_MS = 30 * 60_000
const CLOSED_STATUSES = ['142', '143'] // amo «Успешно реализовано» / «Закрыто и не реализовано»

const TARIFF_LABELS = {
  standard: 'Стандарт', vip: 'VIP', premium: 'Премиум', individual: 'Индивидуальный', budget: 'Бюджет',
}
const REGION_LABELS = { tashkent: 'Ташкент', fergana: 'Фергана', samarkand: 'Самарканд', online: 'Онлайн' }

// ─── Knowledge from ERP ─────────────────────────────────────────────────
const fmtPrice = (v) => {
  const n = Number(String(v || '').replace(/\s/g, ''))
  return n ? n.toLocaleString('ru-RU').replace(/,/g, ' ') + ' сум' : ''
}

function describeCourse(c) {
  const lines = [`• ${c.name}${c.duration ? ` (${c.duration})` : ''}`]
  if (c.description) lines.push(`  ${String(c.description).slice(0, 400)}`)
  for (const [region, tariffs] of Object.entries(c.pricing || {})) {
    const prices = Object.entries(tariffs || {})
      .map(([key, t]) => {
        const price = fmtPrice(t?.full)
        if (!price) return null
        const label = t.label || TARIFF_LABELS[key] || key
        return `${label}: ${price}${t.monthly ? ' в месяц' : ''}${t.durationMonths ? `, ${t.durationMonths} мес.` : ''}`
      })
      .filter(Boolean)
    if (prices.length) lines.push(`  ${REGION_LABELS[region] || region} — ${prices.join('; ')}`)
  }
  return lines.join('\n')
}

async function loadErpContext(tenantId) {
  const db = getDb()
  if (!db || !tenantId) return { schoolName: '', courses: '', branches: '' }
  try {
    const [tenantSnap, coursesSnap, branchesSnap] = await Promise.all([
      db.collection('tenants').doc(tenantId).get(),
      db.collection('courses').where('tenantId', '==', tenantId).get(),
      db.collection('branches').where('tenantId', '==', tenantId).get(),
    ])
    return {
      schoolName: tenantSnap.exists ? (tenantSnap.data().name || '') : '',
      courses: coursesSnap.docs.map(d => describeCourse(d.data())).join('\n'),
      branches: branchesSnap.docs
        .map(d => d.data())
        .map(b => `• ${b.name}${b.address ? ` — ${b.address}` : ''}${b.phone ? `, тел. ${b.phone}` : ''}`)
        .join('\n'),
    }
  } catch (e) {
    console.warn('loadErpContext failed:', e.message)
    return { schoolName: '', courses: '', branches: '' }
  }
}

// ─── Channels ───────────────────────────────────────────────────────────
export const CHANNEL_LABELS = {
  instagram: 'Instagram Direct', comment: 'Комментарий Instagram', telegram: 'Telegram', other: 'Другой канал',
}

// amo puts the chat source into `origin` (e.g. "instagram_business", "telegram").
// No origin at all was treated as Instagram before channels existed — keep that.
export function detectChannel(origin) {
  const o = String(origin || '').toLowerCase()
  if (!o) return 'instagram'
  if (/telegram|^tg\b/.test(o)) return 'telegram'
  if (/insta/.test(o)) return /comment/.test(o) ? 'comment' : 'instagram'
  return 'other'
}

function channelIntro(channel, school) {
  if (channel === 'comment') return [
    `Ты — консультант ${school} и отвечаешь на комментарии под постами в Instagram.`,
    'Твой ответ публичный — его видят все. Пиши 1–2 коротких предложения: ответь по сути и пригласи написать в Direct, чтобы подобрать курс и записаться. Не проси телефон в комментариях.',
  ]
  if (channel === 'telegram') return [
    `Ты — консультант ${school} и отвечаешь клиентам в Telegram.`,
    'Если клиент только нажал «Старт» и ещё ничего не написал — коротко поздоровайся, представься и спроси, какое направление его интересует.',
  ]
  if (channel === 'other') return [`Ты — консультант ${school} и отвечаешь клиентам в мессенджере.`]
  return [`Ты — консультант ${school} и отвечаешь клиентам в Instagram Direct.`]
}

// What the model sees for a client message that has no real text
const START_RE = /^\/start(\s|$)/i
function clientText(text) {
  if (!text) return '[Клиент отправил вложение без текста: фото, голосовое или стикер]'
  if (START_RE.test(text)) return '[Клиент нажал «Старт» и ещё ничего не написал]'
  return text
}

async function buildSystemPrompt(cfg, channel) {
  const erp = cfg.includeCourses ? await loadErpContext(cfg.tenantId || 'default') : { schoolName: '' }
  const school = erp.schoolName || 'нашей школы'
  return [
    ...channelIntro(channel, school),
    '',
    'Правила:',
    '- Пиши коротко (1–4 предложения), живо и по-человечески, без markdown, списков со звёздочками и ссылок-заглушек.',
    '- Отвечай на языке клиента: русский или узбекский (латиница или кириллица — как пишет клиент).',
    '- Используй ТОЛЬКО факты из базы знаний и данных ниже. Если ответа нет — не выдумывай: скажи, что уточнишь у менеджера, и вызови handoff_to_manager.',
    '- Твоя цель — понять, какой курс интересен, в каком городе/формате удобно учиться, и получить имя и номер телефона для записи на консультацию или пробный урок.',
    '- Как только клиент сообщил имя или телефон — вызови save_contact. Когда понятно, что именно его интересует — вызови save_lead_info с кратким резюме.',
    '- Вызывай handoff_to_manager, если клиент просит живого человека, жалуется, готов оплатить, спрашивает про индивидуальные условия/скидки сверх указанных или ты не уверен в ответе.',
    '- Не обещай скидки, сроки и условия, которых нет в базе знаний.',
    '- Вложения (фото, голосовые) ты не видишь и не слышишь — вежливо попроси написать вопрос текстом.',
    cfg.systemPrompt ? `\nДополнительные инструкции школы:\n${cfg.systemPrompt}` : '',
    cfg.knowledge ? `\n## База знаний\n${cfg.knowledge}` : '',
    erp.courses ? `\n## Курсы и цены (из ERP)\n${erp.courses}` : '',
    erp.branches ? `\n## Филиалы\n${erp.branches}` : '',
  ].filter(s => s !== '').join('\n')
}

// ─── Tools exposed to the model ─────────────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'save_contact',
      description: 'Сохранить имя и/или телефон клиента в карточку контакта amoCRM.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Имя клиента' },
          phone: { type: 'string', description: 'Телефон в любом формате, например +998901234567' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_lead_info',
      description: 'Записать в сделку, что интересует клиента (примечание для менеджера).',
      parameters: {
        type: 'object',
        properties: {
          course: { type: 'string' },
          city_or_format: { type: 'string', description: 'Город/филиал или онлайн' },
          summary: { type: 'string', description: 'Краткое резюме диалога для менеджера' },
        },
        required: ['summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'handoff_to_manager',
      description: 'Передать диалог живому менеджеру. После этого бот перестаёт отвечать в этой сделке.',
      parameters: {
        type: 'object',
        properties: { reason: { type: 'string', description: 'Почему нужен менеджер' } },
        required: ['reason'],
      },
    },
  },
]

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 9) return '+998' + digits
  return '+' + digits
}

// Executes a tool call. In dry-run (test) mode nothing is written to amo.
async function executeTool(name, args, ctx) {
  const { amo, leadId, contactId, cfg, dryRun, state } = ctx
  const log = (text) => state.actions.push({ tool: name, args, text })

  if (name === 'save_contact') {
    const phone = normalizePhone(args.phone)
    log(`Контакт: ${[args.name, phone].filter(Boolean).join(', ') || '—'}`)
    if (dryRun || !contactId) return { ok: true }
    const patch = {}
    if (args.name) patch.name = args.name
    if (phone) {
      const contact = await amo.get(`/api/v4/contacts/${contactId}`)
      const phoneField = (contact.custom_fields_values || []).find(f => f.field_code === 'PHONE')
      const existing = (phoneField?.values || []).map(v => ({ value: v.value, enum_code: v.enum_code || 'WORK' }))
      const has = existing.some(v => v.value.replace(/\D/g, '').endsWith(phone.replace(/\D/g, '').slice(-9)))
      if (!has) {
        patch.custom_fields_values = [{
          field_code: 'PHONE',
          values: [...existing, { value: phone, enum_code: 'WORK' }],
        }]
      }
    }
    if (Object.keys(patch).length) await amo.patch(`/api/v4/contacts/${contactId}`, patch)
    return { ok: true }
  }

  if (name === 'save_lead_info') {
    const text = [
      '🤖 ИИ-агент:',
      args.course && `Курс: ${args.course}`,
      args.city_or_format && `Город/формат: ${args.city_or_format}`,
      args.summary,
    ].filter(Boolean).join('\n')
    log(text)
    if (dryRun || !leadId) return { ok: true }
    await amo.post(`/api/v4/leads/${leadId}/notes`, [{ note_type: 'common', params: { text } }])
    return { ok: true }
  }

  if (name === 'handoff_to_manager') {
    state.handoff = args.reason || 'Нужен менеджер'
    log(`Передано менеджеру: ${state.handoff}`)
    if (dryRun || !leadId) return { ok: true }
    const patch = { tags_to_add: [{ name: cfg.handoffTag }] }
    if (cfg.handoffStatusId) patch.status_id = Number(cfg.handoffStatusId)
    await amo.patch(`/api/v4/leads/${leadId}`, patch)
    await amo.post(`/api/v4/leads/${leadId}/notes`, [{
      note_type: 'common',
      params: { text: `🤖 ИИ-агент передал диалог менеджеру.\nПричина: ${state.handoff}` },
    }])
    return { ok: true }
  }

  return { ok: false, error: 'unknown tool' }
}

// ─── OpenAI ─────────────────────────────────────────────────────────────
async function callOpenAI(cfg, messages) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), OPENAI_TIMEOUT_MS)
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${cfg.openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, messages, tools: TOOLS, temperature: 0.4, max_tokens: 600 }),
    })
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`)
    return await r.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * One agent turn: history + new client message → reply text (+ amo actions).
 * Returns { reply, actions, handoff, usage }.
 */
export async function runAgentTurn({ cfg, history, message, followUp, channel = 'instagram', ctx }) {
  const system = await buildSystemPrompt(cfg, channel)
  const messages = [
    { role: 'system', content: system },
    ...history.slice(-HISTORY_TO_MODEL).map(m => ({ role: m.role, content: m.role === 'user' ? clientText(m.text) : m.text })),
    followUp
      ? { role: 'system', content: followUpInstruction(followUp) }
      : { role: 'user', content: message },
  ]
  const state = { actions: [], handoff: null }
  const usage = { prompt: 0, completion: 0 }
  let reply = ''

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const data = await callOpenAI(cfg, messages)
    usage.prompt += data.usage?.prompt_tokens || 0
    usage.completion += data.usage?.completion_tokens || 0
    const msg = data.choices?.[0]?.message
    if (!msg) break
    if (!msg.tool_calls?.length || round === MAX_TOOL_ROUNDS) {
      reply = (msg.content || '').trim()
      break
    }
    messages.push(msg)
    for (const call of msg.tool_calls) {
      let result
      try {
        const args = JSON.parse(call.function.arguments || '{}')
        result = await executeTool(call.function.name, args, { ...ctx, cfg, state })
      } catch (e) {
        console.warn('AI agent tool failed:', call.function.name, e.message)
        result = { ok: false, error: e.message }
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }

  return { reply, actions: state.actions, handoff: state.handoff, usage }
}

function followUpInstruction({ hours, number, total }) {
  return [
    `Клиент не отвечает на твоё последнее сообщение уже примерно ${hours} ч. Это напоминание №${number} из ${total}.`,
    'Напиши одно короткое ненавязчивое сообщение (1–2 предложения), которое мягко возвращает к разговору:',
    'напомни, о чём шла речь, и задай простой вопрос, на который легко ответить. Не повторяй прошлые сообщения дословно и не дави.',
    number === total ? 'Это последнее напоминание — можно добавить, что ты на связи, если вопрос станет актуальным.' : '',
  ].filter(Boolean).join('\n')
}

// ─── Conversation storage ───────────────────────────────────────────────
function convRef(tenantId, key) {
  const db = getDb()
  return db ? db.collection('aiAgentConversations').doc(`${tenantId || 'default'}__${key}`) : null
}

async function loadConversation(ref) {
  if (!ref) return null
  const snap = await ref.get()
  return snap.exists ? snap.data() : null
}

// ─── Webhook from amo ───────────────────────────────────────────────────
// amo posts application/x-www-form-urlencoded; depending on the parser keys
// arrive flat ("message[add][0][text]") or nested. Support both.
function formField(body, path) {
  const flat = path[0] + path.slice(1).map(k => `[${k}]`).join('')
  if (body && body[flat] !== undefined) return body[flat]
  return path.reduce((o, k) => (o == null ? undefined : o[k]), body)
}

export function parseIncomingMessages(body) {
  const out = []
  for (let i = 0; i < 20; i++) {
    const f = (...k) => formField(body, ['message', 'add', String(i), ...k])
    if (f('id') === undefined && f('text') === undefined) break
    const entityType = String(f('entity_type') ?? f('element_type') ?? '')
    out.push({
      id: String(f('id') ?? ''),
      text: String(f('text') ?? '').trim(),
      type: String(f('type') ?? 'incoming'),
      origin: String(f('origin') ?? ''),
      leadId: (entityType === 'lead' || entityType === '2') ? String(f('entity_id') ?? f('element_id') ?? '') : '',
      contactId: String(f('contact_id') ?? ''),
      authorName: String(f('author', 'name') ?? ''),
      attachmentType: String(f('attachment', 'type') ?? ''),
    })
  }
  return out
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function sendReply(amo, cfg, leadId, reply) {
  await amo.patch(`/api/v4/leads/${leadId}`, {
    custom_fields_values: [{ field_id: Number(cfg.replyFieldId), values: [{ value: reply }] }],
  })
  await amo.post('/api/v2/salesbot/run', [{ bot_id: Number(cfg.salesbotId), entity_id: Number(leadId), entity_type: 2 }])
}

const leadTags = (lead) => (lead?._embedded?.tags || []).map(t => t.name)

export async function processIncomingMessage({ cfg, amoCfg, msg, debounceMs = DEBOUNCE_MS }) {
  const db = getDb()
  const ref = convRef(cfg.tenantId, `lead_${msg.leadId}`)
  if (!db || !ref) return
  const now = new Date().toISOString()
  const amo = createAmoClient(amoCfg)
  const channel = detectChannel(msg.origin)

  // Test mode: only leads tagged with testTag are handled; others aren't even logged
  if (cfg.testMode) {
    try {
      const lead = await amo.get(`/api/v4/leads/${msg.leadId}`)
      if (!leadTags(lead).includes(cfg.testTag)) return
    } catch (e) {
      console.warn('AI agent test-mode lead check failed:', e.message)
      await alertError(cfg, amoCfg, msg.leadId, e)
      return
    }
  }

  // 1. Record the message (transaction: several webhooks may land at once)
  const fresh = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const conv = snap.exists ? snap.data() : { messages: [], replies: 0, createdAt: now }
    const processed = conv.processedIds || []
    if (msg.id && processed.includes(msg.id)) return false
    tx.set(ref, {
      ...conv,
      tenantId: cfg.tenantId || 'default',
      leadId: msg.leadId,
      contactId: msg.contactId || conv.contactId || null,
      contactName: msg.authorName || conv.contactName || null,
      origin: msg.origin || conv.origin || null,
      channel,
      messages: [...(conv.messages || []), { role: 'user', text: msg.text, at: now, id: msg.id }].slice(-HISTORY_LIMIT),
      processedIds: [...processed, msg.id].filter(Boolean).slice(-PROCESSED_IDS_LIMIT),
      followUpsSent: 0,
      followUpDueAt: null,
      updatedAt: now,
    })
    return true
  })
  if (!fresh) return

  // 2. Debounce: only the newest message of a burst triggers a reply
  if (debounceMs) await sleep(debounceMs)
  const conv = await loadConversation(ref)
  const messages = conv?.messages || []
  if (messages.at(-1)?.id !== msg.id) return

  try {
    // 3. Stop conditions: handed off / paused, reply cap, pause tag or handoff stage in amo
    let paused = conv.paused || (conv.replies || 0) - (conv.resumedAtReplies || 0) >= cfg.maxRepliesPerLead
    if (!paused) {
      const lead = await amo.get(`/api/v4/leads/${msg.leadId}`)
      const tags = leadTags(lead)
      if (tags.includes(cfg.pauseTag) || tags.includes(cfg.handoffTag)) paused = true
      if (cfg.handoffStatusId && String(lead?.status_id) === String(cfg.handoffStatusId)) paused = true
    }
    if (paused) return

    // 4. Unanswered tail of user messages = this turn's input
    let split = messages.length
    while (split > 0 && messages[split - 1].role === 'user') split--
    const history = messages.slice(0, split)
    const message = messages.slice(split).map(m => clientText(m.text)).join('\n')
    if (!message) return

    const result = await runAgentTurn({
      cfg, history, message, channel,
      ctx: { amo, leadId: msg.leadId, contactId: msg.contactId, dryRun: false },
    })
    if (result.reply) await sendReply(amo, cfg, msg.leadId, result.reply)

    // 5. Persist the answer (merge: new user messages may have arrived meanwhile)
    const replyAt = new Date().toISOString()
    const awaitingClient = !!result.reply && !result.handoff
    const saved = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const cur = snap.data() || {}
      const next = {
        ...cur,
        messages: result.reply
          ? [...(cur.messages || []), { role: 'assistant', text: result.reply, at: replyAt, actions: result.actions }].slice(-HISTORY_LIMIT)
          : (cur.messages || []),
        followUpBaseAt: awaitingClient ? replyAt : null,
        followUpDueAt: awaitingClient && followUpsAllowed(cfg, channel) ? followUpDueAt(cfg, replyAt, 0) : null,
        replies: (cur.replies || 0) + (result.reply ? 1 : 0),
        paused: !!(cur.paused || result.handoff),
        handoffReason: result.handoff || cur.handoffReason || null,
        promptTokens: (cur.promptTokens || 0) + result.usage.prompt,
        completionTokens: (cur.completionTokens || 0) + result.usage.completion,
        lastError: null,
        updatedAt: new Date().toISOString(),
      }
      tx.set(ref, next)
      return next
    })
    if (result.handoff) await notifyHandoff(cfg, amoCfg, saved, result.handoff)
  } catch (e) {
    console.error('AI agent error:', e)
    try { await ref.set({ lastError: String(e.message).slice(0, 500), updatedAt: new Date().toISOString() }, { merge: true }) } catch {}
    await alertError(cfg, amoCfg, msg.leadId, e)
  }
}

// ─── Telegram notifications for managers ────────────────────────────────
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const tenantReq = (tenantId) => ({ query: { tenantId: tenantId || 'default' } })
const leadLink = (amoCfg, leadId) => amoCfg?.subdomain && leadId
  ? `<a href="https://${amoCfg.subdomain}.amocrm.ru/leads/detail/${leadId}">Открыть сделку #${leadId}</a>`
  : (leadId ? `Сделка #${leadId}` : '')

// Managers' chat: cfg.notifyChatId, else the main (Tashkent) chat from the Telegram integration.
async function sendManagerMessage(cfg, text) {
  const tg = await resolveTelegram(tenantReq(cfg.tenantId))
  const chatId = cfg.notifyChatId || tg.chats.tashkent
  if (!tg.botToken || !chatId) throw new Error('Не настроен Telegram-бот или чат для уведомлений')
  const r = await fetch(`https://api.telegram.org/bot${tg.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  })
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${(await r.text()).slice(0, 200)}`)
}

async function notifyHandoff(cfg, amoCfg, conv, reason) {
  if (!cfg.notifyHandoff) return
  const actions = (conv.messages || []).flatMap(m => m.actions || [])
  const phone = actions.filter(a => a.tool === 'save_contact' && a.args?.phone).map(a => normalizePhone(a.args.phone)).at(-1)
  const name = actions.filter(a => a.tool === 'save_contact' && a.args?.name).map(a => a.args.name).at(-1) || conv.contactName
  const info = actions.filter(a => a.tool === 'save_lead_info').at(-1)?.args || {}
  const lastClient = (conv.messages || []).filter(m => m.role === 'user').at(-1)
  const text = [
    '🙋 <b>Клиент ждёт менеджера</b>',
    `Клиент: ${esc([name, phone].filter(Boolean).join(' · ') || 'без имени')}`,
    `Канал: ${esc(CHANNEL_LABELS[conv.channel] || CHANNEL_LABELS.instagram)}`,
    `Причина: ${esc(reason)}`,
    (info.course || info.city_or_format) && `Интерес: ${esc([info.course, info.city_or_format].filter(Boolean).join(', '))}`,
    lastClient?.text && `Последнее сообщение: «${esc(String(lastClient.text).slice(0, 200))}»`,
    leadLink(amoCfg, conv.leadId),
  ].filter(Boolean).join('\n')
  try { await sendManagerMessage(cfg, text) } catch (e) { console.warn('AI agent handoff notify failed:', e.message) }
}

function explainError(message) {
  const m = String(message || '')
  if (/OpenAI 401/.test(m)) return 'Неверный OpenAI API key.'
  if (/OpenAI 429/.test(m) && /quota|billing/i.test(m)) return 'Закончились деньги на балансе OpenAI.'
  if (/OpenAI 429/.test(m)) return 'OpenAI временно ограничил число запросов.'
  if (/OpenAI 5\d\d|abort/i.test(m)) return 'OpenAI не ответил — вероятно, временный сбой.'
  if (/amoCRM .*→ 401/.test(m)) return 'Токен amoCRM истёк и не обновился — переподключите amoCRM в «Интеграциях».'
  if (/amoCRM .*→ 40[034]/.test(m)) return 'amoCRM отклонил запрос — проверьте ID поля «Ответ ИИ» и ID Salesbot.'
  return 'Неизвестная ошибка.'
}

// At most one alert per tenant per ALERT_COOLDOWN_MS, so an outage doesn't flood the chat.
async function alertError(cfg, amoCfg, leadId, err) {
  if (!cfg.notifyErrors) return
  const db = getDb()
  if (!db) return
  try {
    const ref = db.collection('aiAgentAlerts').doc(cfg.tenantId || 'default')
    const due = await db.runTransaction(async (tx) => {
      const last = (await tx.get(ref)).data()?.lastAlertAt
      if (last && Date.now() - Date.parse(last) < ALERT_COOLDOWN_MS) return false
      tx.set(ref, { lastAlertAt: new Date().toISOString(), lastError: String(err?.message).slice(0, 500) }, { merge: true })
      return true
    })
    if (!due) return
    await sendManagerMessage(cfg, [
      '⚠️ <b>ИИ-агент не смог ответить клиенту</b>',
      esc(explainError(err?.message)),
      leadLink(amoCfg, leadId),
      `<code>${esc(String(err?.message).slice(0, 300))}</code>`,
      'Пока ошибка не исправлена, бот молчит. Следующее уведомление — не раньше чем через 30 минут.',
    ].filter(Boolean).join('\n'))
  } catch (e) {
    console.warn('AI agent error alert failed:', e.message)
  }
}

// ─── Follow-ups ─────────────────────────────────────────────────────────
export function parseFollowUpHours(raw) {
  return String(raw ?? '').split(/[,;\s]+/).map(Number).filter(n => n > 0 && n <= 168).slice(0, 3)
}

// Comments are public, so they never get nudges
const followUpsAllowed = (cfg, channel) => cfg.followUpEnabled && channel !== 'comment' && parseFollowUpHours(cfg.followUpHours).length > 0

function followUpDueAt(cfg, baseAt, sent) {
  const hours = parseFollowUpHours(cfg.followUpHours)
  return sent < hours.length ? new Date(Date.parse(baseAt) + hours[sent] * 3600_000).toISOString() : null
}

function isWorkingHours(date = new Date()) {
  const h = (date.getUTCHours() + 5) % 24
  return h >= WORK_HOURS[0] && h < WORK_HOURS[1]
}

const CHANNEL_SETTING = { instagram: 'replyInstagram', comment: 'replyComments', telegram: 'replyTelegram', other: 'replyOtherChannels' }

// Returns 'sent' or the reason it was skipped. Claiming clears followUpDueAt,
// so a skipped conversation leaves the queue until the client writes again.
async function sendFollowUp(ref, cfg, amoCfg) {
  const db = getDb()
  // Claim it: a parallel sweep or a fresh client message may have changed it
  const conv = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const c = snap.data()
    if (!c?.followUpDueAt || c.followUpDueAt > new Date().toISOString()) return null
    tx.set(ref, { followUpDueAt: null }, { merge: true })
    return c
  })
  if (!conv) return 'claimed elsewhere'

  const channel = conv.channel || detectChannel(conv.origin)
  const messages = conv.messages || []
  if (!cfg.enabled || !cfg.openaiKey || !cfg.replyFieldId || !cfg.salesbotId || !amoCfg.accessToken) return 'agent not configured'
  if (!followUpsAllowed(cfg, channel) || !cfg[CHANNEL_SETTING[channel]]) return 'channel off'
  if (conv.paused || messages.at(-1)?.role !== 'assistant') return 'not awaiting client'
  if ((conv.replies || 0) - (conv.resumedAtReplies || 0) >= cfg.maxRepliesPerLead) return 'reply cap'
  const lastClientAt = messages.filter(m => m.role === 'user').at(-1)?.at
  if (channel === 'instagram' && lastClientAt && Date.now() - Date.parse(lastClientAt) > IG_WINDOW_MS) return 'instagram 24h window'

  const amo = createAmoClient(amoCfg)
  try {
    const lead = await amo.get(`/api/v4/leads/${conv.leadId}`)
    const tags = leadTags(lead)
    if (tags.includes(cfg.pauseTag) || tags.includes(cfg.handoffTag)) return 'paused in amo'
    if (cfg.testMode && !tags.includes(cfg.testTag)) return 'test mode'
    if (CLOSED_STATUSES.includes(String(lead?.status_id))) return 'lead closed'
    if (cfg.handoffStatusId && String(lead?.status_id) === String(cfg.handoffStatusId)) return 'at manager stage'

    const hours = parseFollowUpHours(cfg.followUpHours)
    const sent = conv.followUpsSent || 0
    const result = await runAgentTurn({
      cfg, history: messages, channel,
      followUp: {
        hours: Math.round((Date.now() - Date.parse(conv.followUpBaseAt || messages.at(-1).at)) / 3600_000) || 1,
        number: sent + 1, total: hours.length,
      },
      ctx: { amo, leadId: conv.leadId, contactId: conv.contactId, dryRun: false },
    })
    if (!result.reply) return 'empty reply'
    await sendReply(amo, cfg, conv.leadId, result.reply)

    await db.runTransaction(async (tx) => {
      const cur = (await tx.get(ref)).data() || {}
      const clientWrote = (cur.messages || []).at(-1)?.role === 'user'
      tx.set(ref, {
        ...cur,
        messages: [...(cur.messages || []), {
          role: 'assistant', text: result.reply, at: new Date().toISOString(), actions: result.actions, followUp: true,
        }].slice(-HISTORY_LIMIT),
        replies: (cur.replies || 0) + 1,
        followUpsSent: sent + 1,
        followUpDueAt: clientWrote || result.handoff ? null : followUpDueAt(cfg, conv.followUpBaseAt || messages.at(-1).at, sent + 1),
        paused: !!(cur.paused || result.handoff),
        handoffReason: result.handoff || cur.handoffReason || null,
        promptTokens: (cur.promptTokens || 0) + result.usage.prompt,
        completionTokens: (cur.completionTokens || 0) + result.usage.completion,
        lastError: null,
        updatedAt: new Date().toISOString(),
      })
    })
    if (result.handoff) await notifyHandoff(cfg, amoCfg, { ...conv, channel }, result.handoff)
    return 'sent'
  } catch (e) {
    console.error('AI agent follow-up error:', e)
    await ref.set({ lastError: String(e.message).slice(0, 500), updatedAt: new Date().toISOString() }, { merge: true })
    await alertError(cfg, amoCfg, conv.leadId, e)
    return 'error'
  }
}

/** Sends due follow-ups for all tenants. Safe to run concurrently (each one is claimed). */
export async function runFollowUps() {
  const db = getDb()
  if (!db) return { ok: false, error: 'Firestore unavailable' }
  if (!isWorkingHours()) return { ok: true, skipped: 'outside working hours' }
  const snap = await db.collection('aiAgentConversations')
    .where('followUpDueAt', '<=', new Date().toISOString())
    .orderBy('followUpDueAt')
    .limit(FOLLOWUP_BATCH)
    .get()
  const configs = {}
  const results = {}
  await Promise.all(snap.docs.map(async (doc) => {
    const tenantId = doc.data().tenantId || 'default'
    configs[tenantId] ||= Promise.all([resolveAiAgent(tenantReq(tenantId)), resolveAmo(tenantReq(tenantId))])
    const [cfg, amoCfg] = await configs[tenantId]
    const outcome = await sendFollowUp(doc.ref, cfg, amoCfg)
    results[outcome] = (results[outcome] || 0) + 1
  }))
  return { ok: true, due: snap.size, results }
}

let lastSweepAt = 0
function sweepFollowUpsSoon() {
  if (Date.now() - lastSweepAt < SWEEP_INTERVAL_MS) return
  lastSweepAt = Date.now()
  waitUntil(runFollowUps().catch(e => console.error('AI agent follow-up sweep failed:', e)))
}

function keyMatches(given, expected) {
  const a = Buffer.from(String(given || ''))
  const b = Buffer.from(String(expected || ''))
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b)
}

async function handleWebhook(req, res) {
  const [cfg, amoCfg] = await Promise.all([resolveAiAgent(req), resolveAmo(req)])
  if (!keyMatches(req.query?.key, cfg.webhookKey)) return res.status(403).json({ error: 'Forbidden' })
  // Always 200 for amo so it doesn't disable the webhook; just ignore what we can't handle
  if (!cfg.enabled || !cfg.openaiKey || !cfg.replyFieldId || !cfg.salesbotId) return res.status(200).json({ ok: true, skipped: 'agent not configured' })
  if (!amoCfg.subdomain || !amoCfg.accessToken) return res.status(200).json({ ok: true, skipped: 'amo not configured' })

  const allowed = {
    instagram: cfg.replyInstagram, comment: cfg.replyComments,
    telegram: cfg.replyTelegram, other: cfg.replyOtherChannels,
  }
  const parsed = parseIncomingMessages(req.body)
  const messages = parsed.filter(m =>
    m.type === 'incoming' && (m.text || m.attachmentType) && m.leadId && allowed[detectChannel(m.origin)])
  // origin values per channel aren't documented by amo — log them to tune detectChannel
  for (const m of parsed) {
    console.log('AI agent webhook:', JSON.stringify({
      origin: m.origin, channel: detectChannel(m.origin), type: m.type, leadId: m.leadId,
      hasText: !!m.text, attachment: m.attachmentType || null, accepted: messages.includes(m),
    }))
  }

  if (messages.length) {
    waitUntil(Promise.all(messages.map(msg => processIncomingMessage({ cfg, amoCfg, msg }))))
  }
  sweepFollowUpsSoon()
  return res.status(200).json({ ok: true, accepted: messages.length })
}

// One-click amo setup from the ERP: creates the lead field «Ответ ИИ».
async function handleSetup(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const tenantId = getTenantId(req)
  const [cfg, amoCfg] = await Promise.all([resolveAiAgent(req), resolveAmo(req)])
  if (!amoCfg.subdomain || !amoCfg.accessToken) return res.status(400).json({ ok: false, error: 'Сначала подключите amoCRM в «Интеграциях»' })
  try {
    if (req.body?.action === 'create-field') {
      if (cfg.replyFieldId) return res.status(200).json({ ok: true, replyFieldId: cfg.replyFieldId, existed: true })
      const amo = createAmoClient(amoCfg)
      const created = await amo.post('/api/v4/leads/custom_fields', [{ type: 'textarea', name: 'Ответ ИИ' }])
      const id = String(created?._embedded?.custom_fields?.[0]?.id || '')
      if (!id) throw new Error('amoCRM не вернул id поля')
      await saveTenantIntegration(tenantId || 'default', 'aiAgent', { replyFieldId: id })
      return res.status(200).json({ ok: true, replyFieldId: id })
    }
    if (req.body?.action === 'test-notify') {
      await sendManagerMessage(cfg, '✅ Уведомления ИИ-агента подключены. Сюда будут приходить клиенты, переданные менеджеру, и ошибки бота.')
      return res.status(200).json({ ok: true })
    }
    return res.status(400).json({ ok: false, error: 'Unknown action' })
  } catch (e) {
    console.error('AI agent setup error:', e)
    return res.status(500).json({ ok: false, error: e.message })
  }
}

// amo HTML-escapes saved webhook URLs ("&" → "&amp;"), so params arrive as
// "amp;tenantId" / "amp;key". Fold them back before anything reads req.query.
function normalizeQuery(req) {
  const q = req.query || {}
  for (const k of Object.keys(q)) {
    const clean = k.replace(/^(amp;)+/, '')
    if (clean !== k && q[clean] === undefined) q[clean] = q[k]
  }
  req.query = q
}

// GET|POST ?mode=followups&tenantId=…&key=… — for an external cron (every 15 min).
// The key of any tenant authorizes the sweep; it only sends follow-ups that are due.
async function handleFollowUps(req, res) {
  const cfg = await resolveAiAgent(req)
  if (!keyMatches(req.query?.key, cfg.webhookKey)) return res.status(403).json({ error: 'Forbidden' })
  try {
    return res.status(200).json(await runFollowUps())
  } catch (e) {
    console.error('AI agent follow-ups error:', e)
    return res.status(500).json({ ok: false, error: e.message })
  }
}

/** /api/ai/amo-agent?mode=webhook|followups|test|log|setup */
export async function handleAmoAgent(req, res) {
  normalizeQuery(req)
  const mode = req.query?.mode || req.body?.mode
  if (mode === 'log') return handleAgentLog(req, res)
  if (mode === 'followups') return handleFollowUps(req, res)
  if (mode === 'setup') return handleSetup(req, res)
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (mode === 'test') return handleAgentTest(req, res)
  if (mode === 'webhook') return handleWebhook(req, res)
  return res.status(400).json({ error: 'Unknown mode' })
}

// Simple in-memory rate limiter for the test chat (resets on cold start)
const testHits = {}
function testRateLimited(tenantId) {
  const now = Date.now()
  const e = testHits[tenantId] ||= { count: 0, resetAt: now + 3600_000 }
  if (now > e.resetAt) { e.count = 0; e.resetAt = now + 3600_000 }
  return ++e.count > 60
}

async function handleAgentTest(req, res) {
  const tenantId = getTenantId(req)
  const cfg = await resolveAiAgent(req)
  if (!cfg.openaiKey) return res.status(400).json({ ok: false, error: 'Не указан OpenAI API key' })
  if (testRateLimited(tenantId || 'default')) return res.status(429).json({ ok: false, error: 'Лимит тестовых сообщений (60/час)' })

  const { message, history, channel } = req.body || {}
  if (!message?.trim()) return res.status(400).json({ ok: false, error: 'Пустое сообщение' })

  try {
    const result = await runAgentTurn({
      cfg,
      history: Array.isArray(history) ? history.filter(m => m?.role && m?.text) : [],
      message: clientText(message.trim()),
      channel: CHANNEL_LABELS[channel] ? channel : 'instagram',
      ctx: { dryRun: true },
    })
    return res.status(200).json({ ok: true, ...result })
  } catch (e) {
    console.error('AI agent test error:', e)
    return res.status(500).json({ ok: false, error: e.message })
  }
}

// ─── Conversation log for the ERP ───────────────────────────────────────
// GET  ?mode=log&tenantId=…&days=7      → summaries + stats
// GET  ?mode=log&tenantId=…&id=…        → one conversation with messages
// POST ?mode=log { tenantId, id, paused } → pause / resume the bot for a lead

// USD per 1M tokens (input, output) — approximate, for the cost estimate only
const MODEL_PRICES = {
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-4o': [2.5, 10],
  'gpt-4.1-mini': [0.4, 1.6],
  'gpt-4.1-nano': [0.1, 0.4],
  'gpt-4.1': [2, 8],
}

function estimateCost(model, prompt, completion) {
  const price = MODEL_PRICES[model]
  if (!price) return null
  return (prompt * price[0] + completion * price[1]) / 1e6
}

const capturedPhone = (messages) => (messages || []).some(m =>
  (m.actions || []).some(a => a.tool === 'save_contact' && a.args?.phone))

async function handleAgentLog(req, res) {
  const tenantId = getTenantId(req) || 'default'
  const db = getDb()
  if (!db) return res.status(500).json({ ok: false, error: 'Firestore недоступен на сервере' })
  const col = db.collection('aiAgentConversations')
  const id = String(req.query?.id || req.body?.id || '')
  if (id && !id.startsWith(`${tenantId}__`)) return res.status(403).json({ ok: false, error: 'Forbidden' })

  try {
    if (req.method === 'POST') {
      if (!id) return res.status(400).json({ ok: false, error: 'id is required' })
      const paused = !!req.body?.paused
      const ref = col.doc(id)
      const snap = await ref.get()
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'Not found' })
      await ref.set({
        paused,
        ...(paused ? {} : { handoffReason: null, resumedAtReplies: snap.data().replies || 0 }),
        updatedAt: new Date().toISOString(),
      }, { merge: true })
      // On resume also drop the handoff/pause tags, otherwise the bot keeps skipping the lead
      const leadId = snap.data().leadId
      if (!paused && leadId) {
        try {
          const [cfg, amoCfg] = await Promise.all([resolveAiAgent(req), resolveAmo(req)])
          if (amoCfg.subdomain && amoCfg.accessToken) {
            await createAmoClient(amoCfg).patch(`/api/v4/leads/${leadId}`, {
              tags_to_delete: [{ name: cfg.handoffTag }, { name: cfg.pauseTag }],
            })
          }
        } catch (e) {
          console.warn('AI agent resume: failed to remove amo tags:', e.message)
        }
      }
      return res.status(200).json({ ok: true, paused })
    }

    if (id) {
      const snap = await col.doc(id).get()
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'Not found' })
      return res.status(200).json({ ok: true, conversation: { id, ...snap.data() } })
    }

    const cfg = await resolveAiAgent(req)
    const days = Math.min(Math.max(Number(req.query?.days) || 7, 1), 365)
    const since = new Date(Date.now() - days * 86400_000).toISOString()
    // Filter by tenant only (no composite index needed), date-filter in memory
    const snap = await col.where('tenantId', '==', tenantId).get()
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => (c.updatedAt || '') >= since)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))

    let promptTokens = 0, completionTokens = 0
    const conversations = items.map(c => {
      promptTokens += c.promptTokens || 0
      completionTokens += c.completionTokens || 0
      const last = (c.messages || []).at(-1)
      return {
        id: c.id,
        leadId: c.leadId,
        contactName: c.contactName,
        channel: c.channel || detectChannel(c.origin),
        replies: c.replies || 0,
        messagesCount: (c.messages || []).length,
        lastText: last ? String(last.text || '').slice(0, 140) : '',
        lastRole: last?.role || null,
        paused: !!c.paused,
        handoffReason: c.handoffReason || null,
        phoneCaptured: capturedPhone(c.messages),
        cost: estimateCost(cfg.model, c.promptTokens || 0, c.completionTokens || 0),
        updatedAt: c.updatedAt,
      }
    }).slice(0, 200)

    return res.status(200).json({
      ok: true,
      model: cfg.model,
      stats: {
        conversations: items.length,
        replies: items.reduce((s, c) => s + (c.replies || 0), 0),
        handoffs: items.filter(c => c.handoffReason).length,
        phones: items.filter(c => capturedPhone(c.messages)).length,
        cost: estimateCost(cfg.model, promptTokens, completionTokens),
        promptTokens,
        completionTokens,
      },
      conversations,
    })
  } catch (e) {
    console.error('AI agent log error:', e)
    return res.status(500).json({ ok: false, error: e.message })
  }
}
