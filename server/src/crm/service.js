// CRM business logic, shared by the HTTP routes, inbound channels (landing,
// Telegram, telephony — next stage) and the amoCRM import.
//
// All functions take a pg client/pool as `db` and a tenantId; callers own
// the transaction.

import { normalizePhone, normalizePhones } from '../lib/phone.js'
import { notFound, badRequest } from '../lib/errors.js'

// Who works in the CRM at all, and who configures it / sees everything.
export const CRM_ROLES = new Set(['owner', 'admin', 'branch_director', 'branch_admin', 'rop', 'sales', 'smm'])
export const CRM_MANAGER_ROLES = new Set(['owner', 'admin', 'branch_director', 'rop'])

export const DEFAULT_STAGES = [
  { name: 'Неразобранное', color: '#94a3b8', kind: 'open', isInbox: true },
  { name: 'Новая заявка', color: '#3b82f6', kind: 'open' },
  { name: 'Связались', color: '#06b6d4', kind: 'open' },
  { name: 'Записан на пробный урок', color: '#8b5cf6', kind: 'open' },
  { name: 'Пришёл на пробный', color: '#f59e0b', kind: 'open' },
  { name: 'Успешно реализовано', color: '#10b981', kind: 'won' },
  { name: 'Закрыто и не реализовано', color: '#ef4444', kind: 'lost' },
]

// Outgoing touches that count as "the manager reacted" for response-time.
const RESPONSE_TYPES = new Set(['call', 'message', 'note'])

// Foreign keys alone would happily link a lead to another school's contact
// or employee — every id coming from a request is checked against the tenant.
const REF_TABLES = {
  responsibleId: 'employees', assigneeId: 'employees', studentId: 'students',
  paymentId: 'payments', contactId: 'crm_contacts', leadId: 'crm_leads',
}

export async function assertRefs(db, tenantId, input) {
  for (const [key, table] of Object.entries(REF_TABLES)) {
    const id = input[key]
    if (id === undefined || id === null || id === '') continue
    const { rows } = await db.query(`SELECT 1 FROM ${table} WHERE id::text = $1 AND tenant_id = $2`, [String(id), tenantId])
    if (!rows[0]) throw badRequest(`${key}: запись не найдена`)
  }
}

// ─── Row mappers (snake_case rows → camelCase API objects) ──────────────

export const mapStage = (r) => ({
  id: r.id, pipelineId: r.pipeline_id, name: r.name, color: r.color, sort: r.sort,
  kind: r.kind, isInbox: r.is_inbox,
})

export const mapContact = (r) => ({
  id: r.id, name: r.name, phones: r.phones, email: r.email, instagram: r.instagram,
  telegramId: r.telegram_id, telegramUsername: r.telegram_username, studentId: r.student_id,
  responsibleId: r.responsible_id, source: r.source, custom: r.custom,
  createdAt: r.created_at, updatedAt: r.updated_at,
})

export const mapLead = (r) => ({
  id: r.id, title: r.title, contactId: r.contact_id, pipelineId: r.pipeline_id, stageId: r.stage_id,
  responsibleId: r.responsible_id, source: r.source, branchId: r.branch_id, courseId: r.course_id,
  amount: r.amount, tags: r.tags, custom: r.custom, lossReason: r.loss_reason,
  studentId: r.student_id, paymentId: r.payment_id,
  stageChangedAt: r.stage_changed_at, closedAt: r.closed_at, firstResponseAt: r.first_response_at,
  lastActivityAt: r.last_activity_at, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
  ...(r.contact_name !== undefined && { contact: { name: r.contact_name, phones: r.contact_phones } }),
  ...(r.next_task_at !== undefined && { nextTaskAt: r.next_task_at }),
})

export const mapActivity = (r) => ({
  id: r.id, leadId: r.lead_id, contactId: r.contact_id, type: r.type, direction: r.direction,
  channel: r.channel, authorId: r.author_id, body: r.body, meta: r.meta, createdAt: r.created_at,
})

export const mapTask = (r) => ({
  id: r.id, leadId: r.lead_id, contactId: r.contact_id, assigneeId: r.assignee_id, text: r.text,
  dueAt: r.due_at, doneAt: r.done_at, result: r.result, createdBy: r.created_by,
  createdAt: r.created_at, updatedAt: r.updated_at,
})

// ─── Pipelines ───────────────────────────────────────────────────────────

