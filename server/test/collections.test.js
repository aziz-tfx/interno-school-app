import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'

const ctx = setup()
const owner = () => ctx.as('owner')

test('addDoc → getDoc round-trip keeps the Firestore document shape', async () => {
  const res = await owner().post('/api/collections/students', { name: 'Иванов', phone: '+998 93 543-55-67', balance: 0, tags: ['a'] })
  assert.equal(res.statusCode, 201)
  const created = res.json()
  assert.match(created.id, /^[A-Za-z0-9]{20}$/)
  assert.equal(created.data.tenantId, 'school-a')
  assert.equal(created.data.name, 'Иванов')

  const got = (await owner().get(`/api/collections/students/${created.id}`)).json()
  assert.deepEqual(got, created)
})

test('updateDoc supports dotted paths and Firestore sentinels', async () => {
  await owner().put('/api/collections/students/st-up', { name: 'X', balance: 100, stats: { a: 1 }, tags: ['x'], tmp: 1 })
  const res = await owner().patch('/api/collections/students/st-up', {
    balance: { $increment: -40 },
    'stats.b': 2,
    tags: { $arrayUnion: ['y', 'x'] },
    tmp: { $delete: true },
    seenAt: { $serverTimestamp: true },
  })
  const doc = res.json().data
  assert.equal(doc.balance, 60)
  assert.deepEqual(doc.stats, { a: 1, b: 2 })
  assert.deepEqual(doc.tags, ['x', 'y'])
  assert.equal('tmp' in doc, false)
  assert.ok(!Number.isNaN(Date.parse(doc.seenAt)))

  assert.equal((await owner().patch('/api/collections/students/missing', { a: 1 })).statusCode, 404)
})

test('setDoc merge deep-merges; plain setDoc replaces', async () => {
  await owner().put('/api/collections/settings/permissions_school-a', { sales: { finance: true }, rop: { crm: true } })
  await owner().put('/api/collections/settings/permissions_school-a?merge=1', { sales: { crm: true } })
  let doc = (await owner().get('/api/collections/settings/permissions_school-a')).json().data
  assert.deepEqual(doc.sales, { finance: true, crm: true })
  assert.deepEqual(doc.rop, { crm: true })
  await owner().put('/api/collections/settings/permissions_school-a', { only: 1 })
  doc = (await owner().get('/api/collections/settings/permissions_school-a')).json().data
  assert.deepEqual(Object.keys(doc).sort(), ['only', 'tenantId'])
})

test('where / orderBy / limit behave like Firestore queries (type-strict)', async () => {
  for (const [id, amount, date] of [['p1', 100, '2026-10-01'], ['p2', 300, '2026-10-05'], ['p3', '300', '2026-10-03']]) {
    await owner().put(`/api/collections/payments/${id}`, { amount, date, type: 'income', studentId: 'st-1' })
  }
  const q = (where, extra = '') => owner().get(`/api/collections/payments?where=${encodeURIComponent(JSON.stringify(where))}${extra}`)

  assert.deepEqual((await q([['amount', '==', 300]])).json().map(d => d.id), ['p2'])
  assert.deepEqual((await q([['amount', '>=', 100]], '&orderBy=amount&direction=desc')).json().map(d => d.id), ['p2', 'p1'])
  assert.deepEqual((await q([['date', '>', '2026-10-01']], '&orderBy=date')).json().map(d => d.id), ['p3', 'p2'])
  assert.deepEqual((await q([['id', 'in', ['p1', 'p3']]])).json().map(d => d.id), ['p1', 'p3'])
  assert.equal((await q([['amount', '==', 300]], '&limit=0')).json().length, 1)
  assert.equal((await q([['bad field', '==', 1]])).statusCode, 400)
})

test('schools are isolated: other tenant ids are invisible and cannot be overwritten', async () => {
  const other = ctx.as('otherOwner')
  assert.equal((await other.get('/api/collections/payments/p1')).statusCode, 404)
  assert.equal((await other.get('/api/collections/payments')).json().length, 0)
  // setDoc on an id that belongs to school-a must not hijack it
  assert.equal((await other.put('/api/collections/payments/p1', { amount: 1 })).statusCode, 404)
  assert.equal((await other.patch('/api/collections/payments/p1', { amount: 1 })).statusCode, 404)
  await other.delete('/api/collections/payments/p1')
  assert.equal((await owner().get('/api/collections/payments/p1')).json().data.amount, 100)
  // tenantId in the body is ignored
  const res = await other.post('/api/collections/courses', { name: 'Хак', tenantId: 'school-a' })
  assert.equal(res.json().data.tenantId, 'school-b')
})

