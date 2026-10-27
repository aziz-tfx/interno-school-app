// Vercel Serverless — расширенная аналитика amoCRM по воронке
// GET /api/amo/performance-v2?month=YYYY-MM
//
// Автоопределение этапов воронки по названию + метрики с ежедневной разбивкой.

import { resolveAmo } from '../_lib/tenantConfig.js'

const AMO_API_TIMEOUT_MS = 15000

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

// ─── Автоопределение этапов по названию ──────────────────────────────────────
const STAGE_PATTERNS = {
  new_lead:       [/нов[аы].*заявк/i, /^нов[аы][яйе]/i, /^new/i, /incoming/i],
  in_work:        [/взя[тл].*работ/i, /в\s*работ/i, /взято/i],
  qualified:      [/квалифиц/i, /qualif/i],
  trial_assigned: [/назнач.*(?:урок|пу|пробн)/i, /(?:урок|пу|пробн).*назнач/i],
  trial_attended: [/посетил.*(?:урок|пу|пробн)/i, /провед[её]н/i, /(?:урок|пу|пробн).*провед/i],
  terms_agreed:   [/услов.*соглас/i, /соглас.*услов/i],
}

// Воронки пост-оплат — учитываем только финальный этап "клиент полностью оплатил"
const POSTPAYMENT_PIPELINE_PATTERN = /контрол.*постоплат|постоплат|пост[\s-]*оплат|после\s*продаж|post.*payment/i
const POSTPAYMENT_FULLY_PAID_PATTERN = /полност.*оплат|оплат.*полност|fully\s*paid|full.*payment/i

function detectStages(pipelines) {
  // Собираем ВСЕ статусы со ВСЕХ воронок для корректной классификации won/lost
  const allStatusesById = {}
  const wonStatusIds = new Set()
  const lostStatusIds = new Set()
  const postpaymentPipelineIds = new Set()

  for (const p of pipelines) {
    const isPostPayment = POSTPAYMENT_PIPELINE_PATTERN.test(p.name || '')
    if (isPostPayment) postpaymentPipelineIds.add(p.id)
    const sts = p._embedded?.statuses || []
    for (const s of sts) {
      allStatusesById[s.id] = { ...s, pipelineId: p.id, pipelineName: p.name }
      if (isPostPayment) {
        // В воронке постоплат считаем won только этап "Клиент полностью оплатил"
        if (POSTPAYMENT_FULLY_PAID_PATTERN.test(s.name || '')) wonStatusIds.add(s.id)
        if (s.type === 2) lostStatusIds.add(s.id)
      } else {
        // В основной воронке продаж — won = финальный "Успешно реализовано" (type=1)
        if (s.type === 1) wonStatusIds.add(s.id)
        if (s.type === 2) lostStatusIds.add(s.id)
      }
    }
  }

  // Маппинг по названию — из первой (основной) воронки
  const pipeline = pipelines[0]
  const stages = pipeline?._embedded?.statuses || []
  const detected = {
    new_lead: null, in_work: null, qualified: null,
    trial_assigned: null, trial_attended: null, terms_agreed: null,
    won: null, lost: null,
  }

  for (const s of stages) {
    const info = { id: s.id, name: s.name, sort: s.sort }
    if (s.type === 1) { if (!detected.won) detected.won = info; continue }
    if (s.type === 2) { if (!detected.lost) detected.lost = info; continue }
    for (const [key, patterns] of Object.entries(STAGE_PATTERNS)) {
      if (detected[key]) continue
      if (patterns.some(rx => rx.test(s.name))) {
        detected[key] = info
        break
      }
    }
  }

  return {
    pipelineId: pipeline?.id,
    pipelineName: pipeline?.name,
    stages: detected,
    allStages: stages.map(s => ({ id: s.id, name: s.name, sort: s.sort, type: s.type })),
    wonStatusIds: Array.from(wonStatusIds),
    lostStatusIds: Array.from(lostStatusIds),
    postpaymentPipelineIds: Array.from(postpaymentPipelineIds),
    pipelines: pipelines.map(p => ({ id: p.id, name: p.name })),
  }
}

// Проверить "достиг ли лид этапа X" по sort-ordering (приближение)
function reachedStage(leadSort, targetSort) {
  if (targetSort == null) return false
  return leadSort >= targetSort
}

// ─── Рабочие дни в месяце (Пн-Сб по умолчанию, без воскресений) ──────────────
function workingDaysInMonth(year, monthIdx /* 0-11 */) {
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
  let count = 0
  const days = []
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, monthIdx, d).getDay() // 0=Вс
    if (dow !== 0) { count++; days.push(d) }
  }
  return { count, days, daysInMonth }
}

