import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'

const ctx = setup()
const sales = () => ctx.as('sales')
const owner = () => ctx.as('owner')
const c = {}

test('contacts list: deal counts, search, filters', async () => {
  const lead = (await sales().post('/api/crm/leads', { contact: { name: 'Нилуфар', phone: '+998 90 100 20 30', email: 'nilu@mail.uz' } })).json()
  c.nilu = lead.contactId
  await sales().post('/api/crm/leads', { contactId: c.nilu, title: 'Второй курс' })
  c.otabek = (await sales().post('/api/crm/contacts', { name: 'Отабек', phone: '+998 91 555 44 33' })).json().id

  const all = (await sales().get('/api/crm/contacts?sort=name&direction=asc')).json()
  assert.deepEqual(all.items.map(x => [x.name, x.leadsCount, x.openLeads]), [['Нилуфар', 2, 2], ['Отабек', 0, 0]])
  assert.deepEqual((await sales().get('/api/crm/contacts?q=nilu@')).json().items.map(x => x.id), [c.nilu])
  assert.deepEqual((await sales().get('/api/crm/contacts?q=5554433')).json().items.map(x => x.id), [c.otabek])
  assert.equal((await sales().get('/api/crm/contacts?student=yes')).json().total, 0)
  assert.equal((await ctx.as('teacher').get('/api/crm/contacts')).statusCode, 403)
})

test('contact card: deals and a timeline across all of them; custom fields', async () => {
  const card = (await sales().get(`/api/crm/contacts/${c.nilu}`)).json()
  assert.equal(card.leads.length, 2)
  await sales().post(`/api/crm/leads/${card.leads[0].id}/notes`, { body: 'Хочет вечернюю группу' })
  const timeline = (await sales().get(`/api/crm/contacts/${c.nilu}/activities`)).json()
  assert.ok(timeline.some(a => a.body === 'Хочет вечернюю группу' && a.leadTitle))

  const field = (await owner().post('/api/crm/fields', { entity: 'contact', label: 'Район', type: 'text' })).json()
  const res = await sales().patch(`/api/crm/contacts/${c.nilu}`, { fields: { [field.key]: 'Чиланзар' }, instagram: '@nilu' })
  assert.equal(res.json().custom.fields[field.key], 'Чиланзар')
  assert.equal(res.json().instagram, '@nilu')
  // a phone that belongs to someone else
  const dup = await sales().patch(`/api/crm/contacts/${c.nilu}`, { phones: ['+998 90 100 20 30', '+998 91 555 44 33'] })
  assert.equal(dup.statusCode, 409)
  assert.equal(dup.json().existing.id, c.otabek)
})

test('duplicates by phone and merging them', async () => {
  // the same person imported twice (amo) — the API itself wouldn't create this
  const { rows: [twin] } = await ctx.pool.query(
    `INSERT INTO crm_contacts (tenant_id, name, phones, telegram_username) VALUES ('school-a', 'Нилуфар К.', '{998901002030,998977770000}', 'nilu_k') RETURNING id`
  )
  c.twin = twin.id
  const twinLead = (await sales().post('/api/crm/leads', { contactId: c.twin, title: 'Из amo' })).json()

  const groups = (await sales().get('/api/crm/contacts/duplicates')).json()
  assert.equal(groups.length, 1)
  assert.equal(groups[0].phone, '998901002030')
  assert.deepEqual(groups[0].contacts.map(x => x.id).sort(), [c.nilu, c.twin].sort())

  assert.equal((await ctx.as('otherOwner').post(`/api/crm/contacts/${c.nilu}/merge`, { ids: [c.twin] })).statusCode, 404)
  const merged = (await sales().post(`/api/crm/contacts/${c.nilu}/merge`, { ids: [c.twin] })).json()
  assert.deepEqual(merged.phones.sort(), ['998901002030', '998977770000'])
  assert.equal(merged.name, 'Нилуфар')            // the target's own name stays
  assert.equal(merged.telegramUsername, 'nilu_k')  // missing details come from the other
  assert.equal((await sales().get(`/api/crm/leads/${twinLead.id}`)).json().contactId, c.nilu)
  assert.equal((await sales().get(`/api/crm/contacts/${c.twin}`)).statusCode, 404)
  assert.equal((await sales().get('/api/crm/contacts/duplicates')).json().length, 0)
  const timeline = (await sales().get(`/api/crm/contacts/${c.nilu}/activities`)).json()
  assert.ok(timeline.some(a => a.type === 'system' && /Объединены контакты/.test(a.body)))
})

test('deleting a contact: managers only, and only without deals', async () => {
  assert.equal((await sales().delete(`/api/crm/contacts/${c.otabek}`)).statusCode, 403)
  assert.equal((await owner().delete(`/api/crm/contacts/${c.nilu}`)).statusCode, 409)
  assert.equal((await owner().delete(`/api/crm/contacts/${c.otabek}`)).statusCode, 200)
  assert.equal((await sales().get('/api/crm/contacts')).json().total, 1)
})
