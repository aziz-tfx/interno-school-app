import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'
import { getDb } from '../src/vercel/_lib/tenantConfig.js'
import { runCatchUp, processIncomingMessage } from '../src/vercel/_lib/aiAgent.js'
import { configureAmoFetch } from '../src/vercel/_lib/amoFetch.js'

const ctx = setup()
const realFetch = globalThis.fetch
let outbound
let amoBlocked
before(() => {
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    if (u.includes('127.0.0.1') || u.includes('localhost')) return realFetch(url, init)
    outbound.push({ method: init.method || 'GET', url: u, body: init.body ? JSON.parse(init.body) : null })
    if (u.includes('amocrm.ru') && amoBlocked) {
      return new Response('<html><head><title>403 Forbidden</title></head><body><center>nginx</center></body></html>', { status: 403, headers: { 'content-type': 'text/html' } })
    }
    if (u.includes('openai.com')) return Response.json({ choices: [{ message: { role: 'assistant', content: 'Извините за задержку! Курс стоит…' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })
    if (/\/api\/v4\/leads\/\d+$/.test(u) && (init.method || 'GET') === 'GET') return Response.json({ id: 1, status_id: 1, pipeline_id: 9, _embedded: { tags: [] } })
    if (u.includes('api.telegram.org')) return Response.json({ ok: true })
    return Response.json({})
  }
})
after(() => { globalThis.fetch = realFetch; configureAmoFetch() })
beforeEach(() => { outbound = []; amoBlocked = false; configureAmoFetch({ minIntervalMs: 0 }) })

const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString()
const conv = (id, data) => getDb().collection('aiAgentConversations').doc(`school-a__lead_${id}`)
const put = (id, data) => conv(id).set({ tenantId: 'school-a', leadId: String(id), contactId: '77', replies: 0, ...data })

test('catch-up answers clients a failed turn left without a reply', async () => {
  await ctx.pool.query('INSERT INTO tenant_integrations (id, tenant_id, data) VALUES ($1,$1,$2)', ['school-a', {
    aiAgent: { enabled: true, testMode: false, openaiKey: 'sk', webhookKey: 'k', contactReplyFieldId: '1', salesbotId: '2', notifyErrors: false },
    amocrm: { subdomain: 'school', accessToken: 't' },
  }])
  const failed = { lastError: 'amoCRM GET … → 403: <html>nginx</html>' }
  await put(1, { ...failed, channel: 'instagram', messages: [{ role: 'assistant', text: 'Здравствуйте!', at: hoursAgo(3) }, { role: 'user', text: 'Сколько стоит?', at: hoursAgo(2) }, { role: 'user', text: 'Ау', at: hoursAgo(1.5) }] })
  await put(2, { ...failed, channel: 'instagram', messages: [{ role: 'user', text: 'Привет', at: hoursAgo(30) }] })   // past Instagram's 24 h
  await put(3, { ...failed, channel: 'telegram', messages: [{ role: 'user', text: 'Привет', at: hoursAgo(30) }] })    // Telegram: still answered
  await put(4, { ...failed, channel: 'instagram', paused: true, messages: [{ role: 'user', text: 'Хочу менеджера', at: hoursAgo(1) }] })
  await put(5, { channel: 'instagram', messages: [{ role: 'user', text: 'Только что', at: hoursAgo(1) }] }) // no error: its own turn handles it
  await put(6, { ...failed, channel: 'instagram', messages: [{ role: 'user', text: 'Пишу прямо сейчас', at: new Date().toISOString() }] }) // still in debounce

  const out = await runCatchUp()
  assert.deepEqual(out, { due: 2, results: { sent: 2 } })
  const one = (await conv(1).get()).data()
  assert.equal(one.lastError, null)
  assert.equal(one.messages.at(-1).role, 'assistant')
  assert.equal(one.messages.at(-1).late, true)
  assert.equal(one.replies, 1)
  // the model was told both messages and asked to apologize for the delay
  const ai = outbound.filter(o => o.url.includes('openai.com'))
  assert.equal(ai.length, 2)
  // oldest first: the Telegram client (30 h) before the Instagram one
  assert.match(ai[0].body.messages.find(m => m.role === 'user').content, /Привет/)
  const msgs = ai[1].body.messages
  assert.match(msgs.find(m => m.role === 'user').content, /Сколько стоит\?\nАу/)
  assert.match(msgs.at(-1).content, /извинения за задержку/)
  assert.equal(outbound.filter(o => o.url.includes('salesbot/run')).length, 2)
  assert.equal((await conv(3).get()).data().lastError, null)
  for (const id of [2, 4, 6]) assert.ok((await conv(id).get()).data().lastError, `lead ${id} untouched`)

  // nothing left that may be answered
  assert.deepEqual(await runCatchUp(), { due: 0, results: {} })
})

test('while amoCRM is blocked: retried later with a back-off, no OpenAI spent', async () => {
  amoBlocked = true
  await put(7, { lastError: 'x', channel: 'telegram', messages: [{ role: 'user', text: 'Привет', at: hoursAgo(2) }] })
  assert.deepEqual(await runCatchUp(), { due: 1, results: { error: 1 } })
  const c = (await conv(7).get()).data()
  assert.equal(c.retryCount, 1)
  assert.ok(Date.parse(c.nextRetryAt) > Date.now() + 4 * 60_000)
  assert.match(c.lastError, /403/)
  assert.equal(outbound.filter(o => o.url.includes('openai.com')).length, 0)
  assert.deepEqual(await runCatchUp(), { due: 0, results: {} }) // backing off
})

test('test mode: a message is kept for the catch-up when amo can\'t be asked', async () => {
  amoBlocked = true
  const cfg = { tenantId: 'school-a', testMode: true, testTag: 'ии-тест', notifyErrors: false }
  configureAmoFetch({ minIntervalMs: 0 })
  await processIncomingMessage({ cfg, amoCfg: { subdomain: 'school2', accessToken: 't', tenantId: 'school-a' }, debounceMs: 0,
    msg: { id: 'm1', leadId: '8', text: 'Здравствуйте', origin: 'instagram_business', contactId: '77' } })
  const c = (await conv(8).get()).data()
  assert.equal(c.messages.at(-1).text, 'Здравствуйте')
  assert.match(c.lastError, /403/)
})

test('bot errors go to errorChatId; handoffs stay in the managers\' chat', async () => {
  amoBlocked = true
  await ctx.pool.query(`UPDATE tenant_integrations SET data = jsonb_set(jsonb_set(data, '{aiAgent,notifyErrors}', 'true'), '{aiAgent,errorChatId}', '"777"')
    || jsonb_build_object('telegram', jsonb_build_object('botToken', 'BOT', 'chats', jsonb_build_object('tashkent', '-100group'))) WHERE id = 'school-a'`)
  await ctx.pool.query(`DELETE FROM ai_agent_alerts`)
  await put(9, { lastError: 'x', channel: 'telegram', messages: [{ role: 'user', text: 'Привет', at: hoursAgo(2) }] })
  await runCatchUp()
  const tg = outbound.filter(o => o.url.includes('api.telegram.org'))
  assert.equal(tg.length, 1)
  assert.equal(String(tg[0].body.chat_id), '777')
  assert.match(tg[0].body.text, /не смог ответить/)
})
