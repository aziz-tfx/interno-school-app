// Vercel Serverless — проверка подключения к OnlinePBX
// GET /api/onpbx/status
// Пробует несколько вариантов auth + endpoints и сообщает какой сработал

const TIMEOUT_MS = 12000

async function tryRequest(url, headers, body) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : '{}',
      signal: controller.signal,
    })
    const text = await r.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { ok: r.ok, status: r.status, text: text.slice(0, 400), json }
  } catch (err) {
    return { ok: false, status: 0, text: err.message, json: null }
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })

  const { ONPBX_DOMAIN, ONPBX_API_KEY } = process.env

  const missing = []
  if (!ONPBX_DOMAIN) missing.push('ONPBX_DOMAIN')
  if (!ONPBX_API_KEY) missing.push('ONPBX_API_KEY')

  if (missing.length) {
    return res.status(200).json({
      connected: false,
      missing,
      message: `Не заданы env vars: ${missing.join(', ')}`,
    })
  }

  // Пробуем несколько endpoint'ов — пока какой-нибудь не вернёт 200
  const endpoints = [
    { path: '/mfs/users.json', body: {} },
    { path: '/mfs/history.json', body: { start_stamp_from: Math.floor(Date.now() / 1000) - 3600, limit: 1 } },
  ]

  // Разные варианты auth-заголовков, которые использует OnlinePBX
  const authVariants = [
    { name: 'x-pbx-authentication header', headers: { 'x-pbx-authentication': ONPBX_API_KEY } },
    { name: 'Authorization Bearer', headers: { 'Authorization': `Bearer ${ONPBX_API_KEY}` } },
    { name: 'Authorization plain', headers: { 'Authorization': ONPBX_API_KEY } },
    { name: 'x-api-key', headers: { 'x-api-key': ONPBX_API_KEY } },
  ]

  const attempts = []
  for (const ep of endpoints) {
    for (const av of authVariants) {
      const url = `https://${ONPBX_DOMAIN}${ep.path}`
      const result = await tryRequest(url, av.headers, ep.body)
      attempts.push({
        endpoint: ep.path,
        auth: av.name,
        status: result.status,
        ok: result.ok,
        sampleResponse: result.text?.slice(0, 200),
      })
      if (result.ok) {
        return res.status(200).json({
          connected: true,
          domain: ONPBX_DOMAIN,
          workingAuth: av.name,
          workingEndpoint: ep.path,
          response: result.json,
        })
      }
    }
  }

  // Ни один не сработал — возвращаем диагностику
  return res.status(200).json({
    connected: false,
    domain: ONPBX_DOMAIN,
    message: 'Ни один auth-вариант не сработал. Проверьте, включён ли API и верен ли ключ.',
    attempts,
  })
}
