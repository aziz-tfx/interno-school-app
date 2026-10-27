// Firestore → PostgreSQL import of every ERP collection.
//
// Re-runnable: rows are upserted by document id and only rewritten when the
// document changed, so it can run repeatedly while the old app is still live
// and once more at cut-over. Documents deleted in Firestore are NOT deleted
// here (pass prune to do that at cut-over).
//
// Employee passwords are plain text in Firestore; here they're bcrypt-hashed
// into employees.password_hash and removed from the document.

import bcrypt from 'bcryptjs'
import { COLLECTIONS } from './collections.js'
import { hashPassword } from './auth.js'

export const DEFAULT_TENANT_ID = 'default'

// Firestore docs the new system doesn't need.
const SKIP = { settings: new Set(['bootstrap']) }

/**
 * Which school a document belongs to. Most docs carry tenantId; per-school
 * singletons encode it in the id (attendance/_meta_<tid>, settings/permissions_<tid>,
 * tenantIntegrations/<tid>); legacy un-suffixed docs belong to the default school.
 */
export function tenantOf(collection, id, data) {
  if (collection === 'tenants' || collection === 'tenantIntegrations') return id
  if (data?.tenantId) return String(data.tenantId)
  const m = id.match(/^(?:_meta_|permissions_)(.+)$/)
  if (m) return m[1]
  return DEFAULT_TENANT_ID
}

/** Firestore value types → plain JSON (Timestamp → ISO string, etc.). */
export function toJson(v) {
  if (v === null || v === undefined) return v ?? null
  if (Array.isArray(v)) return v.map(toJson)
  if (typeof v !== 'object') return v
  if (typeof v.toDate === 'function') return v.toDate().toISOString()               // Timestamp
  if (typeof v.latitude === 'number' && typeof v.longitude === 'number' && Object.keys(v).length <= 2) {
    return { lat: v.latitude, lng: v.longitude }                                    // GeoPoint
  }
  if (typeof v.path === 'string' && typeof v.firestore === 'object') return v.path   // DocumentReference
  if (v instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(v))) {
    return Buffer.from(v).toString('base64')                                        // Bytes
  }
  const out = {}
  for (const [k, val] of Object.entries(v)) if (val !== undefined) out[k] = toJson(val)
  return out
}

function createdAtOf(data) {
  for (const k of ['createdAt', 'timestamp', 'date']) {
    const t = Date.parse(data?.[k])
    if (!Number.isNaN(t)) return new Date(t)
  }
  return null
}

/**
 * @param {object} p
 * @param {import('pg').Pool} p.pool
 * @param {{ docs: (collection: string) => AsyncIterable<{id: string, data: object}> }} p.source
 * @param {string[]} [p.only]   Firestore collection names to import (default: all)
 * @param {boolean} [p.dryRun]
 * @param {boolean} [p.prune]   delete Postgres rows whose Firestore doc is gone
 */
export async function importFromFirestore({ pool, source, only, dryRun = false, prune = false, log = () => {} }) {
  const stats = {}
  const names = only?.length ? only : Object.keys(COLLECTIONS)

  for (const name of names) {
    const col = COLLECTIONS[name]
    if (!col) throw new Error(`Unknown collection ${name}`)
    const s = { read: 0, written: 0, unchanged: 0, skipped: 0, failed: 0, pruned: 0 }
    const seen = new Set()

    for await (const { id, data: raw } of source.docs(name)) {
      s.read++
      seen.add(id)
      if (SKIP[name]?.has(id)) { s.skipped++; continue }
      const data = toJson(raw) || {}
      const tenantId = tenantOf(name, id, data)
      data.tenantId = tenantId
      if (dryRun) continue

      // One bad document (e.g. a \u0000 that jsonb rejects) must not stop
      // the import of the other thousands — report it and go on.
      try {
        const changed = col.table === 'employees'
          ? await upsertEmployee(pool, id, tenantId, data)
          : (await pool.query(
              `INSERT INTO ${col.table} (id, tenant_id, data, created_at) VALUES ($1, $2, $3, coalesce($4, now()))
               ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, data = EXCLUDED.data
                 WHERE ${col.table}.data IS DISTINCT FROM EXCLUDED.data OR ${col.table}.tenant_id IS DISTINCT FROM EXCLUDED.tenant_id`,
              [id, tenantId, data, createdAtOf(data)]
            )).rowCount > 0
        changed ? s.written++ : s.unchanged++
      } catch (err) {
        s.failed++
        log(`  ! ${name}/${id}: ${err.message}`)
      }
    }

    if (prune && !dryRun && s.read > 0) {
      const { rowCount } = await pool.query(`DELETE FROM ${col.table} WHERE NOT (id = ANY($1::text[]))`, [[...seen]])
      s.pruned = rowCount
    }
    stats[name] = s
    log(`${name}: ${JSON.stringify(s)}`)
  }

  if (!dryRun) {
    // Every school referenced anywhere must exist (public forms check it).
    await pool.query(
      `INSERT INTO tenants (id, tenant_id, data)
       SELECT DISTINCT tenant_id, tenant_id, jsonb_build_object('id', tenant_id) FROM employees
       ON CONFLICT (id) DO NOTHING`
    )
  }
  return stats
}

/** Upsert an employee, hashing the plain password. Returns whether anything changed. */
async function upsertEmployee(pool, id, tenantId, data) {
  const plain = typeof data.password === 'string' ? data.password.trim() : ''
  delete data.password
  // Compare in SQL: jsonb reorders keys, so JSON.stringify would always differ.
  const { rows: [cur] } = await pool.query(
    'SELECT tenant_id, password_hash, data IS DISTINCT FROM $2::jsonb AS data_changed FROM employees WHERE id = $1',
    [id, data]
  )

  // Re-hash only when the password actually changed (bcrypt is slow, and a
  // new hash must bump token_version to end old sessions).
  let hash = cur?.password_hash || null
  let passwordChanged = false
  if (plain && !(hash && await bcrypt.compare(plain, hash))) {
    hash = await hashPassword(plain)
    passwordChanged = !!cur
  }

  if (!cur) {
    await pool.query(
      'INSERT INTO employees (id, tenant_id, data, password_hash, created_at) VALUES ($1, $2, $3, $4, coalesce($5, now()))',
      [id, tenantId, data, hash, createdAtOf(data)]
    )
    return true
  }
  const dataChanged = cur.data_changed || cur.tenant_id !== tenantId
  if (!dataChanged && !passwordChanged) return false
  await pool.query(
    `UPDATE employees SET tenant_id = $2, data = $3, password_hash = $4,
       token_version = token_version + $5::int WHERE id = $1`,
    [id, tenantId, data, hash, passwordChanged ? 1 : 0]
  )
  return true
}
