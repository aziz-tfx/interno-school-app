import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'
import { getDb } from '../src/vercel/_lib/tenantConfig.js'

const webhooks = []
const sent = []
const telegram = {
  send: async (botToken, chatId, text) => { sent.push({ botToken, chatId: String(chatId), text }); return true },
  setWebhook: async (botToken, params) => { webhooks.push({ botToken, ...params }); return { ok: true } },
}
const ctx = setup({ telegram, env: { API_DOMAIN: 'api.test' } })

// The moved handlers call Telegram / amo / Payme with fetch(): record instead
const outbound = []
const realFetch = globalThis.fetch
before(() => {
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes('127.0.0.1') || String(url).includes('localhost')) return realFetch(url, init)
    outbound.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null })
    return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 })
  }
})
after(() => { globalThis.fetch = realFetch })

const insert = (table, id, tenant, data) =>
  ctx.pool.query(`INSERT INTO ${table} (id, tenant_id, data) VALUES ($1, $2, $3)`, [id, tenant, { ...data, tenantId: tenant }])

test('firestore layer: get/set/merge/update/add and queries over the document tables', async () => {
  const db = getDb()
  const ref = db.collection('aiAgentConversations').doc('school-a__lead_1')
  assert.equal((await ref.get()).exists, false)
  await ref.set({ tenantId: 'school-a', messages: [{ role: 'user', text: 'Салом' }], meta: { a: 1 } })
  await ref.set({ meta: { b: 2 }, followUpDueAt: '2026-10-27T10:00:00.000Z' }, { merge: true })
  await ref.update({ 'meta.c': 3, replies: 1 })
  const snap = await ref.get()
  assert.deepEqual(snap.data().meta, { a: 1, b: 2, c: 3 })
  assert.equal(snap.data().messages[0].text, 'Салом')
  const { rows: [row] } = await ctx.pool.query('SELECT tenant_id FROM ai_agent_conversations WHERE id = $1', ['school-a__lead_1'])
  assert.equal(row.tenant_id, 'school-a')

  await assert.rejects(db.collection('aiAgentConversations').doc('missing').update({ x: 1 }))

  const added = await db.collection('aiAgentConversations').add({ tenantId: 'school-a', followUpDueAt: '2026-10-27T09:00:00.000Z', replies: 5, paused: true })
  assert.ok(added.id)

  const due = await db.collection('aiAgentConversations')
    .where('followUpDueAt', '<=', '2026-10-27T12:00:00.000Z').orderBy('followUpDueAt').limit(10).get()
  assert.deepEqual(due.docs.map(d => d.id), [added.id, 'school-a__lead_1'])
  assert.equal((await db.collection('aiAgentConversations').where('replies', '>=', 2).get()).size, 1)
  assert.equal((await db.collection('aiAgentConversations').where('paused', '==', true).get()).docs[0].id, added.id)
  const one = await db.collection('aiAgentConversations').orderBy('followUpDueAt', 'desc').limit(1).get()
  assert.equal(one.docs[0].id, 'school-a__lead_1')
})

test('firestore layer: concurrent transactions on one document do not lose updates', async () => {
  const db = getDb()
  const ref = db.collection('aiAgentAlerts').doc('counter')
  const bump = () => db.runTransaction(async (tx) => {
    const n = (await tx.get(ref)).data()?.n || 0
    await new Promise(r => setTimeout(r, 20))
    tx.set(ref, { tenantId: 'school-a', n: n + 1 })
  })
  await Promise.all([bump(), bump(), bump(), bump(), bump()])
  assert.equal((await ref.get()).data().n, 5)
})

test('sale notification: needs a login and always uses the user\'s own school', async () => {
  await insert('tenant_integrations', 'school-a', 'school-a', { telegram: { botToken: 'tok-a', chats: { tashkent: '-100', samarkand: '-200' } } })
  await insert('tenant_integrations', 'school-b', 'school-b', { telegram: { botToken: 'tok-b', chats: { tashkent: '-900' } } })
  const sale = { clientName: 'Камила', amount: 1500000, branch: 'samarkand', course: 'Дизайн', tenantId: 'school-b' }

  assert.equal((await ctx.as(null).post('/api/telegram/notify', sale)).statusCode, 401)
  assert.equal((await ctx.as('student').post('/api/telegram/notify', sale)).statusCode, 403)

  outbound.length = 0
  const res = await ctx.as('sales').post('/api/telegram/notify', sale)
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().success, true)
  assert.match(outbound[0].url, /bottok-a\/sendMessage$/) // school-a's bot, not the spoofed school-b
  assert.equal(outbound[0].body.chat_id, '-200')
  assert.match(outbound[0].body.text, /Камила[\s\S]*1\s500\s000/)
})

test('the bot\'s old unauthenticated webhook re-points itself to the secured one', async () => {
  webhooks.length = 0
  sent.length = 0
  const res = await ctx.app.inject({
    method: 'POST', url: '/api/telegram/notify?tenantId=school-a',
    payload: { update_id: 5, message: { chat: { id: 42 }, text: '/start st_whatever' } },
  })
  assert.equal(res.statusCode, 200)
  assert.equal(webhooks[0].url, 'https://api.test/api/telegram/webhook?tenantId=school-a')
  assert.ok(webhooks[0].secret_token)
  assert.match(sent[0].text, /ещё раз/)
  const { rows } = await ctx.pool.query("SELECT 1 FROM students WHERE data->>'telegramChatId' = '42'")
  assert.equal(rows.length, 0) // nothing linked through the unsecured path
})

