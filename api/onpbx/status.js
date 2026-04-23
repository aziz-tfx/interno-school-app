// Vercel Serverless — проверка подключения к OnlinePBX
// GET /api/onpbx/status

import crypto from 'crypto'

function signRequest(bodyJson, urlPath, keyId, apiKey) {
  const bodyMd5 = crypto.createHash('md5').update(bodyJson).digest('hex')
  const signature = crypto
    .createHmac('sha256', apiKey)
    .update(bodyMd5 + urlPath)
    .digest('hex')
  return `${keyId}:${signature}`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })

  const { ONPBX_DOMAIN, ONPBX_KEY_ID, ONPBX_API_KEY } = process.env

  const missing = []
  if (!ONPBX_DOMAIN) missing.push('ONPBX_DOMAIN')
  if (!ONPBX_KEY_ID) missing.push('ONPBX_KEY_ID')
  if (!ONPBX_API_KEY) missing.push('ONPBX_API_KEY')

  if (missing.length) {
    return res.status(200).json({
      connected: false,
      missing,
      message: `Не заданы env vars: ${missing.join(', ')}`,
    })
  }

  // Пробуем запросить список добавочных — самый дешёвый endpoint для проверки
  const path = '/mfs/users.json'
  const body = JSON.stringify({})
  const auth = signRequest(body, path, ONPBX_KEY_ID, ONPBX_API_KEY)

  try {
    const r = await fetch(`https://${ONPBX_DOMAIN}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pbx-authentication': auth,
      },
      body,
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      return res.status(200).json({
        connected: false,
        status: r.status,
        domain: ONPBX_DOMAIN,
        error: data?.comment || data?.message || `HTTP ${r.status}`,
      })
    }
    const users = data?.data || data?.users || []
    return res.status(200).json({
      connected: true,
      domain: ONPBX_DOMAIN,
      users: Array.isArray(users) ? users.length : 0,
      sample: Array.isArray(users) ? users.slice(0, 3).map(u => ({
        ext: u.accountcode || u.number || u.id,
        name: u.name || u.description,
      })) : [],
    })
  } catch (err) {
    return res.status(200).json({
      connected: false,
      domain: ONPBX_DOMAIN,
      error: err.message,
    })
  }
}
