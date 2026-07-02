// POST /api/telegram/webhook?tenantId=<tenant>
// Telegram bot webhook. Handles the /start deep-link flow that links a
// student's Telegram account to their student record so the automations
// cron can send them personal payment reminders.
//
// Deep link format (generated in the student cabinet):
//   https://t.me/<botUsername>?start=st_<studentId>
//
// Setup (one-time, per bot):
//   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<app>/api/telegram/webhook?tenantId=default

import { resolveTelegram, getDb } from '../_lib/tenantConfig.js'

async function reply(botToken, chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
  } catch { /* best-effort */ }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Always 200 to Telegram — anything else makes it retry the same update
  const ok = () => res.status(200).json({ ok: true })

  const update = req.body || {}
  const msg = update.message
  if (!msg?.text || !msg.chat?.id) return ok()

  const tg = await resolveTelegram(req)
  if (!tg.botToken) return ok()

  const chatId = msg.chat.id
  const text = msg.text.trim()

  // ─── /start st_<studentId> — link student for payment reminders ───
  const startMatch = text.match(/^\/start\s+st_([A-Za-z0-9_-]+)$/)
  if (startMatch) {
    const studentId = startMatch[1]
    const db = getDb()
    if (!db) return ok()
    try {
      const snap = await db.collection('students').doc(studentId).get()
      if (!snap.exists) {
        await reply(tg.botToken, chatId, '❌ Ученик не найден. Откройте ссылку из личного кабинета ещё раз.')
        return ok()
      }
      const student = snap.data()
      if ((student.tenantId || 'default') !== tg.tenantId && tg.tenantId) {
        await reply(tg.botToken, chatId, '❌ Ссылка не подходит для этого бота.')
        return ok()
      }
      await db.collection('students').doc(studentId).update({
        telegramChatId: chatId,
        telegramLinkedAt: new Date().toISOString(),
      })
      await reply(
        tg.botToken, chatId,
        `✅ <b>${student.name}</b>, уведомления подключены!\n\n` +
        `Я напомню вам о предстоящих платежах за курс, чтобы доступ к урокам не прерывался.\n\n` +
        `Eslatmalar ulandi! Kurs to'lovlari haqida oldindan xabar beraman.`
      )
    } catch (e) {
      console.error('webhook /start error:', e.message)
    }
    return ok()
  }

  // Plain /start without payload — short instruction
  if (text === '/start') {
    await reply(
      tg.botToken, chatId,
      'Привет! Чтобы получать напоминания об оплате, откройте личный кабинет ученика и нажмите «Подключить Telegram-уведомления».'
    )
    return ok()
  }

  return ok()
}
