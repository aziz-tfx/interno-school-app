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
import { amoFetch, amoRelayMode } from '../src/vercel/_lib/amoFetch.js'
import { amoMirrorStatus } from '../src/vercel/_lib/amoMirror.js'
import { checkAgentHealth } from '../src/vercel/_lib/aiAgent.js'

const TENANT = process.argv[2] || 'default'
const has = (v) => !!(v && String(v).trim())
const mask = (s) => String(s ?? '').replace(/\d{5,}/g, '…').replace(/(bot|key=|token=)[^\s"&]+/gi, '$1…').slice(0, 200)

async function status(url, init) {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) })
    const text = await r.text().catch(() => '')
    let body = null
    try { body = JSON.parse(text) } catch {}
    return { status: r.status, body, type: r.headers.get('content-type'), text: mask(text.replace(/\s+/g, ' ')).slice(0, 120) }
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
  // nginx's HTML 403 = amoCRM blocks this server's IP; JSON = a real API answer
  if (r.status && r.status !== 200) out.live.amoAnswer = { type: r.type, text: r.text }
  // Without a token: 401 JSON = amoCRM lets this IP in (so a 403 above is about
  // the token / integration); 403 HTML = the IP itself is blocked
  const anon = await status(`https://${amo.subdomain}.amocrm.ru/api/v4/account`)
  out.live.amoNoToken = { status: anon.status || anon.error, type: anon.type, text: anon.text?.slice(0, 80) }
  // the same call the way the AI agent makes it (through the Vercel relay when it's on)
  out.live.amoRelay = amoRelayMode()
  if (out.live.amoRelay !== 'off') {
    try {
      const rr = await amoFetch(`https://${amo.subdomain}.amocrm.ru/api/v4/account`, { headers: { Authorization: `Bearer ${amo.accessToken}` } }, { priority: 'high', timeoutMs: 20_000 })
      out.live.amoViaRelay = rr.status
      if (rr.status !== 200) out.live.amoViaRelayAnswer = mask((await rr.text().catch(() => '')).replace(/\s+/g, ' ')).slice(0, 120)
    } catch (e) {
      out.live.amoViaRelay = mask(e.message)
    }
    try {
      const ra = await amoFetch(`https://${amo.subdomain}.amocrm.ru/api/v4/account`, {}, { priority: 'high', timeoutMs: 20_000 })
      out.live.amoNoTokenViaRelay = { status: ra.status, type: ra.headers.get('content-type'), text: mask((await ra.text().catch(() => '')).replace(/\s+/g, ' ')).slice(0, 80) }
    } catch (e) {
      out.live.amoNoTokenViaRelay = mask(e.message)
    }
  }
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
// The local copy of amoCRM the reports read (amoMirror.js)
out.amoMirror = (await amoMirrorStatus(TENANT)).map(r => ({ ...r, error: r.error ? mask(r.error) : null }))
const { rows: [mc] } = await pool.query(
  `SELECT count(*) FILTER (WHERE kind = 'lead')::int AS leads, count(*) FILTER (WHERE kind = 'note')::int AS notes,
          count(*) FILTER (WHERE kind = 'event')::int AS events FROM amo_mirror WHERE tenant_id = $1`, [TENANT])
out.amoMirrorRows = mc
// What the daily self-check would report now
try { out.agentHealth = await checkAgentHealth(TENANT) } catch (e) { out.agentHealth = { error: mask(e.message) } }

// The latest conversations: did the bot answer, what failed, catch-up state
out.recent = (await pool.query(`
  SELECT data FROM ai_agent_conversations WHERE tenant_id = $1
   ORDER BY data->>'updatedAt' DESC NULLS LAST LIMIT 12`, [TENANT])).rows.map(({ data: c }) => {
  const last = (c.messages || []).at(-1) || {}
  return {
    updatedAt: c.updatedAt, channel: c.channel || null, lastRole: last.role || null, lastAt: last.at || null,
    replies: c.replies || 0, paused: !!c.paused, err: c.lastError ? mask(c.lastError) : null,
    retryCount: c.retryCount || 0, nextRetryAt: c.nextRetryAt || null,
  }
})
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
  // with `docker compose logs --timestamps` every line starts with its time
  const timeOf = (l) => (/^\d{4}-\d\d-\d\dT[\d:.]+Z/.exec(l) || [])[0]?.slice(0, 19) || null
  const lastTime = (re) => timeOf(pick(re).at(-1) || '')
  out.logs.times = {
    lastLine: timeOf(lines.at(-1)),
    lastWebhook: lastTime(/AI agent webhook:/),
    lastAccepted: lastTime(/"accepted":true/),
    lastAgentError: lastTime(/AI agent error/),
    amoBlocked: pick(/IP blocked|blocked \(403 from nginx/).length,
    lastAmoBlocked: lastTime(/IP blocked|blocked \(403 from nginx/),
    lastStart: lastTime(/Server listening/),
  }
  out.logs.recentErrors = pick(/AI agent error|AI agent catch-up|IP blocked|blocked \(403 from nginx|AI agent follow-up/).slice(-6).map(l => mask(l).slice(0, 200))
}

console.log(JSON.stringify(out))
await pool.end()
