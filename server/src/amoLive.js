// amoCRM in real time.
//
// The amoCRM screens (amoCRM эффективность, manager cards in Продажи) used to
// poll every 60 s, and every poll of every open tab re-downloaded a month of
// deals from amoCRM. Now:
//
//   amoCRM ── webhook ──▶ POST /api/amo/webhook?tenantId=…&key=…
//                            ├─ drops the school's cached amo analytics
//                            └─ NOTIFY changes {table: 'amo'} ──▶ SSE ──▶ open tabs re-fetch
//
//   GET /api/amo/{performance-v2,response-times,calls,users}  answered from a
//   per-school cache: however many tabs are open, one amoCRM download per
//   report per minute at most. A busy account sends webhooks every second
//   (each chat message is a change), and a month report is hundreds of amo
//   requests: re-downloading on every change got the server's IP blocked by
//   amoCRM — and with it the AI agent. So a change only marks the cache
//   stale; a stale report reloads once it is minReloadMs old, and the tabs
//   are told then. Concurrent misses share one in-flight request.
//
// Admins connect the webhook from Интеграции → amoCRM (POST
// /api/admin/amo/webhook registers it through the amoCRM API).

import { createHash } from 'node:crypto'
import { amoFetch } from './vercel/_lib/amoFetch.js'

export const AMO_TABLE = 'amo' // realtime channel name (not a real table)

// Events amoCRM sends to our webhook. If amoCRM rejects the full list (an
// unknown event name on an older account), we retry with the core ones.
export const AMO_WEBHOOK_EVENTS = [
  'add_lead', 'update_lead', 'delete_lead', 'restore_lead', 'status_lead', 'responsible_lead',
  'note_lead', 'add_task', 'update_task', 'delete_task', 'add_talk', 'update_talk',
]
export const AMO_WEBHOOK_EVENTS_CORE = ['add_lead', 'update_lead', 'delete_lead', 'status_lead', 'responsible_lead', 'note_lead']

/** Secret in the webhook URL; derived from the JWT secret, nothing to store. */
export function amoWebhookKey(jwtSecret, tenantId) {
  return createHash('sha256').update(`amo-webhook:${tenantId}:${jwtSecret}`).digest('hex').slice(0, 40)
}

export function amoWebhookUrl(config, tenantId) {
  if (!config.publicUrl) return ''
  return `${config.publicUrl}/api/amo/webhook?tenantId=${encodeURIComponent(tenantId)}`
    + `&key=${amoWebhookKey(config.jwtSecret, tenantId)}`
}

/**
 * Per-school cache of amo analytics responses + the "something changed"
 * signal. ttlMs bounds staleness when no webhook is connected; minReloadMs
 * is the least time between two downloads of one report, however many
 * changes amoCRM reports; notifyEveryMs throttles the tabs' re-fetches.
 */
export function createAmoLive({
  pool, ttlMs = 60_000, minReloadMs = 60_000, notifyEveryMs = 15_000, now = () => Date.now(),
}) {
  const entries = new Map()   // `${tenant}|${path}?${query}` → { at, value, stale } | { promise, stale }
  const lastEventAt = new Map() // tenant → ms of the last webhook
  const pendingNotify = new Map() // tenant → timer (bursts → one event)
  const lastNotifyAt = new Map() // tenant → ms

  const keyOf = (tenantId, path, query) => {
    const q = Object.entries(query || {})
      .filter(([k]) => k !== 'tenantId' && k !== '_')
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`).join('&')
    return `${tenantId}|${path}?${q}`
  }
  const ofTenant = (tenantId) => [...entries].filter(([key]) => key.startsWith(`${tenantId}|`))

  const notify = (tenantId) => {
    lastNotifyAt.set(tenantId, now())
    pool.query('SELECT pg_notify($1, $2)', ['changes', JSON.stringify({ table: AMO_TABLE, tenant: tenantId, id: '', op: 'UPDATE' })])
      .catch(() => { /* best effort: the tabs' polling still catches up */ })
  }

  // ms until every stale report of the school may reload (an in-flight
  // download that a change made stale: check again shortly)
  const untilReloadable = (tenantId) => Math.max(0, ...ofTenant(tenantId)
    .filter(([, e]) => e.stale)
    .map(([, e]) => (e.promise ? 5000 : e.at + minReloadMs - now())))

  const schedule = (tenantId, delay) => {
    const timer = setTimeout(() => {
      const wait = untilReloadable(tenantId)
      if (wait > 0) return schedule(tenantId, wait)
      pendingNotify.delete(tenantId)
      notify(tenantId)
    }, delay)
    timer.unref?.()
    pendingNotify.set(tenantId, timer)
  }

  return {
    /**
     * Cached value for (tenant, path, query), or load() it. Only results
     * keep() accepts are stored (errors are retried on the next call).
     */
    async get(tenantId, path, query, load, keep = () => true) {
      const key = keyOf(tenantId, path, query)
      const hit = entries.get(key)
      if (hit?.promise) return hit.promise
      if (hit && now() - hit.at < (hit.stale ? minReloadMs : ttlMs)) return hit.value
      const promise = load().then((value) => {
        const cur = entries.get(key)
        if (cur?.promise === promise) {
          // a change that arrived mid-download may be missing from it
          if (keep(value)) entries.set(key, { at: now(), value, stale: !!cur.stale })
          else entries.delete(key)
        }
        return value
      }, (err) => {
        if (entries.get(key)?.promise === promise) entries.delete(key)
        throw err
      })
      entries.set(key, { promise })
      return promise
    },

    /** Mark the school's reports stale: each reloads once it is minReloadMs old. */
    invalidate(tenantId) {
      for (const [, entry] of ofTenant(tenantId)) entry.stale = true
    },

    /**
     * A webhook from the school's amoCRM. The tabs are told once the stale
     * reports may reload (and not more often than notifyEveryMs), so their
     * re-fetch gets fresh data instead of the cache.
     */
    changed(tenantId) {
      lastEventAt.set(tenantId, now())
      this.invalidate(tenantId)
      if (pendingNotify.has(tenantId)) return
      const throttle = (lastNotifyAt.get(tenantId) ?? -Infinity) + notifyEveryMs - now()
      schedule(tenantId, Math.max(1000, throttle))
    },

    lastEventAt: (tenantId) => lastEventAt.get(tenantId) || null,

    stop() {
      for (const timer of pendingNotify.values()) clearTimeout(timer)
      pendingNotify.clear()
    },
  }
}

/**
 * Subscribe the school's amoCRM to our webhook (amoCRM API v4). Returns
 * { ok, settings } or { ok: false, error }.
 */
export async function registerAmoWebhook({ subdomain, accessToken }, destination, fetchImpl = amoFetch) {
  const call = (settings) => fetchImpl(`https://${subdomain}.amocrm.ru/api/v4/webhooks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination, settings }),
  })
  try {
    let settings = AMO_WEBHOOK_EVENTS
    let res = await call(settings)
    if (res.status === 400) {
      settings = AMO_WEBHOOK_EVENTS_CORE
      res = await call(settings)
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `amoCRM ${res.status}: ${text.slice(0, 200)}` }
    }
    return { ok: true, settings }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
