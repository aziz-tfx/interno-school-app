// CRM HTTP API (replaces amoCRM).
//
//   Pipelines   GET/POST /api/crm/pipelines, PATCH /api/crm/pipelines/:id,
//               POST /api/crm/pipelines/:id/stages, PATCH/DELETE /api/crm/stages/:id
//   Board       GET /api/crm/board?pipelineId=&responsibleId=&q=&perStage=
//   Leads       GET/POST /api/crm/leads, GET/PATCH/DELETE /api/crm/leads/:id
//   Timeline    GET /api/crm/leads/:id/activities, POST /api/crm/leads/:id/notes,
//               POST /api/crm/leads/:id/activities (calls / messages)
//   Contacts    see contacts.js
//   Tasks       GET/POST /api/crm/tasks, PATCH /api/crm/tasks/:id
//   Reports     GET /api/crm/analytics/funnel?pipelineId=&from=&to=
//   Public      POST /api/public/leads?tenantId=   (landing form, no login)

import { tx } from '../../db.js'
import { forbidden, notFound, badRequest } from '../../lib/errors.js'
import {
  CRM_ROLES, CRM_MANAGER_ROLES, listPipelines, createPipeline, addStage, mapStage,
  mapLead, mapContact, mapActivity, mapTask, getLeadRow, createLead, updateLead, softDeleteLead,
  addActivity, createTask, updateTask,
} from '../../crm/service.js'
import { funnelReport } from '../../crm/analytics.js'
import { isUuid, DATE_RE, leadFilters, leadWhere, leadOrder } from '../../crm/leadQuery.js'

