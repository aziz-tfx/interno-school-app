// Lead filters and sorting shared by the board, the list, bulk "select all"
// and the CSV export. Query aliases: l = crm_leads, c = crm_contacts (LEFT JOIN).
//
//   q             name / title, or ≥5 digits → phone
//   responsibleId employee id | 'none'
//   source        lead source
//   status        open | won | lost
//   stageIds      comma-separated stage ids
//   tags          comma-separated, any of them
//   createdFrom/createdTo, closedFrom/closedTo   YYYY-MM-DD, Tashkent days
//   tasks         none (no open task) | overdue (an open task past due)

import { badRequest } from '../lib/errors.js'

export const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v))
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const list = (v) => String(v || '').split(',').map(s => s.trim()).filter(Boolean)

/** SQL conditions for the filters in `q`; values are appended to `params`. */
export function leadFilters(q, params) {
  const p = (v) => { params.push(v); return `$${params.length}` }
  const where = []
  if (q.responsibleId === 'none') where.push('l.responsible_id IS NULL')
  else if (q.responsibleId) where.push(`l.responsible_id = ${p(q.responsibleId)}`)
  if (q.source) where.push(`l.source = ${p(q.source)}`)
  if (q.tag) where.push(`l.tags @> ARRAY[${p(q.tag)}]`)
  const tags = list(q.tags)
  if (tags.length) where.push(`l.tags && ${p(tags)}::text[]`)
  if (q.status) {
    if (!['open', 'won', 'lost'].includes(q.status)) throw badRequest('status: open | won | lost')
    where.push(`EXISTS (SELECT 1 FROM crm_stages st WHERE st.id = l.stage_id AND st.kind = ${p(q.status)})`)
  }
  const stageIds = list(q.stageIds)
  if (stageIds.length) {
    if (!stageIds.every(isUuid)) throw badRequest('stageIds: неверный id')
    where.push(`l.stage_id = ANY(${p(stageIds)}::uuid[])`)
  }
  for (const [key, col, op] of [
    ['createdFrom', 'created_at', '>='], ['createdTo', 'created_at', '<'],
    ['closedFrom', 'closed_at', '>='], ['closedTo', 'closed_at', '<'],
  ]) {
    if (!q[key]) continue
    if (!DATE_RE.test(q[key])) throw badRequest(`${key}: YYYY-MM-DD`)
    // "to" is inclusive: everything before the start of the next day
    const day = op === '<' ? `(${p(q[key])}::date + 1)` : `${p(q[key])}::date`
    where.push(`l.${col} ${op} (${day}::timestamp AT TIME ZONE 'Asia/Tashkent')`)
  }
  if (q.tasks === 'none') {
    where.push('NOT EXISTS (SELECT 1 FROM crm_tasks t WHERE t.lead_id = l.id AND t.done_at IS NULL)')
  } else if (q.tasks === 'overdue') {
    where.push('EXISTS (SELECT 1 FROM crm_tasks t WHERE t.lead_id = l.id AND t.done_at IS NULL AND t.due_at < now())')
  } else if (q.tasks) {
    throw badRequest('tasks: none | overdue')
  }
  if (q.q) {
    const text = String(q.q).trim()
    const digits = text.replace(/\D/g, '')
    if (digits.length >= 5) {
      where.push(`EXISTS (SELECT 1 FROM unnest(c.phones) ph WHERE ph LIKE ${p(`%${digits}%`)})`)
    } else {
      const like = p(`%${text}%`)
      where.push(`(l.title ILIKE ${like} OR c.name ILIKE ${like})`)
    }
  }
  return where
}

const SORTS = {
  updated: 'l.updated_at', created: 'l.created_at', amount: 'l.amount', title: 'lower(l.title)',
  activity: 'l.last_activity_at', closed: 'l.closed_at', stage: 'l.stage_changed_at',
}

/** ORDER BY for ?sort=<key>&direction=asc|desc (default: last updated first). */
export function leadOrder(q) {
  const col = SORTS[q.sort] || SORTS.updated
  const dir = q.direction === 'asc' ? 'ASC' : 'DESC'
  return `${col} ${dir} NULLS LAST, l.id`
}

/**
 * WHERE clause for the leads of a school matching the request filters,
 * including the pipeline / stage / contact ids of the list endpoint.
 */
export function leadWhere(tenantId, q, params) {
  params.push(tenantId)
  const where = [`l.tenant_id = $${params.length}`, 'l.deleted_at IS NULL', ...leadFilters(q, params)]
  for (const [key, col] of [['pipelineId', 'pipeline_id'], ['stageId', 'stage_id'], ['contactId', 'contact_id']]) {
    if (!q[key]) continue
    if (!isUuid(q[key])) throw badRequest(`${key}: неверный id`)
    params.push(q[key])
    where.push(`l.${col} = $${params.length}`)
  }
  return where.join(' AND ')
}
