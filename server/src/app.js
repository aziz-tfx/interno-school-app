// Builds the Fastify app. Kept separate from index.js so tests can create an
// app against a test database without opening a port.

import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import { authenticate } from './auth.js'
import { createRealtime } from './realtime.js'
import realtimeRoutes from './realtime.js'
import authRoutes from './routes/auth.js'
import collectionRoutes from './routes/collections.js'
import crmRoutes from './routes/crm/index.js'
import publicRoutes from './routes/public.js'
import telegramRoutes from './routes/telegram.js'
import adminRoutes from './routes/admin.js'
import { sendTelegram, setTelegramWebhook } from './telegram.js'

// telegram: injectable so tests don't call the real Bot API
export async function buildApp({ config, pool, telegram = { send: sendTelegram, setWebhook: setTelegramWebhook } }) {
  const app = Fastify({
    logger: { level: config.logLevel },
    trustProxy: true, // behind Caddy: real client IP for rate limits
    bodyLimit: 2 * 1024 * 1024,
  })

  await app.register(helmet, { contentSecurityPolicy: false }) // JSON API, no HTML
  await app.register(cors, {
    origin: config.corsOrigins.length ? config.corsOrigins : false,
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })
  // Per IP — a whole office sits behind one NAT address, so keep it generous.
  await app.register(rateLimit, { global: true, max: 3000, timeWindow: '1 minute' })
  await app.register(jwt, { secret: config.jwtSecret })
  app.decorate('authenticate', authenticate(pool))

  // 4xx: the message is meant for the user. 5xx: log it, show nothing internal.
  app.setErrorHandler((err, req, reply) => {
    const status = err.statusCode || 500
    if (status >= 500) {
      req.log.error({ err }, 'request failed')
      return reply.code(status).send({ error: 'Внутренняя ошибка сервера' })
    }
    return reply.code(status).send({ error: err.message })
  })

  const realtime = createRealtime({ databaseUrl: config.databaseUrl, log: app.log })
  app.decorate('realtime', realtime)
  app.addHook('onReady', () => realtime.start())
  app.addHook('preClose', () => realtime.stop()) // open SSE streams would block close()

  app.get('/api/health', async () => {
    await pool.query('SELECT 1')
    return { ok: true }
  })

  const deps = { pool, config, realtime, telegram }
  await app.register(authRoutes, deps)
  await app.register(collectionRoutes, deps)
  await app.register(realtimeRoutes, deps)
  await app.register(crmRoutes, deps)
  await app.register(publicRoutes, deps)
  await app.register(telegramRoutes, deps)
  await app.register(adminRoutes, deps)

  return app
}
