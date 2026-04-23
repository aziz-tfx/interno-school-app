// Vercel Serverless — Аналитика звонков из OnlinePBX
// GET /api/onpbx/calls?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Правильный API: https://api.onlinepbx.ru/{domain}/auth.json → получаем key_id:key
// Затем https://api.onlinepbx.ru/{domain}/mongo_history/search.json с x-pbx-authentication
// Максимум 1 неделя на запрос → чанкуем период.

import { resolveOnpbx } from '../_lib/tenantConfig.js'

const API_BASE = 'https://api.onlinepbx.ru'
const TIMEOUT_MS = 20000
const WEEK_SEC = 7 * 24 * 3600

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`OnlinePBX timeout after ${ms}ms`)), ms)),
  ])
}

function toForm(obj) {
  const form = new URLSearchParams()
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) form.append(k, String(v))
  }
  return form.toString()
}

async function postForm(url, headers, body) {
  const res = await withTimeout(
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
      body: toForm(body),
    }),
    TIMEOUT_MS
  )
  const text = await res.text()
  if (!res.ok) {
    const err = new Error(`OnlinePBX ${res.status} ${url}: ${text.slice(0, 300)}`)
    err.status = res.status
    throw err
  }
  let json = null
  try { json = JSON.parse(text) } catch {
    const err = new Error(`OnlinePBX ${url} вернул не-JSON: ${text.slice(0, 300)}`)
    err.status = 500
    throw err
  }
  if (json.status && String(json.status) !== '1') {
    const msg = json.comment || json.message || JSON.stringify(json).slice(0, 200)
    const err = new Error(`OnlinePBX ${url} ошибка: ${msg}`)
    err.status = res.status
    throw err
  }
  return json
}

// Шаг 1: получить key_id + key по api_key
async function authenticate(domain, apiKey) {
  const url = `${API_BASE}/${domain}/auth.json`
  const resp = await postForm(url, {}, { auth_key: apiKey })
  const data = resp?.data
  if (!data?.key_id || !data?.key) {
    throw new Error(`auth.json ответил без key/key_id: ${JSON.stringify(resp).slice(0, 200)}`)
  }
  return { keyId: data.key_id, key: data.key }
}

