// Vercel Serverless Function — refresh amoCRM OAuth token
// POST /api/amo/token-refresh  body: { tenantId }
//
// Uses per-tenant OAuth credentials stored in Firestore
// (tenantIntegrations/{tenantId}.amocrm). Falls back to env vars if absent.
// On success, the new tokens are persisted back to Firestore so subsequent
// requests use the refreshed pair automatically.

import { resolveAmo, saveTenantIntegration, getTenantId } from '../_lib/tenantConfig.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const amo = await resolveAmo(req)
  const tenantId = getTenantId(req)
  const {
    subdomain: AMO_SUBDOMAIN,
    clientId: AMO_CLIENT_ID,
    clientSecret: AMO_CLIENT_SECRET,
    redirectUri: AMO_REDIRECT_URI,
    refreshToken: AMO_REFRESH_TOKEN,
  } = amo

  if (!AMO_SUBDOMAIN || !AMO_CLIENT_ID || !AMO_CLIENT_SECRET || !AMO_REFRESH_TOKEN) {
    return res.status(500).json({ error: 'OAuth credentials not configured for this tenant.' })
  }

  try {
    const tokenRes = await fetch(`https://${AMO_SUBDOMAIN}.amocrm.ru/oauth2/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: AMO_CLIENT_ID,
        client_secret: AMO_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: AMO_REFRESH_TOKEN,
        redirect_uri: AMO_REDIRECT_URI || `https://${AMO_SUBDOMAIN}.amocrm.ru`,
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      return res.status(502).json({ error: 'Token refresh failed', details: err })
    }

    const tokens = await tokenRes.json()

    // Persist fresh tokens to Firestore so future calls pick them up
    const saved = await saveTenantIntegration(tenantId, 'amocrm', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenRefreshedAt: new Date().toISOString(),
    })

    return res.status(200).json({
      success: true,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      persisted: saved,
      message: saved
        ? 'Новые токены сохранены в настройках школы.'
        : 'Токены получены, но не сохранены (Firestore недоступен). Обновите вручную.',
    })

  } catch (err) {
    console.error('Token refresh error:', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