// Body schemas: wrong types become a 400 with a message instead of a 500
// from Postgres. Unknown keys are ignored by the service layer.
const id = { type: ['string', 'null'], maxLength: 200 }
const LEAD_PROPS = {
  title: { type: 'string', maxLength: 500 },
  contactId: id, pipelineId: id, stageId: id, responsibleId: id, studentId: id, paymentId: id,
  source: { type: ['string', 'null'], maxLength: 100 },
  branchId: id, courseId: id,
  amount: { type: ['number', 'string'] },
  tags: { type: 'array', items: { type: 'string', maxLength: 100 }, maxItems: 50 },
  custom: { type: 'object' },
  fields: { type: 'object' },
  lossReason: { type: ['string', 'null'], maxLength: 500 },
  note: { type: ['string', 'null'], maxLength: 5000 },
}
const leadSchema = (required = []) => ({
  body: {
    type: 'object',
    required,
    properties: {
      ...LEAD_PROPS,
      contact: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 200 }, phone: { type: 'string', maxLength: 40 },
          phones: { type: 'array', items: { type: 'string' } }, email: { type: 'string' },
          instagram: { type: 'string' }, telegramId: { type: ['string', 'number'] }, telegramUsername: { type: 'string' },
        },
      },
    },
  },
})
const taskSchema = (required = []) => ({
  body: {
    type: 'object',
    required,
    properties: {
      leadId: id, contactId: id, assigneeId: id,
      text: { type: 'string', minLength: 1, maxLength: 2000 },
      dueAt: { type: 'string', maxLength: 40 },
      done: { type: 'boolean' },
      result: { type: ['string', 'null'], maxLength: 2000 },
    },
  },
})
export default async function crmRoutes(app, { pool }) {
  // Everyone in a sales-side role works in the CRM; teachers, accountants
  // and students don't see it.
  const crm = {
    preHandler: [app.authenticate, async (req) => {
      if (!CRM_ROLES.has(req.user.role)) throw forbidden('Нет доступа к CRM')
    }],
  }
  const manager = {
    preHandler: [app.authenticate, async (req) => {
      if (!CRM_MANAGER_ROLES.has(req.user.role)) throw forbidden('Настраивать CRM может руководитель')
    }],
  }
  const T = (req) => req.user.tenantId
  const me = (req) => req.user.employeeId
  const uuidParam = (req) => {
    if (!isUuid(req.params.id)) throw notFound()
    return req.params.id
  }

  // ─── Pipelines & stages ────────────────────────────────────────────────

  app.get('/api/crm/pipelines', crm, async (req) => {
    const pipes = await listPipelines(pool, T(req))
    if (pipes.length) return pipes
    // First visit of a new school: create the standard funnel.
    await tx(pool, c => createPipeline(c, T(req), { name: 'Продажи' }))
    return listPipelines(pool, T(req))
  })

  app.post('/api/crm/pipelines', manager, async (req, reply) => {
    const p = await tx(pool, c => createPipeline(c, T(req), req.body || {}))
    return reply.code(201).send((await listPipelines(pool, T(req))).find(x => x.id === p.id))
  })

  app.patch('/api/crm/pipelines/:id', manager, async (req) => {
    const id = uuidParam(req)
    const { name, sort, isDefault, archived } = req.body || {}
    await tx(pool, async (c) => {
      const { rows } = await c.query('SELECT 1 FROM crm_pipelines WHERE id = $1 AND tenant_id = $2', [id, T(req)])
      if (!rows[0]) throw notFound('Воронка не найдена')
      if (isDefault) await c.query('UPDATE crm_pipelines SET is_default = false WHERE tenant_id = $1', [T(req)])
      await c.query(
        `UPDATE crm_pipelines SET name = coalesce($2, name), sort = coalesce($3, sort),
           is_default = coalesce($4, is_default), archived = coalesce($5, archived) WHERE id = $1`,
        [id, name ?? null, sort ?? null, isDefault ?? null, archived ?? null]
      )
    })
    return (await listPipelines(pool, T(req))).find(x => x.id === id) || { id, archived: true }
  })

  app.post('/api/crm/pipelines/:id/stages', manager, async (req, reply) => {
    const stage = await addStage(pool, T(req), uuidParam(req), req.body || {})
    return reply.code(201).send(stage)
  })

  app.patch('/api/crm/stages/:id', manager, async (req) => {
    const { name, color, sort, kind, isInbox } = req.body || {}
    if (kind && !['open', 'won', 'lost'].includes(kind)) throw badRequest('kind: open | won | lost')
    const { rows: [s] } = await pool.query(
      `UPDATE crm_stages SET name = coalesce($3, name), color = coalesce($4, color), sort = coalesce($5, sort),
         kind = coalesce($6, kind), is_inbox = coalesce($7, is_inbox)
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [uuidParam(req), T(req), name ?? null, color ?? null, sort ?? null, kind ?? null, isInbox ?? null]
    )
    if (!s) throw notFound('Этап не найден')
    return mapStage(s)
  })

  app.delete('/api/crm/stages/:id', manager, async (req, reply) => {
    const id = uuidParam(req)
    const { rows: [{ n }] } = await pool.query(
      'SELECT count(*)::int AS n FROM crm_leads WHERE stage_id = $1 AND tenant_id = $2', [id, T(req)]
    )
    if (n) return reply.code(409).send({ error: `На этапе ${n} сделок — сначала перенесите их` })
    await pool.query('DELETE FROM crm_stages WHERE id = $1 AND tenant_id = $2', [id, T(req)])
    return { ok: true }
  })

  // ─── Board (kanban) ────────────────────────────────────────────────────

  app.get('/api/crm/board', crm, async (req) => {
    const { pipelineId } = req.query
    if (!isUuid(pipelineId)) throw badRequest('Укажите pipelineId')
    const perStage = Math.min(Number(req.query.perStage) || 50, 200)
    const params = [T(req), pipelineId]
    const filters = leadFilters(req.query, params)
    const extra = filters.length ? `AND ${filters.join(' AND ')}` : ''
    const { rows } = await pool.query(`
      SELECT s.*, agg.count, agg.amount, coalesce(top.leads, '[]') AS leads
        FROM crm_stages s
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS count, coalesce(sum(l.amount), 0) AS amount
            FROM crm_leads l LEFT JOIN crm_contacts c ON c.id = l.contact_id
           WHERE l.stage_id = s.id AND l.deleted_at IS NULL ${extra}
        ) agg ON true
        LEFT JOIN LATERAL (
          SELECT json_agg(x) AS leads FROM (
            SELECT l.*, c.name AS contact_name, c.phones AS contact_phones
              FROM crm_leads l LEFT JOIN crm_contacts c ON c.id = l.contact_id
             WHERE l.stage_id = s.id AND l.deleted_at IS NULL ${extra}
             ORDER BY l.updated_at DESC LIMIT ${perStage}
          ) x
        ) top ON true
       WHERE s.tenant_id = $1 AND s.pipeline_id = $2
       ORDER BY s.sort`, params)
    return {
      pipelineId,
      stages: rows.map(r => ({ ...mapStage(r), count: r.count, amount: r.amount, leads: r.leads.map(mapLead) })),
    }
  })

  // ─── Leads ─────────────────────────────────────────────────────────────

  app.get('/api/crm/leads', crm, async (req) => {
    const params = []
    const where = leadWhere(T(req), req.query, params)
    const limit = Math.min(Number(req.query.limit) || 50, 500)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const { rows } = await pool.query(`
      SELECT l.*, c.name AS contact_name, c.phones AS contact_phones, count(*) OVER () AS total,
             (SELECT min(t.due_at) FROM crm_tasks t WHERE t.lead_id = l.id AND t.done_at IS NULL) AS next_task_at
        FROM crm_leads l LEFT JOIN crm_contacts c ON c.id = l.contact_id
       WHERE ${where}
       ORDER BY ${leadOrder(req.query)} LIMIT ${limit} OFFSET ${offset}`, params)
    return { total: Number(rows[0]?.total || 0), items: rows.map(mapLead) }
  })

  app.get('/api/crm/leads/:id', crm, async (req) => {
    const lead = await getLeadRow(pool, T(req), uuidParam(req))
    const [contact, tasks] = await Promise.all([
      lead.contact_id
        ? pool.query('SELECT * FROM crm_contacts WHERE id = $1', [lead.contact_id]).then(r => r.rows[0])
        : null,
      pool.query('SELECT * FROM crm_tasks WHERE lead_id = $1 ORDER BY done_at NULLS FIRST, due_at', [lead.id]).then(r => r.rows),
    ])
    return { ...mapLead(lead), contact: contact ? mapContact(contact) : null, tasks: tasks.map(mapTask) }
  })

  app.post('/api/crm/leads', { ...crm, schema: leadSchema() }, async (req, reply) => {
    const lead = await tx(pool, c => createLead(c, T(req), { source: 'manual', ...req.body }, me(req)))
    return reply.code(201).send(mapLead(lead))
  })

  app.patch('/api/crm/leads/:id', { ...crm, schema: leadSchema() }, async (req) => {
    return mapLead(await tx(pool, c => updateLead(c, T(req), uuidParam(req), req.body || {}, me(req))))
  })

  app.delete('/api/crm/leads/:id', manager, async (req) => {
    await softDeleteLead(pool, T(req), uuidParam(req))
    return { ok: true }
  })

  // ─── Timeline ──────────────────────────────────────────────────────────

  app.get('/api/crm/leads/:id/activities', crm, async (req) => {
    const lead = await getLeadRow(pool, T(req), uuidParam(req))
    const limit = Math.min(Number(req.query.limit) || 100, 500)
    const params = [lead.id]
    let before = ''
    if (req.query.before) {
      params.push(new Date(req.query.before))
      before = `AND created_at < $2`
    }
    const { rows } = await pool.query(
      `SELECT * FROM crm_activities WHERE lead_id = $1 ${before} ORDER BY created_at DESC LIMIT ${limit}`, params
    )
    return rows.map(mapActivity)
  })

  app.post('/api/crm/leads/:id/notes', crm, async (req, reply) => {
    const body = String(req.body?.body || '').trim()
    if (!body) throw badRequest('Пустое примечание')
    const lead = await getLeadRow(pool, T(req), uuidParam(req))
    const a = await tx(pool, c => addActivity(c, T(req), {
      leadId: lead.id, contactId: lead.contact_id, type: 'note', direction: 'out', authorId: me(req), body,
    }))
    return reply.code(201).send(mapActivity(a))
  })

  // Manual log of a call / message made outside the system ("позвонил с
  // личного"). Integrated channels will write these automatically.
  app.post('/api/crm/leads/:id/activities', crm, async (req, reply) => {
    const { type, direction = 'out', channel = null, body = null, meta = {} } = req.body || {}
    if (!['call', 'message'].includes(type)) throw badRequest('type: call | message')
    if (!['in', 'out'].includes(direction)) throw badRequest('direction: in | out')
    const lead = await getLeadRow(pool, T(req), uuidParam(req))
    const a = await tx(pool, c => addActivity(c, T(req), {
      leadId: lead.id, contactId: lead.contact_id, type, direction, channel, authorId: me(req), body, meta,
    }))
    return reply.code(201).send(mapActivity(a))
  })

  // Contacts: see contacts.js

  // ─── Tasks ─────────────────────────────────────────────────────────────

  // ?assigneeId=me (default) | <id> | all, &status=open (default) | overdue | done | any
  app.get('/api/crm/tasks', crm, async (req) => {
    const params = [T(req)]
    const where = ['t.tenant_id = $1']
    const assignee = req.query.assigneeId || 'me'
    if (assignee !== 'all') {
      params.push(assignee === 'me' ? me(req) : assignee)
      where.push(`t.assignee_id = $${params.length}`)
    }
    const status = req.query.status || 'open'
    if (status === 'open') where.push('t.done_at IS NULL')
    else if (status === 'overdue') where.push('t.done_at IS NULL AND t.due_at < now()')
    else if (status === 'done') where.push('t.done_at IS NOT NULL')
    if (req.query.leadId) {
      if (!isUuid(req.query.leadId)) throw badRequest('leadId: неверный id')
      params.push(req.query.leadId)
      where.push(`t.lead_id = $${params.length}`)
    }
    const { rows } = await pool.query(
      `SELECT t.*, l.title AS lead_title FROM crm_tasks t LEFT JOIN crm_leads l ON l.id = t.lead_id
        WHERE ${where.join(' AND ')} ORDER BY t.due_at LIMIT 500`, params
    )
    return rows.map(r => ({ ...mapTask(r), leadTitle: r.lead_title }))
  })

  app.post('/api/crm/tasks', { ...crm, schema: taskSchema(['text', 'dueAt']) }, async (req, reply) => {
    const t = await tx(pool, c => createTask(c, T(req), req.body || {}, me(req)))
    return reply.code(201).send(mapTask(t))
  })

  app.patch('/api/crm/tasks/:id', { ...crm, schema: taskSchema() }, async (req) => {
    return mapTask(await tx(pool, c => updateTask(c, T(req), uuidParam(req), req.body || {}, me(req))))
  })

  // ─── Reports ───────────────────────────────────────────────────────────

  app.get('/api/crm/analytics/funnel', crm, async (req) => {
    const { pipelineId, from, to } = req.query
    if (!isUuid(pipelineId)) throw badRequest('Укажите pipelineId')
    if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) throw badRequest('from/to: YYYY-MM-DD')
    return funnelReport(pool, T(req), { pipelineId, from, to })
  })

  // ─── Public: landing form ──────────────────────────────────────────────
  // Replaces CourseLanding → /api/amo/push-sale. No login, so: strict rate
  // limit, the school must exist, and a honeypot field for dumb bots.
  app.post('/api/public/leads', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['name', 'phone'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          phone: { type: 'string', minLength: 5, maxLength: 40 },
          courseId: { type: 'string', maxLength: 100 },
          branchId: { type: 'string', maxLength: 100 },
          comment: { type: 'string', maxLength: 2000 },
          utm: { type: 'object' },
          website: { type: 'string' }, // honeypot: humans never fill it
        },
      },
    },
  }, async (req, reply) => {
    const tenantId = String(req.query.tenantId || 'default')
    if (req.body.website) return reply.code(201).send({ ok: true })
    const { rows } = await pool.query('SELECT 1 FROM tenants WHERE id = $1', [tenantId])
    if (!rows[0]) throw notFound('Школа не найдена')
    const { name, phone, courseId, branchId, comment, utm } = req.body
    await tx(pool, c => createLead(c, tenantId, {
      source: 'landing', contact: { name, phone }, courseId, branchId,
      custom: utm ? { utm } : {}, note: comment || null,
    }))
    return reply.code(201).send({ ok: true })
  })
}
