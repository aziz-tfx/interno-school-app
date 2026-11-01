import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'
import { createAmoLive, amoWebhookKey, registerAmoWebhook, AMO_WEBHOOK_EVENTS_CORE } from '../src/amoLive.js'

const ctx = setup({ env: { API_DOMAIN: 'api.test' } })

async function openStream(base, ticket, collections) {
  const res = await fetch(`${base}/api/realtime?ticket=${ticket}&collections=${collections}`)
  const reader = res.body.getReader()
  const events = []
  let buf = ''
  ;(async () => {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return
      buf += new TextDecoder().decode(value)
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i)
        buf = buf.slice(i + 2)
        const type = chunk.match(/^event: (.*)$/m)?.[1]
        const data = chunk.match(/^data: (.*)$/m)?.[1]
        if (type) events.push({ type, data: JSON.parse(data) })
      }
    }
  })().catch(() => {})
  const waitFor = async (pred, ms = 4000) => {
    const start = Date.now()
    while (Date.now() - start < ms) {
      if (pred(events)) return true
      await new Promise(r => setTimeout(r, 20))
    }
    return false
  }
  return { events, waitFor, close: () => reader.cancel() }
}

test('amo cache: one load for concurrent readers, kept until a change or TTL', async () => {
  let t = 0
  const live = createAmoLive({ pool: { query: async () => {} }, ttlMs: 1000, now: () => t })
  let loads = 0
  const load = async () => { loads++; await new Promise(r => setTimeout(r, 10)); return { n: loads } }
  const [a, b] = await Promise.all([live.get('s', 'perf', { month: '2026-11' }, load), live.get('s', 'perf', { month: '2026-11' }, load)])
  assert.equal(loads, 1)
  assert.deepEqual(a, b)
  // the client's tenantId / cache-buster don't split the cache; other params do
  await live.get('s', 'perf', { tenantId: 'x', month: '2026-11' }, load)
  assert.equal(loads, 1)
  await live.get('s', 'perf', { month: '2026-10' }, load)
  assert.equal(loads, 2)
  // another school has its own cache
  await live.get('other', 'perf', { month: '2026-11' }, load)
  assert.equal(loads, 3)
  // TTL
  t = 1500
  await live.get('s', 'perf', { month: '2026-11' }, load)
  await live.get('other', 'perf', { month: '2026-11' }, load)
  assert.equal(loads, 5)
  // a change drops only that school's entries
  live.invalidate('s')
  await live.get('s', 'perf', { month: '2026-11' }, load)
  await live.get('other', 'perf', { month: '2026-11' }, load)
  assert.equal(loads, 6)
  // failures aren't cached
  let fails = 0
  await live.get('s', 'bad', {}, async () => { fails++; return { success: false } }, (v) => v.success !== false)
  await live.get('s', 'bad', {}, async () => { fails++; return { success: false } }, (v) => v.success !== false)
  assert.equal(fails, 2)
  await assert.rejects(live.get('s', 'boom', {}, async () => { throw new Error('x') }))
  live.stop()
})

test('amoCRM webhook → live event for the school\'s staff only', async () => {
  const address = await ctx.app.listen({ port: 0, host: '127.0.0.1' })
  const ticket = async (who) => (await ctx.as(who).post('/api/realtime/ticket')).json().ticket
  const staff = await openStream(address, await ticket('sales'), 'amo')
  const other = await openStream(address, await ticket('otherOwner'), 'amo')
  const student = await openStream(address, await ticket('student'), 'amo')
  assert.ok(await staff.waitFor(ev => ev.some(e => e.type === 'ready')))
  assert.deepEqual(staff.events[0].data.collections, ['amo'])
  assert.ok(await student.waitFor(ev => ev.some(e => e.type === 'ready')))
  assert.deepEqual(student.events[0].data.collections, [])

  const hook = (query) => ctx.app.inject({
    method: 'POST', url: `/api/amo/webhook?${query}`,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: 'leads%5Bstatus%5D%5B0%5D%5Bid%5D=123&account%5Bsubdomain%5D=school',
  })
  const key = amoWebhookKey(ctx.config.jwtSecret, 'school-a')
  // wrong / missing key: still 200 for amo, but nothing happens
  assert.equal((await hook('tenantId=school-a&key=nope')).statusCode, 200)
  assert.equal((await hook('tenantId=school-a')).statusCode, 200)
  assert.equal((await hook(`tenantId=school-b&key=${key}`)).statusCode, 200)
  assert.equal((await ctx.as('sales').get('/api/amo/live')).json().lastEventAt, null)

  // amo HTML-escapes saved URLs: "&key=" arrives as "&amp;key="
  assert.equal((await hook(`tenantId=school-a&amp;key=${key}`)).statusCode, 200)
  for (let i = 0; i < 5; i++) await hook(`tenantId=school-a&key=${key}`) // a burst → one event
  assert.ok(await staff.waitFor(ev => ev.some(e => e.type === 'change' && e.data.collection === 'amo')))
  await new Promise(r => setTimeout(r, 300))
  assert.equal(staff.events.filter(e => e.type === 'change').length, 1)
  assert.equal(other.events.filter(e => e.type === 'change').length, 0)
  assert.equal(student.events.filter(e => e.type === 'change').length, 0)

  const live = (await ctx.as('sales').get('/api/amo/live')).json()
  assert.ok(live.lastEventAt > 0)
  assert.equal(live.webhookUrl, undefined) // the secret URL is for admins
  assert.equal((await ctx.as('owner').get('/api/amo/live')).json().webhookUrl,
    `https://api.test/api/amo/webhook?tenantId=school-a&key=${key}`)
  assert.equal((await ctx.as('student').get('/api/amo/live')).statusCode, 403)
  staff.close(); other.close(); student.close()
})

