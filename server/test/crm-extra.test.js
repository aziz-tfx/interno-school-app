import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setup } from './helpers.js'

const filesDir = mkdtempSync(join(tmpdir(), 'interno-files-'))
const ctx = setup({ env: { FILES_DIR: filesDir } })
after(() => rmSync(filesDir, { recursive: true, force: true }))
const sales = () => ctx.as('sales')
const owner = () => ctx.as('owner')

let pipeline
const stage = (name) => pipeline.stages.find(s => s.name === name)
const fields = {}
const leads = {}

test('custom fields: managers define them, values are typed and merge into the deal', async () => {
  pipeline = (await sales().get('/api/crm/pipelines')).json()[0]
  assert.equal((await sales().post('/api/crm/fields', { entity: 'lead', label: 'Формат', type: 'select' })).statusCode, 403)

  let res = await owner().post('/api/crm/fields', { entity: 'lead', label: 'Формат', type: 'select', options: ['Онлайн', 'Офлайн', 'Онлайн'] })
  assert.equal(res.statusCode, 201)
  fields.format = res.json()
  assert.deepEqual(fields.format.options, ['Онлайн', 'Офлайн'])
  fields.age = (await owner().post('/api/crm/fields', { entity: 'lead', label: 'Возраст', type: 'number' })).json()
  assert.deepEqual((await sales().get('/api/crm/fields')).json().map(f => f.label), ['Формат', 'Возраст'])

  res = await sales().post('/api/crm/leads', {
    contact: { name: 'Севара', phone: '+998 90 111 22 33' }, amount: 3000000, tags: ['vip'],
    custom: { utm: { source: 'ig' } }, fields: { [fields.format.key]: 'Онлайн' },
  })
  assert.equal(res.statusCode, 201)
  leads.a = res.json()
  assert.deepEqual(leads.a.custom, { utm: { source: 'ig' }, fields: { [fields.format.key]: 'Онлайн' } })

  res = await sales().patch(`/api/crm/leads/${leads.a.id}`, { fields: { [fields.age.key]: '17' } })
  assert.deepEqual(res.json().custom.fields, { [fields.format.key]: 'Онлайн', [fields.age.key]: 17 })
  assert.equal(res.json().custom.utm.source, 'ig') // untouched
  res = await sales().patch(`/api/crm/leads/${leads.a.id}`, { fields: { [fields.format.key]: null } })
  assert.deepEqual(res.json().custom.fields, { [fields.age.key]: 17 })

  assert.equal((await sales().patch(`/api/crm/leads/${leads.a.id}`, { fields: { [fields.format.key]: 'Заочно' } })).statusCode, 400)
  assert.equal((await sales().patch(`/api/crm/leads/${leads.a.id}`, { fields: { [fields.age.key]: 'много' } })).statusCode, 400)
  assert.equal((await sales().patch(`/api/crm/leads/${leads.a.id}`, { fields: { nope: 1 } })).statusCode, 400)

  // renaming keeps the values (the key doesn't change)
  res = await owner().patch(`/api/crm/fields/${fields.age.id}`, { label: 'Возраст ученика' })
  assert.equal(res.json().key, fields.age.key)
})

test('list: filters by status, tags, dates and tasks; sorting', async () => {
  leads.b = (await sales().post('/api/crm/leads', { contact: { name: 'Бобур', phone: '+998 90 222 33 44' }, amount: 500000, tags: ['school'] })).json()
  leads.c = (await sales().post('/api/crm/leads', { contact: { name: 'Вика', phone: '+998 90 333 44 55' }, amount: 9000000 })).json()
  await sales().patch(`/api/crm/leads/${leads.c.id}`, { stageId: stage('Успешно реализовано').id })
  await sales().post('/api/crm/tasks', { leadId: leads.b.id, text: 'Перезвонить', dueAt: new Date(Date.now() - 3600_000).toISOString() })

  const list = async (qs) => {
    const res = await sales().get(`/api/crm/leads?pipelineId=${pipeline.id}&${qs}`)
    assert.equal(res.statusCode, 200, res.body)
    return res.json()
  }
  assert.deepEqual((await list('status=won')).items.map(l => l.id), [leads.c.id])
  assert.equal((await list('status=open')).total, 2)
  assert.deepEqual((await list('tags=vip,nothing')).items.map(l => l.id), [leads.a.id])
  assert.deepEqual((await list('tasks=overdue')).items.map(l => l.id), [leads.b.id])
  assert.ok((await list('tasks=overdue')).items[0].nextTaskAt)
  assert.ok(!(await list('tasks=none')).items.some(l => l.id === leads.b.id))
  assert.deepEqual((await list('sort=amount&direction=asc')).items.map(l => l.amount).map(Number), [500000, 3000000, 9000000])
  const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10)
  assert.equal((await list(`createdFrom=${today}&createdTo=${today}`)).total, 3)
  assert.equal((await list('createdTo=2020-01-01')).total, 0)
  assert.equal((await sales().get('/api/crm/leads?status=maybe')).statusCode, 400)
  assert.equal((await sales().get('/api/crm/leads?createdFrom=yesterday')).statusCode, 400)

  const tags = (await sales().get('/api/crm/tags')).json()
  assert.deepEqual(tags.map(t => t.name).sort(), ['school', 'vip'])
})

