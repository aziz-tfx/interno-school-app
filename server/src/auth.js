// Authentication: login against the employees table (students log in
// through it too), bcrypt password hashes, JWT sessions.
//
// Login rules are ported from the frontend's AuthContext.login():
//   - text logins match case-insensitively;
//   - phone logins match on the digits after the 998 country code, so
//     "+998 90 123-45-67", "901234567" and "998901234567" are the same;
//   - one login may exist in several schools — the client can pass tenantId
//     to pick one (AuthContext used the last session's tenant).

import bcrypt from 'bcryptjs'

export const BCRYPT_ROUNDS = 10

export const hashPassword = (plain) => bcrypt.hash(String(plain), BCRYPT_ROUNDS)

const BLOCKED_STATUS_MESSAGES = {
  pending: 'Ваша заявка на регистрацию ещё не одобрена. Обратитесь к администратору.',
  rejected: 'Ваша заявка на регистрацию была отклонена.',
  fired: 'Доступ к системе закрыт. Обратитесь к администратору.',
}

/** Employee row → the user object the frontend works with (no secrets). */
export function publicUser(row) {
  const { password, ...data } = row.data || {}
  return { ...data, _docId: row.id, tenantId: row.tenant_id }
}

/**
 * Check credentials. Returns { user, row } or { error, status }.
 * @param {import('pg').Pool} pool
 */
export async function verifyLogin(pool, { login, password, tenantId }) {
  const rawLogin = String(login ?? '').trim()
  const rawPass = String(password ?? '').trim()
  if (!rawLogin || !rawPass) return { error: 'Введите логин и пароль', status: 400 }

  const tail = rawLogin.replace(/\D/g, '').replace(/^998/, '')
  const { rows } = await pool.query(
    `SELECT * FROM employees
      WHERE (login = lower($1) OR (length($2) >= 7 AND login_tail = $2))
        AND coalesce((data->>'deleted')::boolean, false) = false`,
    [rawLogin, tail]
  )

  const matches = []
  for (const row of rows) {
    if (row.password_hash && await bcrypt.compare(rawPass, row.password_hash)) matches.push(row)
  }
  const found = matches.find(r => tenantId && r.tenant_id === tenantId) || matches[0]
  if (!found) return { error: 'Неверный логин или пароль', status: 401 }

  const blocked = BLOCKED_STATUS_MESSAGES[found.status]
  if (blocked) return { error: blocked, status: 403 }
  return { row: found, user: publicUser(found) }
}

/** JWT claims for an employee row. */
export const tokenClaims = (row) => ({ sub: row.id, tid: row.tenant_id, v: row.token_version })

/**
 * Fastify preHandler: verifies the bearer token and loads the employee, so
 * a fired employee or a password change (token_version bump) takes effect
 * on the very next request — not when the 7-day token expires.
 */
export function authenticate(pool) {
  return async function (req, reply) {
    let claims
    try {
      claims = await req.jwtVerify()
    } catch {
      return reply.code(401).send({ error: 'Требуется вход в систему' })
    }
    const { rows } = await pool.query('SELECT * FROM employees WHERE id = $1', [claims.sub])
    const row = rows[0]
    if (!row || row.token_version !== claims.v || row.tenant_id !== claims.tid
        || BLOCKED_STATUS_MESSAGES[row.status] || row.data?.deleted) {
      return reply.code(401).send({ error: 'Сессия завершена, войдите снова' })
    }
    // employeeId = document id (what FKs like crm_leads.responsible_id use);
    // data.id is the legacy numeric id some frontend code still relies on.
    req.user = {
      ...publicUser(row),
      employeeId: row.id,
      role: row.role,
      tenantId: row.tenant_id,
      tokenVersion: row.token_version,
    }
  }
}
