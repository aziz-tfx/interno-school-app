import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'
import { storeCalls, syncCalls, clientNumber } from '../src/crm/telephony.js'

const ctx = setup()
const sales = () => ctx.as('sales')
const T0 = Math.floor(Date.parse('2026-10-27T06:00:00Z') / 1000)
let lead

const call = (o) => ({
  uuid: o.uuid, start_stamp: o.at ?? T0, accountcode: o.dir === 'out' ? 'outbound' : 'inbound',
  caller_id_number: o.dir === 'out' ? o.ext : o.phone, destination_number: o.dir === 'out' ? o.phone : o.ext,
  duration: o.talk ? o.talk + 5 : 20, user_talk_time: o.talk || 0, events: [],
})

test('client number of a call', () => {
  assert.equal(clientNumber({ caller_id_number: '+998 90 777 66 55' }, 'incoming'), '998907776655')
  assert.equal(clientNumber({ destination_number: '907776655' }, 'outgoing'), '998907776655')
  assert.equal(clientNumber({ caller_id_number: '101' }, 'incoming'), null) // internal
})

test('calls land in the client\'s deal; the manager comes from the extension', async () => {
  await ctx.pool.query(`UPDATE employees SET data = data || '{"pbxExt": "101"}' WHERE id = 'e-sales'`)
  lead = (await sales().post('/api/crm/leads', { contact: { name: 'Мадина', phone: '+998 90 777 66 55' } })).json()

  const stats = await storeCalls(ctx.pool, 'school-a', [
    call({ uuid: 'c1', phone: '998907776655', ext: '101', talk: 95 }),
    call({ uuid: 'c2', dir: 'out', phone: '907776655', ext: '101', talk: 0, at: T0 + 600 }),
    call({ uuid: 'c3', phone: '998935550000', ext: '101', talk: 30 }), // unknown number, auto leads off
    call({ uuid: 'c4', phone: '102', ext: '101' }),                     // internal
  ])
  assert.deepEqual(stats, { calls: 4, stored: 2, skipped: 2, leadsCreated: 0 })

  const acts = (await sales().get(`/api/crm/leads/${lead.id}/activities`)).json().filter(a => a.type === 'call')
  const inbound = acts.find(a => a.meta.uuid === 'c1')
  assert.deepEqual([inbound.direction, inbound.authorId, inbound.meta.duration, inbound.meta.answered, inbound.body], ['in', 'e-sales', 95, true, null])
  const outbound = acts.find(a => a.meta.uuid === 'c2')
  assert.deepEqual([outbound.direction, outbound.body, outbound.createdAt], ['out', 'Не дозвонились', new Date((T0 + 600) * 1000).toISOString()])
  // an outgoing touch by the manager counts as the first response
  assert.equal((await sales().get(`/api/crm/leads/${lead.id}`)).json().firstResponseAt, new Date((T0 + 600) * 1000).toISOString())

  // the same calls again: nothing doubles
  const again = await storeCalls(ctx.pool, 'school-a', [call({ uuid: 'c1', phone: '998907776655', ext: '101', talk: 95 })])
  assert.equal(again.stored, 0)
})

test('an unknown incoming number becomes a deal in «Неразобранное» when the school wants it', async () => {
  const stats = await storeCalls(ctx.pool, 'school-a', [call({ uuid: 'c5', phone: '998935550000', ext: '101', talk: 0 })], { autoLeads: true })
  assert.equal(stats.leadsCreated, 1)
  const { items } = (await sales().get('/api/crm/leads?source=call')).json()
  assert.equal(items.length, 1)
  assert.equal(items[0].title, 'Звонок +998935550000')
  assert.equal(items[0].responsibleId, 'e-sales')
  const pipeline = (await sales().get('/api/crm/pipelines')).json()[0]
  assert.equal(items[0].stageId, pipeline.stages.find(s => s.isInbox).id)
  const missed = (await sales().get(`/api/crm/leads/${items[0].id}/activities`)).json().find(a => a.type === 'call')
  assert.equal(missed.body, 'Пропущенный')
})

test('sync windows: first the last day, then from the previous sync with an overlap', async () => {
  const windows = []
  const fetchHistory = async (domain, key, from, to) => { windows.push([from, to]); return { calls: [] } }
  const cfg = { domain: 'pbx1.onpbx.ru', apiKey: 'k' }
  const now = new Date('2026-10-27T10:00:00Z')
  await syncCalls(ctx.pool, 'school-a', { cfg, fetchHistory, now })
  await syncCalls(ctx.pool, 'school-a', { cfg, fetchHistory, now: new Date('2026-10-27T10:05:00Z') })
  const nowTs = now.getTime() / 1000
  assert.deepEqual(windows[0], [nowTs - 86400, nowTs])
  assert.deepEqual(windows[1], [nowTs - 600, nowTs + 300])
})

test('call recordings: amo-imported links are returned; calls without one are 404', async () => {
  const { rows: [a] } = await ctx.pool.query(
    `INSERT INTO crm_activities (tenant_id, lead_id, type, direction, meta) VALUES ('school-a', $1, 'call', 'in', '{"link": "https://rec.example/1.mp3"}') RETURNING id`, [lead.id]
  )
  assert.deepEqual((await sales().get(`/api/crm/activities/${a.id}/record`)).json(), { url: 'https://rec.example/1.mp3' })
  const { rows: [b] } = await ctx.pool.query(
    `INSERT INTO crm_activities (tenant_id, lead_id, type, direction, meta) VALUES ('school-a', $1, 'call', 'in', '{}') RETURNING id`, [lead.id]
  )
  assert.equal((await sales().get(`/api/crm/activities/${b.id}/record`)).statusCode, 404)
  assert.equal((await ctx.as('otherOwner').get(`/api/crm/activities/${a.id}/record`)).statusCode, 404)
  assert.equal((await sales().post('/api/crm/calls/sync', {})).statusCode, 403)
  assert.equal((await ctx.as('owner').post('/api/crm/calls/sync', {})).statusCode, 400) // not configured
})
