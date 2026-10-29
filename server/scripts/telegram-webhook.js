// Point a school's Telegram bot at this server — what «Интеграции → Telegram
// → Подключить бота к серверу» does, for use from the server itself.
//
//   docker compose exec -T api node scripts/telegram-webhook.js [tenantId]

import pg from 'pg'
import { loadConfig } from '../src/config.js'
import { loadTelegramConfig, setTelegramWebhook, webhookSecret } from '../src/telegram.js'

const tenantId = process.argv[2] || 'default'
const config = loadConfig()
const pool = new pg.Pool({ connectionString: config.databaseUrl })
const tg = await loadTelegramConfig(pool, tenantId)
await pool.end()
if (!tg.botToken || !config.publicUrl) {
  console.error('Нет токена бота или API_DOMAIN')
  process.exit(1)
}
const result = await setTelegramWebhook(tg.botToken, {
  url: `${config.publicUrl}/api/telegram/webhook?tenantId=${encodeURIComponent(tenantId)}`,
  secret_token: webhookSecret(config.jwtSecret, tenantId),
  allowed_updates: ['message'],
})
console.log(result.ok ? 'telegram webhook: ok' : `telegram webhook: ${result.description}`)
process.exit(result.ok ? 0 : 1)
