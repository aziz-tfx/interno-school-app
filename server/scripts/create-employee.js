// Create a staff account from the server side — when it has to be done by a
// one-off task rather than on the «Сотрудники» page. Never touches an
// existing login: if it is taken, the script stops and changes nothing.
//
//   printf '%s' "$PASSWORD" | node scripts/create-employee.js \
//     --login=mashxura --name='Машхура' --role=branch_admin --branch=tashkent [--tenant=default]
//
// The password comes on stdin, not in the arguments, so it never shows up in
// the process list or the shell history.

import { createPool } from '../src/db.js'
import { hashPassword } from '../src/auth.js'

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split(/=(.*)/s)))
const tenantId = args.tenant || 'default'
const COMPANY_WIDE = ['owner', 'admin', 'accountant', 'financier', 'hr', 'smm']

let password = ''
for await (const chunk of process.stdin) password += chunk
password = password.replace(/[\r\n]+$/, '')

const login = String(args.login || '').trim().toLowerCase()
const role = args.role
const branch = COMPANY_WIDE.includes(role) ? 'all' : args.branch
if (!login || !args.name || !role || !branch || password.length < 8) {
  console.error('usage: <password on stdin, min 8 chars> --login=… --name=… --role=… --branch=… [--tenant=default]')
  process.exit(1)
}

const pool = createPool(process.env.DATABASE_URL)
try {
  const { rows: [taken] } = await pool.query(
    'SELECT id, data->>\'name\' AS name FROM employees WHERE tenant_id = $1 AND login = $2', [tenantId, login]
  )
  if (taken) {
    console.error(`login ${login} is already taken by ${taken.name} (${taken.id}) — nothing changed`)
    process.exit(2)
  }
  // a branch of this school, or one its staff already work in
  const { rows: [knownBranch] } = await pool.query(
    `SELECT 1 FROM branches WHERE tenant_id = $1 AND id = $2
     UNION ALL SELECT 1 FROM employees WHERE tenant_id = $1 AND data->>'branch' = $2 LIMIT 1`,
    [tenantId, branch]
  )
  if (branch !== 'all' && !knownBranch) {
    console.error(`branch ${branch} not found in ${tenantId} — nothing changed`)
    process.exit(2)
  }

  // Same shape the «Сотрудники» form writes (AuthContext.addEmployee)
  const id = String(Date.now())
  const data = {
    id, tenantId, login, name: args.name, role, branch, status: 'active',
    phone: args.phone || '', telegramChatId: '', pbxExt: null,
    amoUserId: null, amoUserName: null, customPermissions: null,
    avatar: args.name.charAt(0).toUpperCase(),
    createdAt: new Date().toISOString(),
  }
  await pool.query(
    'INSERT INTO employees (id, tenant_id, data, password_hash) VALUES ($1, $2, $3, $4)',
    [id, tenantId, data, await hashPassword(password)]
  )
  console.log(`${role} ${login} (${args.name}, ${branch}) created: ${id}`)
} finally {
  await pool.end()
}
