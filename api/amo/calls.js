// Vercel Serverless Function — calls per amoCRM user for a date range.
// GET /api/amo/calls?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// amoCRM doesn't expose a dedicated /calls listing on every plan, so we
// aggregate call events from the events stream (type=incoming_call /
// outgoing_call) and group by `created_by` (the user who handled the call).
//
// Response: { byUser: { [uid]: { in, out, total } }, totals: {...}, meta }

import { resolveAmo } from '../_lib/tenantConfig.js'

const TIMEOUT_MS = 15000
const MAX_PAGES = 80
const PAGE_SIZE = 250

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`amoCRM timeout after ${ms}ms`)), ms)),
  ])
}

async function amoGet(base, path, headers) {
  const r = await withTimeout(fetch(base + path, { headers }), TIMEOUT_MS)
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    const err = new Error(`amoCRM ${r.status} ${path}: ${text.slice(0, 200)}`)
    err.status = r.status
    throw err
  }
  if (r.status === 204) return null
  return r.json()
}

async function amoGetAll(base, path, headers, collectionKey) {
  const items = []
  let nextPath = path + (path.includes('?') ? '&' : '?') + `limit=${PAGE_SIZE}`
  let safety = 0
  while (nextPath && safety < MAX_PAGES) {
    const data = await amoGet(base, nextPath, headers)
    if (!data) break
    const chunk = data?._embedded?.[collectionKey]
    if (Array.isArray(chunk)) items.push(...chunk)
    const next = data?._links?.next?.href
    if (!next) break
    nextPath = next.replace(base, '')
    safety += 1
  }
  return items
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { from, to } = req.query
  if (!from || !to) return res.status(400).json({ error: 'from / to query params required (YYYY-MM-DD)' })

  const amo = await resolveAmo(req)
  if (!amo.subdomain || !amo.accessToken) {
    return res.status(400).json({ error: 'amoCRM не настроен для этой школы', byUser: {} })
  }

  const base = `https://${amo.subdomain}.amocrm.ru/api/v4`
  const headers = { 'Authorization': `Bearer ${amo.accessToken}` }
  const fromTs = Math.floor(new Date(from + 'T00:00:00').getTime() / 1000)
  const toTs = Math.floor(new Date(to + 'T23:59:59').getTime() / 1000)

  try {
    // amoCRM events filter syntax: filter[type][]=incoming_call&filter[type][]=outgoing_call
    // Some accounts also use "phone_call_*" — try both.
    const path = `/events?filter[type][]=incoming_call&filter[type][]=outgoing_call`
      + `&filter[created_at][from]=${fromTs}&filter[created_at][to]=${toTs}`
    let events = []
    try {
      events = await amoGetAll(base, path, headers, 'events')
    } catch (err) {
      // If events endpoint is restricted on this account, fail soft.
      return res.status(200).json({
        success: false,
        byUser: {},
        totals: { in: 0, out: 0, total: 0 },
        warning: `events API unavailable: ${err.message.slice(0, 120)}`,
        meta: { from, to },
      })
    }

    const byUser = {}
    const totals = { in: 0, out: 0, total: 0 }
    for (const ev of events) {
      const uid = ev.created_by || 0
      if (!byUser[uid]) byUser[uid] = { userId: uid, in: 0, out: 0, total: 0 }
      const isIn = ev.type === 'incoming_call'
      if (isIn) { byUser[uid].in += 1; totals.in += 1 }
      else { byUser[uid].out += 1; totals.out += 1 }
      byUser[uid].total += 1
      totals.total += 1
    }

    res.setHeader('Cache-Control', 'private, max-age=120')
    return res.status(200).json({
      success: true,
      byUser,
      totals,
      meta: { from, to, count: events.length },
    })
  } catch (err) {
    return res.status(500).json({ error: err.message, byUser: {} })
  }
}
