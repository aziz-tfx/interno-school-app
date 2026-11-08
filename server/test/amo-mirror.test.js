import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'
import { syncAmoMirrorOnce, mirrorGetAll, withMirror, forgetAmoLeads, amoMirrorStatus } from '../src/vercel/_lib/amoMirror.js'
import { configureAmoFetch } from '../src/vercel/_lib/amoFetch.js'

const ctx = setup()
const now = Math.floor(Date.now() / 1000)
const DAY = 86400
// a fake amoCRM account
const amoData = {
  leads: [
    { id: 1, created_at: now - 300 * DAY, updated_at: now - 300 * DAY, closed_at: null, status_id: 10 },
    { id: 2, created_at: now - 40 * DAY, updated_at: now - 5 * DAY, closed_at: now - 5 * DAY, status_id: 142, price: 900 },
    { id: 3, created_at: now - 2 * DAY, updated_at: now - 60, closed_at: null, status_id: 11 },
  ],
  notes: [{ id: 50, created_at: now - 3 * DAY, updated_at: now - 3 * DAY, note_type: 'call_out', entity_id: 3 }],
  events: [
    { id: 'e1', type: 'outgoing_call', entity_type: 'lead', entity_id: 3, created_at: now - DAY, created_by: 7 },
    { id: 'e2', type: 'incoming_call', entity_type: 'contact', entity_id: 9, created_at: now - DAY, created_by: 7 },
    { id: 'e3', type: 'outgoing_chat_message', entity_type: 'lead', entity_id: 2, created_at: now - 10 * DAY, created_by: 8 },
  ],
}
let calls
const realFetch = globalThis.fetch
before(() => {
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url))
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return realFetch(url, init)
    calls.push(u.pathname + u.search)
    const key = u.pathname.endsWith('/notes') ? 'notes' : u.pathname.endsWith('/events') ? 'events' : 'leads'
    const field = key === 'events' ? 'created_at' : 'updated_at'
    const from = Number(u.searchParams.get(`filter[${field}][from]`)), to = Number(u.searchParams.get(`filter[${field}][to]`))
    const type = u.searchParams.get('filter[type]')
    let items = amoData[key].filter(o => o[field] >= from && o[field] <= to && (!type || o.type === type))
    // one item per page, to exercise paging
    const page = Number(u.searchParams.get('page') || 1)
    if (!items.length) return new Response(null, { status: 204 })
    const item = items[page - 1]
    const next = items[page] ? (() => { const n = new URL(u); n.searchParams.set('page', page + 1); return { next: { href: n.toString() } } })() : {}
    return Response.json({ _embedded: { [key]: item ? [item] : [] }, _links: next })
  }
})
after(() => { globalThis.fetch = realFetch; configureAmoFetch() })
beforeEach(() => { calls = []; configureAmoFetch({ minIntervalMs: 0 }) })

test('backfill, then incremental: the reports\' queries come from Postgres', async () => {
  await ctx.pool.query(`INSERT INTO tenant_integrations (id, tenant_id, data) VALUES ('school-a', 'school-a', $1)`,
    [{ amocrm: { subdomain: 'school', accessToken: 't' } }])
  // not synced yet: the mirror doesn't answer
  assert.equal(await mirrorGetAll('school-a', `/leads?filter[created_at][from]=${now - 30 * DAY}&filter[created_at][to]=${now}`), null)

  await syncAmoMirrorOnce('school-a')
  const status = await amoMirrorStatus('school-a')
  assert.equal(status.length, 6)
  assert.ok(status.every(s => s.ready && !s.error), JSON.stringify(status))
  const backfillCalls = calls.length
  assert.ok(backfillCalls > 6)

  // deals created this month / closed in the range
  const created = await mirrorGetAll('school-a', `/leads?filter[created_at][from]=${now - 30 * DAY}&filter[created_at][to]=${now}`)
  assert.deepEqual(created.map(l => l.id), [3])
  const closed = await mirrorGetAll('school-a', `/leads?filter[closed_at][from]=${now - 30 * DAY}&filter[closed_at][to]=${now}`)
  assert.deepEqual(closed.map(l => [l.id, l.price]), [[2, 900]])
  // a deal touched 300 days ago is in the copy (13-month backfill)
  assert.equal((await mirrorGetAll('school-a', `/leads?filter[created_at][from]=${now - 320 * DAY}&filter[created_at][to]=${now - 290 * DAY}`)).length, 1)
  // events: by type, entity and range — single and [] syntax
  const ev = await mirrorGetAll('school-a', `/events?filter[created_at][from]=${now - 30 * DAY}&filter[created_at][to]=${now}&filter[entity]=lead&filter[type]=outgoing_call`)
  assert.deepEqual(ev.map(e => e.id), ['e1'])
  const calls2 = await mirrorGetAll('school-a', `/events?filter[type][]=incoming_call&filter[type][]=outgoing_call&filter[created_at][from]=${now - 30 * DAY}&filter[created_at][to]=${now}`)
  assert.deepEqual(calls2.map(e => e.id).sort(), ['e1', 'e2'])
  const notes = await mirrorGetAll('school-a', `/leads/notes?filter[created_at][from]=${now - 30 * DAY}&filter[created_at][to]=${now}`)
  assert.deepEqual(notes.map(n => n.id), [50])

  // outside the copy, or a filter it doesn't know: amoCRM answers, as before
  assert.equal(await mirrorGetAll('school-a', `/events?filter[created_at][from]=${now - 200 * DAY}&filter[created_at][to]=${now}&filter[type]=outgoing_call`), null)
  assert.equal(await mirrorGetAll('school-a', `/events?filter[created_at][from]=${now - DAY}&filter[type]=lead_added`), null)
  assert.equal(await mirrorGetAll('school-a', `/leads?filter[created_at][from]=${now - DAY}&query=ivan`), null)
  assert.equal(await mirrorGetAll('school-a', '/users'), null)
  let fellBack = 0
  const getAll = withMirror('school-a', async () => { fellBack++; return ['from amo'] })
  assert.deepEqual(await getAll('b', '/users', {}, 'users'), ['from amo'])
  assert.deepEqual((await getAll('b', `/leads?filter[created_at][from]=${now - 30 * DAY}&filter[created_at][to]=${now}`)).map(l => l.id), [3])
  assert.equal(fellBack, 1)

  // next run: only what changed — one small request per stream
  amoData.leads[2] = { ...amoData.leads[2], status_id: 142, closed_at: now, updated_at: now }
  calls = []
  await syncAmoMirrorOnce('school-a')
  assert.ok(calls.length <= 7, calls.join('\n'))
  const nowClosed = await mirrorGetAll('school-a', `/leads?filter[closed_at][from]=${now - 30 * DAY}&filter[closed_at][to]=${now + 10}`)
  assert.deepEqual(nowClosed.map(l => l.id).sort(), [2, 3])

  // a deal deleted in amo leaves the copy
  await forgetAmoLeads('school-a', ['2'])
  assert.deepEqual((await mirrorGetAll('school-a', `/leads?filter[closed_at][from]=${now - 30 * DAY}&filter[closed_at][to]=${now + 10}`)).map(l => l.id), [3])
})

test('calls report is answered from the copy, without asking amoCRM', async () => {
  calls = []
  const day = (s) => new Date((now - s) * 1000).toISOString().slice(0, 10)
  const res = await ctx.as('owner').get(`/api/amo/calls?from=${day(5 * DAY)}&to=${day(0)}`)
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().totals.total, 2)
  assert.equal(calls.filter(c => c.includes('/events')).length, 0)
})
