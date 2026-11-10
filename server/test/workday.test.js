import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup, USERS } from './helpers.js'

const ctx = setup()
const sales = () => ctx.as('sales')
const owner = () => ctx.as('owner')
const feed = async (who) => (await ctx.as(who).get('/api/notifications')).json().items
const ofType = (items, type) => items.filter(i => i.type === type)

test('notifications need a login; students and non-CRM staff get an empty CRM feed', async () => {
  assert.equal((await ctx.as(null).get('/api/notifications')).statusCode, 401)
  assert.deepEqual(await feed('student'), [])
  assert.deepEqual(await feed('teacher'), [])
})

test('a new lead is news until someone answers it — and never to the person who made it', async () => {
  await sales().get('/api/crm/pipelines') // creates the default funnel

  // From the landing page: nobody is responsible → everyone in the CRM sees it
  const landing = await ctx.as(null).post('/api/public/leads?tenantId=school-a', { name: 'Дилноза', phone: '+998 90 700 00 01' })
  assert.equal(landing.statusCode, 201)
  // The owner creates a deal for the sales manager, and one for themselves
  const forSales = (await owner().post('/api/crm/leads', {
    contact: { name: 'Жасур', phone: '+998 90 700 00 02' }, responsibleId: USERS.sales.id,
  })).json()
  await owner().post('/api/crm/leads', { contact: { name: 'Свой', phone: '+998 90 700 00 03' }, responsibleId: USERS.owner.id })

  let mine = ofType(await feed('sales'), 'lead_new')
  assert.deepEqual(mine.map(i => i.title).sort(), ['Дилноза', 'Жасур'])
  assert.equal(mine.find(i => i.title === 'Дилноза').unassigned, true)
  assert.equal(mine.find(i => i.title === 'Жасур').leadId, forSales.id)
  // The owner: the unassigned one only — not the deal given to sales, not their own
  assert.deepEqual(ofType(await feed('owner'), 'lead_new').map(i => i.title), ['Дилноза'])

  // Answered (a note counts as a reaction) → gone
  await sales().post(`/api/crm/leads/${forSales.id}/notes`, { body: 'Позвонила, думает' })
  mine = ofType(await feed('sales'), 'lead_new')
  assert.deepEqual(mine.map(i => i.title), ['Дилноза'])

  // Another school never sees it
  assert.deepEqual(await feed('otherOwner'), [])
})

test('tasks: overdue ones, and ones somebody else assigned', async () => {
  const leadId = (await sales().post('/api/crm/leads', { contact: { name: 'Клиент задач', phone: '+998 90 700 00 10' } })).json().id
  const past = (await sales().post('/api/crm/tasks', { leadId, text: 'Перезвонить', dueAt: '2020-01-01T10:00:00Z' })).json()
  await sales().post('/api/crm/tasks', { leadId, text: 'Своя на потом', dueAt: '2099-01-01T10:00:00Z' })
  const given = (await owner().post('/api/crm/tasks', {
    leadId, text: 'Отправить договор', dueAt: '2099-01-01T10:00:00Z', assigneeId: USERS.sales.id,
  })).json()

  let items = await feed('sales')
  assert.deepEqual(ofType(items, 'task_overdue').map(i => i.taskId), [past.id])
  assert.equal(ofType(items, 'task_overdue')[0].leadId, leadId)
  // only the task from the owner — not the one sales set for themselves
  assert.deepEqual(ofType(items, 'task_new').map(i => i.taskId), [given.id])
  assert.equal(ofType(items, 'task_new')[0].authorId, USERS.owner.id)
  // the owner has no tasks of their own
  assert.equal(ofType(await feed('owner'), 'task_overdue').length, 0)

  await sales().patch(`/api/crm/tasks/${past.id}`, { done: true })
  await sales().patch(`/api/crm/tasks/${given.id}`, { done: true })
  items = await feed('sales')
  assert.equal(ofType(items, 'task_overdue').length, 0)
  assert.equal(ofType(items, 'task_new').length, 0)
})

