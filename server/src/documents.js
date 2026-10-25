// Document store over the ERP tables — the server-side equivalent of the
// Firestore calls the frontend makes (getDocs/query, getDoc, addDoc, setDoc,
// updateDoc, deleteDoc, writeBatch). Every function is tenant-scoped and
// applies the access rules from collections.js.

import { getCollection, canRead, canWrite, ownRowSql, ownsDoc, isAdmin, ADMIN_ROLES, PEOPLE_ROLES } from './collections.js'
import { newDocId } from './lib/ids.js'
import { prepareDoc, mergeDoc, applyUpdate } from './lib/patch.js'
import { hashPassword } from './auth.js'
import { HttpError, notFound, forbidden, badRequest } from './lib/errors.js'

const FIELD_RE = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/
const MAX_LIMIT = 5000
export const MAX_BATCH = 500 // same as Firestore's writeBatch limit

// { id, data } rather than { ...data, id }: some documents carry their own
// `id` field (employees have a legacy numeric id), which must survive.
const toDoc = (row) => ({ id: row.id, data: row.data })

export function resolveCollection(name, user, mode) {
  const col = getCollection(name)
  if (!col) throw notFound(`Неизвестная коллекция ${name}`)
  if (mode === 'read' ? !canRead(col, user) : !canWrite(col, user)) throw forbidden()
  return col
}

// ─── Queries ─────────────────────────────────────────────────────────────

/**
 * where: [[field, op, value], …] with Firestore operators.
 * Comparisons are type-strict like Firestore: '5' never matches 5, and range
 * filters only match values of the same JSON type.
 */
function buildWhere(where, params) {
  const p = (v) => { params.push(v); return `$${params.length}` }
  const clauses = []
  for (const cond of where || []) {
    if (!Array.isArray(cond) || cond.length !== 3) throw badRequest('where: ожидается [поле, оператор, значение]')
    const [field, op, value] = cond
    if (typeof field !== 'string' || !FIELD_RE.test(field)) throw badRequest(`Недопустимое поле ${field}`)

    if (field === 'id') {
      if (op === '==') clauses.push(`id = ${p(String(value))}`)
      else if (op === 'in') clauses.push(`id = ANY(${p((value || []).map(String))}::text[])`)
      else throw badRequest('Для id поддерживаются только == и in')
      continue
    }

    const f = `(data #> ${p(field.split('.'))}::text[])`
    const v = () => `${p(JSON.stringify(value ?? null))}::jsonb`
    switch (op) {
      case '==': clauses.push(`${f} = ${v()}`); break
      case '!=': clauses.push(`(${f} IS NOT NULL AND ${f} <> ${v()})`); break
      case '<': case '<=': case '>': case '>=': {
        const val = v()
        clauses.push(`(jsonb_typeof(${f}) = jsonb_typeof(${val}) AND ${f} ${op} ${val})`)
        break
      }
      case 'in':
        if (!Array.isArray(value)) throw badRequest('in: ожидается массив')
        clauses.push(`${f} IN (SELECT jsonb_array_elements(${v()}))`)
        break
      case 'array-contains':
        clauses.push(`(jsonb_typeof(${f}) = 'array' AND ${f} @> jsonb_build_array(${v()}))`)
        break
      case 'array-contains-any':
        if (!Array.isArray(value)) throw badRequest('array-contains-any: ожидается массив')
        clauses.push(`(jsonb_typeof(${f}) = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(${v()}) e WHERE ${f} @> jsonb_build_array(e)))`)
        break
      default:
        throw badRequest(`Оператор ${op} не поддерживается`)
    }
  }
  return clauses
}

export async function listDocs(pool, user, name, { where, orderBy, direction = 'asc', limit, offset } = {}) {
  const col = resolveCollection(name, user, 'read')
  const params = [user.tenantId]
  const clauses = ['tenant_id = $1', ...buildWhere(where, params)]
  const own = ownRowSql(col, user, `$${params.length + 1}`)
  if (own) {
    params.push(user.studentId ?? '')
    clauses.push(own)
  }

  let order = 'id'
  if (orderBy) {
    if (!FIELD_RE.test(orderBy)) throw badRequest(`Недопустимое поле ${orderBy}`)
    params.push(orderBy.split('.'))
    order = `data #> $${params.length}::text[] ${direction === 'desc' ? 'DESC' : 'ASC'} NULLS LAST, id`
  }
  const lim = Math.min(Number(limit) || MAX_LIMIT, MAX_LIMIT)
  const off = Math.max(Number(offset) || 0, 0)

  const { rows } = await pool.query(
    `SELECT id, data FROM ${col.table} WHERE ${clauses.join(' AND ')} ORDER BY ${order} LIMIT ${lim} OFFSET ${off}`,
    params
  )
  return rows.map(toDoc)
}

export async function getDocument(pool, user, name, id) {
  const col = resolveCollection(name, user, 'read')
  const own = ownRowSql(col, user, '$3')
  const params = own ? [id, user.tenantId, user.studentId ?? ''] : [id, user.tenantId]
  const { rows } = await pool.query(
    `SELECT id, data FROM ${col.table} WHERE id = $1 AND tenant_id = $2 ${own ? `AND ${own}` : ''}`,
    params
  )
  return rows[0] ? toDoc(rows[0]) : null
}

// ─── Writes (each takes a pg client so they compose inside one transaction)

