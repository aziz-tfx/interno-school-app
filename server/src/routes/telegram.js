// Telegram bot webhook — replaces the bot half of api/telegram/notify.js.
//
//   POST /api/telegram/webhook?tenantId=…        updates from Telegram
//
// Students link the bot from their cabinet: t.me/<bot>?start=st_<studentId>.
// Telegram then sends "/start st_<studentId>" here and we store the chat id
// that the daily automations send personal payment reminders to.
// Telegram retries non-2xx answers forever, so every update gets a 200.

import { loadTelegramConfig, webhookSecret } from '../telegram.js'

export default async function telegramRoutes(app, { pool, config, telegram }) {
  app.post('/api/telegram/webhook', async (req, reply) => {
    const tenantId = String(req.query.tenantId || 'default')
    // Only Telegram knows the secret (we hand it over in setWebhook)
    if (req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret(config.jwtSecret, tenantId)) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
    const msg = req.body?.message
    const chatId = msg?.chat?.id
    const text = typeof msg?.text === 'string' ? msg.text.trim() : ''
    if (!chatId || !text) return { ok: true }

    const tg = await loadTelegramConfig(pool, tenantId)
    if (!tg.botToken) return { ok: true }

    const link = text.match(/^\/start\s+st_([A-Za-z0-9_-]+)$/)
    if (link) {
      const { rows: [student] } = await pool.query(
        `UPDATE students SET data = data || jsonb_build_object('telegramChatId', $3::bigint, 'telegramLinkedAt', $4::text)
         WHERE id = $1 AND tenant_id = $2 RETURNING data->>'name' AS name`,
        [link[1], tenantId, chatId, new Date().toISOString()]
      )
      await telegram.send(tg.botToken, chatId, student
        ? `✅ <b>${student.name || ''}</b>, уведомления подключены!\n\n`
          + 'Я напомню вам о предстоящих платежах за курс, чтобы доступ к урокам не прерывался.\n\n'
          + "Eslatmalar ulandi! Kurs to'lovlari haqida oldindan xabar beraman."
        : '❌ Ученик не найден. Откройте ссылку из личного кабинета ещё раз.')
      return { ok: true }
    }

    if (text === '/start') {
      await telegram.send(tg.botToken, chatId,
        'Привет! Чтобы получать напоминания об оплате, откройте личный кабинет ученика и нажмите «Подключить Telegram-уведомления».')
    }
    return { ok: true }
  })
}
