// Create (or reset the password of) an owner account — for the first login
// on a fresh server, or when nobody can log in.
//
//   npm run create-owner -- --login=owner --password='…' --name='Азиз' [--tenant=default]

import { createPool } from '../src/db.js'
import { migrate } from '../src/migrate.js'
import { hashPassword } from '../src/auth.js'
import { newDocId } from '../src/lib/ids.js'

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split(/=(.*)/s)))
const tenantId = args.tenant || 'default'
if (!args.login || !args.password || args.password.length < 8) {
  console.error('usage: --login=<login> --password=<min 8 chars> [--name=…] [--tenant=default]')
  process.exit(1)
}

const pool = createPool(process.env.DATABASE_URL)
try {
  await migrate(pool, () => {})
  await pool.query(
    `INSERT INTO tenants (id, tenant_id, data) VALUES ($1, $1, jsonb_build_object('id', $1::text)) ON CONFLICT DO NOTHING`,
    [tenantId]
  )
  const hash = await hashPassword(args.password)
  const { rows: [existing] } = await pool.query(
    'SELECT id FROM employees WHERE tenant_id = $1 AND login = lower($2)', [tenantId, args.login]
  )
  if (existing) {
    await pool.query(
      `UPDATE employees SET password_hash = $2, token_version = token_version + 1,
         data = data || '{"role":"owner","status":"active"}'::jsonb WHERE id = $1`,
      [existing.id, hash]
    )
    console.log(`password reset for ${args.login} (${existing.id}), role set to owner`)
  } else {
    const id = newDocId()
    await pool.query(
      'INSERT INTO employees (id, tenant_id, data, password_hash) VALUES ($1, $2, $3, $4)',
      [id, tenantId, { login: args.login, name: args.name || args.login, role: 'owner', branch: 'all', status: 'active', tenantId }, hash]
    )
    console.log(`owner ${args.login} created (${id})`)
  }
} finally {
  await pool.end()
}
