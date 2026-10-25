// Live updates — replaces Firestore onSnapshot().
//
// Table triggers NOTIFY 'changes' with {table, tenant, id, op} (see
// 001_core.sql). One LISTEN connection per process fans these out over
// Server-Sent Events to the browsers of that school. Events carry only ids:
// the client re-fetches the document through the normal API, which applies
// all access rules.
//
// EventSource can't send an Authorization header and tokens in URLs end up
// in access logs, so the client first trades its JWT for a single-use
// ticket (valid 60 s) and opens the stream with that.

import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { getCollection, canRead, TABLE_TO_COLLECTION, isStudent } from './collections.js'

const TICKET_TTL_MS = 60_000
const HEARTBEAT_MS = 25_000 // keep proxies from closing idle streams
const CRM_TABLES = new Set(['crm_leads', 'crm_tasks', 'crm_activities', 'crm_stages'])

export function createRealtime({ databaseUrl, log }) {
  const tickets = new Map()     // ticket → { user, expiresAt }
  const subscribers = new Set() // { user, tables:Set, send, close }
  let listener = null
  let stopped = false

  async function connect(attempt = 0) {
    if (stopped) return
    const client = new pg.Client({ connectionString: databaseUrl })
    client.on('notification', (msg) => {
      let evt
      try { evt = JSON.parse(msg.payload) } catch { return }
      dispatch(evt)
    })
    client.on('error', (err) => {
      log.error({ err }, 'realtime listener lost')
      listener = null
      client.end().catch(() => {})
      setTimeout(() => connect(attempt + 1), Math.min(30_000, 1000 * 2 ** attempt))
    })
    try {
      await client.connect()
      await client.query('LISTEN changes')
      listener = client
    } catch (err) {
      log.error({ err }, 'realtime listener connect failed')
      client.end().catch(() => {})
      setTimeout(() => connect(attempt + 1), Math.min(30_000, 1000 * 2 ** attempt))
    }
  }

  function dispatch(evt) {
    for (const sub of subscribers) {
      if (sub.user.tenantId !== evt.tenant) continue
      // A change to the subscriber's own employee record (fired, password
      // changed) → drop the stream; the client must log in again.
      if (evt.table === 'employees' && evt.id === sub.user.employeeId) sub.recheck()
      if (!sub.tables.has(evt.table)) continue
      sub.send({ collection: TABLE_TO_COLLECTION[evt.table] || evt.table, id: evt.id, op: evt.op })
    }
  }

  function issueTicket(user) {
    const now = Date.now()
    for (const [t, v] of tickets) if (v.expiresAt < now) tickets.delete(t)
    const ticket = randomBytes(24).toString('base64url')
    tickets.set(ticket, { user, expiresAt: now + TICKET_TTL_MS })
    return ticket
  }

  function redeemTicket(ticket) {
    const entry = tickets.get(ticket)
    tickets.delete(ticket)
    return entry && entry.expiresAt >= Date.now() ? entry.user : null
  }

  /** Tables a user may watch, from the requested Firestore/CRM names. */
  function allowedTables(user, names) {
    const tables = new Set()
    for (const name of names) {
      if (CRM_TABLES.has(name)) {
        if (!isStudent(user)) tables.add(name)
        continue
      }
      const col = getCollection(name)
      if (col && canRead(col, user)) tables.add(col.table)
    }
    return tables
  }

  return {
    start: () => connect(),
    async stop() {
      stopped = true
      for (const sub of subscribers) sub.close()
      await listener?.end().catch(() => {})
    },
    issueTicket,
    redeemTicket,
    allowedTables,
    /** Attach an SSE stream; returns an unsubscribe function. */
    subscribe(user, tables, raw, recheck, headers = {}) {
      raw.writeHead(200, {
        ...headers, // CORS headers set by @fastify/cors before the reply was hijacked
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      raw.write(`event: ready\ndata: ${JSON.stringify({ collections: [...tables].map(t => TABLE_TO_COLLECTION[t] || t) })}\n\n`)
      const sub = {
        user,
        tables,
        send: (data) => raw.write(`event: change\ndata: ${JSON.stringify(data)}\n\n`),
        close: () => { cleanup(); raw.end() },
        recheck: async () => { if (!(await recheck())) sub.close() },
      }
      const heartbeat = setInterval(() => raw.write(': ping\n\n'), HEARTBEAT_MS)
      const cleanup = () => { clearInterval(heartbeat); subscribers.delete(sub) }
      raw.on('close', cleanup)
      subscribers.add(sub)
      return cleanup
    },
    get size() { return subscribers.size },
  }
}

export default async function realtimeRoutes(app, { pool, realtime }) {
  app.post('/api/realtime/ticket', { preHandler: app.authenticate }, async (req) => ({
    ticket: realtime.issueTicket(req.user),
  }))

  // GET /api/realtime?ticket=…&collections=students,payments,crm_leads
  app.get('/api/realtime', async (req, reply) => {
    const user = realtime.redeemTicket(String(req.query.ticket || ''))
    if (!user) return reply.code(401).send({ error: 'Недействительный тикет' })
    const names = String(req.query.collections || '').split(',').map(s => s.trim()).filter(Boolean)
    const tables = realtime.allowedTables(user, names)

    const recheck = async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM employees WHERE id = $1 AND token_version = $2
           AND coalesce(status, '') NOT IN ('fired', 'pending', 'rejected')
           AND coalesce((data->>'deleted')::boolean, false) = false`,
        [user.employeeId, user.tokenVersion]
      )
      return rows.length > 0
    }

    reply.hijack()
    realtime.subscribe(user, tables, reply.raw, recheck, reply.getHeaders())
  })
}
