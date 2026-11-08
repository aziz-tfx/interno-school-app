// Telegram helpers shared by the bot webhook and the daily automations.

import { createHash } from 'node:crypto'

/** Call a Bot API method; returns Telegram's answer ({ ok, description, result }). Never throws. */
async function callBotApi(botToken, method, params) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
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
 * Send an HTML message; never throws (notifications are best-effort).
 * extra — more sendMessage fields, e.g. { reply_markup } for a mini app button.
 */
export async function sendTelegram(botToken, chatId, text, extra = {}) {
  if (!botToken || !chatId) return false
  const result = await callBotApi(botToken, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra })
  return Boolean(result?.ok)
}

/** Point the bot's updates at a URL; returns Telegram's answer ({ ok, description }). */
export function setTelegramWebhook(botToken, params) {
  return callBotApi(botToken, 'setWebhook', params)
}

/** The bot's menu button (left of the message field) → opens the mini app. */
export function setTelegramMenuButton(botToken, params) {
  return callBotApi(botToken, 'setChatMenuButton', params)
}

/** Inline keyboard with one button that opens the mini app; {} without a URL. */
export function miniAppKeyboard(url, text = '📱 Открыть INTERNO') {
  if (!url) return {}
  return { reply_markup: { inline_keyboard: [[{ text, web_app: { url } }]] } }
}

/**
 * The address the bot's mini app opens: the frontend origin + this school's
 * tenantId (the app needs it to check Telegram's signature with the right bot).
 * Telegram only opens https pages. Returns '' for anything else.
 */
export function miniAppUrl(appUrl, tenantId) {
  let origin
  try {
    const u = new URL(String(appUrl || ''))
    if (u.protocol !== 'https:') return ''
    origin = u.origin
  } catch {
    return ''
  }
  return `${origin}/?tenantId=${encodeURIComponent(tenantId)}`
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
        bukhara: env.TG_CHAT_BUKHARA || env.TG_CHAT_FERGANA || '',
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
