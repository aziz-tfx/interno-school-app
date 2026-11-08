// amoCRM relay: the API server (api.internoedu.uz) sends its amoCRM calls
// through here while amoCRM blocks the server's own IP (nginx 403 after the
// API rate limit was exceeded). Vercel calls amoCRM from its own IPs.
//
//   POST /api/amo-relay   x-relay-key: <AMO_RELAY_KEY>
//   { url: "https://<sub>.amocrm.ru/api/v4/…", method, headers: { Authorization, Content-Type }, body }
//   → amoCRM's answer as is: status, content-type, body
//
// Only amoCRM addresses, only the auth and content-type headers. Without the
// shared key nobody can use it. The server rate-limits what it sends (≤ 5/s).

import { timingSafeEqual } from 'node:crypto'

export const config = { maxDuration: 30 }

const AMO_URL = /^https:\/\/[a-z0-9-]+\.(amocrm\.ru|amocrm\.com|kommo\.com)\/(api\/v[24]\/|oauth2\/access_token)/
const METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE'])

function keyOk(given) {
  const expected = process.env.AMO_RELAY_KEY || ''
  const a = Buffer.from(String(given || ''))
  const b = Buffer.from(expected)
  return b.length >= 32 && a.length === b.length && timingSafeEqual(a, b)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!keyOk(req.headers['x-relay-key'])) return res.status(403).json({ error: 'Forbidden' })

  const { url, method = 'GET', headers = {}, body } = req.body || {}
  if (typeof url !== 'string' || !AMO_URL.test(url)) return res.status(400).json({ error: 'Not an amoCRM API address' })
  if (!METHODS.has(String(method).toUpperCase())) return res.status(400).json({ error: 'Bad method' })

  const out = {}
  if (headers.Authorization) out.Authorization = String(headers.Authorization)
  if (headers['Content-Type']) out['Content-Type'] = String(headers['Content-Type'])

  try {
    const r = await fetch(url, {
      method: String(method).toUpperCase(),
      headers: out,
      body: body == null ? undefined : String(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(25_000),
    })
    const text = await r.text()
    res.setHeader('x-relay-status', String(r.status))
    res.setHeader('Content-Type', r.headers.get('content-type') || 'text/plain')
    res.setHeader('Cache-Control', 'no-store')
    return res.status(r.status).send(text)
  } catch (e) {
    return res.status(502).json({ error: `relay: ${e.name === 'TimeoutError' ? 'amoCRM did not answer in 25 s' : e.message}` })
  }
}
