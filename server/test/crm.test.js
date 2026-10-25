import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'
import { normalizePhone } from '../src/lib/phone.js'

const ctx = setup()
const sales = () => ctx.as('sales')
const owner = () => ctx.as('owner')
let pipeline
const stage = (name) => pipeline.stages.find(s => s.name === name)

test('phone normalisation', () => {
  assert.equal(normalizePhone('+998 (90) 123-45-67'), '998901234567')
  assert.equal(normalizePhone('90 123 45 67'), '998901234567')
  assert.equal(normalizePhone('8 90 123 45 67'), '998901234567')
  assert.equal(normalizePhone(''), '')
})

test('a new school gets the standard funnel with «Неразобранное» first', async () => {
  const res = await sales().get('/api/crm/pipelines')
  assert.equal(res.statusCode, 200)
  pipeline = res.json()[0]
  assert.equal(pipeline.isDefault, true)
  assert.equal(pipeline.stages[0].name, 'Неразобранное')
  assert.equal(pipeline.stages[0].isInbox, true)
  assert.deepEqual(pipeline.stages.filter(s => s.kind !== 'open').map(s => s.kind), ['won', 'lost'])
})

test('CRM is closed to teachers and students; configuring it needs a manager', async () => {
  assert.equal((await ctx.as('teacher').get('/api/crm/pipelines')).statusCode, 403)
  assert.equal((await ctx.as('student').get('/api/crm/board?pipelineId=' + pipeline.id)).statusCode, 403)
  assert.equal((await sales().post('/api/crm/pipelines', { name: 'X' })).statusCode, 403)
  assert.equal((await owner().post(`/api/crm/pipelines/${pipeline.id}/stages`, { name: 'Думает' })).statusCode, 201)
})

let leadId
test('new lead lands in «Неразобранное»; the same phone reuses the contact', async () => {
  const res = await sales().post('/api/crm/leads', {
    contact: { name: 'Малика', phone: '+998 97 777 11 22' }, source: 'instagram', amount: 1200000,
  })
  assert.equal(res.statusCode, 201)
  const lead = res.json()
  leadId = lead.id
  assert.equal(lead.stageId, stage('Неразобранное').id)
  assert.equal(lead.title, 'Малика')

  const again = (await sales().post('/api/crm/leads', { contact: { name: 'Малика', phone: '977771122' }, source: 'telegram' })).json()
  assert.equal(again.contactId, lead.contactId)

  const dup = await sales().post('/api/crm/contacts', { name: 'Малика 2', phone: '998977771122' })
  assert.equal(dup.statusCode, 409)
  assert.equal(dup.json().existing.id, lead.contactId)
})

test('board shows counts, sums and leads per stage; search by phone works', async () => {
  const board = (await sales().get(`/api/crm/board?pipelineId=${pipeline.id}`)).json()
  const inbox = board.stages.find(s => s.isInbox)
  assert.equal(inbox.count, 2)
  assert.equal(inbox.amount, 1200000)
  assert.equal(inbox.leads[0].contact.name, 'Малика')

  const found = (await sales().get(`/api/crm/board?pipelineId=${pipeline.id}&q=77711`)).json()
  assert.equal(found.stages.find(s => s.isInbox).count, 2)
  const none = (await sales().get(`/api/crm/board?pipelineId=${pipeline.id}&q=Никого`)).json()
  assert.equal(none.stages.reduce((n, s) => n + s.count, 0), 0)
})

test('moving through stages is logged; won closes the lead; response time is tracked', async () => {
  await sales().post(`/api/crm/leads/${leadId}/activities`, { type: 'call', direction: 'out', body: 'Дозвонилась' })
  await sales().patch(`/api/crm/leads/${leadId}`, { stageId: stage('Связались').id })
  const won = (await sales().patch(`/api/crm/leads/${leadId}`, { stageId: stage('Успешно реализовано').id })).json()
  assert.ok(won.closedAt)
  assert.ok(won.firstResponseAt)

  const timeline = (await sales().get(`/api/crm/leads/${leadId}/activities`)).json()
  const moves = timeline.filter(a => a.type === 'stage_change').map(a => a.meta.to)
  assert.deepEqual(moves, [stage('Успешно реализовано').id, stage('Связались').id, stage('Неразобранное').id])

  const reopened = (await sales().patch(`/api/crm/leads/${leadId}`, { stageId: stage('Связались').id })).json()
  assert.equal(reopened.closedAt, null)
  await sales().patch(`/api/crm/leads/${leadId}`, { stageId: stage('Успешно реализовано').id })
})