export async function listPipelines(db, tenantId) {
  const { rows: pipes } = await db.query(
    'SELECT * FROM crm_pipelines WHERE tenant_id = $1 AND NOT archived ORDER BY sort, created_at', [tenantId]
  )
  const { rows: stages } = await db.query(
    'SELECT * FROM crm_stages WHERE tenant_id = $1 ORDER BY sort, created_at', [tenantId]
  )
  return pipes.map(p => ({
    id: p.id, name: p.name, sort: p.sort, isDefault: p.is_default,
    stages: stages.filter(s => s.pipeline_id === p.id).map(mapStage),
  }))
}

export async function createPipeline(db, tenantId, { name, stages = DEFAULT_STAGES, isDefault, amoId = null }) {
  if (!name) throw badRequest('Укажите название воронки')
  const { rows: [{ n }] } = await db.query('SELECT count(*)::int AS n FROM crm_pipelines WHERE tenant_id = $1', [tenantId])
  const makeDefault = isDefault ?? n === 0 // the first pipeline is the default one
  if (makeDefault) await db.query('UPDATE crm_pipelines SET is_default = false WHERE tenant_id = $1', [tenantId])
  const { rows: [p] } = await db.query(
    `INSERT INTO crm_pipelines (tenant_id, name, sort, is_default, amo_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [tenantId, name, n, makeDefault, amoId]
  )
  for (const [i, s] of stages.entries()) await addStage(db, tenantId, p.id, { ...s, sort: s.sort ?? i })
  return p
}

export async function addStage(db, tenantId, pipelineId, { name, color = null, kind = 'open', isInbox = false, sort, amoId = null }) {
  if (!name) throw badRequest('Укажите название этапа')
  if (!['open', 'won', 'lost'].includes(kind)) throw badRequest('kind: open | won | lost')
  const { rows: [s] } = await db.query(
    `INSERT INTO crm_stages (tenant_id, pipeline_id, name, color, kind, is_inbox, sort, amo_id)
     SELECT $1, id, $3, $4, $5, $6,
            coalesce($7, (SELECT coalesce(max(sort) + 1, 0) FROM crm_stages WHERE pipeline_id = $2)), $8
       FROM crm_pipelines WHERE id = $2 AND tenant_id = $1
     RETURNING *`,
    [tenantId, pipelineId, name, color, kind, isInbox, sort ?? null, amoId]
  )
  if (!s) throw notFound('Воронка не найдена')
  return mapStage(s)
}

async function defaultPipeline(db, tenantId) {
  const { rows } = await db.query(
    `SELECT * FROM crm_pipelines WHERE tenant_id = $1 AND NOT archived ORDER BY is_default DESC, sort LIMIT 1`, [tenantId]
  )
  if (rows[0]) return rows[0]
  // Brand-new school: the CRM works out of the box with the standard funnel.
  return createPipeline(db, tenantId, { name: 'Продажи' })
}

async function getStage(db, tenantId, stageId) {
  const { rows } = await db.query('SELECT * FROM crm_stages WHERE id = $1 AND tenant_id = $2', [stageId, tenantId])
  if (!rows[0]) throw badRequest('Этап не найден')
  return rows[0]
}

/** First stage new leads land in: the inbox if the pipeline has one. */
async function entryStage(db, pipelineId) {
  const { rows } = await db.query(
    `SELECT * FROM crm_stages WHERE pipeline_id = $1 AND kind = 'open' ORDER BY is_inbox DESC, sort LIMIT 1`, [pipelineId]
  )
  if (!rows[0]) throw badRequest('В воронке нет открытых этапов')
  return rows[0]
}

// ─── Contacts ────────────────────────────────────────────────────────────

export async function findContactByPhone(db, tenantId, phone) {
  const p = normalizePhone(phone)
  if (!p) return null
  const { rows } = await db.query(
    `SELECT * FROM crm_contacts WHERE tenant_id = $1 AND deleted_at IS NULL AND phones @> ARRAY[$2]
     ORDER BY created_at LIMIT 1`, [tenantId, p]
  )
  return rows[0] || null
}

export async function createContact(db, tenantId, input, authorId = null) {
  await assertRefs(db, tenantId, { studentId: input.studentId, responsibleId: input.responsibleId })
  const phones = normalizePhones([...(input.phones || []), input.phone])
  const { rows: [c] } = await db.query(
    `INSERT INTO crm_contacts (tenant_id, name, phones, email, instagram, telegram_id, telegram_username,
                               student_id, responsible_id, source, custom, amo_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [tenantId, (input.name || '').trim(), phones, input.email || null, input.instagram || null,
     input.telegramId || null, input.telegramUsername || null, input.studentId || null,
     input.responsibleId || null, input.source || null, input.custom || {}, input.amoId || null, authorId]
  )
  return c
}

/**
 * Find a contact by any of its phones (or Telegram/Instagram id), else
 * create one. Missing details on an existing contact are filled in.
 */
export async function findOrCreateContact(db, tenantId, input, authorId = null) {
  const phones = normalizePhones([...(input.phones || []), input.phone])
  let existing = null
  if (phones.length) {
    const { rows } = await db.query(
      `SELECT * FROM crm_contacts WHERE tenant_id = $1 AND deleted_at IS NULL AND phones && $2
       ORDER BY created_at LIMIT 1`, [tenantId, phones]
    )
    existing = rows[0]
  }
  for (const [col, val] of [['telegram_id', input.telegramId], ['instagram', input.instagram]]) {
    if (existing || !val) continue
    const { rows } = await db.query(
      `SELECT * FROM crm_contacts WHERE tenant_id = $1 AND deleted_at IS NULL AND ${col} = $2 LIMIT 1`, [tenantId, String(val)]
    )
    existing = rows[0]
  }
  if (!existing) return { contact: await createContact(db, tenantId, input, authorId), created: true }

  const { rows: [c] } = await db.query(
    `UPDATE crm_contacts SET
       phones = (SELECT array_agg(DISTINCT p) FROM unnest(phones || $2::text[]) p),
       name = CASE WHEN name = '' THEN $3 ELSE name END,
       telegram_id = coalesce(telegram_id, $4),
       telegram_username = coalesce(telegram_username, $5),
       instagram = coalesce(instagram, $6),
       email = coalesce(email, $7)
     WHERE id = $1 RETURNING *`,
    [existing.id, phones, (input.name || '').trim(), input.telegramId || null,
     input.telegramUsername || null, input.instagram || null, input.email || null]
  )
  return { contact: c, created: false }
}

// ─── Activities ──────────────────────────────────────────────────────────

export async function addActivity(db, tenantId, { leadId = null, contactId = null, type, direction = null,
  channel = null, authorId = null, body = null, meta = {}, createdAt = null, amoKey = null }) {
  const { rows: [a] } = await db.query(
    `INSERT INTO crm_activities (tenant_id, lead_id, contact_id, type, direction, channel, author_id, body, meta, amo_key, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, coalesce($11, now()))
     ON CONFLICT (tenant_id, amo_key) DO UPDATE SET body = EXCLUDED.body, meta = EXCLUDED.meta
     RETURNING *`,
    [tenantId, leadId, contactId, type, direction, channel, authorId, body, meta, amoKey, createdAt]
  )
  if (leadId) {
    // Response time = first outgoing touch by a person (system rows don't count).
    const isResponse = direction === 'out' && RESPONSE_TYPES.has(type) && authorId
    await db.query(
      `UPDATE crm_leads SET
         last_activity_at = greatest(coalesce(last_activity_at, $2), $2),
         first_response_at = CASE WHEN $3 AND (first_response_at IS NULL OR first_response_at > $2) THEN $2 ELSE first_response_at END
       WHERE id = $1`,
      [leadId, a.created_at, !!isResponse]
    )
  }
  return a
}

// ─── Leads ───────────────────────────────────────────────────────────────

export async function getLeadRow(db, tenantId, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM crm_leads WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL ${forUpdate ? 'FOR UPDATE' : ''}`,
    [id, tenantId]
  )
  if (!rows[0]) throw notFound('Сделка не найдена')
  return rows[0]
}

/**
 * Create a lead. `contact` ({name, phone, telegramId…}) is matched against
 * existing contacts by phone, so a client writing again from another channel
 * doesn't become a second contact.
 */
export async function createLead(db, tenantId, input, authorId = null) {
  await assertRefs(db, tenantId, { contactId: input.contactId, responsibleId: input.responsibleId })
  let contactId = input.contactId || null
  if (!contactId && input.contact) {
    contactId = (await findOrCreateContact(db, tenantId, { source: input.source, ...input.contact }, authorId)).contact.id
  }

  let stage
  if (input.stageId) stage = await getStage(db, tenantId, input.stageId)
  else {
    const pipelineId = input.pipelineId || (await defaultPipeline(db, tenantId)).id
    stage = await entryStage(db, pipelineId)
  }
  if (input.pipelineId && input.pipelineId !== stage.pipeline_id) throw badRequest('Этап из другой воронки')

  const title = input.title || input.contact?.name || 'Новая сделка'
  const custom = { ...(input.custom || {}) }
  if (input.fields) {
    const values = Object.fromEntries(Object.entries(await cleanFieldValues(db, tenantId, 'lead', input.fields)).filter(([, v]) => v !== null))
    custom.fields = { ...(custom.fields || {}), ...values }
  }
  const { rows: [lead] } = await db.query(
    `INSERT INTO crm_leads (tenant_id, title, contact_id, pipeline_id, stage_id, responsible_id, source,
                            branch_id, course_id, amount, tags, custom, created_by, closed_at, amo_id,
                            created_at, stage_changed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
             CASE WHEN $14 THEN coalesce($16, now()) END, $15, coalesce($16, now()), coalesce($16, now()))
     RETURNING *`,
    [tenantId, title, contactId, stage.pipeline_id, stage.id, input.responsibleId || null, input.source || null,
     input.branchId || null, input.courseId || null, Number(input.amount) || 0, input.tags || [],
     custom, authorId, stage.kind !== 'open', input.amoId || null, input.createdAt || null]
  )
  // The funnel report counts entries into stages from these rows.
  await addActivity(db, tenantId, {
    leadId: lead.id, contactId, type: 'stage_change', authorId,
    meta: { from: null, to: stage.id }, createdAt: lead.created_at,
  })
  if (input.note) {
    await addActivity(db, tenantId, { leadId: lead.id, contactId, type: 'note', authorId, body: input.note })
  }
  return lead
}

// ─── Custom fields ───────────────────────────────────────────────────────

export const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'multiselect', 'checkbox', 'url']

export const mapField = (r) => ({
  id: r.id, entity: r.entity, key: r.key, label: r.label, type: r.type, options: r.options, sort: r.sort,
})

/**
 * Validate values for the school's custom fields ({ key: value }) and coerce
 * them to the field type. Empty values become null, which removes the value.
 */
export async function cleanFieldValues(db, tenantId, entity, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw badRequest('fields: ожидается объект')
  const { rows } = await db.query('SELECT * FROM crm_fields WHERE tenant_id = $1 AND entity = $2', [tenantId, entity])
  const defs = Object.fromEntries(rows.map(r => [r.key, r]))
  const out = {}
  for (const [key, raw] of Object.entries(values)) {
    const def = defs[key]
    if (!def) throw badRequest(`Поле «${key}» не найдено`)
    const empty = raw === null || raw === undefined || raw === '' || (Array.isArray(raw) && !raw.length)
    if (empty) { out[key] = null; continue }
    let v
    switch (def.type) {
      case 'number':
        v = Number(String(raw).replace(/\s/g, '').replace(',', '.'))
        if (!Number.isFinite(v)) throw badRequest(`«${def.label}»: нужно число`)
        break
      case 'checkbox': v = raw === true || raw === 'true'; break
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) throw badRequest(`«${def.label}»: дата YYYY-MM-DD`)
        v = String(raw)
        break
      case 'select':
        v = String(raw)
        if (def.options.length && !def.options.includes(v)) throw badRequest(`«${def.label}»: нет такого варианта`)
        break
      case 'multiselect':
        v = (Array.isArray(raw) ? raw : [raw]).map(String)
        if (def.options.length && v.some(x => !def.options.includes(x))) throw badRequest(`«${def.label}»: нет такого варианта`)
        break
      default:
        v = String(raw).trim().slice(0, 5000)
    }
    out[key] = v
  }
  return out
}

const LEAD_FIELDS = {
  title: 'title', responsibleId: 'responsible_id', source: 'source', branchId: 'branch_id',
  courseId: 'course_id', amount: 'amount', tags: 'tags', custom: 'custom', lossReason: 'loss_reason',
  contactId: 'contact_id', studentId: 'student_id', paymentId: 'payment_id',
}

/** Update a lead; a stageId change is logged and maintains closed_at. */
export async function updateLead(db, tenantId, id, patch, authorId = null) {
  const lead = await getLeadRow(db, tenantId, id, { forUpdate: true })
  await assertRefs(db, tenantId, {
    contactId: patch.contactId, responsibleId: patch.responsibleId,
    studentId: patch.studentId, paymentId: patch.paymentId,
  })
  const sets = []
  const params = [id]
  for (const [key, col] of Object.entries(LEAD_FIELDS)) {
    if (patch[key] === undefined || (key === 'custom' && patch.fields !== undefined)) continue
    params.push(key === 'amount' ? Number(patch[key]) || 0 : patch[key])
    sets.push(`${col} = $${params.length}`)
  }
  // Custom field values merge into custom.fields; null removes a value.
  if (patch.fields !== undefined) {
    const values = await cleanFieldValues(db, tenantId, 'lead', patch.fields)
    params.push(patch.custom !== undefined ? patch.custom : null, values)
    const base = `coalesce($${params.length - 1}::jsonb, custom)`
    sets.push(`custom = jsonb_set(${base}, '{fields}', jsonb_strip_nulls(coalesce(${base}->'fields', '{}'::jsonb) || $${params.length}::jsonb))`)
  }

  if (patch.stageId && patch.stageId !== lead.stage_id) {
    const stage = await getStage(db, tenantId, patch.stageId)
    params.push(stage.id, stage.pipeline_id)
    sets.push(`stage_id = $${params.length - 1}`, `pipeline_id = $${params.length}`, 'stage_changed_at = now()',
      stage.kind === 'open' ? 'closed_at = NULL' : 'closed_at = coalesce(closed_at, now())')
    await addActivity(db, tenantId, {
      leadId: id, contactId: lead.contact_id, type: 'stage_change', authorId,
      meta: { from: lead.stage_id, to: stage.id },
    })
  }
  if (!sets.length) return getLeadRow(db, tenantId, id)
  const { rows: [row] } = await db.query(`UPDATE crm_leads SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params)
  return row
}

