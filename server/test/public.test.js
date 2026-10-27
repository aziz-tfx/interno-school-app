import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'

const ctx = setup()
const anon = (method, url, payload) => ctx.app.inject({ method, url, payload })
const owner = () => ctx.as('owner')

test('catalog exposes branch names but not their finances', async () => {
  await owner().put('/api/collections/branches/br-1', { name: 'Ташкент', monthlyRevenue: 99000000, color: '#f00' })
  await owner().put('/api/collections/courses/c-1', { name: 'Дизайн интерьера', pricing: {} })
  const res = (await anon('GET', '/api/public/catalog?tenantId=school-a')).json()
  assert.deepEqual(res.branches, [{ id: 'br-1', data: { name: 'Ташкент', color: '#f00' } }])
  assert.deepEqual(res.courses, [{ id: 'c-1', data: { name: 'Дизайн интерьера' } }])
})

test('employee self-registration: pending, hashed, no owner role, unique login', async () => {
  const base = { tenantId: 'school-a', name: 'Новый Учитель', login: 'newteacher', password: 'secret-1', role: 'teacher', branch: 'br-1', subject: 'Скетчинг' }
  assert.equal((await anon('POST', '/api/public/register-employee', base)).statusCode, 201)
  const { rows: [emp] } = await ctx.pool.query("SELECT * FROM employees WHERE login = 'newteacher'")
  assert.equal(emp.status, 'pending')
  assert.equal(emp.data.password, undefined)
  const { rows: [teacher] } = await ctx.pool.query("SELECT data FROM teachers WHERE data->>'employeeId' = $1", [String(emp.data.id)])
  assert.equal(teacher.data.subject, 'Скетчинг')

  // pending accounts can't log in yet
  const login = await anon('POST', '/api/auth/login', { login: 'newteacher', password: 'secret-1' })
  assert.equal(login.statusCode, 403)

  assert.equal((await anon('POST', '/api/public/register-employee', base)).statusCode, 409)
  assert.equal((await anon('POST', '/api/public/register-employee', { ...base, login: 'x-owner', role: 'owner' })).statusCode, 400)
})

