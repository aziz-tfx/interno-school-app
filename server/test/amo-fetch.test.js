import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { amoFetch, configureAmoFetch, amoBlockedFor, AmoBlockedError } from '../src/vercel/_lib/amoFetch.js'

const realFetch = globalThis.fetch
let calls
let reply
beforeEach(() => {
  calls = []
  reply = () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async (url) => { calls.push({ url: String(url), at: Date.now() }); return reply(url, calls.length) }
})
after(() => { globalThis.fetch = realFetch; configureAmoFetch() })

test('requests to one amo account are spaced; agent calls go first', async () => {
  configureAmoFetch({ minIntervalMs: 40 })
  const reports = Array.from({ length: 4 }, (_, i) => amoFetch(`https://a.amocrm.ru/api/v4/leads?page=${i}`))
  const agent = amoFetch('https://a.amocrm.ru/api/v4/leads/1', {}, { priority: 'high' })
  const otherAccount = amoFetch('https://b.amocrm.ru/api/v4/leads/1')
  await Promise.all([...reports, agent, otherAccount])
  const a = calls.filter(c => c.url.includes('a.amocrm'))
  assert.equal(a.length, 5)
  // the first report page was already on its way; the agent's call is next
  assert.match(a[1].url, /leads\/1$/)
  for (let i = 1; i < a.length; i++) assert.ok(a[i].at - a[i - 1].at >= 35, `gap ${a[i].at - a[i - 1].at}`)
  // another account has its own queue
  assert.ok(calls.find(c => c.url.includes('b.amocrm')).at - a[0].at < 35)
})

test('429 waits and retries', async () => {
  configureAmoFetch({ minIntervalMs: 0, retryDelayMs: 20 })
  reply = (url, n) => new Response('{}', { status: n === 1 ? 429 : 200 })
  const res = await amoFetch('https://a.amocrm.ru/api/v4/account')
  assert.equal(res.status, 200)
  assert.equal(calls.length, 2)
})

test('nginx 403 (IP blocked) pauses calls to that account; amo\'s JSON 403 does not', async () => {
  configureAmoFetch({ minIntervalMs: 0, blockPauseMs: 60_000 })
  reply = () => new Response('{"title":"Forbidden","status":403}', { status: 403, headers: { 'content-type': 'application/problem+json' } })
  assert.equal((await amoFetch('https://a.amocrm.ru/api/v4/leads/1')).status, 403)
  assert.equal(amoBlockedFor('https://a.amocrm.ru/x'), 0)

  reply = () => new Response('<html><head><title>403 Forbidden</title></head><body><center>nginx</center></body></html>', { status: 403, headers: { 'content-type': 'text/html' } })
  const res = await amoFetch('https://a.amocrm.ru/api/v4/leads/1')
  assert.equal(res.status, 403)
  assert.match(await res.text(), /nginx/) // callers can still read the body
  assert.ok(amoBlockedFor('https://a.amocrm.ru/x') > 0)
  const before = calls.length
  await assert.rejects(amoFetch('https://a.amocrm.ru/api/v4/leads/2'), (e) => e instanceof AmoBlockedError && /→ 403/.test(e.message))
  assert.equal(calls.length, before) // amo isn't called while blocked
  assert.equal((await amoFetch('https://b.amocrm.ru/api/v4/leads/2')).status, 403) // other accounts unaffected (still answered)
})

test('timeout counts from sending, not from waiting in the queue', async () => {
  configureAmoFetch({ minIntervalMs: 0 })
  globalThis.fetch = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason))
  })
  const keepAlive = setTimeout(() => {}, 1000) // AbortSignal.timeout doesn't hold the process open
  await assert.rejects(amoFetch('https://a.amocrm.ru/api/v4/leads', {}, { timeoutMs: 30 }), /amoCRM timeout after 30ms/)
  clearTimeout(keepAlive)
})
