// What the integrations look like from inside the API container — without
// printing a single secret: only "is it set", HTTP statuses, counts, dates.
//
//   docker compose logs api | grep … | docker compose exec -T api node scripts/diagnose.js
//
// Log lines on stdin (optional) are summarized too. Error texts are cut and
// have long digit runs (phones, ids, chat ids) masked.

import pg from 'pg'
import { loadTelegramConfig } from '../src/telegram.js'
import { initTenantConfig, resolveAmo, resolveAiAgent } from '../src/vercel/_lib/tenantConfig.js'

const TENANT = process.argv[2] || 'default'
const has = (v) => !!(v && String(v).trim())
const mask = (s) => String(s ?? '').replace(/\d{5,}/g, '…').replace(/(bot|key=|token=)[^\s"&]+/gi, '$1…').slice(0, 200)

async function status(url, init) {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) })
    return { status: r.status, body: await r.json().catch(() => null) }
  } catch (e) {
    return { status: 0, error: mask(e.message) }
  }
}

async function readStdin() {
  if (process.stdin.isTTY) return ''
  let s = ''
  for await (const chunk of process.stdin) s += chunk
  return s
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
initTenantConfig(pool)
const out = { at: new Date().toISOString(), tenant: TENANT }
const env = process.env

out.env = Object.fromEntries([
  'TG_BOT_TOKEN', 'TELEGRAM_BOT_TOKEN', 'TG_CHAT_TASHKENT', 'TG_CHAT_SAMARKAND', 'TG_CHAT_FERGANA',
  'AMO_SUBDOMAIN', 'AMO_ACCESS_TOKEN', 'AMO_REFRESH_TOKEN', 'AMO_CLIENT_ID', 'OPENAI_API_KEY',
  'ONPBX_DOMAIN', 'ONPBX_API_KEY', 'GOOGLE_AI_KEY', 'PUBLIC_URL', 'API_DOMAIN',
].map(k => [k, has(env[k])]))
out.env.AUTOMATIONS = env.AUTOMATIONS || null

const { rows: [ti] } = await pool.query('SELECT data FROM tenant_integrations WHERE id = $1', [TENANT])
const d = ti?.data || {}
out.stored = {
  exists: !!ti,
  telegram: { botToken: has(d.telegram?.botToken), chats: Object.fromEntries(Object.entries(d.telegram?.chats || {}).map(([k, v]) => [k, has(v)])), enabled: d.telegram?.enabled ?? null },
  amocrm: { subdomain: has(d.amocrm?.subdomain), accessToken: has(d.amocrm?.accessToken), refreshToken: has(d.amocrm?.refreshToken), enabled: d.amocrm?.enabled ?? null },
  aiAgent: d.aiAgent ? {
    enabled: d.aiAgent.enabled ?? null, testMode: d.aiAgent.testMode ?? null, openaiKey: has(d.aiAgent.openaiKey),
    webhookKey: has(d.aiAgent.webhookKey), replyFieldId: has(d.aiAgent.replyFieldId),
    contactReplyFieldId: has(d.aiAgent.contactReplyFieldId), salesbotId: has(d.aiAgent.salesbotId),
    notifyChatId: has(d.aiAgent.notifyChatId), model: d.aiAgent.model || null,
  } : null,
}

// What the code actually ends up using (stored value, else env for 'default')
const req = { query: { tenantId: TENANT } }
const [tg, amo, ai] = await Promise.all([loadTelegramConfig(pool, TENANT), resolveAmo(req), resolveAiAgent(req)])
out.resolved = {
  telegram: { botToken: has(tg.botToken), chats: Object.fromEntries(Object.entries(tg.chats || {}).map(([k, v]) => [k, has(v)])) },
  amo: { subdomain: has(amo.subdomain), accessToken: has(amo.accessToken), source: amo.source },
  aiAgent: { enabled: ai.enabled, openaiKey: has(ai.openaiKey), webhookKey: has(ai.webhookKey), testMode: ai.testMode },
}

// Live checks against the outside services
if (tg.botToken) {
  const me = await status(`https://api.telegram.org/bot${tg.botToken}/getMe`)
  const wh = await status(`https://api.telegram.org/bot${tg.botToken}/getWebhookInfo`)
  const w = wh.body?.result || {}
  let hook = null
  try { const u = new URL(w.url); hook = `${u.host}${u.pathname}` } catch {}
  out.live = { telegramGetMe: me.status, telegramUsername: me.body?.result?.username || null,
    telegramWebhook: hook, telegramPending: w.pending_update_count ?? null,
    telegramLastError: w.last_error_message ? mask(w.last_error_message) : null,
    telegramLastErrorAt: w.last_error_date ? new Date(w.last_error_date * 1000).toISOString() : null }
} else out.live = {}
if (amo.subdomain && amo.accessToken) {
  const r = await status(`https://${amo.subdomain}.amocrm.ru/api/v4/account`, { headers: { Authorization: `Bearer ${amo.accessToken}` } })
  out.live.amoAccount = r.status || r.error
}
if (ai.openaiKey) {
  const r = await status('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${ai.openaiKey}` } })
  out.live.openai = r.status || r.error
  out.live.openaiError = r.body?.error?.code || r.body?.error?.type || null
}

// Activity
out.scheduledRuns = (await pool.query('SELECT name, last_date, ran_at FROM scheduled_runs ORDER BY name')).rows
const { rows: [conv] } = await pool.query(`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE data->>'updatedAt' > (now() - interval '1 day')::text)::int AS day,
         count(*) FILTER (WHERE data->>'updatedAt' > (now() - interval '7 days')::text)::int AS week,
         max(data->>'updatedAt') AS last,
         max(data->'messages'->-1->>'at') FILTER (WHERE data->'messages'->-1->>'role' = 'assistant') AS "lastReply"
    FROM ai_agent_conversations WHERE tenant_id = $1`, [TENANT])
out.conversations = conv
out.conversationErrors = (await pool.query(`
  SELECT data->>'lastError' AS e, max(data->>'updatedAt') AS at, count(*)::int AS n
    FROM ai_agent_conversations WHERE tenant_id = $1 AND coalesce(data->>'lastError', '') <> ''
   GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, [TENANT])).rows.map(r => ({ ...r, e: mask(r.e) }))
const { rows: [auto] } = await pool.query('SELECT data FROM automation_settings WHERE id = $1', [TENANT])
out.automationSettings = auto ? Object.fromEntries(Object.entries(auto.data).filter(([, v]) => typeof v === 'boolean')) : null

// Log lines (pino JSON or plain console output)
const lines = (await readStdin()).split('\n').filter(Boolean)
if (lines.length) {
  const pick = (re) => lines.filter(l => re.test(l))
  const msgOf = (l) => { const i = l.indexOf('{'); try { const j = JSON.parse(l.slice(i)); return j } catch { return null } }
  out.logs = {
    lines: lines.length,
    first: lines[0].slice(0, 40),
    agentWebhook: pick(/AI agent webhook:/).length,
    agentAccepted: pick(/"accepted":true/).length,
    agentErrors: [...new Set(pick(/AI agent [^w]|AI agent follow-ups failed/).map(l => mask(l.replace(/^[^|]*\|\s*/, ''))))].slice(-8),
    automations: pick(/daily automations/).slice(-3).map(l => {
      const j = msgOf(l)
      return j ? { msg: j.msg, time: j.time ? new Date(j.time).toISOString() : null, results: j.results ? { ...j.results, errors: (j.results.errors || []).map(mask).slice(0, 5) } : undefined, err: j.err ? mask(j.err.message) : undefined } : mask(l)
    }),
    starts: pick(/Server listening|daily automations: on/).length,
  }
}

console.log(JSON.stringify(out))
await pool.end()