export async function softDeleteLead(db, tenantId, id) {
  const { rowCount } = await db.query(
    'UPDATE crm_leads SET deleted_at = now() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL', [id, tenantId]
  )
  if (!rowCount) throw notFound('Сделка не найдена')
}

// ─── Tasks ───────────────────────────────────────────────────────────────

export async function createTask(db, tenantId, input, authorId = null) {
  if (!input.text) throw badRequest('Укажите текст задачи')
  const due = new Date(input.dueAt)
  if (Number.isNaN(due.getTime())) throw badRequest('Укажите срок задачи')
  await assertRefs(db, tenantId, { leadId: input.leadId, contactId: input.contactId, assigneeId: input.assigneeId })
  let contactId = input.contactId || null
  if (input.leadId) contactId = contactId || (await getLeadRow(db, tenantId, input.leadId)).contact_id
  const { rows: [t] } = await db.query(
    `INSERT INTO crm_tasks (tenant_id, lead_id, contact_id, assignee_id, text, due_at, done_at, result, amo_id, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, coalesce($11, now()))
     ON CONFLICT (tenant_id, amo_id) DO UPDATE SET text = EXCLUDED.text, due_at = EXCLUDED.due_at,
       done_at = EXCLUDED.done_at, result = EXCLUDED.result, assignee_id = EXCLUDED.assignee_id
     RETURNING *`,
    [tenantId, input.leadId || null, contactId, input.assigneeId || authorId, input.text, due,
     input.doneAt || null, input.result || null, input.amoId || null, authorId, input.createdAt || null]
  )
  return t
}

