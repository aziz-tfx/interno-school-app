import bcrypt from 'bcryptjs'
import { verifyLogin, tokenClaims, hashPassword } from '../auth.js'
import { loadTelegramConfig } from '../telegram.js'
import { tx } from '../db.js'
import { verifyTelegramInitData } from './public.js'

export default async function authRoutes(app, { pool, config }) {
  app.post('/api/auth/login', {
    config: { rateLimit: { max: config.authRateLimit, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['login', 'password'],
        properties: {
          login: { type: 'string', maxLength: 200 },
          password: { type: 'string', maxLength: 200 },
          tenantId: { type: 'string', maxLength: 100 },
        },
      },
    },
  }, async (req, reply) => {
    const result = await verifyLogin(pool, req.body)
    if (result.error) return reply.code(result.status).send({ error: result.error })
    const token = app.jwt.sign(tokenClaims(result.row), { expiresIn: config.jwtTtl })
    return { token, user: result.user }
  })

  app.get('/api/auth/me', { preHandler: app.authenticate }, async (req) => ({ user: req.user }))

  // Change own password. Bumps token_version → every other session ends;
  // the caller gets a fresh token.
  app.post('/api/auth/password', {
    preHandler: app.authenticate,
    config: { rateLimit: { max: config.authRateLimit, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['current', 'next'],
        properties: {
          current: { type: 'string', maxLength: 200 },
          next: { type: 'string', minLength: 6, maxLength: 200 },
        },
      },
    },
  }, async (req, reply) => {
    const { rows } = await pool.query('SELECT password_hash FROM employees WHERE id = $1', [req.user.employeeId])
    const ok = rows[0]?.password_hash && await bcrypt.compare(req.body.current, rows[0].password_hash)
    if (!ok) return reply.code(400).send({ error: 'Текущий пароль неверный' })
    const { rows: [row] } = await pool.query(
      `UPDATE employees SET password_hash = $2, token_version = token_version + 1
        WHERE id = $1 RETURNING *`,
      [req.user.employeeId, await hashPassword(req.body.next)]
    )
    return { token: app.jwt.sign(tokenClaims(row), { expiresIn: config.jwtTtl }) }
  })

  // "Выйти на всех устройствах"
  app.post('/api/auth/logout-all', { preHandler: app.authenticate }, async (req) => {
    await pool.query('UPDATE employees SET token_version = token_version + 1 WHERE id = $1', [req.user.employeeId])
    return { ok: true }
  })

  // ─── Telegram mini app sign-in ────────────────────────────────────────
  // Called from inside the mini app after a password login: Telegram's
  // signed initData proves which Telegram account is holding this session,
  // and from then on opening the bot's app signs this person in directly
  // (POST /api/public/telegram-login). One Telegram ↔ one account per school.
  app.post('/api/auth/telegram-link', {
    preHandler: app.authenticate,
    config: { rateLimit: { max: config.authRateLimit, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['initData'],
        properties: { initData: { type: 'string', minLength: 1, maxLength: 4096 } },
      },
    },
  }, async (req, reply) => {
    const { tenantId, employeeId, role, studentId } = req.user
    const { botToken } = await loadTelegramConfig(pool, tenantId)
    const tgUser = verifyTelegramInitData(req.body.initData, botToken)
    if (!tgUser) return reply.code(400).send({ error: 'Не удалось проверить данные Telegram. Откройте приложение через бота школы.' })

    await tx(pool, async (client) => {
      // the Telegram account moves to this person (e.g. a shared phone, a new job)
      await client.query(
        'UPDATE employees SET telegram_user_id = NULL WHERE tenant_id = $1 AND telegram_user_id = $2 AND id <> $3',
        [tenantId, tgUser.id, employeeId]
      )
      await client.query('UPDATE employees SET telegram_user_id = $2 WHERE id = $1', [employeeId, tgUser.id])
      // Students also get payment reminders in this chat, like the bot's /start link
      if (role === 'student' && studentId) {
        await client.query(
          `UPDATE students SET data = data || jsonb_build_object('telegramChatId', $3::bigint, 'telegramLinkedAt', $4::text)
            WHERE id = $1 AND tenant_id = $2 AND coalesce(data->>'telegramChatId', '') = ''`,
          [studentId, tenantId, tgUser.id, new Date().toISOString()]
        )
      }
    })
    return { ok: true, telegramLinked: true }
  })

  app.delete('/api/auth/telegram-link', { preHandler: app.authenticate }, async (req) => {
    await pool.query('UPDATE employees SET telegram_user_id = NULL WHERE id = $1', [req.user.employeeId])
    return { ok: true, telegramLinked: false }
  })
}
