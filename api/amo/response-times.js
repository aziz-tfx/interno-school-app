// Vercel Serverless — время первой реакции на новую заявку
// GET /api/amo/response-times?month=YYYY-MM
//
// Для каждого лида, созданного в месяце, находит первое исходящее событие
// (звонок, сообщение, SMS, заметка) и считает разницу в минутах.

import { resolveAmo } from '../_lib/tenantConfig.js'

const AMO_API_TIMEOUT_MS = 20000

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`amoCRM timeout after ${ms}ms`)), ms)),
  ])
}

async function amoGet(base, path, headers) {
  const res = await withTimeout(fetch(`${base}${path}`, { headers }), AMO_API_TIMEOUT_MS)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(`amoCRM ${res.status} ${path}: ${text.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  if (res.status === 204) return null
  return res.json()
}

async function amoGetAll(base, path, headers, collectionKey, { maxPages = 80, pageSize = 250 } = {}) {
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
    nextPath = next.replace(base, '')
    safety += 1
  }
  return items
}

// Типы событий, которые считаем "первой реакцией менеджера"
// см. https://www.amocrm.ru/developers/content/crm_platform/events-and-notes
const OUTGOING_EVENT_TYPES = [
  'outgoing_call',
  'outgoing_chat_message',
  'sms_out',
]
// Notes как fallback (если нет телефонии, менеджер ставит коммент)
const OUTGOING_NOTE_TYPES = new Set([
  'call_out',       // исх. звонок (если записан как note)
  'sms_out',        // исх. SMS
  'service_message',// служебное (уведомление клиенту)
  'extended_service_message',
])

function percentile(sortedArr, p) {
  if (!sortedArr.length) return null
  const idx = (sortedArr.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sortedArr[lo]
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo)
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

  const { month } = req.query
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month query param required (YYYY-MM)' })
  }

  const [year, mm] = month.split('-').map(Number)
  const monthIdx = mm - 1
  const daysInMonth = new Date(year, mm, 0).getDate()
  const fromTs = Math.floor(new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0)).getTime() / 1000)
  const toTs   = Math.floor(new Date(Date.UTC(year, monthIdx, daysInMonth, 23, 59, 59)).getTime() / 1000)
  // Буфер +7 дней для поиска событий после создания лида в конце месяца
  const eventsToTs = toTs + 7 * 24 * 3600

  try {
    // 1) Пользователи
    const usersRaw = await amoGetAll(base, '/users', headers, 'users', { pageSize: 250 })
    const userMap = Object.fromEntries(usersRaw.map(u => [u.id, { id: u.id, name: u.name }]))

    // 2) Лиды созданные в месяце
    const leadsPath = `/leads?filter[created_at][from]=${fromTs}&filter[created_at][to]=${toTs}`
    const leads = await amoGetAll(base, leadsPath, headers, 'leads', { pageSize: 250, maxPages: 100 })

    // 3) События — параллельно собираем по типам (amoCRM не поддерживает OR по type в одном запросе стабильно)
    const eventsPath = (type) =>
      `/events?filter[created_at][from]=${fromTs}&filter[created_at][to]=${eventsToTs}&filter[entity]=lead&filter[type]=${type}`
    const eventsArrays = await Promise.all(
      OUTGOING_EVENT_TYPES.map(t => amoGetAll(base, eventsPath(t), headers, 'events', { pageSize: 250, maxPages: 60 }).catch(err => {
        console.warn(`events ${t} failed:`, err.message)
        return []
      }))
    )
    const allEvents = eventsArrays.flat()

    // 4) Notes как бэкап (если телефонии нет — ищем в комментариях)
    const notesPath = `/leads/notes?filter[created_at][from]=${fromTs}&filter[created_at][to]=${eventsToTs}`
    let allNotes = []
    try {
      allNotes = await amoGetAll(base, notesPath, headers, 'notes', { pageSize: 250, maxPages: 80 })
    } catch (err) {
      console.warn('notes failed:', err.message)
    }

    // 5) Строим map: leadId -> [{ts, type, sourceUserId}]
    const leadContacts = {}
    for (const ev of allEvents) {
      const leadId = ev.entity_id
      if (!leadId) continue
      if (!leadContacts[leadId]) leadContacts[leadId] = []
      leadContacts[leadId].push({ ts: ev.created_at, type: ev.type, by: ev.created_by })
    }
    for (const note of allNotes) {
      const leadId = note.entity_id
      if (!leadId) continue
      if (!OUTGOING_NOTE_TYPES.has(note.note_type)) continue
      if (!leadContacts[leadId]) leadContacts[leadId] = []
      leadContacts[leadId].push({ ts: note.created_at, type: note.note_type, by: note.created_by })
    }

    // 6) Агрегация по менеджеру
    const byUser = {}
    const totals = { responses: [], within15: 0, within30: 0, within60: 0, noResponse: 0, totalLeads: 0 }

    for (const lead of leads) {
      const uid = lead.responsible_user_id || 0
      if (!byUser[uid]) {
        byUser[uid] = {
          userId: uid,
          userName: userMap[uid]?.name || (uid ? `User #${uid}` : 'Не назначен'),
          responses: [],       // массив минут
          totalLeads: 0,
          within15: 0,         // ≤ 15 мин
          within30: 0,         // ≤ 30 мин
          within60: 0,         // ≤ 60 мин
          noResponse: 0,       // никакой реакции
        }
      }
      const bucket = byUser[uid]
      bucket.totalLeads += 1
      totals.totalLeads += 1

      const contacts = leadContacts[lead.id] || []
      // Только события ПОСЛЕ создания лида
      const validContacts = contacts.filter(c => c.ts >= lead.created_at)
      if (validContacts.length === 0) {
        bucket.noResponse += 1
        totals.noResponse += 1
        continue
      }
      const firstTs = Math.min(...validContacts.map(c => c.ts))
      const minutes = Math.max(0, (firstTs - lead.created_at) / 60)
      bucket.responses.push(minutes)
      totals.responses.push(minutes)
      if (minutes <= 15) { bucket.within15 += 1; totals.within15 += 1 }
      if (minutes <= 30) { bucket.within30 += 1; totals.within30 += 1 }
      if (minutes <= 60) { bucket.within60 += 1; totals.within60 += 1 }
    }

    // 7) Считаем avg/median на выходе
    const finalize = (b) => {
      const arr = [...b.responses].sort((a, b) => a - b)
      const avg = arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
      const median = arr.length ? percentile(arr, 0.5) : null
      const p90 = arr.length ? percentile(arr, 0.9) : null
      const responded = arr.length
      return {
        userId: b.userId,
        userName: b.userName,
        totalLeads: b.totalLeads,
        responded,
        noResponse: b.noResponse,
        avgMinutes: avg,
        medianMinutes: median,
        p90Minutes: p90,
        within15: b.within15,
        within30: b.within30,
        within60: b.within60,
        pctWithin15: b.totalLeads > 0 ? b.within15 / b.totalLeads : null,
        pctWithin60: b.totalLeads > 0 ? b.within60 / b.totalLeads : null,
        pctNoResponse: b.totalLeads > 0 ? b.noResponse / b.totalLeads : null,
      }
    }

    const byUserFinal = {}
    for (const uid of Object.keys(byUser)) byUserFinal[uid] = finalize(byUser[uid])
    const totalsFinal = finalize({ ...totals, userId: 0, userName: 'Всего' })

    return res.status(200).json({
      byUser: byUserFinal,
      totals: totalsFinal,
      meta: {
        month,
        fetchedLeads: leads.length,
        fetchedEvents: allEvents.length,
        fetchedNotes: allNotes.length,
        fetchedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    console.error('response-times error:', err)
    const status = err.status === 401 ? 401 : 500
    return res.status(status).json({
      error: err.status === 401
        ? 'Токен amoCRM невалиден'
        : 'Ошибка загрузки данных amoCRM',
      details: err.message,
    })
  }
}
