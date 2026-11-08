// The former Vercel functions (src/vercel/*), served by this server under
// their old paths — so the frontend, amoCRM and Payme keep calling the same
// URLs (app.internoedu.uz/api/… is forwarded here by vercel.json).
//
// On Vercel anyone could call them with any tenantId. Here every call made
// by the app requires a login, and the school is the user's own — whatever
// the request says. Webhooks from outside check their own secrets:
//   /api/ai/amo-agent?mode=webhook|followups   key=<webhookKey of the school>
//   /api/pay/payme (POST)                      Basic auth with the Payme key
//
//   GET  /api/amo/{status,users,calls,performance-v2,response-times}
//   POST /api/amo/webhook?tenantId=&key=        amoCRM changes → live updates
//   GET  /api/amo/live                          last amoCRM event (+ webhook URL for admins)
//   POST /api/admin/amo/webhook                 subscribe the school's amoCRM
//   POST /api/amo/{push-sale,token-refresh}
//   GET  /api/onpbx/calls                       call analytics / ?status=1
//   POST /api/telegram/notify                   sale → branch chat
//   POST /api/ai/chat                           LMS helper for students
//   *    /api/ai/amo-agent?mode=…               Instagram/Telegram sales agent
//   GET  /api/pay/payme?tenantId=               public: is Payme on, merchant id
//   POST /api/pay/payme?tenantId=               Payme merchant API (JSON-RPC)

import { isAdmin, isStudent } from '../collections.js'
import { forbidden } from '../lib/errors.js'
import amoStatus from '../vercel/amo/status.js'
import amoUsers from '../vercel/amo/users.js'
import amoCalls from '../vercel/amo/calls.js'
import amoPerformance from '../vercel/amo/performance-v2.js'
import amoResponseTimes from '../vercel/amo/response-times.js'
import amoPushSale from '../vercel/amo/push-sale.js'
import amoTokenRefresh from '../vercel/amo/token-refresh.js'
import onpbxCalls from '../vercel/onpbx/calls.js'
import telegramNotify from '../vercel/telegram/notify.js'
import aiChat from '../vercel/ai/chat.js'
import payme from '../vercel/pay/payme.js'
import { handleAmoAgent } from '../vercel/_lib/aiAgent.js'
import { loadTelegramConfig, webhookSecret } from '../telegram.js'
import { resolveAmo } from '../vercel/_lib/tenantConfig.js'
import { ensureAmoToken } from '../vercel/_lib/amoClient.js'
import { amoWebhookKey, amoWebhookUrl, registerAmoWebhook } from '../amoLive.js'
import { timingSafeEqual } from 'node:crypto'

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Run a Vercel-style (req, res) handler and capture its answer:
 * { status, headers, body, sent }.
 */
async function invokeVercel(handler, req, tenantId) {
  const query = { ...req.query }
  const headers = { ...req.headers }
  let body = req.body
  if (tenantId !== undefined) {
    // the signed-in user's school, not whatever the client sent
    query.tenantId = tenantId
    headers['x-tenant-id'] = tenantId
    if (body && typeof body === 'object' && !Array.isArray(body)) body = { ...body, tenantId }
  }
  const out = { status: 200, headers: {}, body: undefined, sent: false }
  const res = {
    setHeader(name, value) {
      // CORS is the server's job (@fastify/cors); the old wildcard headers would undo it
      if (!/^access-control-/i.test(name)) out.headers[name] = value
      return res
    },
    status(code) { out.status = code; return res },
    json(obj) { out.body = obj; out.sent = true; return res },
    send(data) { out.body = data; out.sent = true; return res },
    end(data) { out.body = data ?? ''; out.sent = true; return res },
  }
  await handler({ method: req.method, url: req.url, query, headers, body }, res)
  return out
}

function sendInvoked(reply, out) {
  for (const [name, value] of Object.entries(out.headers)) reply.header(name, value)
  if (!out.sent) return reply.code(204).send()
  return reply.code(out.status).send(out.body)
}

/** Vercel-style (req, res) on top of a Fastify request/reply. */
async function runVercel(handler, req, reply, tenantId) {
  return sendInvoked(reply, await invokeVercel(handler, req, tenantId))
}

