import bcrypt from 'bcryptjs'
import { verifyLogin, tokenClaims, hashPassword } from '../auth.js'

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
}
