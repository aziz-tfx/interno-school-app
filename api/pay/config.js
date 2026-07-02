// GET /api/pay/config?tenantId=<tenant>
// Public, SAFE subset of tenant integration config for the student cabinet:
//   - whether Payme is enabled + merchantId (public: embedded in every
//     checkout link anyway)
//   - Telegram bot username for reminder-linking deep links
// Secrets (payme key, bot token, amo tokens) never leave the server.

import { resolvePayme, loadTenantIntegration, getTenantId } from '../_lib/tenantConfig.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const tenantId = getTenantId(req) || 'default'
  const payme = await resolvePayme(req)
  const tg = await loadTenantIntegration(tenantId, 'telegram')
  const botUsername = tg.botUsername ||
    (tenantId === 'default' ? (process.env.TG_BOT_USERNAME || '') : '')

  return res.status(200).json({
    payme: {
      enabled: payme.enabled && !!payme.merchantId,
      merchantId: payme.merchantId || '',
    },
    telegramBotUsername: botUsername.replace(/^@/, ''),
  })
}
