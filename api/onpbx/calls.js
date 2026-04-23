// Vercel Serverless — Аналитика звонков из OnlinePBX
// GET /api/onpbx/calls?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Auth: API v2 — один ключ в заголовке x-pbx-authentication

const TIMEOUT_MS = 20000

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`OnlinePBX timeout after ${ms}ms`)), ms)),
  ])
}

async function onpbxPost(domain, path, body, apiKey) {
  const bodyJson = JSON.stringify(body)
  const url = `https://${domain}${path}`
  const res = await withTimeout(
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pbx-authentication': apiKey,
      },
      body: bodyJson,
    }),
    TIMEOUT_MS
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(`OnlinePBX ${res.status} ${path}: ${text.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

function classifyCall(call) {
  // OnlinePBX поля:
  //   type: 'incoming' | 'outgoing' | 'internal'
  //   disposition: 'ANSWERED' | 'NO ANSWER' | 'BUSY' | 'FAILED'
  //   billsec: длительность разговора в секундах (0 = не отвечен)
  //   duration: общая длительность включая гудки
  //   from / to: номера
  //   uuid: идентификатор звонка
  //   start_stamp: unix timestamp начала
  //   answer_stamp / end_stamp
  //   record: URL записи (если есть)
  //   caller_id_number / caller_id_name
  //   dest / destination_number
  //   cdr_from_nc / cdr_to_nc — добавочные (extensions)
  //   accountcode — внутренний номер менеджера
  const type = call.type || (call.direction === 'inbound' ? 'incoming' : 'outgoing')
  const answered = (call.disposition === 'ANSWERED') || (Number(call.billsec) > 0)
  const duration = Number(call.billsec) || 0
  const waitTime = Number(call.duration) && Number(call.billsec)
    ? Number(call.duration) - Number(call.billsec)
    : 0
  // Добавочный менеджера — берём из разных возможных полей
  const ext = call.accountcode || call.cdr_from_nc || call.cdr_to_nc
    || call.user_id || call.operator || ''
  return { type, answered, duration, waitTime, ext: String(ext || '') }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { ONPBX_DOMAIN, ONPBX_API_KEY } = process.env
  if (!ONPBX_DOMAIN || !ONPBX_API_KEY) {
    return res.status(500).json({
      error: 'OnlinePBX не настроен',
      details: 'Нужны env vars: ONPBX_DOMAIN (например pbx14950.onpbx.ru), ONPBX_API_KEY',
    })
  }

  const { from, to } = req.query
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: 'from и to обязательны в формате YYYY-MM-DD' })
  }

  const fromTs = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000)
  const toTs   = Math.floor(new Date(`${to}T23:59:59Z`).getTime() / 1000)

  try {
    // Получаем историю звонков. Пагинация — limit 1000 на страницу
    const allCalls = []
    let start = 0
    const pageSize = 1000
    let safety = 0
    while (safety < 20) {
      const data = await onpbxPost(
        ONPBX_DOMAIN,
        '/mfs/history.json',
        {
          start_stamp_from: fromTs,
          start_stamp_to: toTs,
          start,
          limit: pageSize,
        },
        ONPBX_API_KEY,
      )
      const items = data?.data || data?.items || data?.history || []
      if (!items.length) break
      allCalls.push(...items)
      if (items.length < pageSize) break
      start += pageSize
      safety += 1
    }

    // Агрегация по extension (добавочному)
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

    // Финализируем: avg talk time, avg wait time, miss rate
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
