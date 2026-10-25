// amoCRM → CRM import. Re-runnable: every row is keyed by its amo id
// (amo_id / amo_key), so a second run updates instead of duplicating — run
// it once for the bulk, then again right before switching amo off to pick up
// what changed in between.
//
// What comes over:
//   users      → mapped to employees by employees.amoUserId, then by name
//   pipelines  → crm_pipelines / crm_stages (142 = won, 143 = lost, amo
//                «Неразобранное» (status type 1) = inbox)
//   contacts   → crm_contacts (phones normalised; linked to students by phone)
//   leads      → crm_leads with responsible, price, tags, loss reason
//   events     → stage_change history (lead_status_changed) for the funnel
//   notes      → timeline: notes, calls (with direction), system messages
//   tasks      → crm_tasks
// Not available through amo's public API: Instagram/Telegram chat history
// (it lives in amojo). The AI agent's conversations come over with the
// Firestore import (aiAgentConversations).

import { normalizePhones } from '../lib/phone.js'

const WON = 142
const LOST = 143
const PAGE = 250

const toDate = (unix) => (unix ? new Date(unix * 1000) : null)

/** Iterate an amo list endpoint page by page. */
async function* pages(amo, path, key, size = PAGE) {
  for (let page = 1; ; page++) {
    const sep = path.includes('?') ? '&' : '?'
    const data = await amo.get(`${path}${sep}limit=${size}&page=${page}`)
    const items = data?._embedded?.[key] || []
    if (items.length) yield items
    if (!data?._links?.next || items.length < size) return
  }
}

function customField(entity, code) {
  const f = (entity.custom_fields_values || []).find(x => x.field_code === code)
  return (f?.values || []).map(v => v.value).filter(Boolean)
}

/**
 * @param {object} p
 * @param {import('pg').Pool} p.pool
 * @param {string} p.tenantId
 * @param {{get: (path: string) => Promise<any>}} p.amo  amo REST client (see scripts/import-amo.js)
 * @param {string} [p.eventsSince]  ISO date; stage history before it is skipped
 * @param {(msg: string) => void} [p.log]
 */
