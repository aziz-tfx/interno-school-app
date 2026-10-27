// Test harness: each test file gets a freshly migrated database
// (TEST_DATABASE_URL, default postgres://postgres@localhost:5432/interno_test),
// an app instance and seeded users in two schools.

import { after, before } from 'node:test'
import pg from 'pg'
import { loadConfig } from '../src/config.js'
import { createPool } from '../src/db.js'
import { migrate } from '../src/migrate.js'
import { buildApp } from '../src/app.js'
import { hashPassword } from '../src/auth.js'

process.env.NODE_ENV = 'test'
const DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres@localhost:5432/interno_test'

async function resetDatabase() {
  const client = new pg.Client({ connectionString: DATABASE_URL })
  await client.connect()
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await client.end()
}

export const USERS = {
  owner:   { id: 'e-owner', tenant: 'school-a', login: 'owner', password: 'owner-pass', role: 'owner', name: 'Азиз' },
  sales:   { id: 'e-sales', tenant: 'school-a', login: '998901112233', password: 'sales-pass', role: 'sales', name: 'Гулнора', managerId: 'mgr_1' },
  teacher: { id: 'e-teach', tenant: 'school-a', login: 'teacher1', password: 'teach-pass', role: 'teacher', name: 'Елена' },
  student: { id: 'e-stud', tenant: 'school-a', login: '998935435567', password: 'stud-pass', role: 'student', name: 'Алексей', studentId: 'st-1' },
  fired:   { id: 'e-fired', tenant: 'school-a', login: 'fired', password: 'fired-pass', role: 'sales', name: 'Уволен', status: 'fired' },
  otherOwner: { id: 'e-b-owner', tenant: 'school-b', login: 'owner', password: 'b-pass', role: 'owner', name: 'Другая школа' },
}

/**
 * Sets up db + app for the calling test file; returns a context object.
 * opts.env — extra env for loadConfig; opts.telegram — fake Bot API.
 */
export function setup(opts = {}) {
  const ctx = { tokens: {} }

  before(async () => {
    await resetDatabase()
    const config = loadConfig({ ...process.env, ...opts.env, NODE_ENV: 'test', DATABASE_URL })
    ctx.config = config
    ctx.pool = createPool(DATABASE_URL)
    await migrate(ctx.pool, () => {})
    for (const t of ['school-a', 'school-b']) {
      await ctx.pool.query('INSERT INTO tenants (id, tenant_id, data) VALUES ($1, $1, $2)', [t, { name: t }])
    }
    for (const u of Object.values(USERS)) {
      const { id, tenant, password, ...data } = u
      await ctx.pool.query(
        'INSERT INTO employees (id, tenant_id, data, password_hash) VALUES ($1, $2, $3, $4)',
        [id, tenant, { ...data, tenantId: tenant, status: data.status || 'active' }, await hashPassword(password)]
      )
    }
    ctx.app = await buildApp({ config, pool: ctx.pool, ...(opts.telegram && { telegram: opts.telegram }) })
    await ctx.app.ready()
    for (const [key, u] of Object.entries(USERS)) {
      if (u.status === 'fired') continue
      const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: u.login, password: u.password, tenantId: u.tenant } })
      ctx.tokens[key] = res.json().token
    }
  })

  after(async () => {
    await ctx.app?.close()
    await ctx.pool?.end()
  })

  /** app.inject() as a given user: ctx.as('owner').get('/api/…') */
  ctx.as = (who) => {
    const headers = who ? { authorization: `Bearer ${ctx.tokens[who]}` } : {}
    const call = (method) => (url, payload) => ctx.app.inject({ method, url, payload, headers })
    return { get: call('GET'), post: call('POST'), put: call('PUT'), patch: call('PATCH'), delete: call('DELETE') }
  }
  return ctx
}