test('bulk actions: tags, stage, responsible, task; delete needs a manager', async () => {
  const ids = (await sales().get(`/api/crm/leads/ids?pipelineId=${pipeline.id}&status=open`)).json()
  assert.deepEqual(ids.sort(), [leads.a.id, leads.b.id].sort())

  let res = await sales().post('/api/crm/leads/bulk', { ids, action: 'addTags', value: ['весна'] })
  assert.equal(res.json().updated, 2)
  res = await sales().post('/api/crm/leads/bulk', { ids, action: 'stage', value: stage('Связались').id })
  assert.equal(res.statusCode, 200)
  const moved = (await sales().get(`/api/crm/leads?stageId=${stage('Связались').id}`)).json()
  assert.equal(moved.total, 2)
  assert.ok(moved.items.every(l => l.tags.includes('весна')))
  const timeline = (await sales().get(`/api/crm/leads/${leads.a.id}/activities`)).json()
  assert.ok(timeline.some(a => a.type === 'stage_change' && a.meta.to === stage('Связались').id))

  await sales().post('/api/crm/leads/bulk', { ids, action: 'responsible', value: 'e-owner' })
  await sales().post('/api/crm/leads/bulk', { ids, action: 'task', value: { text: 'Пригласить на день открытых дверей', dueAt: new Date(Date.now() + 86400_000).toISOString() } })
  const tasks = (await owner().get('/api/crm/tasks?assigneeId=all')).json()
  assert.equal(tasks.filter(t => t.text === 'Пригласить на день открытых дверей').length, 2)
  await sales().post('/api/crm/leads/bulk', { ids, action: 'removeTags', value: 'весна' })
  assert.equal((await sales().get('/api/crm/leads?tags=весна')).json().total, 0)

  assert.equal((await sales().post('/api/crm/leads/bulk', { ids, action: 'delete' })).statusCode, 403)
  assert.equal((await sales().post('/api/crm/leads/bulk', { ids: ['nope'], action: 'stage', value: 'x' })).statusCode, 400)
  // another school's deals are skipped, not touched
  const other = await ctx.as('otherOwner').post('/api/crm/leads/bulk', { ids, action: 'delete' })
  assert.equal(other.json().updated, 0)
  assert.equal((await owner().post('/api/crm/leads/bulk', { ids: [leads.b.id], action: 'delete' })).json().updated, 1)
  assert.equal((await sales().get(`/api/crm/leads/${leads.b.id}`)).statusCode, 404)
})

test('CSV export for managers, with custom field columns', async () => {
  assert.equal((await sales().get('/api/crm/leads/export')).statusCode, 403)
  const res = await owner().get(`/api/crm/leads/export?pipelineId=${pipeline.id}&sort=amount`)
  assert.equal(res.statusCode, 200)
  assert.match(res.headers['content-type'], /text\/csv/)
  const [header, ...rows] = res.body.replace(/^﻿/, '').split('\r\n')
  assert.match(header, /^Название;Контакт;Телефон;.*;Формат;Возраст ученика$/)
  assert.equal(rows.length, 2)
  assert.match(rows.find(r => r.startsWith('Севара')), /\+998901112233;.*;17$/)
})

test('files on a deal: upload, list, download, delete', async () => {
  const upload = (who, body, name = 'договор №1.pdf') => ctx.app.inject({
    method: 'POST', url: `/api/crm/leads/${leads.a.id}/files?name=${encodeURIComponent(name)}&type=application/pdf`,
    headers: { authorization: `Bearer ${ctx.tokens[who]}`, 'content-type': 'application/octet-stream' },
    payload: body,
  })
  assert.equal((await upload('teacher', Buffer.from('x'))).statusCode, 403)
  let res = await upload('sales', Buffer.from('%PDF-1.4 test'))
  assert.equal(res.statusCode, 201)
  const file = res.json()
  assert.equal(file.name, 'договор №1.pdf')
  assert.equal(file.size, 13)

  const list = (await sales().get(`/api/crm/leads/${leads.a.id}/files`)).json()
  assert.deepEqual(list.map(f => f.id), [file.id])
  res = await owner().get(`/api/crm/files/${file.id}`)
  assert.equal(res.body, '%PDF-1.4 test')
  assert.match(res.headers['content-disposition'], /filename\*=UTF-8''/)
  assert.equal((await ctx.as('otherOwner').get(`/api/crm/files/${file.id}`)).statusCode, 404)

  // too big
  res = await upload('sales', Buffer.alloc(26 * 1024 * 1024))
  assert.equal(res.statusCode, 413)

  const timeline = (await sales().get(`/api/crm/leads/${leads.a.id}/activities`)).json()
  assert.ok(timeline.some(a => a.type === 'system' && a.body === 'Файл: договор №1.pdf'))
  assert.equal((await ctx.as('owner').delete(`/api/crm/files/${file.id}`)).statusCode, 200)
  assert.equal((await owner().get(`/api/crm/files/${file.id}`)).statusCode, 404)
})
