// CRM: list-view tools, the school's own fields, and files on deals.
//
//   GET    /api/crm/leads/ids?<filters>          ids of every matching deal (≤ 5000) — "select all"
//   POST   /api/crm/leads/bulk                   { ids, action, value } on many deals at once
//   GET    /api/crm/leads/export?<filters>       CSV for Excel (managers)
//   GET    /api/crm/tags                         tags in use, most used first
//   GET    /api/crm/fields                       custom fields of deals and contacts
//   POST   /api/crm/fields, PATCH/DELETE /api/crm/fields/:id   (managers)
//   GET    /api/crm/leads/:id/files, POST /api/crm/leads/:id/files?name=&type=  (raw body)
//   GET    /api/crm/files/:id                    download
//   DELETE /api/crm/files/:id                    uploader or a manager
//
// Filters: see crm/leadQuery.js.

import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tx } from '../../db.js'
import { forbidden, notFound, badRequest } from '../../lib/errors.js'
import {
  CRM_ROLES, CRM_MANAGER_ROLES, FIELD_TYPES, mapField, getLeadRow, updateLead, softDeleteLead,
  createTask, addActivity,
} from '../../crm/service.js'
import { isUuid, leadWhere, leadOrder } from '../../crm/leadQuery.js'

const MAX_BULK = 5000
const MAX_FILE = 25 * 1024 * 1024
const BULK_ACTIONS = ['stage', 'responsible', 'addTags', 'removeTags', 'task', 'delete']

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v)
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const tashkent = (d) => d ? new Date(new Date(d).getTime() + 5 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') : ''

export default async function crmExtraRoutes(app, { pool, config }) {
  const crm = {
    preHandler: [app.authenticate, async (req) => {
      if (!CRM_ROLES.has(req.user.role)) throw forbidden('Нет доступа к CRM')
    }],
  }
  const manager = {
    preHandler: [app.authenticate, async (req) => {
      if (!CRM_MANAGER_ROLES.has(req.user.role)) throw forbidden('Это может руководитель')
    }],
  }
  const T = (req) => req.user.tenantId
  const me = (req) => req.user.employeeId
  const isManager = (req) => CRM_MANAGER_ROLES.has(req.user.role)
  const uuidParam = (req) => {
    if (!isUuid(req.params.id)) throw notFound()
    return req.params.id
  }

  // ─── Select all / bulk ─────────────────────────────────────────────────

  app.get('/api/crm/leads/ids', crm, async (req) => {
    const params = []
    const { rows } = await pool.query(
      `SELECT l.id FROM crm_leads l LEFT JOIN crm_contacts c ON c.id = l.contact_id
        WHERE ${leadWhere(T(req), req.query, params)} ORDER BY ${leadOrder(req.query)} LIMIT ${MAX_BULK + 1}`, params)
    if (rows.length > MAX_BULK) throw badRequest(`Больше ${MAX_BULK} сделок — сузьте фильтр`)
    return rows.map(r => r.id)
  })

  app.post('/api/crm/leads/bulk', {
    ...crm,
    schema: {
      body: {
        type: 'object',
        required: ['ids', 'action'],
        properties: {
          ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: MAX_BULK },
          action: { type: 'string', enum: BULK_ACTIONS },
          value: {},
          lossReason: { type: ['string', 'null'], maxLength: 500 },
        },
      },
    },
  }, async (req) => {
    const { ids, action, value, lossReason } = req.body
    if (!ids.every(isUuid)) throw badRequest('ids: неверный id')
    if (action === 'delete' && !isManager(req)) throw forbidden('Удалять сделки может руководитель')
    const tags = (Array.isArray(value) ? value : [value]).map(t => String(t || '').trim()).filter(Boolean)
    if ((action === 'addTags' || action === 'removeTags') && !tags.length) throw badRequest('Укажите теги')
    if (action === 'stage' && !isUuid(value)) throw badRequest('Укажите этап')
    if (action === 'task' && (!value?.text || !value?.dueAt)) throw badRequest('Укажите текст и срок задачи')

    const done = await tx(pool, async (c) => {
      const { rows } = await c.query(
        'SELECT id, tags, stage_id FROM crm_leads WHERE tenant_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])',
        [T(req), ids]
      )
      for (const lead of rows) {
        if (action === 'stage') {
          await updateLead(c, T(req), lead.id, { stageId: value, ...(lossReason ? { lossReason } : {}) }, me(req))
        } else if (action === 'responsible') {
          await updateLead(c, T(req), lead.id, { responsibleId: value || null }, me(req))
        } else if (action === 'addTags') {
          await updateLead(c, T(req), lead.id, { tags: [...new Set([...lead.tags, ...tags])] }, me(req))
        } else if (action === 'removeTags') {
          await updateLead(c, T(req), lead.id, { tags: lead.tags.filter(t => !tags.includes(t)) }, me(req))
        } else if (action === 'task') {
          await createTask(c, T(req), { leadId: lead.id, text: value.text, dueAt: value.dueAt, assigneeId: value.assigneeId }, me(req))
        } else if (action === 'delete') {
          await softDeleteLead(c, T(req), lead.id)
        }
      }
      return rows.length
    })
    return { ok: true, updated: done }
  })

  // ─── Export ────────────────────────────────────────────────────────────

  app.get('/api/crm/leads/export', manager, async (req, reply) => {
    const params = []
    const where = leadWhere(T(req), req.query, params)
    const [{ rows }, { rows: fields }] = await Promise.all([
      pool.query(`
        SELECT l.*, c.name AS contact_name, c.phones AS contact_phones, c.email AS contact_email,
               s.name AS stage_name, p.name AS pipeline_name, e.data->>'name' AS responsible_name
          FROM crm_leads l
          LEFT JOIN crm_contacts c ON c.id = l.contact_id
          JOIN crm_stages s ON s.id = l.stage_id
          JOIN crm_pipelines p ON p.id = l.pipeline_id
          LEFT JOIN employees e ON e.id = l.responsible_id
         WHERE ${where} ORDER BY ${leadOrder(req.query)} LIMIT 20000`, params),
      pool.query(`SELECT * FROM crm_fields WHERE tenant_id = $1 AND entity = 'lead' ORDER BY sort, created_at`, [T(req)]),
    ])
    const header = ['Название', 'Контакт', 'Телефон', 'Email', 'Воронка', 'Этап', 'Ответственный', 'Источник',
      'Сумма', 'Теги', 'Создана', 'Закрыта', 'Причина отказа', ...fields.map(f => f.label)]
    const lines = rows.map(r => [
      r.title, r.contact_name, (r.contact_phones || []).map(p => `+${p}`), r.contact_email, r.pipeline_name, r.stage_name,
      r.responsible_name || r.custom?.amoResponsible || '', r.source, Number(r.amount) || 0, r.tags,
      tashkent(r.created_at), tashkent(r.closed_at), r.loss_reason,
      ...fields.map(f => r.custom?.fields?.[f.key] ?? ''),
    ].map(csvCell).join(';'))
    // BOM + ";" — what Excel with Russian regional settings expects
    const csv = '﻿' + [header.map(csvCell).join(';'), ...lines].join('\r\n')
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="crm-${new Date().toISOString().slice(0, 10)}.csv"`)
      .send(csv)
  })

  // ─── Tags ──────────────────────────────────────────────────────────────

  app.get('/api/crm/tags', crm, async (req) => {
    const { rows } = await pool.query(
      `SELECT t AS name, count(*)::int AS count FROM crm_leads, unnest(tags) t
        WHERE tenant_id = $1 AND deleted_at IS NULL GROUP BY t ORDER BY count(*) DESC, t LIMIT 500`, [T(req)]
    )
    return rows
  })

  // ─── Custom fields ─────────────────────────────────────────────────────

  const fieldSchema = (required = []) => ({
    body: {
      type: 'object',
      required,
      properties: {
        entity: { type: 'string', enum: ['lead', 'contact'] },
        label: { type: 'string', minLength: 1, maxLength: 100 },
        type: { type: 'string', enum: FIELD_TYPES },
        options: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 200 },
        sort: { type: 'integer' },
      },
    },
  })

  app.get('/api/crm/fields', crm, async (req) => {
    const { rows } = await pool.query('SELECT * FROM crm_fields WHERE tenant_id = $1 ORDER BY entity, sort, created_at', [T(req)])
    return rows.map(mapField)
  })

  app.post('/api/crm/fields', { ...manager, schema: fieldSchema(['entity', 'label', 'type']) }, async (req, reply) => {
    const { entity, label, type, options = [] } = req.body
    // Stable key, independent of the label (labels get renamed)
    const key = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
    const { rows: [f] } = await pool.query(
      `INSERT INTO crm_fields (tenant_id, entity, key, label, type, options, sort)
       VALUES ($1, $2, $3, $4, $5, $6, (SELECT coalesce(max(sort) + 1, 0) FROM crm_fields WHERE tenant_id = $1 AND entity = $2))
       RETURNING *`,
      [T(req), entity, key, label.trim(), type, [...new Set(options.map(o => o.trim()).filter(Boolean))]]
    )
    return reply.code(201).send(mapField(f))
  })

  app.patch('/api/crm/fields/:id', { ...manager, schema: fieldSchema() }, async (req) => {
    const { label, options, sort } = req.body || {}
    const { rows: [f] } = await pool.query(
      `UPDATE crm_fields SET label = coalesce($3, label), options = coalesce($4, options), sort = coalesce($5, sort)
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [uuidParam(req), T(req), label?.trim() || null,
       options ? [...new Set(options.map(o => o.trim()).filter(Boolean))] : null, sort ?? null]
    )
    if (!f) throw notFound('Поле не найдено')
    return mapField(f)
  })

  // Values stay in the deals (custom.fields) — re-creating a field doesn't bring them back, but nothing is lost.
  app.delete('/api/crm/fields/:id', manager, async (req) => {
    const { rowCount } = await pool.query('DELETE FROM crm_fields WHERE id = $1 AND tenant_id = $2', [uuidParam(req), T(req)])
    if (!rowCount) throw notFound('Поле не найдено')
    return { ok: true }
  })

  // ─── Files ─────────────────────────────────────────────────────────────

  // The browser sends the file itself as the body (no multipart): name and
  // type travel in the query string.
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: MAX_FILE }, (req, body, done) => done(null, body))
  const filePath = (tenantId, id) => join(config.filesDir, tenantId, id)
  const mapFile = (r) => ({
    id: r.id, leadId: r.lead_id, name: r.name, mime: r.mime, size: Number(r.size),
    uploadedBy: r.uploaded_by, createdAt: r.created_at,
  })

  app.get('/api/crm/leads/:id/files', crm, async (req) => {
    const lead = await getLeadRow(pool, T(req), uuidParam(req))
    const { rows } = await pool.query('SELECT * FROM crm_files WHERE lead_id = $1 ORDER BY created_at DESC', [lead.id])
    return rows.map(mapFile)
  })

  app.post('/api/crm/leads/:id/files', { ...crm, bodyLimit: MAX_FILE }, async (req, reply) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Пустой файл')
    const name = String(req.query.name || 'файл').replace(/[\\/\0]/g, '_').slice(0, 200)
    const mime = String(req.query.type || '').slice(0, 100) || null
    const lead = await getLeadRow(pool, T(req), uuidParam(req))
    const row = await tx(pool, async (c) => {
      const { rows: [f] } = await c.query(
        `INSERT INTO crm_files (tenant_id, lead_id, contact_id, name, mime, size, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [T(req), lead.id, lead.contact_id, name, mime, req.body.length, me(req)]
      )
      await mkdir(join(config.filesDir, T(req)), { recursive: true })
      await writeFile(filePath(T(req), f.id), req.body)
      await addActivity(c, T(req), {
        leadId: lead.id, contactId: lead.contact_id, type: 'system', authorId: me(req),
        body: `Файл: ${name}`, meta: { fileId: f.id },
      })
      return f
    })
    return reply.code(201).send(mapFile(row))
  })

  async function fileRow(req) {
    const { rows: [f] } = await pool.query('SELECT * FROM crm_files WHERE id = $1 AND tenant_id = $2', [uuidParam(req), T(req)])
    if (!f) throw notFound('Файл не найден')
    return f
  }

  app.get('/api/crm/files/:id', crm, async (req, reply) => {
    const f = await fileRow(req)
    let data
    try { data = await readFile(filePath(T(req), f.id)) } catch { throw notFound('Файл не найден на диске') }
    return reply
      .header('Content-Type', f.mime || 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`)
      .header('Cache-Control', 'private, no-store')
      .send(data)
  })

  app.delete('/api/crm/files/:id', crm, async (req) => {
    const f = await fileRow(req)
    if (f.uploaded_by !== me(req) && !isManager(req)) throw forbidden('Удалить файл может тот, кто его загрузил, или руководитель')
    await pool.query('DELETE FROM crm_files WHERE id = $1', [f.id])
    await unlink(filePath(T(req), f.id)).catch(() => {})
    return { ok: true }
  })
}