export async function importFromAmo({ pool, tenantId, amo, eventsSince, log = () => {} }) {
  const stats = { users: 0, mappedUsers: 0, pipelines: 0, stages: 0, contacts: 0, leads: 0, events: 0, notes: 0, tasks: 0 }

  // ─── Users → employees ────────────────────────────────────────────────
  const { rows: emps } = await pool.query(
    `SELECT id, amo_user_id, lower(btrim(data->>'name')) AS name, lower(btrim(data->>'amoUserName')) AS amo_name
       FROM employees WHERE tenant_id = $1`, [tenantId]
  )
  const userMap = new Map() // amo user id → employee id
  const userNames = new Map()
  for await (const users of pages(amo, '/api/v4/users', 'users')) {
    for (const u of users) {
      stats.users++
      userNames.set(u.id, u.name)
      const name = String(u.name || '').trim().toLowerCase()
      const emp = emps.find(e => Number(e.amo_user_id) === u.id)
        || emps.find(e => name && (e.amo_name === name || e.name === name))
      if (emp) { userMap.set(u.id, emp.id); stats.mappedUsers++ }
    }
  }
  const employeeFor = (amoUserId) => userMap.get(amoUserId) || null
  log(`users: ${stats.users}, matched to employees: ${stats.mappedUsers}`)

  // ─── Pipelines & stages ───────────────────────────────────────────────
  const stageMap = new Map() // `${pipelineAmoId}:${statusId}` → { id, kind }
  const pipeMap = new Map()  // pipeline amo id → pipeline uuid
  const data = await amo.get('/api/v4/leads/pipelines')
  for (const p of data?._embedded?.pipelines || []) {
    const { rows: [pipe] } = await pool.query(
      `INSERT INTO crm_pipelines (tenant_id, name, sort, is_default, amo_id) VALUES ($1, $2, $3, false, $4)
       ON CONFLICT (tenant_id, amo_id) DO UPDATE SET name = EXCLUDED.name, sort = EXCLUDED.sort
       RETURNING id`, [tenantId, p.name, p.sort || 0, p.id]
    )
    pipeMap.set(p.id, pipe.id)
    stats.pipelines++
    if (p.is_main) {
      // two statements: a single UPDATE could hit the one-default unique index mid-way
      await pool.query('UPDATE crm_pipelines SET is_default = false WHERE tenant_id = $1 AND id <> $2', [tenantId, pipe.id])
      await pool.query('UPDATE crm_pipelines SET is_default = true WHERE id = $1', [pipe.id])
    }
    for (const s of p._embedded?.statuses || []) {
      const kind = s.id === WON ? 'won' : s.id === LOST ? 'lost' : 'open'
      const isInbox = kind === 'open' && (s.type === 1 || /неразобран/i.test(s.name || ''))
      const { rows: [st] } = await pool.query(
        `INSERT INTO crm_stages (tenant_id, pipeline_id, name, color, sort, kind, is_inbox, amo_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (pipeline_id, amo_id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color,
           sort = EXCLUDED.sort, kind = EXCLUDED.kind, is_inbox = EXCLUDED.is_inbox
         RETURNING id, kind`, [tenantId, pipe.id, s.name, s.color || null, s.sort || 0, kind, isInbox, s.id]
      )
      stageMap.set(`${p.id}:${s.id}`, st)
      stats.stages++
    }
  }
  log(`pipelines: ${stats.pipelines}, stages: ${stats.stages}`)

  // ─── Contacts ─────────────────────────────────────────────────────────
  const contactMap = new Map() // amo contact id → uuid
  for await (const batch of pages(amo, '/api/v4/contacts', 'contacts')) {
    for (const c of batch) {
      const phones = normalizePhones(customField(c, 'PHONE'))
      const email = customField(c, 'EMAIL')[0] || null
      const { rows: [row] } = await pool.query(
        `INSERT INTO crm_contacts (tenant_id, name, phones, email, responsible_id, source, amo_id, created_at)
         VALUES ($1, $2, $3, $4, $5, 'amo', $6, $7)
         ON CONFLICT (tenant_id, amo_id) DO UPDATE SET name = EXCLUDED.name, phones = EXCLUDED.phones,
           email = EXCLUDED.email, responsible_id = EXCLUDED.responsible_id
         RETURNING id`,
        [tenantId, c.name || '', phones, email, employeeFor(c.responsible_user_id), c.id, toDate(c.created_at) || new Date()]
      )
      contactMap.set(c.id, row.id)
      stats.contacts++
    }
    log(`contacts: ${stats.contacts}`)
  }

  // Link contacts to existing students by phone (last 9 digits — student
  // phones in the ERP are stored in all sorts of formats).
  await pool.query(
    `UPDATE crm_contacts c SET student_id = s.id
       FROM students s
      WHERE c.tenant_id = $1 AND s.tenant_id = $1 AND c.student_id IS NULL
        AND length(s.phone_digits) >= 9
        AND EXISTS (SELECT 1 FROM unnest(c.phones) p WHERE right(p, 9) = right(s.phone_digits, 9))`,
    [tenantId]
  )

  // ─── Leads ────────────────────────────────────────────────────────────
  const leadMap = new Map() // amo lead id → { id, created, pipeline, status }
  for await (const batch of pages(amo, '/api/v4/leads?with=contacts,loss_reason', 'leads')) {
    for (const l of batch) {
      const stage = stageMap.get(`${l.pipeline_id}:${l.status_id}`)
      if (!stage) continue // lead in a deleted pipeline/status
      const main = (l._embedded?.contacts || []).find(c => c.is_main) || l._embedded?.contacts?.[0]
      const tags = (l._embedded?.tags || []).map(t => t.name).filter(Boolean)
      const lossReason = l._embedded?.loss_reason?.[0]?.name || null
      const responsible = employeeFor(l.responsible_user_id)
      const custom = responsible ? {} : { amoResponsible: userNames.get(l.responsible_user_id) || null }
      const created = toDate(l.created_at) || new Date()
      const { rows: [row] } = await pool.query(
        `INSERT INTO crm_leads (tenant_id, title, contact_id, pipeline_id, stage_id, responsible_id, source,
                                amount, tags, custom, loss_reason, created_at, stage_changed_at, closed_at, amo_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'amo', $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (tenant_id, amo_id) DO UPDATE SET title = EXCLUDED.title, contact_id = EXCLUDED.contact_id,
           pipeline_id = EXCLUDED.pipeline_id, stage_id = EXCLUDED.stage_id, responsible_id = EXCLUDED.responsible_id,
           amount = EXCLUDED.amount, tags = EXCLUDED.tags, custom = crm_leads.custom || EXCLUDED.custom,
           loss_reason = EXCLUDED.loss_reason, stage_changed_at = EXCLUDED.stage_changed_at, closed_at = EXCLUDED.closed_at
         RETURNING id`,
        [tenantId, l.name || '', main ? contactMap.get(main.id) || null : null, pipeMap.get(l.pipeline_id), stage.id,
         responsible, Number(l.price) || 0, tags, custom, lossReason, created, toDate(l.updated_at) || created,
         stage.kind === 'open' ? null : (toDate(l.closed_at) || toDate(l.updated_at) || created), l.id]
      )
      leadMap.set(l.id, { id: row.id, contactId: main ? contactMap.get(main.id) || null : null, created, stageId: stage.id, pipelineAmoId: l.pipeline_id })
      stats.leads++
    }
    log(`leads: ${stats.leads}`)
  }

  // ─── Stage history (funnel) ───────────────────────────────────────────
  const history = new Map() // amo lead id → [{ id, at, before, after }]
  const since = eventsSince ? Math.floor(Date.parse(eventsSince) / 1000) : null
  const eventsPath = '/api/v4/events?filter[type]=lead_status_changed' + (since ? `&filter[created_at][from]=${since}` : '')
  for await (const batch of pages(amo, eventsPath, 'events', 100)) { // events API caps limit at 100
    for (const e of batch) {
      if (!leadMap.has(e.entity_id)) continue
      const stageOf = (v) => {
        const s = v?.[0]?.lead_status
        return s ? stageMap.get(`${s.pipeline_id}:${s.id}`) : null
      }
      const list = history.get(e.entity_id) || []
      list.push({ id: e.id, at: toDate(e.created_at), before: stageOf(e.value_before), after: stageOf(e.value_after), author: employeeFor(e.created_by) })
      history.set(e.entity_id, list)
    }
  }
  for (const [amoId, lead] of leadMap) {
    const events = (history.get(amoId) || []).sort((a, b) => a.at - b.at)
    // Entry into the first stage: where the earliest change started from,
    // or the current stage if the lead never moved.
    const first = events[0]?.before?.id || (events.length ? null : lead.stageId)
    if (first) {
      await upsertStageChange(pool, tenantId, lead, `created:${amoId}`, null, first, lead.created, null)
    }
    for (const ev of events) {
      if (!ev.after) continue
      await upsertStageChange(pool, tenantId, lead, `event:${ev.id}`, ev.before?.id || null, ev.after.id, ev.at, ev.author)
      stats.events++
    }
  }
  log(`stage changes: ${stats.events}`)

  // ─── Notes & calls ────────────────────────────────────────────────────
  const NOTE_TYPES = {
    common: { type: 'note', direction: 'out' },
    call_in: { type: 'call', direction: 'in' },
    call_out: { type: 'call', direction: 'out' },
    sms_in: { type: 'message', direction: 'in', channel: 'sms' },
    sms_out: { type: 'message', direction: 'out', channel: 'sms' },
  }
  for (const entity of ['leads', 'contacts']) {
    for await (const batch of pages(amo, `/api/v4/${entity}/notes`, 'notes')) {
      for (const n of batch) {
        const lead = entity === 'leads' ? leadMap.get(n.entity_id) : null
        const contactId = entity === 'contacts' ? contactMap.get(n.entity_id) : lead?.contactId
        if (!lead && !contactId) continue
        const kind = NOTE_TYPES[n.note_type] || { type: 'system', direction: null }
        const p = n.params || {}
        const body = p.text || (kind.type === 'call'
          ? [p.phone, p.duration ? `${p.duration} сек` : null, p.call_result].filter(Boolean).join(' · ')
          : null) || n.note_type
        const meta = kind.type === 'call'
          ? { phone: p.phone || null, duration: p.duration ?? null, link: p.link || null, result: p.call_result || null }
          : { amoNoteType: n.note_type }
        await pool.query(
          `INSERT INTO crm_activities (tenant_id, lead_id, contact_id, type, direction, channel, author_id, body, meta, amo_key, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (tenant_id, amo_key) DO UPDATE SET body = EXCLUDED.body, meta = EXCLUDED.meta`,
          [tenantId, lead?.id || null, contactId || null, kind.type, kind.direction, kind.channel || null,
           employeeFor(n.created_by), body, meta, `${entity}-note:${n.id}`, toDate(n.created_at) || new Date()]
        )
        stats.notes++
      }
    }
  }
  log(`notes & calls: ${stats.notes}`)

  // ─── Tasks ────────────────────────────────────────────────────────────
  for await (const batch of pages(amo, '/api/v4/tasks', 'tasks')) {
    for (const t of batch) {
      const lead = t.entity_type === 'leads' ? leadMap.get(t.entity_id) : null
      const contactId = t.entity_type === 'contacts' ? contactMap.get(t.entity_id) || null : lead?.contactId || null
      const due = toDate(t.complete_till) || new Date()
      await pool.query(
        `INSERT INTO crm_tasks (tenant_id, lead_id, contact_id, assignee_id, text, due_at, done_at, result, amo_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (tenant_id, amo_id) DO UPDATE SET text = EXCLUDED.text, due_at = EXCLUDED.due_at,
           done_at = EXCLUDED.done_at, result = EXCLUDED.result, assignee_id = EXCLUDED.assignee_id`,
        [tenantId, lead?.id || null, contactId, employeeFor(t.responsible_user_id), t.text || 'Задача', due,
         t.is_completed ? (toDate(t.updated_at) || due) : null, t.result?.text || null, t.id, toDate(t.created_at) || new Date()]
      )
      stats.tasks++
    }
  }
  log(`tasks: ${stats.tasks}`)

  // ─── Derived fields: response time and last activity ──────────────────
  await pool.query(
    `UPDATE crm_leads l SET
       first_response_at = a.first_out,
       last_activity_at = a.last_any
       FROM (SELECT lead_id,
                    min(created_at) FILTER (WHERE direction = 'out' AND author_id IS NOT NULL
                                              AND type IN ('call', 'message', 'note')) AS first_out,
                    max(created_at) AS last_any
               FROM crm_activities WHERE tenant_id = $1 AND lead_id IS NOT NULL GROUP BY lead_id) a
      WHERE l.id = a.lead_id AND l.tenant_id = $1 AND l.amo_id IS NOT NULL`,
    [tenantId]
  )

  return stats
}

async function upsertStageChange(pool, tenantId, lead, key, from, to, at, author) {
  await pool.query(
    `INSERT INTO crm_activities (tenant_id, lead_id, contact_id, type, author_id, meta, amo_key, created_at)
     VALUES ($1, $2, $3, 'stage_change', $4, $5, $6, $7)
     ON CONFLICT (tenant_id, amo_key) DO UPDATE SET meta = EXCLUDED.meta, created_at = EXCLUDED.created_at`,
    [tenantId, lead.id, lead.contactId, author, { from, to }, key, at || lead.created]
  )
}