// Fields an employee may NOT change on their own record unless they manage
// employees — otherwise anyone could promote themselves to owner.
const PROTECTED_EMPLOYEE_FIELDS = new Set([
  'role', 'status', 'branch', 'customPermissions', 'isSuperAdmin', 'managerId', 'login', 'tenantId', 'deleted',
])

/**
 * Employee-specific rules. Returns the password hash to store (or undefined)
 * and strips the plain password out of the document.
 */
async function guardEmployeeWrite(user, id, before, after, changedKeys) {
  const self = id === user.employeeId
  const managesPeople = PEOPLE_ROLES.has(user.role)
  // Student LMS accounts live in employees too; any staff member creates
  // them on a sale and resets their passwords. Staying a student is the
  // condition, so this never turns into a way to mint staff accounts.
  const studentAccount = after.role === 'student' && (!before || before.role === 'student')
  if (!managesPeople && !studentAccount) {
    if (!self) throw forbidden()
    if (changedKeys.some(k => PROTECTED_EMPLOYEE_FIELDS.has(k))) {
      throw forbidden('Эти поля может менять только администратор')
    }
  }
  // Only owner/admin hand out (or edit holders of) owner/admin roles.
  const touchesAdmin = ADMIN_ROLES.has(after.role) || ADMIN_ROLES.has(before?.role)
  if (touchesAdmin && !isAdmin(user) && !(self && !changedKeys.includes('role'))) {
    throw forbidden('Роли владельца и администратора назначает только администратор')
  }
  let passwordHash
  if (typeof after.password === 'string' && after.password !== '') {
    passwordHash = await hashPassword(after.password)
  }
  delete after.password
  return passwordHash
}

// Diff instead of trusting the request's keys: a setDoc() that omits `role`
// changes it just as much as one that sets it.
function changedTopLevelKeys(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after)])
  return [...keys].filter(k => k !== 'password' && k !== 'tenantId' && JSON.stringify(before?.[k]) !== JSON.stringify(after[k]))
}

async function lockRow(client, col, id) {
  const { rows } = await client.query(`SELECT tenant_id, data FROM ${col.table} WHERE id = $1 FOR UPDATE`, [id])
  return rows[0] || null
}

/**
 * The single write path. mode:
 *   'create'  addDoc()            — fails if the id exists
 *   'set'     setDoc()            — replace
 *   'merge'   setDoc({merge})     — deep merge, creates if missing
 *   'update'  updateDoc()         — dotted paths, fails if missing
 */
export async function writeDoc(client, user, name, id, body, mode) {
  const col = resolveCollection(name, user, 'write')
  if (body !== null && (typeof body !== 'object' || Array.isArray(body))) throw badRequest('Ожидается объект')
  id = String(id || newDocId())
  if (id.length > 200 || id.includes('/')) throw badRequest('Недопустимый id')

  const existing = mode === 'create' ? null : await lockRow(client, col, id)
  if (existing && existing.tenant_id !== user.tenantId) throw notFound() // never reveal other schools' ids
  if (mode === 'update' && !existing) throw notFound('Документ не найден')

  const before = existing?.data || null
  let after
  if (mode === 'update') after = applyUpdate(before, body)
  else if (mode === 'merge') after = mergeDoc(before, body)
  else after = prepareDoc(body)
  after.tenantId = user.tenantId

  if (!ownsDoc(col, user, id, after) || (before && !ownsDoc(col, user, id, before))) throw forbidden()

  let passwordHash
  if (col.table === 'employees') {
    passwordHash = await guardEmployeeWrite(user, id, before, after, changedTopLevelKeys(before, after))
  }

  if (mode === 'create') {
    try {
      await client.query(
        `INSERT INTO ${col.table} (id, tenant_id, data${passwordHash ? ', password_hash' : ''})
         VALUES ($1, $2, $3${passwordHash ? ', $4' : ''})`,
        passwordHash ? [id, user.tenantId, after, passwordHash] : [id, user.tenantId, after]
      )
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'Документ с таким id уже существует')
      throw err
    }
  } else if (existing) {
    // An admin resetting someone's password ends that person's sessions. Your
    // own change keeps your session (POST /api/auth/password also ends the others).
    const revoke = passwordHash && id !== user.employeeId ? ', token_version = token_version + 1' : ''
    await client.query(
      `UPDATE ${col.table} SET data = $2${passwordHash ? `, password_hash = $3${revoke}` : ''}
        WHERE id = $1`,
      passwordHash ? [id, after, passwordHash] : [id, after]
    )
  } else {
    await client.query(
      `INSERT INTO ${col.table} (id, tenant_id, data${passwordHash ? ', password_hash' : ''})
       VALUES ($1, $2, $3${passwordHash ? ', $4' : ''})`,
      passwordHash ? [id, user.tenantId, after, passwordHash] : [id, user.tenantId, after]
    )
  }
  return { id, data: after }
}

export async function deleteDocument(client, user, name, id) {
  const col = resolveCollection(name, user, 'write')
  const existing = await lockRow(client, col, String(id))
  // Firestore deleteDoc() on a missing doc succeeds silently — keep that.
  if (!existing || existing.tenant_id !== user.tenantId) return
  if (!ownsDoc(col, user, id, existing.data)) throw forbidden()
  if (col.table === 'employees' && !PEOPLE_ROLES.has(user.role) && existing.data?.role !== 'student') throw forbidden()
  await client.query(`DELETE FROM ${col.table} WHERE id = $1`, [String(id)])
}