export default async function vercelRoutes(app, { pool, config, telegram, amoLive }) {
  // amo posts its webhooks as application/x-www-form-urlencoded
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => {
    try { done(null, Object.fromEntries(new URLSearchParams(body))) } catch (e) { done(e) }
  })

  const staffOnly = async (req) => { if (isStudent(req.user)) throw forbidden() }
  const adminOnly = async (req) => { if (!isAdmin(req.user)) throw forbidden() }
  const as = (handler, ...checks) => ({
    preHandler: [app.authenticate, ...checks],
    handler: (req, reply) => runVercel(handler, req, reply, req.user.tenantId),
  })

  // amo analytics: shared per school until amoCRM reports a change (see amoLive.js)
  const cachedAmo = (handler, path) => ({
    preHandler: [app.authenticate, staffOnly],
    handler: async (req, reply) => {
      const out = await amoLive.get(req.user.tenantId, path, req.query,
        () => invokeVercel(handler, req, req.user.tenantId),
        (o) => o.sent && o.status === 200 && o.body?.success !== false)
      // The browser must re-ask after a live event, not answer from its own cache
      const headers = Object.fromEntries(Object.entries(out.headers).filter(([k]) => k.toLowerCase() !== 'cache-control'))
      reply.header('Cache-Control', 'private, no-cache')
      return sendInvoked(reply, { ...out, headers })
    },
  })

  app.get('/api/amo/status', as(amoStatus, staffOnly))
  app.get('/api/amo/users', cachedAmo(amoUsers, 'users'))
  app.get('/api/amo/calls', cachedAmo(amoCalls, 'calls'))
  app.get('/api/amo/performance-v2', cachedAmo(amoPerformance, 'performance-v2'))
  app.get('/api/amo/response-times', cachedAmo(amoResponseTimes, 'response-times'))

  // ─── amoCRM → live updates ────────────────────────────────────────────
  // amoCRM posts every deal / task / note change here (form-encoded). Always
  // 200: amoCRM switches off webhooks that keep failing.
  app.post('/api/amo/webhook', { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (req) => {
    const q = req.query || {}
    const tenantId = String(q.tenantId || '')
    // amo HTML-escapes saved URLs: "&key=" may arrive as "amp;key"
    const key = String(q.key || q['amp;key'] || '')
    if (tenantId && key && safeEqual(key, amoWebhookKey(config.jwtSecret, tenantId))) amoLive.changed(tenantId)
    return { ok: true }
  })

  // Is amoCRM pushing changes? (the screens show «обновляется сразу» vs polling)
  app.get('/api/amo/live', { preHandler: [app.authenticate, staffOnly] }, async (req) => ({
    lastEventAt: amoLive.lastEventAt(req.user.tenantId),
    ...(isAdmin(req.user) && { webhookUrl: amoWebhookUrl(config, req.user.tenantId) }),
  }))

  // Интеграции → amoCRM → «Включить живые обновления»
  app.post('/api/admin/amo/webhook', { preHandler: [app.authenticate, adminOnly] }, async (req, reply) => {
    const tenantId = req.user.tenantId
    const destination = amoWebhookUrl(config, tenantId)
    if (!destination) return reply.code(400).send({ error: 'На сервере не задан API_DOMAIN' })
    const amo = await resolveAmo({ query: { tenantId }, headers: {} })
    if (!amo.subdomain || !amo.accessToken) {
      return reply.code(400).send({ error: 'amoCRM не подключён: укажите поддомен и токен', webhookUrl: destination })
    }
    const accessToken = await ensureAmoToken(amo, tenantId)
    const result = await registerAmoWebhook({ subdomain: amo.subdomain, accessToken }, destination)
    if (!result.ok) return reply.code(400).send({ error: result.error, webhookUrl: destination })
    return { ok: true, webhookUrl: destination, events: result.settings }
  })
  app.post('/api/amo/push-sale', as(amoPushSale, staffOnly))
  app.post('/api/amo/token-refresh', as(amoTokenRefresh, adminOnly))
  app.get('/api/onpbx/calls', as(onpbxCalls, staffOnly))
  app.post('/api/ai/chat', as(aiChat)) // students: the LMS helper

  app.post('/api/telegram/notify', async (req, reply) => {
    // The bot's webhook used to point here, without a secret. Re-point the
    // bot to /api/telegram/webhook (secret-checked) and ask the client to
    // tap the link again — nothing from this unauthenticated path is trusted.
    if (req.body && req.body.update_id !== undefined) return legacyBotUpdate(req)
    await app.authenticate(req, reply)
    if (reply.sent) return reply
    if (isStudent(req.user)) throw forbidden()
    return runVercel(telegramNotify, req, reply, req.user.tenantId)
  })

  async function legacyBotUpdate(req) {
    const tenantId = String(req.query.tenantId || 'default')
    const tg = await loadTelegramConfig(pool, tenantId)
    const chatId = req.body.message?.chat?.id
    if (!tg.botToken || !config.publicUrl) return { ok: true }
    await telegram.setWebhook(tg.botToken, {
      url: `${config.publicUrl}/api/telegram/webhook?tenantId=${encodeURIComponent(tenantId)}`,
      secret_token: webhookSecret(config.jwtSecret, tenantId),
      allowed_updates: ['message'],
    })
    if (chatId && /^\/start\b/.test(String(req.body.message?.text || ''))) {
      await telegram.send(tg.botToken, chatId, 'Бот обновился. Пожалуйста, откройте ссылку из личного кабинета ещё раз.')
    }
    return { ok: true }
  }

  // Sales agent: webhooks from amo carry the school's key; the settings,
  // test chat and conversation log are for the school's staff.
  app.route({
    method: ['GET', 'POST'],
    url: '/api/ai/amo-agent',
    handler: async (req, reply) => {
      // amo HTML-escapes saved URLs: "&mode=" may arrive as "amp;mode"
      const q = req.query || {}
      const mode = q.mode || q['amp;mode'] || req.body?.mode
      if (mode === 'webhook' || mode === 'followups') {
        return runVercel(handleAmoAgent, req, reply)
      }
      await app.authenticate(req, reply)
      if (reply.sent) return reply
      if (isStudent(req.user)) throw forbidden()
      if (mode === 'setup' && !isAdmin(req.user)) throw forbidden()
      return runVercel(handleAmoAgent, req, reply, req.user.tenantId)
    },
  })

  // Payme: GET is public config for the student cabinet; POST is Payme's own
  // server calling, authenticated inside the handler.
  app.route({ method: ['GET', 'POST'], url: '/api/pay/payme', handler: (req, reply) => runVercel(payme, req, reply) })
}
