import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'

const ctx = setup()
const sales = () => ctx.as('sales')
const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10)

test('insights: now, daily, sources, loss reasons, manager activity', async () => {
  const pipeline = (await sales().get('/api/crm/pipelines')).json()[0]
  const stage = (kind) => pipeline.stages.find(s => s.kind === kind)
  const lead = async (body) => (await sales().post('/api/crm/leads', { pipelineId: pipeline.id, ...body })).json()

  const a = await lead({ contact: { name: 'А', phone: '+998 90 000 00 01' }, source: 'instagram', amount: 2000000 })
  const b = await lead({ contact: { name: 'Б', phone: '+998 90 000 00 02' }, source: 'instagram' })
  await lead({ contact: { name: 'В', phone: '+998 90 000 00 03' }, source: 'landing' })
  // an inbound lead nobody answered yet: from the landing form, no author
  const form = await ctx.app.inject({ method: 'POST', url: '/api/public/leads?tenantId=school-a', payload: { name: 'Г', phone: '+998 90 000 00 04' } })
  assert.equal(form.statusCode, 201)

  await sales().patch(`/api/crm/leads/${a.id}`, { stageId: stage('won').id })
  await sales().patch(`/api/crm/leads/${b.id}`, { stageId: stage('lost').id, lossReason: 'Дорого' })
  await sales().post(`/api/crm/leads/${a.id}/notes`, { body: 'Оплатит наличными' })
  await sales().post(`/api/crm/leads/${a.id}/activities`, { type: 'call', direction: 'out', meta: { duration: 120 } })
  await sales().post('/api/crm/tasks', { leadId: a.id, text: 'Старая', dueAt: new Date(Date.now() - 3600_000).toISOString() })

  const res = await sales().get(`/api/crm/analytics/insights?pipelineId=${pipeline.id}&from=${today}&to=${today}`)
  assert.equal(res.statusCode, 200, res.body)
  const r = res.json()
  assert.equal(r.now.openLeads, 2)       // В and Г
  assert.equal(r.now.overdueTasks, 1)
  assert.equal(r.now.unanswered, 1)      // Г
  assert.equal(r.now.newToday, 4)
  assert.deepEqual(r.daily, [{ date: today, created: 4, won: 1, lost: 1 }])
  const ig = r.sources.find(s => s.source === 'instagram')
  assert.deepEqual([ig.created, ig.won, ig.lost, Number(ig.wonAmount), ig.conversion], [2, 1, 1, 2000000, 50])
  assert.deepEqual(r.lossReasons, [{ reason: 'Дорого', count: 1 }])
  const me = r.activity.find(x => x.employeeId === 'e-sales')
  assert.deepEqual(
    [me.callsOut, me.talkSec, me.notes, me.stageMoves, me.wins, me.overdueTasks],
    [1, 120, 1, 2, 1, 1])

  assert.equal((await sales().get(`/api/crm/analytics/insights?pipelineId=${pipeline.id}&from=2020-01-01&to=2026-01-01`)).statusCode, 400)
})
