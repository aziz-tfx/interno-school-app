// Telegram helpers shared by the bot webhook and the daily automations.

import { createHash } from 'node:crypto'

/** Send an HTML message; never throws (notifications are best-effort). */
export async function sendTelegram(botToken, chatId, text) {
  if (!botToken || !chatId) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Point the bot's updates at a URL; returns Telegram's answer ({ ok, description }). */
export async function setTelegramWebhook(botToken, params) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    return await res.json()
  } catch (err) {
    return { ok: false, description: err.message }
  }
}

/**
 * The school's bot token and branch chats, from tenant_integrations (the
 * block imported from Firestore and edited on the Integrations page). The
 * default school may still keep them in env vars, as on Vercel.
 */
export async function loadTelegramConfig(db, tenantId, env = process.env) {
  const { rows: [row] } = await db.query('SELECT data FROM tenant_integrations WHERE id = $1', [tenantId])
  const cfg = { ...(row?.data?.telegram || {}) }
  if (tenantId === 'default') {
    cfg.botToken ||= env.TELEGRAM_BOT_TOKEN || env.TG_BOT_TOKEN || ''
    if (!cfg.chats || !Object.values(cfg.chats).some(Boolean)) {
      cfg.chats = {
        tashkent: env.TG_CHAT_TASHKENT || '',
        samarkand: env.TG_CHAT_SAMARKAND || '',
        fergana: env.TG_CHAT_FERGANA || '',
        bukhara: env.TG_CHAT_BUKHARA || '',
        online: env.TG_CHAT_TASHKENT || '',
      }
    }
  }
  cfg.chats ||= {}
  return cfg
}

/**
 * Secret Telegram echoes in X-Telegram-Bot-Api-Secret-Token on every webhook
 * call, so only Telegram can post to /api/telegram/webhook. Derived from the
 * JWT secret: nothing extra to store, and it changes if that secret does.
 */
export function webhookSecret(jwtSecret, tenantId) {
  return createHash('sha256').update(`telegram-webhook:${tenantId}:${jwtSecret}`).digest('hex').slice(0, 48)
}
