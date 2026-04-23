// Vercel Serverless Function — aggregated manager effectiveness from amoCRM
// GET /api/amo/performance?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns:
//   {
//     users:     [{ id, name, email }],
//     pipelines: [{ id, name, statuses: [{ id, name, type }] }],
//     byUser: {
//       [userId]: {
//         userId, userName,
//         total,                 // leads created in period
//         open, won, lost,
//         wonSum,                // sum of prices of won leads
//         conversion,            // won / (won+lost)
//         avgCycleDays,          // avg (closed - created) for closed leads
//         lastActivityAt,        // max(updated_at) as ISO string
//       }
//     },
//     totals: { total, open, won, lost, wonSum, conversion, avgCycleDays },
//     meta: { from, to, fetchedLeads }
//   }
//
// amoCRM win/lose semantics:
//   status.type === 1  → WON  (successfully closed)
//   status.type === 142 → legacy won
//   status.type === 143 → LOST
//   Any other type → in progress / open

import { resolveAmo } from '../_lib/tenantConfig.js'

const AMO_API_TIMEOUT_MS = 10000

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`amoCRM timeout after ${ms}ms`)), ms)),
  ])
}

async function amoGet(base, path, headers) {
  const url = `${base}${path}`
  const res = await withTimeout(fetch(url, { headers }), AMO_API_TIMEOUT_MS)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(`amoCRM ${res.status} ${path}: ${text.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  // 204 No Content is a valid empty response for some endpoints
  if (res.status === 204) return null
  return res.json()
}

// Paginate through a collection endpoint (amoCRM returns _links.next.href when more pages)
async function amoGetAll(base, path, headers, collectionKey, opts = {}) {
  const { maxPages = 50, pageSize = 250 } = opts
  const items = []
  let nextPath = path + (path.includes('?') ? '&' : '?') + `limit=${pageSize}`
  let safety = 0
  while (nextPath && safety < maxPages) {
    const data = await amoGet(base, nextPath, headers)
    if (!data) break
    const chunk = data?._embedded?.[collectionKey]
    if (Array.isArray(chunk)) items.push(...chunk)
    const next = data?._links?.next?.href
    if (!next) break
    // amo returns absolute URL in next — strip the base
    nextPath = next.replace(base, '')
    safety += 1
  }
  return items
}

function classifyStatus(pipelines, statusId) {
  for (const p of pipelines) {
    for (const s of (p.statuses || p._embedded?.statuses || [])) {
      if (s.id === statusId) {
        // type: 1 = success (legacy 142 too on some accounts), 2 = not realized
        if (s.type === 1 || s.type === 142) return 'won'
        if (s.type === 2 || s.type === 143) return 'lost'
        return 'open'
      }
    }
  }
  return 'open'
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const amo = await resolveAmo(req)
  const AMO_SUBDOMAIN = amo.subdomain
  const AMO_ACCESS_TOKEN = amo.accessToken
  if (!AMO_SUBDOMAIN || !AMO_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'amoCRM не настроен для этой школы' })
  }

  const base = `https://${AMO_SUBDOMAIN}.amocrm.ru/api/v4`
  const headers = {
    'Authorization': `Bearer ${AMO_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  }

  const { from, to } = req.query
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to query params required (YYYY-MM-DD)' })
  }

  // Convert YYYY-MM-DD to unix timestamps (seconds) in server UTC.
  // `from` is start of day, `to` is end of day (23:59:59).
  const fromTs = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000)
  const toTs   = Math.floor(new Date(`${to}T23:59:59Z`).getTime() / 1000)
  if (Number.isNaN(fromTs) || Number.isNaN(toTs) || fromTs > toTs) {
    return res.status(400).json({ error: 'Invalid date range' })
  }

  try {
    // 1) Users
    const usersRaw = await amoGetAll(base, '/users', headers, 'users', { pageSize: 250 })
    const users = usersRaw.map(u => ({ id: u.id, name: u.name, email: u.email }))
    const userMap = Object.fromEntries(users.map(u => [u.id, u]))

    // 2) Pipelines (for status classification)
    let pipelines = []
    try {
      const pipeData = await amoGet(base, '/leads/pipelines', headers)
      pipelines = pipeData?._embedded?.pipelines || []
    } catch (err) {
      console.warn('pipelines fetch failed:', err.message)
    }

    // 3) Leads created in period
    const leadsPath = `/leads?filter[created_at][from]=${fromTs}&filter[created_at][to]=${toTs}&with=contacts`
    const leads = await amoGetAll(base, leadsPath, headers, 'leads', { pageSize: 250, maxPages: 100 })

    // 4) Aggregate per responsible_user_id
    const byUser = {}
    let totalAll = 0, openAll = 0, wonAll = 0, lostAll = 0, wonSumAll = 0
    const cyclesAll = []

    for (const lead of leads) {
      const uid = lead.responsible_user_id || 0
      const bucket = byUser[uid] || (byUser[uid] = {
        userId: uid,
        userName: userMap[uid]?.name || (uid ? `User #${uid}` : 'Не назначен'),
        total: 0, open: 0, won: 0, lost: 0,
        wonSum: 0,
        cycles: [],
        lastActivityAt: 0,
      })

      bucket.total += 1
      totalAll += 1

      const cls = classifyStatus(pipelines, lead.status_id)
      if (cls === 'won') {
        bucket.won += 1; wonAll += 1
        bucket.wonSum += Number(lead.price) || 0
        wonSumAll += Number(lead.price) || 0
      } else if (cls === 'lost') {
        bucket.lost += 1; lostAll += 1
      } else {
        bucket.open += 1; openAll += 1
      }

      // cycle days for closed leads
      if (lead.closed_at && lead.created_at) {
        const days = (lead.closed_at - lead.created_at) / 86400
        if (days >= 0 && days < 3650) {
          bucket.cycles.push(days)
          cyclesAll.push(days)
        }
      }

      if (lead.updated_at && lead.updated_at > bucket.lastActivityAt) {
        bucket.lastActivityAt = lead.updated_at
      }
    }

    // finalize per-user metrics
    for (const k of Object.keys(byUser)) {
      const b = byUser[k]
      const closed = b.won + b.lost
      b.conversion = closed > 0 ? +(b.won / closed).toFixed(4) : 0
      b.avgCycleDays = b.cycles.length > 0
        ? +(b.cycles.reduce((s, x) => s + x, 0) / b.cycles.length).toFixed(1)
        : 0
      b.lastActivityAt = b.lastActivityAt
        ? new Date(b.lastActivityAt * 1000).toISOString()
        : null
      delete b.cycles
    }

    const closedAll = wonAll + lostAll
    const totals = {
      total: totalAll,
      open: openAll,
      won: wonAll,
      lost: lostAll,
      wonSum: wonSumAll,
      conversion: closedAll > 0 ? +(wonAll / closedAll).toFixed(4) : 0,
      avgCycleDays: cyclesAll.length > 0
        ? +(cyclesAll.reduce((s, x) => s + x, 0) / cyclesAll.length).toFixed(1)
        : 0,
    }

    // Strip pipeline details to just what frontend needs
    const slimPipelines = pipelines.map(p => ({
      id: p.id,
      name: p.name,
      statuses: (p._embedded?.statuses || []).map(s => ({ id: s.id, name: s.name, type: s.type })),
    }))

    return res.status(200).json({
      users,
      pipelines: slimPipelines,
      byUser,
      totals,
      meta: { from, to, fetchedLeads: leads.length },
    })
  } catch (err) {
    console.error('amo performance error:', err)
    const status = err.status === 401 ? 401 : 500
    return res.status(status).json({
      error: err.status === 401
        ? 'amoCRM token is invalid or expired — refresh AMO_ACCESS_TOKEN'
        : 'Failed to fetch amoCRM performance',
      details: err.message,
    })
  }
}
