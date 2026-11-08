// Every amoCRM API call this server makes goes through amoFetch().
//
// amoCRM allows about 7 requests a second per integration. When a client
// keeps going over it, amoCRM first answers 429 and then blocks the caller's
// IP: its nginx answers «403 Forbidden» (an HTML page, not JSON) to every
// request, the AI agent's included. All schools' traffic leaves this server
// from one IP, so the limit is enforced here, for the whole process:
//
//   • requests to one amo account start at most 1 / minIntervalMs;
//   • priority 'high' (the AI agent answering a client, a sale being pushed)
//     goes ahead of queued report downloads;
//   • 429 → wait (Retry-After, else a few seconds) and retry;
//   • 403 with an HTML body = the IP is blocked → stop calling that account
//     for blockPauseMs (hammering only prolongs the block); calls fail at once
//     with AmoBlockedError meanwhile.
//
// Relay: with AMO_RELAY_URL + AMO_RELAY_KEY set (api/amo-relay.js on Vercel),
// 'high' calls — the AI agent, sales, token refresh — go out from Vercel's
// IPs instead of the server's, so they keep working while amoCRM blocks the
// server. AMO_RELAY_ALL=1 sends report downloads that way too (they are
// heavy: hundreds of calls per report, counted against Vercel's limits).
// Blocks are tracked per route: a blocked server IP doesn't stop the relay.

const DEFAULTS = {
  minIntervalMs: Number(process.env.AMO_MIN_INTERVAL_MS ?? 200), // ≤ 5 req/s per amo account
  retries429: 2,
  retryDelayMs: 3000,
  blockPauseMs: 10 * 60_000,
}
let opts = { ...DEFAULTS }

const relayFromEnv = () => ({
  url: process.env.AMO_RELAY_URL || '',
  key: process.env.AMO_RELAY_KEY || '',
  all: process.env.AMO_RELAY_ALL === '1',
})
let relay = relayFromEnv()

/** Tests: change the limits (and reset the queues). */
export function configureAmoFetch(o = {}) {
  const { relay: r, ...rest } = o
  opts = { ...DEFAULTS, ...rest }
  relay = r ? { url: '', key: '', all: false, ...r } : relayFromEnv()
  hosts.clear()
}

const useRelay = (priority) => !!(relay.url && relay.key && (relay.all || priority === 'high'))

/** Is the relay on, and for what (shown by diagnostics). */
export const amoRelayMode = () => (relay.url && relay.key ? (relay.all ? 'all' : 'high') : 'off')

export class AmoBlockedError extends Error {
  constructor(host, until) {
    super(`amoCRM ${host} → 403: amoCRM временно заблокировал IP сервера за превышение лимита запросов (пауза до ${new Date(until).toISOString()})`)
    this.name = 'AmoBlockedError'
    this.status = 403
    this.blockedUntil = until
  }
}

// host → { high: [], normal: [], nextAt, timer, blockedUntil: { direct, relay } }
// One queue per amo account (its limit doesn't care which IP calls), a block per route.
const hosts = new Map()

function hostState(host) {
  let s = hosts.get(host)
  if (!s) hosts.set(host, s = { high: [], normal: [], nextAt: 0, timer: null, blockedUntil: { direct: 0, relay: 0 } })
  return s
}

const hostOf = (url) => {
  try { return new URL(String(url)).host } catch { return String(url) }
}

// Wait for this host's next free slot (high-priority callers first).
function slot(host, priority) {
  const s = hostState(host)
  return new Promise((resolve) => {
    ;(priority === 'high' ? s.high : s.normal).push(resolve)
    pump(s)
  })
}

function pump(s) {
  if (s.timer) return
  const next = () => {
    s.timer = null
    // nextAt may have moved since the timer was set (a 429 pushes it back)
    const wait = s.nextAt - Date.now()
    if (wait > 0) { s.timer = setTimeout(next, wait); return }
    const resolve = s.high.shift() || s.normal.shift()
    if (!resolve) return
    s.nextAt = Date.now() + opts.minIntervalMs
    resolve()
    if (s.high.length || s.normal.length) s.timer = setTimeout(next, opts.minIntervalMs)
  }
  next()
}

/** True for amo's «IP blocked» answer: 403 from nginx, as an HTML page. */
export function isIpBlock(res, text) {
  if (res.status !== 403) return false
  const type = res.headers?.get?.('content-type') || ''
  return /text\/html/i.test(type) || /<html|nginx/i.test(text || '')
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function send(url, init, timeoutMs, viaRelay) {
  const signal = timeoutMs ? AbortSignal.timeout(timeoutMs + (viaRelay ? 5000 : 0)) : undefined
  try {
    if (!viaRelay) return await globalThis.fetch(url, { ...init, ...(signal && { signal }) })
    const res = await globalThis.fetch(relay.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-relay-key': relay.key },
      body: JSON.stringify({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body ?? null }),
      ...(signal && { signal }),
    })
    // the relay's own failure (bad key, Vercel error) — not an amoCRM answer
    if (!res.headers.get('x-relay-status')) {
      const text = await res.text().catch(() => '')
      throw new Error(`amoCRM relay ${res.status}: ${text.slice(0, 200)}`)
    }
    return res
  } catch (err) {
    if (err?.name === 'TimeoutError') throw new Error(`amoCRM timeout after ${timeoutMs}ms`)
    throw err
  }
}

/** Is this amo account paused after an IP block? (ms left, 0 if not) */
export function amoBlockedFor(url, route = 'direct') {
  const s = hosts.get(hostOf(url))
  return s ? Math.max(0, s.blockedUntil[route] - Date.now()) : 0
}

/**
 * fetch() for amoCRM, rate-limited per amo account.
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {{priority?: 'high'|'normal', timeoutMs?: number}} [o]
 *   timeoutMs counts from the moment the request is sent, not the time queued
 */
export async function amoFetch(url, init = {}, { priority = 'normal', timeoutMs = 0 } = {}) {
  const host = hostOf(url)
  const s = hostState(host)
  const viaRelay = useRelay(priority)
  const route = viaRelay ? 'relay' : 'direct'
  for (let attempt = 0; ; attempt++) {
    if (s.blockedUntil[route] > Date.now()) throw new AmoBlockedError(host, s.blockedUntil[route])
    await slot(host, priority)
    if (s.blockedUntil[route] > Date.now()) throw new AmoBlockedError(host, s.blockedUntil[route])
    const res = await send(url, init, timeoutMs, viaRelay)

    if (res.status === 429 && attempt < opts.retries429) {
      const retryAfter = Number(res.headers?.get?.('retry-after')) * 1000
      const wait = retryAfter > 0 ? Math.min(retryAfter, 30_000) : opts.retryDelayMs * (attempt + 1)
      // everyone else waits too: the limit is per account
      s.nextAt = Math.max(s.nextAt, Date.now() + wait)
      await sleep(wait)
      continue
    }

    if (res.status === 403) {
      const text = await res.text().catch(() => '')
      if (isIpBlock(res, text)) {
        s.blockedUntil[route] = Date.now() + opts.blockPauseMs
        console.error(`amoCRM ${host}: IP blocked (403 from nginx${viaRelay ? ', via the Vercel relay' : ''}), pausing ${route} amo calls for ${Math.round(opts.blockPauseMs / 60_000)} min`)
      }
      // the body has been read: hand callers a fresh Response with the same text
      return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers })
    }
    return res
  }
}
