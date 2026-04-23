// Vercel Serverless — проверка подключения к OnlinePBX
// GET /api/onpbx/status
// Выполняет auth.json → получает key_id:key → делает тестовый запрос истории

const API_BASE = 'https://api.onlinepbx.ru'
const TIMEOUT_MS = 12000

function toForm(obj) {
  const form = new URLSearchParams()
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) form.append(k, String(v))
  }
  return form.toString()
}

async function postForm(url, headers, body) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
      body: toForm(body),
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

  // Шаг 1: авторизация
  const authUrl = `${API_BASE}/${ONPBX_DOMAIN}/auth.json`
  const authRes = await postForm(authUrl, {}, { auth_key: ONPBX_API_KEY })
  if (!authRes.ok || !authRes.json) {
    return res.status(200).json({
      connected: false,
      step: 'auth.json',
      url: authUrl,
      status: authRes.status,
      response: authRes.text,
      message: 'Не удалось авторизоваться. Проверьте ONPBX_DOMAIN и ONPBX_API_KEY.',
    })
  }
  const data = authRes.json.data
  if (!data?.key_id || !data?.key) {
    return res.status(200).json({
      connected: false,
      step: 'auth.json response',
      response: authRes.json,
      message: 'auth.json не вернул key_id+key',
    })
  }

  // Шаг 2: тестовый запрос истории за последние сутки
  const historyUrl = `${API_BASE}/${ONPBX_DOMAIN}/mongo_history/search.json`
  const nowTs = Math.floor(Date.now() / 1000)
  const histRes = await postForm(
    historyUrl,
    { 'x-pbx-authentication': `${data.key_id}:${data.key}` },
    { start_stamp_from: nowTs - 24 * 3600, start_stamp_to: nowTs }
  )

  return res.status(200).json({
    connected: histRes.ok && !!histRes.json,
    domain: ONPBX_DOMAIN,
    auth: { ok: true, keyId: data.key_id.slice(0, 8) + '...' },
    history: {
      ok: histRes.ok,
      status: histRes.status,
      callsInLast24h: Array.isArray(histRes.json?.data) ? histRes.json.data.length : null,
      sample: Array.isArray(histRes.json?.data) && histRes.json.data[0]
        ? {
            uuid: histRes.json.data[0].uuid,
            accountcode: histRes.json.data[0].accountcode,
            caller_id_number: histRes.json.data[0].caller_id_number,
            destination_number: histRes.json.data[0].destination_number,
            duration: histRes.json.data[0].duration,
            user_talk_time: histRes.json.data[0].user_talk_time,
          }
        : null,
      errorSample: histRes.json ? null : histRes.text?.slice(0, 200),
    },
  })
}
