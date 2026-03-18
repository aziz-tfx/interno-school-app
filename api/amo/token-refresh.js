// Vercel Serverless Function — refresh amoCRM OAuth token
// POST /api/amo/token-refresh
//
// amoCRM access tokens expire. Call this to refresh.
// Set env vars: AMO_SUBDOMAIN, AMO_CLIENT_ID, AMO_CLIENT_SECRET, AMO_REDIRECT_URI, AMO_REFRESH_TOKEN
//
// After refreshing, update AMO_ACCESS_TOKEN and AMO_REFRESH_TOKEN in Vercel env vars.
// For production, store tokens in a database (e.g., Firestore) instead.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    AMO_SUBDOMAIN,
    AMO_CLIENT_ID,
    AMO_CLIENT_SECRET,
    AMO_REDIRECT_URI,
    AMO_REFRESH_TOKEN,
  } = process.env

  if (!AMO_SUBDOMAIN || !AMO_CLIENT_ID || !AMO_CLIENT_SECRET || !AMO_REFRESH_TOKEN) {
    return res.status(500).json({ error: 'OAuth credentials not configured in Vercel env.' })
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

    return res.status(200).json({
      success: true,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      message: 'Update AMO_ACCESS_TOKEN and AMO_REFRESH_TOKEN in Vercel environment variables.',
    })

  } catch (err) {
    console.error('Token refresh error:', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