test('admin subscribes amoCRM; unknown events fall back to the core list', async () => {
  assert.equal((await ctx.as('sales').post('/api/admin/amo/webhook', {})).statusCode, 403)
  const res = await ctx.as('owner').post('/api/admin/amo/webhook', {})
  assert.equal(res.statusCode, 400) // no amoCRM credentials in this school
  assert.match(res.json().webhookUrl, /^https:\/\/api\.test\/api\/amo\/webhook\?tenantId=school-a&key=/)

  const calls = []
  const fakeFetch = async (url, init) => {
    const body = JSON.parse(init.body)
    calls.push({ url, auth: init.headers.Authorization, body })
    return calls.length === 1 ? { ok: false, status: 400, text: async () => 'bad setting' } : { ok: true, status: 200 }
  }
  const out = await registerAmoWebhook({ subdomain: 'school', accessToken: 'tok' }, 'https://api.test/hook', fakeFetch)
  assert.deepEqual(out, { ok: true, settings: AMO_WEBHOOK_EVENTS_CORE })
  assert.equal(calls[0].url, 'https://school.amocrm.ru/api/v4/webhooks')
  assert.equal(calls[0].auth, 'Bearer tok')
  assert.equal(calls[1].body.destination, 'https://api.test/hook')
  const failed = await registerAmoWebhook({ subdomain: 'school', accessToken: 'tok' }, 'x', async () => ({ ok: false, status: 401, text: async () => 'expired' }))
  assert.equal(failed.ok, false)
  assert.match(failed.error, /401/)
})

test('main school on .env amo keys: an empty, unticked form on the page does not switch amo off', async () => {
  const { resolveAmo } = await import('../src/vercel/_lib/tenantConfig.js')
  const saved = { t: process.env.AMO_ACCESS_TOKEN, s: process.env.AMO_SUBDOMAIN }
  process.env.AMO_ACCESS_TOKEN = 'env-token'
  process.env.AMO_SUBDOMAIN = 'interno'
  try {
    await ctx.pool.query(`INSERT INTO tenant_integrations (id, tenant_id, data) VALUES ('default', 'default', $1)`,
      [{ amocrm: { subdomain: '', accessToken: '', enabled: false } }])
    const main = await resolveAmo({ query: { tenantId: 'default' } })
    assert.equal(main.source, 'env')
    assert.equal(main.accessToken, 'env-token')
    assert.equal(main.subdomain, 'interno')
    assert.equal(main.enabled, true)

    // keys entered on the page: their «Включено» box decides
    await ctx.pool.query(`INSERT INTO tenant_integrations (id, tenant_id, data) VALUES ('school-b', 'school-b', $1)`,
      [{ amocrm: { subdomain: 'b', accessToken: 'tok-b', enabled: false } }])
    const b = await resolveAmo({ query: { tenantId: 'school-b' } })
    assert.equal(b.source, 'tenant')
    assert.equal(b.enabled, false)

    // other schools never see the main school's .env keys
    const a = await resolveAmo({ query: { tenantId: 'school-a' } })
    assert.equal(a.source, 'none')
    assert.equal(a.accessToken, '')
  } finally {
    process.env.AMO_ACCESS_TOKEN = saved.t ?? ''
    process.env.AMO_SUBDOMAIN = saved.s ?? ''
    if (saved.t === undefined) delete process.env.AMO_ACCESS_TOKEN
    if (saved.s === undefined) delete process.env.AMO_SUBDOMAIN
  }
})