test('AI agent handoffs go to the school admins only, without the conversation text', async () => {
  const conv = (id, data) => ctx.pool.query(
    'INSERT INTO ai_agent_conversations (id, tenant_id, data) VALUES ($1, $2, $3)', [id, 'school-a', data]
  )
  const now = new Date().toISOString()
  await conv('school-a__lead_1', {
    paused: true, handoffReason: 'Готов оплатить', updatedAt: now, contactName: 'Азиза', channel: 'instagram',
    messages: [{ role: 'user', text: 'секрет' }],
  })
  await conv('school-a__lead_2', { paused: false, handoffReason: null, updatedAt: now, contactName: 'Обычный' })
  await conv('school-a__lead_3', { paused: true, handoffReason: 'Старое', updatedAt: '2020-01-01T00:00:00.000Z', contactName: 'Давно' })

  const items = ofType(await feed('owner'), 'ai_handoff')
  assert.equal(items.length, 1)
  assert.deepEqual(
    { title: items[0].title, reason: items[0].reason, channel: items[0].channel },
    { title: 'Азиза', reason: 'Готов оплатить', channel: 'instagram' }
  )
  assert.equal(JSON.stringify(items).includes('секрет'), false)
  assert.equal(ofType(await feed('sales'), 'ai_handoff').length, 0)
})

test('student history: deals and timeline by the sale link and by phone', async () => {
  const put = (id, data) => owner().put(`/api/collections/students/${id}`, data)
  assert.equal((await put('st-linked', { name: 'Связанный', phone: '+998 91 800 00 01' })).statusCode, 200)
  assert.equal((await put('st-phone', { name: 'По телефону', phone: '90 800 00 02' })).statusCode, 200)
  assert.equal((await put('st-none', { name: 'Без сделок', phone: '' })).statusCode, 200)

  // A deal closed with a sale: the lead and its contact point at the student
  const linked = (await sales().post('/api/crm/leads', { contact: { name: 'Связанный', phone: '+998 93 111 11 11' } })).json()
  await sales().post(`/api/crm/leads/${linked.id}/notes`, { body: 'Оплатил первый месяц' })
  await sales().patch(`/api/crm/leads/${linked.id}`, { studentId: 'st-linked' })
  // A deal that was never linked, same phone as the student (typed differently)
  const byPhone = (await sales().post('/api/crm/leads', { contact: { name: 'Кто-то', phone: '+998 (90) 800-00-02' } })).json()
  await sales().post(`/api/crm/leads/${byPhone.id}/activities`, { type: 'call', direction: 'out', body: 'Не взял' })

  let h = (await sales().get('/api/crm/students/st-linked/history')).json()
  assert.deepEqual(h.leads.map(l => l.id), [linked.id])
  assert.equal(h.leads[0].stage.kind, 'open')
  assert.ok(h.activities.some(a => a.type === 'note' && a.body === 'Оплатил первый месяц' && a.leadTitle !== undefined))

  h = (await sales().get('/api/crm/students/st-phone/history')).json()
  assert.deepEqual(h.contacts.map(c => c.name), ['Кто-то'])
  assert.deepEqual(h.leads.map(l => l.id), [byPhone.id])
  assert.ok(h.activities.some(a => a.type === 'call'))

  // No phone → nothing is matched (an empty phone must not match everyone)
  h = (await sales().get('/api/crm/students/st-none/history')).json()
  assert.deepEqual(h, { contacts: [], leads: [], activities: [] })

  assert.equal((await sales().get('/api/crm/students/nope/history')).statusCode, 404)
  assert.equal((await ctx.as('teacher').get('/api/crm/students/st-linked/history')).statusCode, 404)
  assert.equal((await ctx.as('otherOwner').get('/api/crm/students/st-linked/history')).statusCode, 404)
})
