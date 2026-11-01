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
//   per-school cache: one amoCRM download per change (or per minute), however
//   many tabs are open. Concurrent misses share one in-flight request.
//
// Admins connect the webhook from Интеграции → amoCRM (POST
// /api/admin/amo/webhook registers it through the amoCRM API).

import { createHash } from 'node:crypto'

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
 * signal. ttlMs bounds staleness when no webhook is connected.
 */
export function createAmoLive({ pool, ttlMs = 60_000, notifyEveryMs = 1000, now = () => Date.now() }) {
  const entries = new Map()   // `${tenant}|${path}?${query}` → { at, value } | { promise }
  const lastEventAt = new Map() // tenant → ms of the last webhook
  const pendingNotify = new Map() // tenant → timer (bursts → one event)

  const keyOf = (tenantId, path, query) => {
    const q = Object.entries(query || {})
      .filter(([k]) => k !== 'tenantId' && k !== '_')
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`).join('&')
    return `${tenantId}|${path}?${q}`
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
      if (hit && now() - hit.at < ttlMs) return hit.value
      const promise = load().then((value) => {
        if (entries.get(key)?.promise === promise) {
          if (keep(value)) entries.set(key, { at: now(), value })
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

    invalidate(tenantId) {
      for (const key of entries.keys()) if (key.startsWith(`${tenantId}|`)) entries.delete(key)
    },

    /** A webhook from the school's amoCRM: fresh data on the next read, tabs told (throttled). */
    changed(tenantId) {
      lastEventAt.set(tenantId, now())
      this.invalidate(tenantId)
      if (pendingNotify.has(tenantId)) return
      pendingNotify.set(tenantId, setTimeout(() => {
        pendingNotify.delete(tenantId)
        // drop anything cached while the burst was still arriving
        this.invalidate(tenantId)
        pool.query('SELECT pg_notify($1, $2)', ['changes', JSON.stringify({ table: AMO_TABLE, tenant: tenantId, id: '', op: 'UPDATE' })])
          .catch(() => { /* best effort: the tabs' polling still catches up */ })
      }, notifyEveryMs))
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
export async function registerAmoWebhook({ subdomain, accessToken }, destination, fetchImpl = fetch) {
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
