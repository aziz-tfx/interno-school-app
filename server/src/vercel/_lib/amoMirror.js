// Local copy of the amoCRM data the analytics reports read.
//
// The reports (performance-v2, response-times, calls) used to download a
// month of deals, events and notes from amoCRM on every view — hundreds of
// requests each — which got the integration blocked by amoCRM. Now:
//
//   every minute, and a few seconds after an amoCRM webhook:
//     for each stream, fetch only what changed since the last sync
//     (amo filter on updated_at / created_at, in windows of a week), upsert
//     it into amo_mirror and move the stream's cursor
//   first run: the history is backfilled the same way, window by window,
//     resumable after a restart (deals 13 months back, events / notes 100 days)
//
//   reports → withMirror(tenantId, amoGetAll): a query the mirror covers
//     (stream backfilled, range inside it) is answered from Postgres; anything
//     else (an older month, a filter it doesn't know) goes to amoCRM as before.
//
// Steady state: ~6 small amo requests a minute per school instead of hundreds
// per report view. Deleted deals arrive with the webhook (forgetAmoLeads).

import { amoFetch } from './amoFetch.js'
import { getPool, resolveAmo } from './tenantConfig.js'

const DAY = 86_400
const WINDOW = 7 * DAY          // one request range while catching up
const OVERLAP = 120             // re-read the last 2 minutes: amo timestamps settle late
const RUN_BUDGET_MS = 50_000    // one sync run; a long backfill continues next minute
const SYNC_EVERY_MS = 60_000
const KICK_DELAY_MS = 5_000     // after a webhook: let a burst of changes settle
const MAX_PAGES = 200           // per window (250 items a page)

// Event types the reports use: response times (outgoing) and calls
export const MIRROR_EVENT_TYPES = ['incoming_call', 'outgoing_call', 'outgoing_chat_message', 'sms_out']

export const STREAMS = [
  { stream: 'leads', kind: 'lead', path: '/api/v4/leads', key: 'leads', field: 'updated_at', backfillDays: 400 },
  { stream: 'notes', kind: 'note', path: '/api/v4/leads/notes', key: 'notes', field: 'updated_at', backfillDays: 100 },
  ...MIRROR_EVENT_TYPES.map(t => ({
    stream: `events:${t}`, kind: 'event', path: '/api/v4/events', key: 'events', field: 'created_at', backfillDays: 100,
    extra: `&filter[type]=${t}`,
  })),
]

const nowSec = () => Math.floor(Date.now() / 1000)

// ─── Writing ────────────────────────────────────────────────────────────
async function upsert(pool, tenantId, kind, items) {
  const byId = new Map(items.filter(o => o?.id != null).map(o => [String(o.id), o]))
  if (!byId.size) return 0
  const cols = { id: [], created: [], updated: [], closed: [], type: [], entity: [], data: [] }
  for (const [id, o] of byId) {
    cols.id.push(id)
    cols.created.push(o.created_at ?? null)
    cols.updated.push(o.updated_at ?? o.created_at ?? null)
    cols.closed.push(o.closed_at ?? null)
    cols.type.push(o.type ?? o.note_type ?? null)
    cols.entity.push(o.entity_type ?? null)
    cols.data.push(JSON.stringify(o))
  }
  await pool.query(
    `INSERT INTO amo_mirror (tenant_id, kind, id, created_at, updated_at, closed_at, type, entity, data)
     SELECT $1, $2, u.* FROM unnest($3::text[], $4::bigint[], $5::bigint[], $6::bigint[], $7::text[], $8::text[], $9::jsonb[]) AS u
     ON CONFLICT (tenant_id, kind, id) DO UPDATE SET
       created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, closed_at = EXCLUDED.closed_at,
       type = EXCLUDED.type, entity = EXCLUDED.entity, data = EXCLUDED.data`,
    [tenantId, kind, cols.id, cols.created, cols.updated, cols.closed, cols.type, cols.entity, cols.data])
  return byId.size
}

/** Deals deleted in amoCRM (from the webhook): out of the reports too. */
export async function forgetAmoLeads(tenantId, ids) {
  const pool = getPool()
  const list = (ids || []).map(String).filter(Boolean)
  if (!pool || !list.length) return
  await pool.query(`DELETE FROM amo_mirror WHERE tenant_id = $1 AND kind = 'lead' AND id = ANY($2::text[])`, [tenantId, list])
}

// ─── Syncing ────────────────────────────────────────────────────────────
async function fetchWindow(amo, s, from, to) {
  const headers = { Authorization: `Bearer ${amo.accessToken}` }
  let url = `https://${amo.subdomain}.amocrm.ru${s.path}?filter[${s.field}][from]=${from}&filter[${s.field}][to]=${to}${s.extra || ''}&limit=250`
  const out = []
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const r = await amoFetch(url, { headers }, { timeoutMs: 30_000 })
    if (r.status === 204) break
    const text = await r.text()
    if (!r.ok) throw new Error(`amoCRM ${s.path} → ${r.status}: ${text.slice(0, 200)}`)
    const data = text ? JSON.parse(text) : null
    out.push(...(data?._embedded?.[s.key] || []))
    url = data?._links?.next?.href || null
  }
  return out
}