test('funnel report: cohort, reached stages, conversion, by manager', async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' })
  const res = await owner().get(`/api/crm/analytics/funnel?pipelineId=${pipeline.id}&from=${today}&to=${today}`)
  assert.equal(res.statusCode, 200)
  const r = res.json()
  assert.equal(r.totals.created, 2)
  assert.equal(r.totals.won, 1)
  assert.equal(r.totals.wonAmount, 1200000)
  assert.equal(r.totals.conversion, 50)
  // the won lead skipped «Записан на пробный» but still counts as reaching it
  assert.equal(r.stages.find(s => s.name === 'Записан на пробный урок').reached, 1)
  assert.equal(r.stages.find(s => s.name === 'Неразобранное').reached, 2)
  const gul = r.byResponsible.find(x => x.created === 2)
  assert.ok(gul)
})

test('notes and tasks; completing a task writes to the timeline', async () => {
  assert.equal((await sales().post(`/api/crm/leads/${leadId}/notes`, { body: '' })).statusCode, 400)
  await sales().post(`/api/crm/leads/${leadId}/notes`, { body: 'Хочет вечернюю группу' })
  const task = (await sales().post('/api/crm/tasks', { leadId, text: 'Перезвонить', dueAt: '2020-01-01T10:00:00Z' })).json()
  assert.equal(task.assigneeId, 'e-sales')

  const overdue = (await sales().get('/api/crm/tasks?status=overdue')).json()
  assert.deepEqual(overdue.map(t => t.id), [task.id])

  const done = (await sales().patch(`/api/crm/tasks/${task.id}`, { done: true, result: 'Записала' })).json()
  assert.ok(done.doneAt)
  const timeline = (await sales().get(`/api/crm/leads/${leadId}/activities`)).json()
  assert.ok(timeline.some(a => a.type === 'task' && a.meta.result === 'Записала'))
  assert.ok(timeline.some(a => a.type === 'note' && a.body === 'Хочет вечернюю группу'))
})

test('other schools cannot see or touch the CRM data, nor link to it', async () => {
  const other = ctx.as('otherOwner')
  assert.equal((await other.get(`/api/crm/leads/${leadId}`)).statusCode, 404)
  assert.equal((await other.patch(`/api/crm/leads/${leadId}`, { title: 'x' })).statusCode, 404)
  assert.equal((await other.get('/api/crm/contacts')).json().total, 0)
  // linking school-b's lead to a school-a employee / contact is refused
  const lead = (await other.post('/api/crm/leads', { contact: { name: 'B', phone: '901234567' } })).json()
  assert.equal((await other.patch(`/api/crm/leads/${lead.id}`, { responsibleId: 'e-sales' })).statusCode, 400)
  const contactA = (await sales().get('/api/crm/contacts')).json().items[0].id
  assert.equal((await other.patch(`/api/crm/leads/${lead.id}`, { contactId: contactA })).statusCode, 400)
  assert.equal((await other.post('/api/crm/tasks', { leadId, text: 'x', dueAt: '2030-01-01' })).statusCode, 400)
})

test('public landing form creates a lead without login (honeypot ignored)', async () => {
  const post = (payload, tenant = 'school-a') => ctx.app.inject({ method: 'POST', url: `/api/public/leads?tenantId=${tenant}`, payload })
  assert.equal((await post({ name: 'С лендинга', phone: '+998 99 000 11 22', comment: 'Курс дизайна' })).statusCode, 201)
  assert.equal((await post({ name: 'Бот', phone: '+998 99 000 33 44', website: 'spam' })).statusCode, 201)
  assert.equal((await post({ name: 'X', phone: '900000000' }, 'no-such-school')).statusCode, 404)

  const list = (await sales().get('/api/crm/leads?source=landing')).json()
  assert.equal(list.total, 1)
  assert.equal(list.items[0].contact.name, 'С лендинга')
})

test('malformed bodies get 400, not 500', async () => {
  assert.equal((await sales().patch(`/api/crm/leads/${leadId}`, { tags: { not: 'an array' } })).statusCode, 400)
  assert.equal((await sales().post('/api/crm/tasks', { text: 'x' })).statusCode, 400)
  assert.equal((await sales().post('/api/crm/tasks', { text: 'x', dueAt: 'never' })).statusCode, 400)
  assert.equal((await sales().get('/api/crm/leads/not-a-uuid')).statusCode, 404)
})

test('stage with leads cannot be deleted', async () => {
  const res = await owner().delete(`/api/crm/stages/${stage('Успешно реализовано').id}`)
  assert.equal(res.statusCode, 409)
})
