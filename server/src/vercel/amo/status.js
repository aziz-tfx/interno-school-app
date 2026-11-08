// Vercel Serverless Function — check amoCRM connection status
// GET /api/amo/status

import { amoFetch } from '../_lib/amoFetch.js'
import { resolveAmo } from '../_lib/tenantConfig.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const amo = await resolveAmo(req)
  const AMO_SUBDOMAIN = amo.subdomain
  const AMO_ACCESS_TOKEN = amo.accessToken

  if (!AMO_SUBDOMAIN || !AMO_ACCESS_TOKEN) {
    return res.status(200).json({
      connected: false,
      source: amo.source,
      message: 'amoCRM не настроен для этой школы. Заполните subdomain и access token на странице «Интеграции».',
    })
  }

  try {
    const accountRes = await amoFetch(`https://${AMO_SUBDOMAIN}.amocrm.ru/api/v4/account`, {
      headers: { 'Authorization': `Bearer ${AMO_ACCESS_TOKEN}` },
    })

    if (!accountRes.ok) {
      return res.status(200).json({
        connected: false,
        source: amo.source,
        subdomain: AMO_SUBDOMAIN,
        canRefresh: Boolean(amo.refreshToken && amo.clientId && amo.clientSecret),
        message: amo.source === 'env'
          ? `amoCRM ответил ${accountRes.status}: токен из настроек сервера (.env) невалиден или истёк. Подключите интеграцию заново на этой странице.`
          : `amoCRM ответил ${accountRes.status}: токен невалиден или истёк. Нажмите «Обновить токен» или получите новый код авторизации.`,
      })
    }

    const account = await accountRes.json()

    return res.status(200).json({
      connected: true,
      source: amo.source,
      account: account.name,
      subdomain: AMO_SUBDOMAIN,
      canRefresh: Boolean(amo.refreshToken && amo.clientId && amo.clientSecret),
      message: `Подключено к ${account.name}`,
    })

  } catch (err) {
    return res.status(200).json({
      connected: false,
      source: amo.source,
      message: `Ошибка подключения: ${err.message}`,
    })
  }
}