test('amo and OnlinePBX endpoints need staff login; tenantId in the request is ignored', async () => {
  assert.equal((await ctx.as(null).get('/api/amo/status')).statusCode, 401)
  assert.equal((await ctx.as('student').get('/api/amo/status')).statusCode, 403)
  // school-a has no amo: the env credentials of the original school must not leak in via ?tenantId=default
  process.env.AMO_SUBDOMAIN = 'interno'
  process.env.AMO_ACCESS_TOKEN = 'secret'
  try {
    const res = await ctx.as('sales').get('/api/amo/status?tenantId=default')
    assert.equal(res.statusCode, 200)
    assert.equal(res.json().connected, false)
  } finally {
    delete process.env.AMO_SUBDOMAIN
    delete process.env.AMO_ACCESS_TOKEN
  }
  assert.equal((await ctx.as('sales').post('/api/amo/token-refresh', {})).statusCode, 403) // admins only
  assert.equal((await ctx.as(null).get('/api/onpbx/calls?status=1')).statusCode, 401)
  assert.equal((await ctx.as('sales').get('/api/onpbx/calls?status=1')).json().connected, false)
})

test('AI agent: webhooks check the school key, the log needs a login', async () => {
  assert.equal((await ctx.app.inject({ method: 'POST', url: '/api/ai/amo-agent?mode=webhook&tenantId=school-a&key=nope', payload: 'a=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).statusCode, 403)
  assert.equal((await ctx.as(null).get('/api/ai/amo-agent?mode=log')).statusCode, 401)
  const log = await ctx.as('owner').get('/api/ai/amo-agent?mode=log&days=7')
  assert.equal(log.statusCode, 200)
  assert.equal(log.json().ok, true)
  assert.ok(log.json().conversations.every(c => c.id.startsWith('school-a__')))
  assert.equal((await ctx.as('sales').post('/api/ai/amo-agent?mode=setup', { action: 'test-notify' })).statusCode, 403)
})

test('Payme: create → perform writes the payment, cancel rolls it back', async () => {
  const rpc = (method, params, auth = 'Basic ' + Buffer.from('Paycom:k1').toString('base64')) => ctx.app.inject({
    method: 'POST', url: '/api/pay/payme?tenantId=school-a', headers: { authorization: auth },
    payload: { id: 1, method, params },
  }).then(r => r.json())

  const pub = (await ctx.as(null).get('/api/pay/payme?tenantId=school-a')).json()
  assert.equal(pub.payme.enabled, false)
  await ctx.pool.query(`UPDATE tenant_integrations SET data = data || '{"payme": {"enabled": true, "merchantId": "m1", "key": "k1"}}' WHERE id = 'school-a'`)
  await insert('students', 'st-p', 'school-a', { name: 'Анвар', branch: 'tashkent', status: 'active', totalCoursePrice: 1000000, balance: 0 })
  assert.deepEqual((await ctx.as(null).get('/api/pay/payme?tenantId=school-a')).json().payme, { enabled: true, merchantId: 'm1' })

  assert.equal((await rpc('CheckPerformTransaction', { amount: 50000000, account: { student_id: 'st-p' } }, 'Basic bad')).error.code, -32504)
  assert.deepEqual((await rpc('CheckPerformTransaction', { amount: 50000000, account: { student_id: 'st-p' } })).result, { allow: true })
  assert.equal((await rpc('CheckPerformTransaction', { amount: 200000000, account: { student_id: 'st-p' } })).error.code, -31001)

  assert.equal((await rpc('CreateTransaction', { id: 'tx1', time: 1, amount: 50000000, account: { student_id: 'st-p' } })).result.state, 1)
  assert.equal((await rpc('CreateTransaction', { id: 'tx2', time: 1, amount: 50000000, account: { student_id: 'st-p' } })).error.code, -31099)

  assert.equal((await rpc('PerformTransaction', { id: 'tx1' })).result.state, 2)
  assert.equal((await rpc('PerformTransaction', { id: 'tx1' })).result.state, 2) // repeat is a no-op
  const { rows: pays } = await ctx.pool.query("SELECT data FROM payments WHERE data->>'paymeTransactionId' = 'tx1'")
  assert.equal(pays.length, 1)
  assert.deepEqual([pays[0].data.amount, pays[0].data.method, pays[0].data.type, pays[0].data.tenantId], [500000, 'Payme', 'income', 'school-a'])
  let st = (await ctx.pool.query("SELECT data FROM students WHERE id = 'st-p'")).rows[0].data
  assert.deepEqual([st.balance, st.status, st.lmsAccess], [500000, 'debtor', true])

  assert.equal((await rpc('CancelTransaction', { id: 'tx1', reason: 5 })).result.state, -2)
  assert.equal((await ctx.pool.query("SELECT data FROM payments WHERE data->>'paymeTransactionId' = 'tx1'")).rows[0].data.cancelled, true)
  st = (await ctx.pool.query("SELECT data FROM students WHERE id = 'st-p'")).rows[0].data
  assert.equal(st.balance, 0)

  const statement = await rpc('GetStatement', { from: 0, to: Date.now() + 1000 })
  assert.deepEqual(statement.result.transactions.map(t => [t.id, t.state]), [['tx1', -2]])
})
