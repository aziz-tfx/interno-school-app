// The part of the firebase-admin Firestore API that the former Vercel
// functions (AI agent, Payme) use, on top of this server's document tables.
// Lets that code move here almost unchanged. Server-side only: no user, no
// access checks — callers authenticate the request themselves.
//
//   db.collection('payments').doc(id).get() / .set(data, { merge }) / .update(patch) / .delete()
//   db.collection('payments').add(data)
//   db.collection('payments').where(f, op, v).orderBy(f, dir).limit(n).get()
//   db.runTransaction(async (tx) => { await tx.get(ref); tx.set(ref, …); tx.update(ref, …) })
//
// Transactions lock each document they read (advisory lock on table + id, so
// it also covers documents that don't exist yet) until commit — the same
// guarantee Firestore gives: a concurrent transaction on that document waits.

import { getCollection } from '../../collections.js'
import { tx as withTx } from '../../db.js'
import { newDocId } from '../../lib/ids.js'
import { prepareDoc, mergeDoc, applyUpdate } from '../../lib/patch.js'

let pool = null
export function setPool(p) { pool = p }

function tableOf(name) {
  const c = getCollection(name)
  if (!c) throw new Error(`Unknown collection ${name}`)
  return c.table
}

class Snapshot {
  constructor(ref, row) {
    this.ref = ref
    this.id = ref.id
    this.exists = !!row
    this._data = row?.data
  }
  data() { return this._data }
}

async function readRow(client, table, id, lock) {
  if (lock) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${table}:${id}`])
  const { rows: [row] } = await client.query(`SELECT tenant_id, data FROM ${table} WHERE id = $1`, [id])
  return row || null
}

async function writeRow(client, table, id, data, current) {
  const tenantId = String(data.tenantId || current?.tenant_id || 'default')
  await client.query(
    `INSERT INTO ${table} (id, tenant_id, data) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, data = EXCLUDED.data`,
    [id, tenantId, data]
  )
}

function nextData(current, data, mode) {
  if (mode === 'update') {
    if (!current) {
      const err = new Error('No document to update')
      err.code = 5 // Firestore NOT_FOUND
      throw err
    }
    return applyUpdate(current.data, data)
  }
  if (mode === 'merge') return current ? mergeDoc(current.data, data) : prepareDoc(data)
  return prepareDoc(data)
}

class DocRef {
  constructor(collection, id) {
    this.collection = collection
    this.table = tableOf(collection)
    this.id = String(id)
    this.path = `${collection}/${this.id}`
  }
  async get() { return new Snapshot(this, await readRow(pool, this.table, this.id, false)) }
  async set(data, opts = {}) { await this._write(data, opts.merge ? 'merge' : 'set') }
  async update(patch) { await this._write(patch, 'update') }
  async delete() { await pool.query(`DELETE FROM ${this.table} WHERE id = $1`, [this.id]) }
  async _write(data, mode) {
    await withTx(pool, async (client) => {
      const current = await readRow(client, this.table, this.id, true)
      await writeRow(client, this.table, this.id, nextData(current, data, mode), current)
    })
  }
}

const OPS = new Set(['==', '!=', '<', '<=', '>', '>=', 'in', 'array-contains'])

class Query {
  constructor(collection, { filters = [], order = null, max = null } = {}) {
    this.collection = collection
    this.table = tableOf(collection)
    this._filters = filters
    this._order = order
    this._max = max
  }
  where(field, op, value) {
    if (!OPS.has(op)) throw new Error(`Unsupported where operator ${op}`)
    return new Query(this.collection, { ...this._state(), filters: [...this._filters, { field, op, value }] })
  }
  orderBy(field, direction = 'asc') {
    return new Query(this.collection, { ...this._state(), order: { field, desc: direction === 'desc' } })
  }
  limit(n) { return new Query(this.collection, { ...this._state(), max: Number(n) }) }
  _state() { return { filters: this._filters, order: this._order, max: this._max } }

  async get() {
    const params = []
    const p = (v) => { params.push(v); return `$${params.length}` }
    const path = (field) => `data #>> ${p(String(field).split('.'))}::text[]`
    const conds = this._filters.map(({ field, op, value }) => {
      if (op === 'in') return `data #> ${p(String(field).split('.'))}::text[] = ANY(${p(value.map(v => JSON.stringify(v)))}::jsonb[])`
      if (op === 'array-contains') return `data #> ${p(String(field).split('.'))}::text[] @> ${p(JSON.stringify([value]))}::jsonb`
      if (typeof value === 'number') return `safe_numeric(${path(field)}) ${op === '==' ? '=' : op} ${p(value)}`
      if (typeof value === 'string') return `(${path(field)}) COLLATE "C" ${op === '==' ? '=' : op} ${p(value)}`
      // booleans and null: exact JSON comparison
      const json = `data #> ${p(String(field).split('.'))}::text[]`
      const eq = value === null ? `(${json} IS NULL OR ${json} = 'null'::jsonb)` : `${json} = ${p(JSON.stringify(value))}::jsonb`
      if (op === '==') return eq
      if (op === '!=') return `NOT ${eq}`
      throw new Error(`Operator ${op} needs a string or number`)
    })
    let sql = `SELECT id, data FROM ${this.table}${conds.length ? ` WHERE ${conds.join(' AND ')}` : ''}`
    if (this._order) sql += ` ORDER BY ${path(this._order.field)} COLLATE "C" ${this._order.desc ? 'DESC' : 'ASC'}`
    if (this._max) sql += ` LIMIT ${p(this._max)}`
    const { rows } = await pool.query(sql, params)
    const docs = rows.map(r => new Snapshot(new DocRef(this.collection, r.id), r))
    return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn) => docs.forEach(fn) }
  }
}

class CollectionRef extends Query {
  doc(id) { return new DocRef(this.collection, id ?? newDocId()) }
  async add(data) {
    const ref = this.doc()
    await ref.set(data)
    return ref
  }
}

class Transaction {
  constructor(client) { this.client = client; this.read = new Map(); this.writes = Promise.resolve() }
  async get(ref) {
    const row = await readRow(this.client, ref.table, ref.id, true)
    this.read.set(ref.path, row)
    return new Snapshot(ref, row)
  }
  async _write(ref, data, mode) {
    const current = this.read.has(ref.path) ? this.read.get(ref.path) : await readRow(this.client, ref.table, ref.id, true)
    const next = nextData(current, data, mode)
    await writeRow(this.client, ref.table, ref.id, next, current)
    this.read.set(ref.path, { tenant_id: next.tenantId || current?.tenant_id, data: next })
  }
  // Firestore queues writes and returns the transaction synchronously; here
  // they run one after another on the transaction's connection and are
  // awaited before commit. The no-op catch only keeps a failed write from
  // counting as an unhandled rejection meanwhile — runTransaction still throws.
  set(ref, data, opts = {}) { return this._queue(() => this._write(ref, data, opts.merge ? 'merge' : 'set')) }
  update(ref, patch) { return this._queue(() => this._write(ref, patch, 'update')) }
  _queue(write) {
    this.writes = this.writes.then(write)
    this.writes.catch(() => {})
    return this
  }
}

const db = {
  collection: (name) => new CollectionRef(name),
  async runTransaction(fn) {
    return withTx(pool, async (client) => {
      const t = new Transaction(client)
      const result = await fn(t)
      await t.writes
      return result
    })
  },
}

/** The Firestore-like handle; null until setPool() ran (mirrors getDb() on Vercel). */
export function getDb() { return pool ? db : null }