async function loadState(pool, tenantId, s, now) {
  const { rows: [st] } = await pool.query(
    'SELECT covered_from, cursor, ready FROM amo_mirror_state WHERE tenant_id = $1 AND stream = $2', [tenantId, s.stream])
  if (st) return { coveredFrom: Number(st.covered_from), cursor: Number(st.cursor), ready: st.ready }
  const start = now - s.backfillDays * DAY
  await pool.query(
    `INSERT INTO amo_mirror_state (tenant_id, stream, covered_from, cursor) VALUES ($1, $2, $3, $3)
     ON CONFLICT DO NOTHING`, [tenantId, s.stream, start])
  return { coveredFrom: start, cursor: start, ready: false }
}

/**
 * One sync run for a school: every stream advances window by window,
 * round-robin, until all are up to date or the time budget runs out.
 * Returns { stream: items fetched }.
 */
export async function syncAmoMirrorOnce(tenantId, { budgetMs = RUN_BUDGET_MS } = {}) {
  const pool = getPool()
  if (!pool) return {}
  const amo = await resolveAmo({ query: { tenantId }, headers: {} })
  if (!amo.subdomain || !amo.accessToken || amo.enabled === false) return {}
  const deadline = Date.now() + budgetMs
  const now = nowSec()
  const todo = []
  for (const s of STREAMS) todo.push({ s, st: await loadState(pool, tenantId, s, now) })
  const fetched = {}
  // every stream at least once per run (a webhook may land in the same second
  // as the last sync), then on until caught up
  let pending = todo
  while (pending.length && Date.now() < deadline) {
    for (const t of pending) {
      if (Date.now() >= deadline) break
      const from = Math.max(t.st.coveredFrom, t.st.cursor - OVERLAP)
      const to = Math.min(now, t.st.cursor + WINDOW)
      try {
        const items = await fetchWindow(amo, t.s, from, to)
        fetched[t.s.stream] = (fetched[t.s.stream] || 0) + await upsert(pool, tenantId, t.s.kind, items)
        t.st.cursor = to
        t.st.ready ||= to >= now
        await pool.query(
          `UPDATE amo_mirror_state SET cursor = $3, ready = $4, synced_at = now(), error = NULL
            WHERE tenant_id = $1 AND stream = $2`, [tenantId, t.s.stream, to, t.st.ready])
      } catch (e) {
        // an event type this account doesn't have (amo: 400 «Invalid params passed
        // to filter»): it has no events, so the stream is complete and empty —
        // the reports got [] from amo for it too
        if (t.s.kind === 'event' && /→ 400:.*Invalid params/.test(e.message)) {
          t.st.cursor = now
          t.st.ready = true
          await pool.query(
            `UPDATE amo_mirror_state SET cursor = $3, ready = true, synced_at = now(), error = $4
              WHERE tenant_id = $1 AND stream = $2`, [tenantId, t.s.stream, now, 'тип событий не поддерживается аккаунтом — пусто'])
          continue
        }
        await pool.query('UPDATE amo_mirror_state SET error = $3 WHERE tenant_id = $1 AND stream = $2',
          [tenantId, t.s.stream, String(e.message).slice(0, 300)]).catch(() => {})
        // amo refuses (blocked, bad key): no point asking for the other streams now
        if (/→ (401|403)/.test(e.message)) throw e
        t.failed = true
      }
    }
    pending = pending.filter(t => !t.failed && t.st.cursor < now)
  }
  return fetched
}

// ─── Scheduling ─────────────────────────────────────────────────────────
const running = new Map()   // tenant → promise
const kicks = new Map()     // tenant → timer

/** Sync a school now (one run at a time per school). */
export function syncAmoMirror(tenantId, opts) {
  if (running.has(tenantId)) return running.get(tenantId)
  const p = syncAmoMirrorOnce(tenantId, opts)
    .catch((e) => { console.warn(`amo mirror ${tenantId}:`, e.message); return {} })
    .finally(() => running.delete(tenantId))
  running.set(tenantId, p)
  return p
}

/** amoCRM reported a change: sync a few seconds later (a burst → one run). */
export function kickAmoMirror(tenantId) {
  if (!getPool() || kicks.has(tenantId)) return
  const timer = setTimeout(() => { kicks.delete(tenantId); syncAmoMirror(tenantId) }, KICK_DELAY_MS)
  timer.unref?.()
  kicks.set(tenantId, timer)
}