test('students see only their own records and only LMS-side collections', async () => {
  const student = ctx.as('student')
  await owner().put('/api/collections/students/st-1', { name: 'Алексей', phone: '998935435567' })
  await owner().put('/api/collections/students/st-2', { name: 'Чужой', phone: '998900000000' })
  await owner().put('/api/collections/payments/p-other', { amount: 5, studentId: 'st-2' })

  assert.deepEqual((await student.get('/api/collections/students')).json().map(d => d.id), ['st-1'])
  assert.equal((await student.get('/api/collections/students/st-2')).statusCode, 404)
  assert.ok((await student.get('/api/collections/payments')).json().every(p => p.data.studentId === 'st-1'))
  assert.equal((await student.get('/api/collections/employees')).statusCode, 403)
  assert.equal((await student.get('/api/collections/tenantIntegrations')).statusCode, 403)
  assert.equal((await student.post('/api/collections/payments', { amount: 1, studentId: 'st-1' })).statusCode, 403)

  // own LMS progress: allowed; someone else's: not
  assert.equal((await student.post('/api/collections/lmsProgress', { studentId: 'st-1', lessonId: 'l1' })).statusCode, 201)
  assert.equal((await student.post('/api/collections/lmsProgress', { studentId: 'st-2', lessonId: 'l1' })).statusCode, 403)
  // leaderboard is readable by everyone, writable only for self
  await owner().put('/api/collections/studentGameData/st-2', { xp: 10 })
  assert.equal((await student.get('/api/collections/studentGameData')).json().length, 1)
  assert.equal((await student.put('/api/collections/studentGameData/st-2', { xp: 9999 })).statusCode, 403)
  assert.equal((await student.put('/api/collections/studentGameData/st-1?merge=1', { xp: 5 })).statusCode, 200)
})

test('employees: passwords are hashed, never stored or returned in plain text', async () => {
  const res = await owner().post('/api/collections/employees', { name: 'Новый', login: 'new1', password: 'secret1', role: 'sales', status: 'active' })
  assert.equal(res.statusCode, 201)
  assert.equal(res.json().data.password, undefined)
  const { rows: [row] } = await ctx.pool.query('SELECT data, password_hash FROM employees WHERE id = $1', [res.json().id])
  assert.equal(row.data.password, undefined)
  assert.match(row.password_hash, /^\$2[aby]\$/)
  const login = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'new1', password: 'secret1' } })
  assert.equal(login.statusCode, 200)
})

test('employees: no self-promotion, profile edits allowed', async () => {
  const sales = ctx.as('sales')
  assert.equal((await sales.patch('/api/collections/employees/e-sales', { role: 'owner' })).statusCode, 403)
  assert.equal((await sales.put('/api/collections/employees/e-sales', { name: 'Гулнора' })).statusCode, 403) // would drop role
  assert.equal((await sales.patch('/api/collections/employees/e-teach', { name: 'x' })).statusCode, 403)
  const ok = await sales.patch('/api/collections/employees/e-sales', { avatar: 'Г', phone: '+998 90 111 22 33' })
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.json().data.role, 'sales')
  // teachers can't see tenant secrets
  assert.equal((await ctx.as('teacher').get('/api/collections/tenantIntegrations')).statusCode, 403)
})

test('staff create and reset student LMS accounts, but cannot mint staff accounts', async () => {
  const sales = ctx.as('sales')
  const acc = await sales.put('/api/collections/employees/stud-acc-1', { login: '998977000111', password: '123456', role: 'student', studentId: 'st-9', name: 'Ученик' })
  assert.equal(acc.statusCode, 200)
  assert.equal((await sales.patch('/api/collections/employees/stud-acc-1', { password: '654321' })).statusCode, 200)
  assert.equal((await sales.patch('/api/collections/employees/stud-acc-1', { role: 'admin' })).statusCode, 403)
  assert.equal((await sales.put('/api/collections/employees/staff-x', { login: 'x', role: 'sales' })).statusCode, 403)
  assert.equal((await sales.delete('/api/collections/employees/e-teach')).statusCode, 403)
  const login = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: '977000111', password: '654321' } })
  assert.equal(login.json().user.role, 'student')
})

test('batch writes are atomic', async () => {
  const res = await owner().post('/api/batch', {
    ops: [
      { op: 'set', collection: 'groups', id: 'g1', data: { name: 'G1' } },
      { op: 'update', collection: 'groups', id: 'does-not-exist', data: { name: 'boom' } },
    ],
  })
  assert.equal(res.statusCode, 404)
  assert.equal((await owner().get('/api/collections/groups/g1')).statusCode, 404) // rolled back

  const ok = await owner().post('/api/batch', {
    ops: [
      { op: 'set', collection: 'groups', id: 'g1', data: { name: 'G1' } },
      { op: 'update', collection: 'groups', id: 'g1', data: { size: 3 } },
      { op: 'delete', collection: 'groups', id: 'nothing-here' },
    ],
  })
  assert.equal(ok.statusCode, 200)
  assert.deepEqual((await owner().get('/api/collections/groups/g1')).json().data.size, 3)
})

test('documents keep their own `id` field (legacy numeric employee ids)', async () => {
  await owner().put('/api/collections/employees/emp-doc-1', { id: 26, name: 'Нигора', role: 'teacher', login: 'nig' })
  const got = (await owner().get('/api/collections/employees/emp-doc-1')).json()
  assert.equal(got.id, 'emp-doc-1')
  assert.equal(got.data.id, 26)
})

test('own password change keeps the session; an admin reset ends it', async () => {
  const login = (await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'teacher1', password: 'teach-pass' } })).json()
  const headers = { authorization: `Bearer ${login.token}` }
  const me = () => ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers })
  await ctx.app.inject({ method: 'PATCH', url: '/api/collections/employees/e-teach', headers, payload: { password: 'teach-pass-2' } })
  assert.equal((await me()).statusCode, 200)
  await owner().patch('/api/collections/employees/e-teach', { password: 'teach-pass' })
  assert.equal((await me()).statusCode, 401)
})

test('unknown collections are rejected', async () => {
  assert.equal((await owner().get('/api/collections/pg_shadow')).statusCode, 404)
})
