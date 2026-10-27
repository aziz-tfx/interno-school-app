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

/** Vercel-style (req, res) on top of a Fastify request/reply. */
async function runVercel(handler, req, reply, tenantId) {
  const query = { ...req.query }
  const headers = { ...req.headers }
  let body = req.body
  if (tenantId !== undefined) {
    // the signed-in user's school, not whatever the client sent
    query.tenantId = tenantId
    headers['x-tenant-id'] = tenantId
    if (body && typeof body === 'object' && !Array.isArray(body)) body = { ...body, tenantId }
  }
  let status = 200
  const res = {
    setHeader(name, value) {
      // CORS is the server's job (@fastify/cors); the old wildcard headers would undo it
      if (!/^access-control-/i.test(name)) reply.header(name, value)
      return res
    },
    status(code) { status = code; return res },
    json(obj) { reply.code(status).send(obj); return res },
    send(data) { reply.code(status).send(data); return res },
    end(data) { reply.code(status).send(data ?? ''); return res },
  }
  await handler({ method: req.method, url: req.url, query, headers, body }, res)
  if (!reply.sent) reply.code(204).send()
  return reply
}

export default async function vercelRoutes(app, { pool, config, telegram }) {
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

  app.get('/api/amo/status', as(amoStatus, staffOnly))
  app.get('/api/amo/users', as(amoUsers, staffOnly))
  app.get('/api/amo/calls', as(amoCalls, staffOnly))
  app.get('/api/amo/performance-v2', as(amoPerformance, staffOnly))
  app.get('/api/amo/response-times', as(amoResponseTimes, staffOnly))
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
      if (mode === 'webhook' || mode === 'followups') return runVercel(handleAmoAgent, req, reply)
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