// ─── Handler ─────────────────────────────────────────────────────────────────
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
  const { count: totalWorkingDays, days: workingDayList } = workingDaysInMonth(year, monthIdx)

  // «Прошедшие рабочие дни» — с 1-го по сегодня (включительно)
  const now = new Date()
  const nowInMonth = now.getFullYear() === year && now.getMonth() === monthIdx
  const currentDay = nowInMonth ? now.getDate() : daysInMonth
  const workingDaysPassed = workingDayList.filter(d => d <= currentDay).length || 1

  try {
    // 1) Пользователи amo
    const usersRaw = await amoGetAll(base, '/users', headers, 'users', { pageSize: 250 })
    const users = usersRaw.map(u => ({ id: u.id, name: u.name, email: u.email }))
    const userMap = Object.fromEntries(users.map(u => [u.id, u]))

    // 2) Воронки
    let pipelines = []
    try {
      const pipeData = await amoGet(base, '/leads/pipelines', headers)
      pipelines = pipeData?._embedded?.pipelines || []
    } catch (err) {
      console.warn('pipelines fetch failed:', err.message)
    }

    const { pipelineId, pipelineName, stages, allStages, wonStatusIds, lostStatusIds, postpaymentPipelineIds, pipelines: allPipelines } = detectStages(pipelines)
    const wonSet = new Set(wonStatusIds)
    const lostSet = new Set(lostStatusIds)
    const stageSort = Object.fromEntries(
      Object.entries(stages).map(([k, v]) => [k, v?.sort ?? null])
    )

    // 3) Лиды — объединение двух запросов:
    //    а) созданные в месяце (для метрик "Новая заявка" и этапов воронки)
    //    б) закрытые в месяце (для выручки — сделки могли быть созданы раньше,
    //       но достигли "Успешно реализовано" только в этом месяце)
    const [leadsByCreated, leadsByClosed] = await Promise.all([
      amoGetAll(base,
        `/leads?filter[created_at][from]=${fromTs}&filter[created_at][to]=${toTs}`,
        headers, 'leads', { pageSize: 250, maxPages: 100 }),
      amoGetAll(base,
        `/leads?filter[closed_at][from]=${fromTs}&filter[closed_at][to]=${toTs}`,
        headers, 'leads', { pageSize: 250, maxPages: 100 }),
    ])
    // Дедупликация по lead.id
    const leadsMap = new Map()
    for (const l of leadsByCreated) leadsMap.set(l.id, l)
    for (const l of leadsByClosed) leadsMap.set(l.id, l) // overwrite с более свежими данными
    const leads = Array.from(leadsMap.values())

    // 4) Текущие sort для классификации
    const statusInfo = Object.fromEntries(allStages.map(s => [s.id, s]))

    // 5) Агрегация по менеджеру + по дню
    const postpaymentSet = new Set(postpaymentPipelineIds)
    const emptyMetrics = () => ({
      leadsNew: 0, leadsInWork: 0, qualified: 0,
      trialAssigned: 0, trialAttended: 0, termsAgreed: 0,
      sales: 0, revenue: 0,
      // Разбивка продаж по источнику
      salesMainWon: 0, revenueMainWon: 0,
      salesPostpayment: 0, revenuePostpayment: 0,
    })
    const emptyDaily = () => {
      const obj = {}
      for (let d = 1; d <= daysInMonth; d++) obj[d] = emptyMetrics()
      return obj
    }

    const byUser = {}
    const totals = { metrics: emptyMetrics(), daily: emptyDaily() }

    for (const lead of leads) {
      const isFromPostpayment = postpaymentSet.has(lead.pipeline_id)
      // Из воронок постоплат учитываем ТОЛЬКО сделки на финальном этапе "Клиент полностью оплатил".
      // Остальные сделки оттуда пропускаем (они уже были won в основной воронке либо ещё в процессе).
      if (isFromPostpayment && !wonSet.has(lead.status_id)) continue

      const uid = lead.responsible_user_id || 0
      if (!byUser[uid]) {
        byUser[uid] = {
          userId: uid,
          userName: userMap[uid]?.name || (uid ? `User #${uid}` : 'Не назначен'),
          email: userMap[uid]?.email || '',
          metrics: emptyMetrics(),
          daily: emptyDaily(),
        }
      }
      const bucket = byUser[uid]

      const currentStage = statusInfo[lead.status_id]
      const currentSort = currentStage?.sort ?? 0
      // Учитываем won/lost по ВСЕМ воронкам (не только первой) + legacy 142/143
      const isWon  = wonSet.has(lead.status_id)
      const isLost = lostSet.has(lead.status_id)

      // День создания — для "Новая заявка"
      const createdDate = new Date(lead.created_at * 1000)
      const createdInMonth = createdDate.getFullYear() === year && createdDate.getMonth() === monthIdx
      const createdDay = createdInMonth ? createdDate.getDate() : null

      // Лид вошёл в воронку — считаем как "Новая заявка" в день создания.
      // Сделки из воронки постоплат не являются новыми заявками — пропускаем.
      if (createdDay && !isFromPostpayment) {
        bucket.metrics.leadsNew += 1
        bucket.daily[createdDay].leadsNew += 1
        totals.metrics.leadsNew += 1
        totals.daily[createdDay].leadsNew += 1
      }

      // Для промежуточных этапов — по updated_at (день последнего изменения статуса)
      // При утере (lost) засчитываем этапы которые прошёл по sort
      const updatedDate = new Date(lead.updated_at * 1000)
      const updatedInMonth = updatedDate.getFullYear() === year && updatedDate.getMonth() === monthIdx
      const updatedDay = updatedInMonth ? updatedDate.getDate() : null

      const stageChecks = [
        ['leadsInWork',     'in_work'],
        ['qualified',       'qualified'],
        ['trialAssigned',   'trial_assigned'],
        ['trialAttended',   'trial_attended'],
        ['termsAgreed',     'terms_agreed'],
      ]
      // Этапы воронки считаем только для сделок из основной воронки продаж
      for (const [metricKey, stageKey] of (isFromPostpayment ? [] : stageChecks)) {
        const targetSort = stageSort[stageKey]
        if (targetSort == null) continue
        // Лид "достиг" этапа если: текущий sort >= target sort ИЛИ выигран ИЛИ (проиграно, но уже прошёл)
        const reached = isWon || reachedStage(currentSort, targetSort)
        if (reached) {
          bucket.metrics[metricKey] += 1
          totals.metrics[metricKey] += 1
          // Для дневной разбивки: если достиг этапа и этап не пройден (текущий = он), используем updated_at
          // Если этап пройден дальше — тоже updated_at (грубое приближение)
          const day = updatedDay || createdDay
          if (day) {
            bucket.daily[day][metricKey] += 1
            totals.daily[day][metricKey] += 1
          }
        }
      }

      // Продажи и выручка — строго по closed_at попадающему в месяц.
      // Это позволяет учитывать сделки созданные в прошлом месяце,
      // но перешедшие в "Успешно реализовано" в текущем.
      if (isWon) {
        const closedDate = lead.closed_at ? new Date(lead.closed_at * 1000) : null
        const closedInMonth = closedDate && closedDate.getFullYear() === year && closedDate.getMonth() === monthIdx
        if (closedInMonth) {
          const closedDay = closedDate.getDate()
          const price = Number(lead.price) || 0

          bucket.metrics.sales += 1
          bucket.metrics.revenue += price
          totals.metrics.sales += 1
          totals.metrics.revenue += price

          if (isFromPostpayment) {
            bucket.metrics.salesPostpayment += 1
            bucket.metrics.revenuePostpayment += price
            totals.metrics.salesPostpayment += 1
            totals.metrics.revenuePostpayment += price
          } else {
            bucket.metrics.salesMainWon += 1
            bucket.metrics.revenueMainWon += price
            totals.metrics.salesMainWon += 1
            totals.metrics.revenueMainWon += price
          }

          bucket.daily[closedDay].sales += 1
          bucket.daily[closedDay].revenue += price
          totals.daily[closedDay].sales += 1
          totals.daily[closedDay].revenue += price
        }
      }
    }

    return res.status(200).json({
      users,
      pipeline: { id: pipelineId, name: pipelineName },
      stages, allStages,
      byUser, totals,
      meta: {
        month,
        from: new Date(fromTs * 1000).toISOString().split('T')[0],
        to: new Date(toTs * 1000).toISOString().split('T')[0],
        fetchedLeads: leads.length,
        daysInMonth,
        workingDaysTotal: totalWorkingDays,
        workingDaysPassed,
        currentDay,
        fetchedAt: new Date().toISOString(),
        allPipelines,
        postpaymentPipelineIds,
      },
    })
  } catch (err) {
    console.error('amo performance-v2 error:', err)
    const status = err.status === 401 ? 401 : 500
    return res.status(status).json({
      error: err.status === 401
        ? 'Токен amoCRM невалиден — обновите AMO_ACCESS_TOKEN'
        : 'Ошибка загрузки данных amoCRM',
      details: err.message,
    })
  }
}
