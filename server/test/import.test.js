import { test } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { setup } from './helpers.js'
import { importFromFirestore, tenantOf, toJson } from '../src/firestoreImport.js'
import { importFromAmo } from '../src/crm/amoImport.js'

const ctx = setup()

// ─── Firestore ──────────────────────────────────────────────────────────

const fakeTimestamp = (iso) => ({ toDate: () => new Date(iso) })
const firestoreData = () => ({
  employees: [
    { id: '26', data: { id: 26, login: 'teacher9', password: 'pw-1', role: 'teacher', name: 'Нигора', status: 'active' } },
    { id: 'mgr', data: { login: 'sales9', password: 'pw-2', role: 'sales', name: 'Шахло', amoUserId: 555, tenantId: 'default' } },
  ],
  students: [
    { id: 'fs-st-1', data: { name: 'Камила', phone: '+998 (91) 222-33-44', balance: 0, createdAt: fakeTimestamp('2025-03-01T10:00:00Z'), tenantId: 'default' } },
  ],
  attendance: [{ id: '_meta_default', data: { data: { g1: { '2026-10-01': ['fs-st-1'] } } } }],
  settings: [{ id: 'bootstrap', data: { employeesSeeded: true } }, { id: 'permissions_school-x', data: { sales: {} } }],
  tenantIntegrations: [{ id: 'default', data: { amocrm: { subdomain: 'interno' } } }],
})
const sourceOf = (data) => ({
  async *docs(name) { for (const d of data[name] || []) yield d },
})

test('tenant detection and Firestore type conversion', () => {
  assert.equal(tenantOf('students', 'x', { tenantId: 't1' }), 't1')
  assert.equal(tenantOf('attendance', '_meta_t2', {}), 't2')
  assert.equal(tenantOf('settings', 'permissions_t3', {}), 't3')
  assert.equal(tenantOf('tenantIntegrations', 't4', {}), 't4')
  assert.equal(tenantOf('salesPlans', '_meta', {}), 'default')
  assert.deepEqual(toJson({ at: fakeTimestamp('2026-01-02T03:04:05Z'), n: [1, { x: undefined }] }), { at: '2026-01-02T03:04:05.000Z', n: [1, {}] })
})

test('Firestore import: hashes passwords, keeps ids, re-run is a no-op', async () => {
  const data = firestoreData()
  const first = await importFromFirestore({ pool: ctx.pool, source: sourceOf(data) })
  assert.equal(first.employees.written, 2)
  assert.equal(first.settings.skipped, 1)

  const { rows: [emp] } = await ctx.pool.query("SELECT data, password_hash, token_version, tenant_id FROM employees WHERE id = '26'")
  assert.equal(emp.data.password, undefined)
  assert.equal(emp.tenant_id, 'default')
  assert.ok(await bcrypt.compare('pw-1', emp.password_hash))
  const login = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'teacher9', password: 'pw-1' } })
  assert.equal(login.statusCode, 200)

  const { rows: [st] } = await ctx.pool.query("SELECT data, phone_digits, created_at FROM students WHERE id = 'fs-st-1'")
  assert.equal(st.phone_digits, '998912223344')
  assert.equal(st.created_at.toISOString(), '2025-03-01T10:00:00.000Z')

  const second = await importFromFirestore({ pool: ctx.pool, source: sourceOf(firestoreData()) })
  assert.equal(second.employees.unchanged, 2)
  assert.equal(second.students.unchanged, 1)

  // password changed in Firestore → new hash, old sessions revoked
  const changed = firestoreData()
  changed.employees[0].data.password = 'pw-new'
  await importFromFirestore({ pool: ctx.pool, source: sourceOf(changed), only: ['employees'] })
  const { rows: [emp2] } = await ctx.pool.query("SELECT password_hash, token_version FROM employees WHERE id = '26'")
  assert.ok(await bcrypt.compare('pw-new', emp2.password_hash))
  assert.equal(emp2.token_version, emp.token_version + 1)

  // every referenced school exists afterwards
  const { rows } = await ctx.pool.query("SELECT 1 FROM tenants WHERE id = 'default'")
  assert.equal(rows.length, 1)
})

// ─── amoCRM ─────────────────────────────────────────────────────────────