export async function updateTask(db, tenantId, id, patch, authorId = null) {
  const { rows: [task] } = await db.query('SELECT * FROM crm_tasks WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [id, tenantId])
  if (!task) throw notFound('Задача не найдена')
  await assertRefs(db, tenantId, { assigneeId: patch.assigneeId })
  const sets = []
  const params = [id]
  const set = (col, v) => { params.push(v); sets.push(`${col} = $${params.length}`) }
  if (patch.text !== undefined) set('text', patch.text)
  if (patch.assigneeId !== undefined) set('assignee_id', patch.assigneeId)
  if (patch.result !== undefined) set('result', patch.result)
  if (patch.dueAt !== undefined) {
    const due = new Date(patch.dueAt)
    if (Number.isNaN(due.getTime())) throw badRequest('Неверный срок')
    set('due_at', due)
  }
  if (patch.done === true && !task.done_at) {
    sets.push('done_at = now()')
    if (task.lead_id) {
      await addActivity(db, tenantId, {
        leadId: task.lead_id, contactId: task.contact_id, type: 'task', authorId,
        body: task.text, meta: { taskId: id, result: patch.result ?? task.result ?? null },
      })
    }
  } else if (patch.done === false) {
    sets.push('done_at = NULL')
  }
  if (!sets.length) return task
  const { rows: [row] } = await db.query(`UPDATE crm_tasks SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params)
  return row
}
