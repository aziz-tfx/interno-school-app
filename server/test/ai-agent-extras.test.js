import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'
import { getDb } from '../src/vercel/_lib/tenantConfig.js'
import { checkAgentHealth, runAgentHealthChecks, tokenExpiresAt, processIncomingMessage, samplingParams } from '../src/vercel/_lib/aiAgent.js'
import { configureAmoFetch } from '../src/vercel/_lib/amoFetch.js'

const ctx = setup()
const jwt = (exp) => ['x', Buffer.from(JSON.stringify({ exp })).toString('base64url'), 'sig'].join('.')
const DAY = 86_400_000
let outbound, amoStatus, modelStatus
const realFetch = globalThis.fetch
before(() => {
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    if (u.includes('127.0.0.1') || u.includes('localhost')) return realFetch(url, init)
    const isForm = init.body instanceof FormData
    outbound.push({ url: u, method: init.method || 'GET', body: init.body && !isForm ? JSON.parse(init.body) : null, form: isForm ? init.body : null })
    if (u.includes('/api/v4/account')) {
      return amoStatus === 403
        ? new Response('<html><center>nginx</center></html>', { status: 403, headers: { 'content-type': 'text/html' } })
        : Response.json({ id: 1 })
    }
    if (u.includes('/v1/models/')) return new Response('{}', { status: modelStatus })
    if (u.includes('api.telegram.org')) return Response.json({ ok: true })
    if (u.startsWith('https://files.test/voice')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/ogg' } })
    if (u.startsWith('https://files.test/photo')) return new Response(new Uint8Array([9, 9]), { headers: { 'content-type': 'image/jpeg' } })
    if (u.includes('/v1/audio/transcriptions')) return Response.json({ text: 'Сколько стоит английский?' })
    if (u.includes('/v1/chat/completions')) return Response.json({ choices: [{ message: { role: 'assistant', content: 'Английский — 500 000 сум в месяц.' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } })
    if (/\/api\/v4\/leads\/\d+$/.test(u) && (init.method || 'GET') === 'GET') return Response.json({ id: 1, _embedded: { tags: [] } })
    return Response.json({})
  }
})
after(() => { globalThis.fetch = realFetch; configureAmoFetch() })
beforeEach(() => { outbound = []; amoStatus = 200; modelStatus = 200; configureAmoFetch({ minIntervalMs: 0 }) })

const setIntegrations = (amoToken, extra = {}) => ctx.pool.query(
  `INSERT INTO tenant_integrations (id, tenant_id, data) VALUES ('school-a', 'school-a', $1)
   ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
  [{
    aiAgent: { enabled: true, testMode: false, openaiKey: 'sk', model: 'gpt-4.1-mini', contactReplyFieldId: '1', salesbotId: '2', errorChatId: '555', notifyChatId: '-100group', ...extra },
    amocrm: { subdomain: 'school', accessToken: amoToken },
    telegram: { botToken: 'BOT', chats: { tashkent: '-100group' } },
  }])

test('self-check: all well → silent; blocked amo / missing model → the error chat', async () => {
  await setIntegrations(jwt(Math.floor((Date.now() + 60 * DAY) / 1000)))
  assert.deepEqual(await checkAgentHealth('school-a'), { problems: [], warnings: [] })
  await runAgentHealthChecks()
  assert.equal(outbound.filter(o => o.url.includes('telegram')).length, 0)

  amoStatus = 403
  modelStatus = 404
  const h = await checkAgentHealth('school-a')
  assert.equal(h.problems.length, 2)
  assert.match(h.problems[0], /заблокировал доступ к API/)
  assert.match(h.problems[1], /модели «gpt-4.1-mini» нет/)
  configureAmoFetch({ minIntervalMs: 0 })
  outbound = []
  await runAgentHealthChecks({ warnings: false })
  const tg = outbound.filter(o => o.url.includes('telegram'))
  assert.equal(tg.length, 1)
  assert.equal(tg[0].body.chat_id, '555') // the owner, not the managers' group
  assert.match(tg[0].body.text, /бот не сможет отвечать/)
})

test('amoCRM key expiry: reminders on 14, 7, 3, 2, 1 days left; expired = a problem', async () => {
  const exp = Date.now() + 7 * DAY - 1000
  await setIntegrations(jwt(Math.floor(exp / 1000)))
  assert.equal(tokenExpiresAt(jwt(123)), 123_000)
  assert.equal(tokenExpiresAt('not-a-jwt'), null)
  const h = await checkAgentHealth('school-a')
  assert.equal(h.problems.length, 0)
  assert.match(h.warnings[0], /через 7 дн/)
  await runAgentHealthChecks()
  assert.equal(outbound.filter(o => o.url.includes('telegram')).length, 1)
  // not a reminder day (6 days left): quiet; after a restart (warnings: false): quiet
  outbound = []
  await runAgentHealthChecks({ now: Date.now() + DAY })
  await runAgentHealthChecks({ warnings: false })
  assert.equal(outbound.filter(o => o.url.includes('telegram')).length, 0)
  const later = await checkAgentHealth('school-a', exp + DAY)
  assert.match(later.problems.at(-1), /Ключ amoCRM истёк/)
})

test('voice messages are transcribed; photos are shown to the model', async () => {
  await setIntegrations(jwt(Math.floor((Date.now() + 60 * DAY) / 1000)))
  const cfg = { tenantId: 'school-a', openaiKey: 'sk', model: 'gpt-4.1-mini', testMode: false, contactReplyFieldId: '1', salesbotId: '2', maxRepliesPerLead: 30, pauseTag: 'x', handoffTag: 'y', includeCourses: false }
  const amoCfg = { subdomain: 'school', accessToken: 't', tenantId: 'school-a' }

  await processIncomingMessage({ cfg, amoCfg, debounceMs: 0,
    msg: { id: 'v1', leadId: '31', text: '', origin: 'instagram_business', contactId: '77', attachmentType: 'voice', attachmentLink: 'https://files.test/voice.ogg', attachmentName: 'voice.ogg' } })
  const tr = outbound.find(o => o.url.includes('/audio/transcriptions'))
  assert.equal(tr.form.get('model'), 'gpt-4o-mini-transcribe')
  const conv = (await getDb().collection('aiAgentConversations').doc('school-a__lead_31').get()).data()
  assert.deepEqual([conv.messages[0].text, conv.messages[0].voice], ['Сколько стоит английский?', true])
  const chat = outbound.find(o => o.url.includes('/chat/completions')).body
  assert.match(chat.messages.at(-1).content, /\[Голосовое сообщение, расшифровка\] Сколько стоит английский\?/)
  assert.equal(conv.messages.at(-1).role, 'assistant')

  outbound = []
  await processIncomingMessage({ cfg, amoCfg, debounceMs: 0,
    msg: { id: 'p1', leadId: '32', text: 'Это у вас?', origin: 'instagram_business', contactId: '78', attachmentType: 'picture', attachmentLink: 'https://files.test/photo.jpg' } })
  const content = outbound.find(o => o.url.includes('/chat/completions')).body.messages.at(-1).content
  assert.equal(content[0].text, '[Фото] Это у вас?')
  assert.equal(content[1].image_url.url, `data:image/jpeg;base64,${Buffer.from([9, 9]).toString('base64')}`)
})

test('model parameters: gpt-4.x takes temperature, reasoning models don\'t', () => {
  assert.deepEqual(samplingParams('gpt-4.1-mini'), { temperature: 0.4, max_tokens: 600 })
  assert.deepEqual(samplingParams('gpt-5-mini'), { max_completion_tokens: 2000 })
  assert.deepEqual(samplingParams('o4-mini'), { max_completion_tokens: 2000 })
})
