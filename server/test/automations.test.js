import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'
import { runAutomations, claimDailyRun, tashkentClock } from '../src/automations.js'
import { loadTelegramConfig, webhookSecret } from '../src/telegram.js'

const sent = []
const webhooks = []
const telegram = {
  send: async (botToken, chatId, text) => { sent.push({ botToken, chatId: String(chatId), text }); return true },
  setWebhook: async (botToken, params) => { webhooks.push({ botToken, ...params }); return { ok: true } },
  setMenuButton: async (botToken, params) => { menus.push({ botToken, ...params }); return { ok: true } },
}
const menus = []
const ctx = setup({ telegram, env: { API_DOMAIN: 'api.test' } })

const NOW = new Date('2026-03-10T09:00:00Z') // 14:00 in Tashkent
const insert = (table, id, tenant, data) =>
  ctx.pool.query(`INSERT INTO ${table} (id, tenant_id, data) VALUES ($1, $2, $3)`, [id, tenant, { ...data, tenantId: tenant }])
const student = async (id) => (await ctx.pool.query('SELECT data FROM students WHERE id = $1', [id])).rows[0].data
const run = (opts = {}) => runAutomations(ctx.pool, {
  now: NOW, tenantIds: ['school-a'], send: telegram.send, loadTelegram: (t) => loadTelegramConfig(ctx.pool, t), ...opts,
})

test('seed', async () => {
  await insert('tenant_integrations', 'school-a', 'school-a', { telegram: { botToken: 'tok-a', chats: { tashkent: '-100' } } })
  await ctx.pool.query(`UPDATE employees SET data = data || '{"telegramChatId": "555"}' WHERE id = 'e-sales'`)
  // installment due in 3 days, sold by manager mgr_1
  await insert('students', 'st-a', 'school-a', { name: 'Анна', branch: 'tashkent', status: 'active', totalCoursePrice: 1000, nextPaymentDate: '2026-03-13' })
  await insert('payments', 'p-a', 'school-a', { type: 'income', studentId: 'st-a', amount: 400, date: '2026-02-13', managerId: 'mgr_1' })
  // 5 days overdue, linked Telegram, LMS expired
  await insert('students', 'st-b', 'school-a', { name: 'Борис', branch: 'tashkent', status: 'active', totalCoursePrice: 2000, nextPaymentDate: '2026-03-05', telegramChatId: 777, lmsAccess: true, lmsExpiresAt: '2026-03-01' })
  // paid in full / frozen: left alone
  await insert('students', 'st-c', 'school-a', { name: 'Вера', branch: 'tashkent', status: 'active', totalCoursePrice: 500, nextPaymentDate: '2026-03-05' })
  await insert('payments', 'p-c', 'school-a', { type: 'income', studentId: 'st-c', amount: 500, date: '2026-02-01' })
  await insert('students', 'st-d', 'school-a', { name: 'Глеб', branch: 'tashkent', status: 'frozen', totalCoursePrice: 900, nextPaymentDate: '2026-03-05', telegramChatId: 888 })
  // another school
  await insert('students', 'st-x', 'school-b', { name: 'Чужой', status: 'active', totalCoursePrice: 900, nextPaymentDate: '2026-03-05', telegramChatId: 999 })
})

test('dry run counts without sending or writing', async () => {
  const r = await run({ dryRun: true })
  assert.deepEqual(
    [r.reminders, r.studentReminders, r.debtors, r.blocked, r.managerAlerts, r.errors],
    [1, 1, 1, 1, 2, []])
  assert.equal(sent.length, 0)
  assert.equal((await student('st-b')).status, 'active')
})

test('rules of the old cron, on Postgres', async () => {
  const r = await run()
  assert.deepEqual(
    [r.reminders, r.studentReminders, r.debtors, r.blocked, r.managerAlerts, r.errors],
    [1, 1, 1, 1, 2, []])
  const to = (chat) => sent.filter(m => m.chatId === chat).map(m => m.text)
  assert.match(to('-100')[0], /Анна[\s\S]*Долг: 600/)          // branch reminder, 3 days before
  assert.match(to('-100')[1], /срочные[\s\S]*Борис[\s\S]*Анна/) // branch urgent list
  assert.match(to('777')[0], /просрочена на 5 дн/)               // personal reminder
  assert.match(to('555')[0], /доплаты[\s\S]*Анна/)               // manager's list
  assert.equal(to('888').length + to('999').length, 0)
  assert.ok(sent.every(m => m.botToken === 'tok-a'))

  const b = await student('st-b')
  assert.equal(b.status, 'debtor')
  assert.equal(b.lmsAccess, false)
  assert.equal(b.lastStudentReminderDate, '2026-03-10')
  assert.equal((await student('st-a')).status, 'active')
  assert.equal((await student('st-x')).status, 'active')

  // same day again: no second personal reminder, nothing left to change
  const again = await run()
  assert.deepEqual([again.studentReminders, again.debtors, again.blocked], [0, 0, 0])
})

