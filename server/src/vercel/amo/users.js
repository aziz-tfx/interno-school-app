// Vercel Serverless Function — list amoCRM users (id + name + email)
// GET /api/amo/users
// Used by the employee form to let admins pick an amoCRM user from a
// dropdown instead of typing the numeric id.

import { resolveAmo } from '../_lib/tenantConfig.js'

const TIMEOUT_MS = 10000

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`amoCRM timeout after ${ms}ms`)), ms)),
  ])
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const amo = await resolveAmo(req)
  if (!amo.subdomain || !amo.accessToken) {
    return res.status(400).json({ error: 'amoCRM не настроен для этой школы', users: [] })
  }

  const base = `https://${amo.subdomain}.amocrm.ru/api/v4`
  const headers = { 'Authorization': `Bearer ${amo.accessToken}` }

  try {
    const users = []
    let nextPath = '/users?limit=250'
    for (let page = 0; page < 20 && nextPath; page += 1) {
      const r = await withTimeout(fetch(base + nextPath, { headers }), TIMEOUT_MS)
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        return res.status(500).json({ error: `amoCRM ${r.status}: ${text.slice(0, 200)}`, users: [] })
      }
      const data = await r.json()
      const chunk = data?._embedded?.users || []
      users.push(...chunk.map(u => ({ id: u.id, name: u.name, email: u.email })))
      const next = data?._links?.next?.href
      nextPath = next ? next.replace(base, '') : null
    }
    res.setHeader('Cache-Control', 'private, max-age=120')
    return res.status(200).json({ success: true, users })
  } catch (err) {
    return res.status(500).json({ error: err.message, users: [] })
  }
}