test('school registration creates tenant, owner and branch, and logs in', async () => {
  const res = await anon('POST', '/api/public/register-school', {
    schoolName: 'Новая школа', ownerName: 'Дилноза', login: 'dilnoza', password: 'school-pass', phone: '+998901234567',
  })
  assert.equal(res.statusCode, 201)
  const { token, user } = res.json()
  assert.equal(user.role, 'owner')
  assert.match(user.tenantId, /^tenant_/)
  const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${token}` } })
  assert.equal(me.json().user.name, 'Дилноза')
  const branches = await ctx.app.inject({ method: 'GET', url: '/api/collections/branches', headers: { authorization: `Bearer ${token}` } })
  assert.equal(branches.json()[0].data.name, 'Новая школа')
  // login must be unique across schools
  assert.equal((await anon('POST', '/api/public/register-school', { schoolName: 'X', ownerName: 'Y', login: 'OWNER', password: 'whatever1' })).statusCode, 409)
})

test('course landing: only the first module ships videos', async () => {
  await owner().put('/api/collections/lmsModules/m1', { courseId: 'c-1', title: 'Вводный', order: 1 })
  await owner().put('/api/collections/lmsModules/m2', { courseId: 'c-1', title: 'Платный', order: 2 })
  await owner().put('/api/collections/lmsLessons/l1', { courseId: 'c-1', moduleId: 'm1', title: 'Урок 1', videoUrl: 'https://kinescope.io/free1', order: 1 })
  await owner().put('/api/collections/lmsLessons/l2', { courseId: 'c-1', moduleId: 'm2', title: 'Урок 2', videoUrl: 'https://kinescope.io/paid2', order: 2 })
  await owner().put('/api/collections/groups/g-1', { course: 'Дизайн интерьера', name: 'ДИ-1', status: 'active', branch: 'br-1', teacherId: 't1' })

  const res = (await anon('GET', '/api/public/courses/c-1')).json()
  assert.equal(res.course.data.name, 'Дизайн интерьера')
  assert.deepEqual(res.modules.map(m => m.id), ['m1', 'm2'])
  assert.equal(res.lessons[0].data.videoUrl, 'https://kinescope.io/free1')
  assert.equal(res.lessons[1].data.videoUrl, undefined)
  assert.equal(res.lessons[1].data.hasVideo, true)
  assert.deepEqual(res.groups, [{ id: 'g-1', data: { name: 'ДИ-1', status: 'active', branch: 'br-1' } }])
  assert.equal((await anon('GET', '/api/public/courses/nope')).statusCode, 404)
})

test('landing signup: student account + CRM lead; repeat never leaks the password', async () => {
  const res = await anon('POST', '/api/public/courses/c-1/signup', { name: 'Зарина', phone: '+998 93 111 22 33' })
  assert.equal(res.statusCode, 201)
  const { token, user, credentials } = res.json()
  assert.equal(user.role, 'student')
  assert.equal(credentials.login, '998931112233')
  assert.match(credentials.password, /^\d{6}$/)

  // the student is logged in and sees their own record
  const mine = await ctx.app.inject({ method: 'GET', url: '/api/collections/students', headers: { authorization: `Bearer ${token}` } })
  assert.equal(mine.json().length, 1)
  assert.equal(mine.json()[0].data.groupId, 'g-1')

  // a lead landed in the CRM, linked to the student
  const { rows: [lead] } = await ctx.pool.query(
    `SELECT l.source, c.student_id FROM crm_leads l JOIN crm_contacts c ON c.id = l.contact_id WHERE l.tenant_id = 'school-a' AND l.source = 'landing'`
  )
  assert.equal(lead.student_id, user.studentId)

  const again = await anon('POST', '/api/public/courses/c-1/signup', { name: 'Кто-то', phone: '931112233' })
  assert.equal(again.statusCode, 409)
  assert.equal(again.json().credentials, undefined)
  assert.doesNotMatch(again.body, new RegExp(credentials.password))
})

test('contract: view limited fields, sign once', async () => {
  await owner().put('/api/collections/payments/pay-contract', {
    type: 'income', student: 'Зарина', amount: 1500000, contractNumber: 'D-15', passport: 'AB1234567', managerId: 'mgr_1', comment: 'внутреннее',
  })
  const view = (await anon('GET', '/api/public/contracts/pay-contract')).json()
  assert.equal(view.data.contractNumber, 'D-15')
  assert.equal(view.data.comment, undefined)
  assert.equal(view.data.managerId, undefined)

  const sig = 'data:image/png;base64,iVBORw0KGgo='
  assert.equal((await anon('POST', '/api/public/contracts/pay-contract/sign', { signatureData: 'javascript:alert(1)' })).statusCode, 400)
  assert.equal((await anon('POST', '/api/public/contracts/pay-contract/sign', { signatureData: sig })).statusCode, 200)
  assert.equal((await anon('POST', '/api/public/contracts/pay-contract/sign', { signatureData: sig })).statusCode, 409)
  assert.equal((await anon('GET', '/api/public/contracts/pay-contract')).json().data.contractSigned, true)
  assert.equal((await anon('GET', '/api/public/contracts/missing')).statusCode, 404)
})

test('telegram mini app: signed initData of a linked student logs in; forged data does not', async () => {
  const { createHmac } = await import('node:crypto')
  const { verifyTelegramInitData } = await import('../src/routes/public.js')
  const botToken = '123456:TEST-TOKEN'
  await ctx.pool.query(
    `INSERT INTO tenant_integrations (id, tenant_id, data) VALUES ('school-a', 'school-a', $1)`,
    [{ telegram: { botToken } }]
  )
  const sign = (fields) => {
    const p = new URLSearchParams(fields)
    const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n')
    const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
    p.set('hash', createHmac('sha256', secret).update(check).digest('hex'))
    return p.toString()
  }
  const now = Math.floor(Date.now() / 1000)
  const user = JSON.stringify({ id: 5550001, first_name: 'Алексей' })
  const initData = sign({ auth_date: String(now), user, query_id: 'q1' })

  assert.equal(verifyTelegramInitData(initData, botToken)?.id, 5550001)
  assert.equal(verifyTelegramInitData(initData, 'other-token'), null)
  assert.equal(verifyTelegramInitData(initData.replace('5550001', '5550002'), botToken), null)
  assert.equal(verifyTelegramInitData(sign({ auth_date: String(now - 2 * 86400), user }), botToken), null)

  const login = (data) => anon('POST', '/api/public/telegram-login', { initData: data, tenantId: 'school-a' })
  // not linked yet
  await owner().put('/api/collections/students/st-1', { name: 'Алексей', phone: '998935435567' })
  assert.equal((await login(initData)).statusCode, 404)
  // linked through the bot
  await owner().patch('/api/collections/students/st-1', { telegramChatId: 5550001 })
  const ok = await login(initData)
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.json().user.studentId, 'st-1')
  assert.equal((await login(initData.replace(/hash=[0-9a-f]+/, 'hash=' + '0'.repeat(64)))).statusCode, 401)
})