test('settings switch rules off', async () => {
  await insert('automation_settings', 'school-a', 'school-a', { paymentReminders: false, managerDoplataAlerts: false })
  sent.length = 0
  const r = await run({ now: new Date('2026-03-11T09:00:00Z') })
  assert.equal(r.reminders, 0)
  assert.equal(r.managerAlerts, 0)
  assert.equal(r.studentReminders, 1) // still on: overdue students hear every day
})

test('daily run is claimed once per Tashkent day', async () => {
  assert.deepEqual(tashkentClock(new Date('2026-03-10T19:30:00Z')), { date: '2026-03-11', hour: 0 })
  assert.equal(await claimDailyRun(ctx.pool, 'automations', '2026-03-10'), true)
  assert.equal(await claimDailyRun(ctx.pool, 'automations', '2026-03-10'), false)
  assert.equal(await claimDailyRun(ctx.pool, 'automations', '2026-03-11'), true)
})

test('admin endpoint runs only for own school, admins only', async () => {
  assert.equal((await ctx.as('sales').post('/api/admin/automations/run', {})).statusCode, 403)
  const res = await ctx.as('owner').post('/api/admin/automations/run', { dryRun: true })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().tenants, 1)
})

test('bot webhook links a student by /start deep link', async () => {
  const secret = webhookSecret(ctx.config.jwtSecret, 'school-a')
  const post = (text, chatId, headers = { 'x-telegram-bot-api-secret-token': secret }) => ctx.app.inject({
    method: 'POST', url: '/api/telegram/webhook?tenantId=school-a', headers,
    payload: { update_id: 1, message: { chat: { id: chatId }, text } },
  })
  sent.length = 0
  assert.equal((await post('/start st_st-a', 4242, {})).statusCode, 401)
  assert.equal((await post('/start st_st-a', 4242, { 'x-telegram-bot-api-secret-token': 'nope' })).statusCode, 401)

  assert.equal((await post('/start st_st-a', 4242)).statusCode, 200)
  const a = await student('st-a')
  assert.equal(a.telegramChatId, 4242)
  assert.ok(a.telegramLinkedAt)
  assert.match(sent.at(-1).text, /Анна.*уведомления подключены/)

  // another school's student can't be linked through this school's bot
  await post('/start st_st-x', 5151)
  assert.equal((await student('st-x')).telegramChatId, 999)
  assert.match(sent.at(-1).text, /не найден/)

  await post('/start', 6161)
  assert.match(sent.at(-1).text, /личный кабинет/)
  assert.equal((await post('hello', 6161)).statusCode, 200)
})

test('admin points the bot at this server', async () => {
  assert.equal((await ctx.as('sales').post('/api/admin/telegram/webhook', {})).statusCode, 403)
  const res = await ctx.as('owner').post('/api/admin/telegram/webhook', {})
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().url, 'https://api.test/api/telegram/webhook?tenantId=school-a')
  assert.deepEqual(webhooks.at(-1), {
    botToken: 'tok-a', url: 'https://api.test/api/telegram/webhook?tenantId=school-a',
    secret_token: webhookSecret(ctx.config.jwtSecret, 'school-a'), allowed_updates: ['message'],
  })
  // no frontend address (no APP_URL, none sent) → webhook only
  assert.equal(res.json().miniAppUrl, '')
  assert.equal(menus.length, 0)
  // a school without a bot token gets a clear message
  assert.equal((await ctx.as('otherOwner').post('/api/admin/telegram/webhook', {})).statusCode, 400)
})

test('admin connects the mini app: menu button + «Открыть» under the bot replies', async () => {
  // only https pages open inside Telegram
  assert.equal((await ctx.as('owner').post('/api/admin/telegram/webhook', { appUrl: 'http://app.test' })).json().miniAppUrl, '')
  const res = await ctx.as('owner').post('/api/admin/telegram/webhook', { appUrl: 'https://app.test/integrations?x=1' })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().miniAppUrl, 'https://app.test/?tenantId=school-a')
  assert.equal(res.json().menuButton, true)
  assert.deepEqual(menus.at(-1), {
    botToken: 'tok-a', menu_button: { type: 'web_app', text: 'INTERNO', web_app: { url: 'https://app.test/?tenantId=school-a' } },
  })
  // stored next to the bot settings, which stay intact
  const cfg = await loadTelegramConfig(ctx.pool, 'school-a')
  assert.equal(cfg.miniAppUrl, 'https://app.test/?tenantId=school-a')
  assert.equal(cfg.botToken, 'tok-a')

  const extras = []
  const secret = webhookSecret(ctx.config.jwtSecret, 'school-a')
  const orig = telegram.send
  telegram.send = async (token, chatId, text, extra) => { extras.push(extra); return orig(token, chatId, text) }
  try {
    await ctx.app.inject({
      method: 'POST', url: '/api/telegram/webhook?tenantId=school-a', headers: { 'x-telegram-bot-api-secret-token': secret },
      payload: { update_id: 2, message: { chat: { id: 6262 }, text: '/start' } },
    })
  } finally {
    telegram.send = orig
  }
  assert.match(sent.at(-1).text, /Открыть INTERNO/)
  assert.deepEqual(extras.at(-1).reply_markup.inline_keyboard[0][0].web_app, { url: 'https://app.test/?tenantId=school-a' })
})