async function mirrorTenants(pool) {
  const { rows } = await pool.query(
    `SELECT id FROM tenant_integrations WHERE coalesce(data->'amocrm'->>'accessToken', '') <> ''`)
  const ids = new Set(rows.map(r => r.id))
  if (process.env.AMO_ACCESS_TOKEN && process.env.AMO_SUBDOMAIN) ids.add('default')
  return [...ids]
}

/** Background sync for every school with amoCRM. Returns a stop function. */
export function startAmoMirror(log = console) {
  const tick = async () => {
    const pool = getPool()
    if (!pool) return
    try {
      for (const tenantId of await mirrorTenants(pool)) await syncAmoMirror(tenantId)
    } catch (e) {
      log.warn?.(`amo mirror tick failed: ${e.message}`)
    }
  }
  const first = setTimeout(tick, 15_000)
  const timer = setInterval(tick, SYNC_EVERY_MS)
  first.unref?.(); timer.unref?.()
  return () => { clearTimeout(first); clearInterval(timer) }
}

// ─── Reading ────────────────────────────────────────────────────────────
const KNOWN_PARAMS = /^(limit|page|filter\[(created_at|closed_at|updated_at)\]\[(from|to)\]|filter\[type\](\[\])?|filter\[entity\])$/

async function covered(pool, tenantId, streams, from) {
  const { rows } = await pool.query(
    'SELECT stream, covered_from, ready FROM amo_mirror_state WHERE tenant_id = $1 AND stream = ANY($2::text[])',
    [tenantId, streams])
  return rows.length === streams.length && rows.every(r => r.ready && Number(r.covered_from) <= from)
}

/**
 * The answer to an amo list request (path as the reports write it, e.g.
 * "/leads?filter[created_at][from]=…&filter[created_at][to]=…") from the
 * mirror, or null when the mirror can't answer it exactly.
 */
export async function mirrorGetAll(tenantId, path) {
  const pool = getPool()
  if (!pool || !tenantId) return null
  const [p, qs = ''] = String(path).split('?')
  const q = new URLSearchParams(qs)
  if ([...q.keys()].some(k => !KNOWN_PARAMS.test(k))) return null
  const rangeOf = (field) => q.has(`filter[${field}][from]`)
    ? [Number(q.get(`filter[${field}][from]`)), Number(q.get(`filter[${field}][to]`) || nowSec())]
    : null

  let streams, where, params
  if (p === '/leads') {
    const field = q.has('filter[created_at][from]') ? 'created_at' : q.has('filter[closed_at][from]') ? 'closed_at' : null
    if (!field || q.has('filter[type]') || q.has('filter[entity]')) return null
    const [from, to] = rangeOf(field)
    streams = ['leads']
    where = `kind = 'lead' AND ${field} BETWEEN $2 AND $3`
    params = [from, to]
  } else if (p === '/leads/notes') {
    const r = rangeOf('created_at')
    if (!r || q.has('filter[type]') || q.has('filter[type][]')) return null
    streams = ['notes']
    where = `kind = 'note' AND created_at BETWEEN $2 AND $3`
    params = r
  } else if (p === '/events') {
    const r = rangeOf('created_at')
    const types = [...q.getAll('filter[type]'), ...q.getAll('filter[type][]')]
    if (!r || !types.length || !types.every(t => MIRROR_EVENT_TYPES.includes(t))) return null
    streams = types.map(t => `events:${t}`)
    where = `kind = 'event' AND created_at BETWEEN $2 AND $3 AND type = ANY($4::text[])`
    params = [...r, types]
    if (q.has('filter[entity]')) { where += ' AND entity = $5'; params.push(q.get('filter[entity]')) }
  } else {
    return null
  }
  if (!Number.isFinite(params[0]) || !Number.isFinite(params[1])) return null
  if (!(await covered(pool, tenantId, streams, params[0]))) return null
  const { rows } = await pool.query(
    `SELECT data FROM amo_mirror WHERE tenant_id = $1 AND ${where} ORDER BY created_at, id`, [tenantId, ...params])
  return rows.map(r => r.data)
}

/**
 * Wraps a report's amoGetAll(base, path, headers, key, opts): the mirror
 * answers what it covers, amoCRM the rest.
 */
export function withMirror(tenantId, amoGetAll) {
  return async (base, path, ...rest) => {
    try {
      const local = await mirrorGetAll(tenantId, path)
      if (local) return local
    } catch (e) {
      console.warn('amo mirror read failed, asking amoCRM:', e.message)
    }
    return amoGetAll(base, path, ...rest)
  }
}

/** Per stream: how far the copy goes (diagnostics). */
export async function amoMirrorStatus(tenantId) {
  const pool = getPool()
  if (!pool) return []
  const { rows } = await pool.query(
    `SELECT stream, ready, to_timestamp(covered_from) AS from, to_timestamp(cursor) AS to, synced_at, error
       FROM amo_mirror_state WHERE tenant_id = $1 ORDER BY stream`, [tenantId])
  return rows
}