const T0 = Math.floor(Date.parse('2026-09-01T09:00:00Z') / 1000)
const amoData = {
  '/api/v4/users': { users: [{ id: 555, name: 'Шахло' }, { id: 777, name: 'Нигора' }, { id: 999, name: 'Ушедший' }] },
  '/api/v4/leads/pipelines': {
    pipelines: [{
      id: 10, name: 'Воронка', sort: 1, is_main: true,
      _embedded: { statuses: [
        { id: 100, name: 'Неразобранное', sort: 10, type: 1 },
        { id: 101, name: 'Первичный контакт', sort: 20, type: 0 },
        { id: 102, name: 'Пробный урок', sort: 30, type: 0 },
        { id: 142, name: 'Успешно реализовано', sort: 10000, type: 0 },
        { id: 143, name: 'Закрыто и не реализовано', sort: 11000, type: 0 },
      ] },
    }],
  },
  '/api/v4/contacts': {
    contacts: [{ id: 1, name: 'Камила', responsible_user_id: 555, created_at: T0,
      custom_fields_values: [{ field_code: 'PHONE', values: [{ value: '+998 91 222 33 44' }] }] }],
  },
  '/api/v4/leads?with=contacts,loss_reason': {
    leads: [
      { id: 50, name: 'Камила — дизайн', price: 3000000, pipeline_id: 10, status_id: 142, responsible_user_id: 555,
        created_at: T0, updated_at: T0 + 7200, closed_at: T0 + 7200,
        _embedded: { contacts: [{ id: 1, is_main: true }], tags: [{ name: 'instagram' }] } },
      { id: 51, name: 'Без менеджера', price: 0, pipeline_id: 10, status_id: 100, responsible_user_id: 999,
        created_at: T0, updated_at: T0, _embedded: {} },
    ],
  },
  '/api/v4/events?filter[type]=lead_status_changed': {
    events: [
      { id: 'e1', entity_id: 50, created_by: 555, created_at: T0 + 600,
        value_before: [{ lead_status: { id: 100, pipeline_id: 10 } }], value_after: [{ lead_status: { id: 101, pipeline_id: 10 } }] },
      { id: 'e2', entity_id: 50, created_by: 555, created_at: T0 + 7200,
        value_before: [{ lead_status: { id: 101, pipeline_id: 10 } }], value_after: [{ lead_status: { id: 142, pipeline_id: 10 } }] },
    ],
  },
  '/api/v4/leads/notes': {
    notes: [
      { id: 9, entity_id: 50, note_type: 'call_out', created_by: 555, created_at: T0 + 300, params: { phone: '998912223344', duration: 95 } },
      { id: 10, entity_id: 50, note_type: 'common', created_by: 555, created_at: T0 + 900, params: { text: 'Оплатит завтра' } },
    ],
  },
  '/api/v4/contacts/notes': { notes: [] },
  '/api/v4/tasks': {
    tasks: [{ id: 70, entity_type: 'leads', entity_id: 50, responsible_user_id: 555, text: 'Перезвонить',
      complete_till: T0 + 86400, is_completed: true, result: { text: 'Готово' }, created_at: T0, updated_at: T0 + 3600 }],
  },
}
const fakeAmo = {
  async get(path) {
    const base = path.replace(/[?&]limit=\d+&page=(\d+)$/, '')
    const page = Number(path.match(/page=(\d+)$/)?.[1] || 1)
    const data = amoData[base]
    if (!data) throw new Error(`unexpected amo call ${path}`)
    if (page > 1) return null
    return { _embedded: data }
  },
}

test('amo import maps users, stages, contacts, history; re-run does not duplicate', async () => {
  const stats = await importFromAmo({ pool: ctx.pool, tenantId: 'default', amo: fakeAmo })
  assert.equal(stats.mappedUsers, 2) // Шахло by amoUserId, Нигора by name; Ушедший unmatched
  assert.equal(stats.leads, 2)

  const { rows: stages } = await ctx.pool.query('SELECT s.name, s.kind, s.is_inbox FROM crm_stages s JOIN crm_pipelines p ON p.id = s.pipeline_id WHERE p.amo_id = 10 ORDER BY s.sort')
  assert.deepEqual(stages.map(s => [s.kind, s.is_inbox]), [['open', true], ['open', false], ['open', false], ['won', false], ['lost', false]])

  const { rows: [lead] } = await ctx.pool.query("SELECT * FROM crm_leads WHERE amo_id = 50")
  assert.equal(lead.responsible_id, 'mgr')
  assert.equal(lead.amount, 3000000)
  assert.deepEqual(lead.tags, ['instagram'])
  assert.ok(lead.closed_at)
  assert.equal(lead.first_response_at.toISOString(), new Date((T0 + 300) * 1000).toISOString()) // the call

  const { rows: [contact] } = await ctx.pool.query('SELECT * FROM crm_contacts WHERE amo_id = 1')
  assert.deepEqual(contact.phones, ['998912223344'])
  assert.equal(contact.student_id, 'fs-st-1') // linked by phone to the imported student

  const { rows: [orphan] } = await ctx.pool.query("SELECT responsible_id, custom FROM crm_leads WHERE amo_id = 51")
  assert.equal(orphan.responsible_id, null)
  assert.equal(orphan.custom.amoResponsible, 'Ушедший')

  const count = async () => (await ctx.pool.query(
    `SELECT (SELECT count(*) FROM crm_leads) l, (SELECT count(*) FROM crm_activities) a,
            (SELECT count(*) FROM crm_tasks) t, (SELECT count(*) FROM crm_contacts) c`
  )).rows[0]
  const before = await count()
  await importFromAmo({ pool: ctx.pool, tenantId: 'default', amo: fakeAmo })
  assert.deepEqual(await count(), before)
})

test('imported history feeds the funnel report', async () => {
  const login = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'sales9', password: 'pw-2' } })
  const headers = { authorization: `Bearer ${login.json().token}` }
  const { rows: [p] } = await ctx.pool.query('SELECT id FROM crm_pipelines WHERE amo_id = 10')
  const res = await ctx.app.inject({ method: 'GET', url: `/api/crm/analytics/funnel?pipelineId=${p.id}&from=2026-09-01&to=2026-09-30`, headers })
  const r = res.json()
  assert.equal(r.totals.created, 2)
  assert.equal(r.totals.won, 1)
  assert.equal(r.totals.medianResponseMin, 5)
  const reached = Object.fromEntries(r.stages.map(s => [s.name, s.reached]))
  assert.deepEqual(reached, { 'Неразобранное': 2, 'Первичный контакт': 1, 'Пробный урок': 1, 'Успешно реализовано': 1, 'Закрыто и не реализовано': 0 })
})
