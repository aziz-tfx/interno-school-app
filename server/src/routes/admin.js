// School-admin tools (owner / admin of the school):
//
//   POST /api/admin/automations/run  { dryRun? }   run the daily automations now
//                                                  for this school (Automations page)
//   POST /api/admin/telegram/webhook  { appUrl? }  point the school's bot at this
//                                                  server (/api/telegram/webhook) and
//                                                  its menu button at the mini app

import { isAdmin } from '../collections.js'
import { forbidden, badRequest } from '../lib/errors.js'
import { runAutomations } from '../automations.js'
import { loadTelegramConfig, webhookSecret, miniAppUrl } from '../telegram.js'
import { resolvePayme } from '../vercel/_lib/tenantConfig.js'

export default async function adminRoutes(app, { pool, config, telegram }) {
  const adminOnly = {
    preHandler: [app.authenticate, async (req) => { if (!isAdmin(req.user)) throw forbidden() }],
  }

  app.post('/api/admin/automations/run', adminOnly, async (req) => {
    return runAutomations(pool, {
      tenantIds: [req.user.tenantId],
      dryRun: Boolean(req.body?.dryRun),
      send: telegram.send,
      loadTelegram: (tid) => loadTelegramConfig(pool, tid),
      loadPayme: (tid) => resolvePayme({ query: { tenantId: tid } }),
    })
  })

  app.post('/api/admin/telegram/webhook', adminOnly, async (req) => {
    if (!config.publicUrl) throw badRequest('На сервере не задан API_DOMAIN')
    const { tenantId } = req.user
    const tg = await loadTelegramConfig(pool, tenantId)
    if (!tg.botToken) throw badRequest('Не указан токен Telegram-бота (Интеграции → Telegram)')
    const url = `${config.publicUrl}/api/telegram/webhook?tenantId=${encodeURIComponent(tenantId)}`
    const result = await telegram.setWebhook(tg.botToken, {
      url,
      secret_token: webhookSecret(config.jwtSecret, tenantId),
      allowed_updates: ['message'],
    })
    if (!result?.ok) throw badRequest(`Telegram: ${result?.description || 'не удалось установить вебхук'}`)

    // Menu button «INTERNO» → the whole app opens inside Telegram. The page
    // that pressed the button knows its own address; APP_URL is the fallback.
    const appUrl = miniAppUrl(req.body?.appUrl || config.appUrl, tenantId)
    let menuButton = false
    if (appUrl) {
      const menu = await telegram.setMenuButton(tg.botToken, {
        menu_button: { type: 'web_app', text: 'INTERNO', web_app: { url: appUrl } },
      })
      menuButton = Boolean(menu?.ok)
      // the bot's /start reply links to the app too
      await pool.query(
        `INSERT INTO tenant_integrations (id, tenant_id, data) VALUES ($1, $1, $2)
         ON CONFLICT (id) DO UPDATE
           SET data = coalesce(tenant_integrations.data, '{}') || jsonb_build_object('telegram',
             coalesce(tenant_integrations.data->'telegram', '{}') || jsonb_build_object('miniAppUrl', $3::text))`,
        [tenantId, { telegram: { miniAppUrl: appUrl } }, appUrl]
      )
    }
    return { ok: true, url, miniAppUrl: appUrl, menuButton }
  })
}