function classifyCall(call) {
  // OnlinePBX mongo_history формат:
  //   accountcode: 'inbound' | 'outbound' | 'local' | 'missed' (missed хранится как inbound с duration=0)
  //   duration: длительность звонка
  //   user_talk_time: время разговора менеджера
  //   hangup_cause: NORMAL_CLEARING = успешно завершён, USER_BUSY = занято, NO_ANSWER = нет ответа
  //   caller_id_number / destination_number
  //   from_uuid / to_uuid
  //   events[]: массив событий (user переводы, hold, dtmf и т.д.)
  const acc = String(call.accountcode || '').toLowerCase()
  const isIncoming = acc === 'inbound' || acc === 'missed'
  const isOutgoing = acc === 'outbound'
  const type = isIncoming ? 'incoming' : isOutgoing ? 'outgoing' : 'internal'
  const talkTime = Number(call.user_talk_time) || 0
  const duration = Number(call.duration) || 0
  const answered = talkTime > 0
  const waitTime = answered && duration > talkTime ? duration - talkTime : 0

  // Добавочный менеджера: у исходящих — caller_id_number (internal), у входящих — destination_number
  // Но если звонок прошёл через очередь, реальный оператор в events[].number
  let ext = ''
  if (isOutgoing) {
    ext = String(call.caller_id_number || '')
  } else if (isIncoming) {
    // ищем в events оператора который взял трубку (type='user' с answered_stamp > 0)
    const userEvents = (call.events || []).filter(e => e.type === 'user' && e.answered_stamp)
    if (userEvents.length) {
      ext = String(userEvents[0].number || '')
    } else {
      ext = String(call.destination_number || '')
    }
  }

  return { type, answered, duration: talkTime, waitTime, ext }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const pbx = await resolveOnpbx(req)
  const ONPBX_DOMAIN = pbx.domain
  const ONPBX_API_KEY = pbx.apiKey
  if (!ONPBX_DOMAIN || !ONPBX_API_KEY) {
    return res.status(500).json({
      error: 'OnlinePBX не настроен для этой школы',
      details: 'Заполните domain (например pbx14950.onpbx.ru) и apiKey на странице «Интеграции»',
    })
  }
  if (ONPBX_DOMAIN.startsWith('api.')) {
    return res.status(500).json({
      error: 'Неверный ONPBX_DOMAIN',
      details: `Нужен ваш клиентский домен (pbx14950.onpbx.ru), а не ${ONPBX_DOMAIN}. api.onlinepbx.ru уже прописан в коде как базовый URL.`,
    })
  }

  const { from, to } = req.query
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: 'from и to обязательны в формате YYYY-MM-DD' })
  }

  const fromTs = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000)
  const toTs   = Math.floor(new Date(`${to}T23:59:59Z`).getTime() / 1000)

  try {
    // Шаг 1: авторизация
    const { keyId, key } = await authenticate(ONPBX_DOMAIN, ONPBX_API_KEY)
    const authHeaders = { 'x-pbx-authentication': `${keyId}:${key}` }

    // Шаг 2: получаем историю, чанкуя по неделям (ограничение API)
    const historyUrl = `${API_BASE}/${ONPBX_DOMAIN}/mongo_history/search.json`
    const allCalls = []
    let chunkStart = fromTs
    let safety = 0
    while (chunkStart < toTs && safety < 20) {
      const chunkEnd = Math.min(chunkStart + WEEK_SEC - 1, toTs)
      const resp = await postForm(historyUrl, authHeaders, {
        start_stamp_from: chunkStart,
        start_stamp_to: chunkEnd,
      })
      const items = Array.isArray(resp?.data) ? resp.data : []
      allCalls.push(...items)
      chunkStart = chunkEnd + 1
      safety += 1
    }

    // Шаг 3: агрегация по extension
    const byExt = {}
    const totals = {
      totalCalls: 0,
      incoming: 0, outgoing: 0,
      answered: 0, missed: 0,
      answeredIncoming: 0, missedIncoming: 0,
      totalTalkSec: 0,
      totalWaitSec: 0,
      answeredCountForWait: 0,
    }

    for (const raw of allCalls) {
      const c = classifyCall(raw)
      totals.totalCalls += 1
      if (c.type === 'incoming') totals.incoming += 1
      else if (c.type === 'outgoing') totals.outgoing += 1
      if (c.answered) {
        totals.answered += 1
        totals.totalTalkSec += c.duration
        if (c.type === 'incoming') {
          totals.answeredIncoming += 1
          totals.totalWaitSec += c.waitTime
          totals.answeredCountForWait += 1
        }
      } else {
        totals.missed += 1
        if (c.type === 'incoming') totals.missedIncoming += 1
      }

      const key = c.ext || '—'
      if (!byExt[key]) {
        byExt[key] = {
          ext: key,
          totalCalls: 0,
          incoming: 0, outgoing: 0,
          answered: 0, missed: 0,
          answeredIncoming: 0, missedIncoming: 0,
          totalTalkSec: 0,
          totalWaitSec: 0,
          answeredCountForWait: 0,
        }
      }
      const b = byExt[key]
      b.totalCalls += 1
      if (c.type === 'incoming') b.incoming += 1
      else if (c.type === 'outgoing') b.outgoing += 1
      if (c.answered) {
        b.answered += 1
        b.totalTalkSec += c.duration
        if (c.type === 'incoming') {
          b.answeredIncoming += 1
          b.totalWaitSec += c.waitTime
          b.answeredCountForWait += 1
        }
      } else {
        b.missed += 1
        if (c.type === 'incoming') b.missedIncoming += 1
      }
    }

    const finalize = (b) => ({
      ...b,
      avgTalkSec: b.answered > 0 ? b.totalTalkSec / b.answered : null,
      avgWaitSec: b.answeredCountForWait > 0 ? b.totalWaitSec / b.answeredCountForWait : null,
      missRate: b.incoming > 0 ? b.missedIncoming / b.incoming : null,
      answerRate: b.incoming > 0 ? b.answeredIncoming / b.incoming : null,
    })

    const byExtFinal = {}
    for (const k of Object.keys(byExt)) byExtFinal[k] = finalize(byExt[k])
    const totalsFinal = finalize(totals)

    return res.status(200).json({
      byExt: byExtFinal,
      totals: totalsFinal,
      meta: {
        from, to,
        totalCalls: allCalls.length,
        fetchedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    console.error('onpbx calls error:', err)
    return res.status(err.status === 401 ? 401 : 500).json({
      error: err.status === 401
        ? 'Ключ OnlinePBX невалиден или просрочен'
        : 'Ошибка загрузки данных OnlinePBX',
      details: err.message,
    })
  }
}
