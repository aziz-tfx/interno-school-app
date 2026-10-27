// CRM contacts: the people behind deals.
//
//   GET    /api/crm/contacts?q=&responsibleId=&student=yes|no&sort=&direction=&limit=&offset=
//   GET    /api/crm/contacts/duplicates          contacts sharing a phone number
//   GET    /api/crm/contacts/:id                 contact + their deals
//   GET    /api/crm/contacts/:id/activities      timeline of the contact and all their deals
//   POST   /api/crm/contacts                     409 + the existing one if the phone is known
//   PATCH  /api/crm/contacts/:id                 incl. custom field values ({ fields })
//   POST   /api/crm/contacts/:id/merge { ids }   fold other contacts into this one
//   DELETE /api/crm/contacts/:id                 managers; only a contact without deals

import { tx } from '../../db.js'
import { forbidden, notFound, badRequest } from '../../lib/errors.js'
import { normalizePhone, normalizePhones } from '../../lib/phone.js'
import {
  CRM_ROLES, CRM_MANAGER_ROLES, assertRefs, mapContact, mapLead, mapActivity, createContact,
  findContactByPhone, cleanFieldValues,
} from '../../crm/service.js'
import { isUuid } from '../../crm/leadQuery.js'

const SORTS = { name: 'lower(c.name)', created: 'c.created_at', updated: 'c.updated_at', activity: 'last_activity_at' }

export default async function crmContactRoutes(app, { pool }) {
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
  const uuidParam = (req) => {
    if (!isUuid(req.params.id)) throw notFound()
    return req.params.id
  }
  async function contactRow(db, tenantId, id, { forUpdate = false } = {}) {
    const { rows: [c] } = await db.query(
      `SELECT * FROM crm_contacts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL ${forUpdate ? 'FOR UPDATE' : ''}`,
      [id, tenantId]
    )
    if (!c) throw notFound('Контакт не найден')
    return c
  }

  app.get('/api/crm/contacts', crm, async (req) => {
    const params = [T(req)]
    const p = (v) => { params.push(v); return `$${params.length}` }
    const where = ['c.tenant_id = $1', 'c.deleted_at IS NULL']
    const text = String(req.query.q || '').trim()
    if (text) {
      const digits = text.replace(/\D/g, '')
      if (digits.length >= 5) where.push(`EXISTS (SELECT 1 FROM unnest(c.phones) ph WHERE ph LIKE ${p(`%${digits}%`)})`)
      else {
        const like = p(`%${text}%`)
        where.push(`(c.name ILIKE ${like} OR c.email ILIKE ${like} OR c.instagram ILIKE ${like} OR c.telegram_username ILIKE ${like})`)
      }
    }
    if (req.query.responsibleId === 'none') where.push('c.responsible_id IS NULL')
    else if (req.query.responsibleId) where.push(`c.responsible_id = ${p(req.query.responsibleId)}`)
    if (req.query.student === 'yes') where.push('c.student_id IS NOT NULL')
    else if (req.query.student === 'no') where.push('c.student_id IS NULL')
    const order = `${SORTS[req.query.sort] || SORTS.updated} ${req.query.direction === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, c.id`
    const limit = Math.min(Number(req.query.limit) || 50, 500)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const { rows } = await pool.query(`
      SELECT c.*, count(*) OVER () AS total, d.leads_count, d.open_leads, d.last_activity_at
        FROM crm_contacts c
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS leads_count,
                 count(*) FILTER (WHERE s.kind = 'open')::int AS open_leads,
                 max(l.last_activity_at) AS last_activity_at
            FROM crm_leads l JOIN crm_stages s ON s.id = l.stage_id
           WHERE l.contact_id = c.id AND l.deleted_at IS NULL
        ) d ON true
       WHERE ${where.join(' AND ')}
       ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, params)
    return {
      total: Number(rows[0]?.total || 0),
      items: rows.map(r => ({ ...mapContact(r), leadsCount: r.leads_count, openLeads: r.open_leads, lastActivityAt: r.last_activity_at })),
    }
  })

  // Groups of contacts that share a phone — usually one person entered twice
  // (or imported from amo twice).
  app.get('/api/crm/contacts/duplicates', crm, async (req) => {
    const { rows } = await pool.query(`
      SELECT ph AS phone, json_agg(json_build_object(
               'id', c.id, 'name', c.name, 'phones', c.phones, 'createdAt', c.created_at,
               'studentId', c.student_id,
               'leadsCount', (SELECT count(*) FROM crm_leads l WHERE l.contact_id = c.id AND l.deleted_at IS NULL))
             ORDER BY c.created_at) AS contacts
        FROM crm_contacts c, unnest(c.phones) ph
       WHERE c.tenant_id = $1 AND c.deleted_at IS NULL
       GROUP BY ph HAVING count(*) > 1
       ORDER BY max(c.updated_at) DESC
       LIMIT 200`, [T(req)])
    return rows
  })

  app.get('/api/crm/contacts/:id', crm, async (req) => {
    const c = await contactRow(pool, T(req), uuidParam(req))
    const { rows: leads } = await pool.query(
      'SELECT * FROM crm_leads WHERE contact_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC', [c.id]
    )
    return { ...mapContact(c), leads: leads.map(mapLead) }
  })

  app.get('/api/crm/contacts/:id/activities', crm, async (req) => {
    const c = await contactRow(pool, T(req), uuidParam(req))
    const limit = Math.min(Number(req.query.limit) || 100, 500)
    const { rows } = await pool.query(`
      SELECT a.*, l.title AS lead_title FROM crm_activities a LEFT JOIN crm_leads l ON l.id = a.lead_id
       WHERE a.tenant_id = $2 AND (a.contact_id = $1 OR a.lead_id IN (SELECT id FROM crm_leads WHERE contact_id = $1))
       ORDER BY a.created_at DESC LIMIT ${limit}`, [c.id, T(req)])
    return rows.map(r => ({ ...mapActivity(r), leadTitle: r.lead_title }))
  })

  app.post('/api/crm/contacts', crm, async (req, reply) => {
    const input = req.body || {}
    for (const phone of [input.phone, ...(input.phones || [])].filter(Boolean)) {
      const dup = await findContactByPhone(pool, T(req), phone)
      if (dup) return reply.code(409).send({ error: 'Контакт с таким телефоном уже есть', existing: mapContact(dup) })
    }
    const custom = {}
    if (input.fields) custom.fields = Object.fromEntries(Object.entries(await cleanFieldValues(pool, T(req), 'contact', input.fields)).filter(([, v]) => v !== null))
    const c = await createContact(pool, T(req), { ...input, custom }, me(req))
    return reply.code(201).send(mapContact(c))
  })

  app.patch('/api/crm/contacts/:id', crm, async (req, reply) => {
    const id = uuidParam(req)
    const b = req.body || {}
    await assertRefs(pool, T(req), { studentId: b.studentId, responsibleId: b.responsibleId })
    const phones = b.phones ? [...new Set(b.phones.map(normalizePhone).filter(Boolean))] : null
    if (phones) {
      const { rows: [dup] } = await pool.query(
        `SELECT * FROM crm_contacts WHERE tenant_id = $1 AND deleted_at IS NULL AND id <> $2 AND phones && $3 LIMIT 1`,
        [T(req), id, phones]
      )
      if (dup) return reply.code(409).send({ error: 'Этот телефон уже у другого контакта — объедините их', existing: mapContact(dup) })
    }
    const fields = b.fields !== undefined ? await cleanFieldValues(pool, T(req), 'contact', b.fields) : null
    const { rows: [c] } = await pool.query(
      `UPDATE crm_contacts SET
         name = coalesce($3, name), phones = coalesce($4, phones), email = coalesce($5, email),
         instagram = coalesce($6, instagram), telegram_username = coalesce($7, telegram_username),
         student_id = coalesce($8, student_id), responsible_id = coalesce($9, responsible_id),
         custom = CASE WHEN $10::jsonb IS NULL THEN custom
                       ELSE jsonb_set(custom, '{fields}', jsonb_strip_nulls(coalesce(custom->'fields', '{}'::jsonb) || $10::jsonb)) END
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL RETURNING *`,
      [id, T(req), b.name ?? null, phones, b.email ?? null, b.instagram ?? null, b.telegramUsername ?? null,
       b.studentId ?? null, b.responsibleId ?? null, fields]
    )
    if (!c) throw notFound('Контакт не найден')
    return mapContact(c)
  })

  // Everything of the other contacts moves here: deals, timeline, tasks,
  // files; phones are combined and empty details filled in. The others are
  // soft-deleted (still in the database).
  app.post('/api/crm/contacts/:id/merge', {
    ...crm,
    schema: { body: { type: 'object', required: ['ids'], properties: { ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 } } } },
  }, async (req) => {
    const id = uuidParam(req)
    const ids = [...new Set(req.body.ids)].filter(x => x !== id)
    if (!ids.length || !ids.every(isUuid)) throw badRequest('ids: неверный id')
    const merged = await tx(pool, async (db) => {
      const target = await contactRow(db, T(req), id, { forUpdate: true })
      const { rows: sources } = await db.query(
        'SELECT * FROM crm_contacts WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND deleted_at IS NULL FOR UPDATE',
        [ids, T(req)]
      )
      if (sources.length !== ids.length) throw notFound('Контакт не найден')
      for (const table of ['crm_leads', 'crm_activities', 'crm_tasks', 'crm_files']) {
        await db.query(`UPDATE ${table} SET contact_id = $1 WHERE contact_id = ANY($2::uuid[])`, [id, ids])
      }
      // free the unique telegram/instagram ids before the target takes them
      await db.query('UPDATE crm_contacts SET deleted_at = now() WHERE id = ANY($1::uuid[])', [ids])
      const pick = (key) => target[key] || sources.find(s => s[key])?.[key] || null
      const fields = Object.assign({}, ...sources.map(s => s.custom?.fields || {}), target.custom?.fields || {})
      const { rows: [c] } = await db.query(
        `UPDATE crm_contacts SET name = $2, phones = $3, email = $4, instagram = $5, telegram_id = $6,
           telegram_username = $7, student_id = $8, responsible_id = $9,
           custom = jsonb_set(custom, '{fields}', $10::jsonb)
         WHERE id = $1 RETURNING *`,
        [id, target.name || sources.find(s => s.name)?.name || '',
         normalizePhones([...target.phones, ...sources.flatMap(s => s.phones)]),
         pick('email'), pick('instagram'), pick('telegram_id'), pick('telegram_username'), pick('student_id'),
         pick('responsible_id'), fields]
      )
      await db.query(
        `INSERT INTO crm_activities (tenant_id, contact_id, type, author_id, body, meta)
         VALUES ($1, $2, 'system', $3, $4, $5)`,
        [T(req), id, me(req), `Объединены контакты: ${sources.map(s => s.name || s.phones[0] || '—').join(', ')}`, { mergedIds: ids }]
      )
      return c
    })
    return mapContact(merged)
  })

  app.delete('/api/crm/contacts/:id', manager, async (req, reply) => {
    const c = await contactRow(pool, T(req), uuidParam(req))
    const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM crm_leads WHERE contact_id = $1 AND deleted_at IS NULL', [c.id])
    if (n) return reply.code(409).send({ error: `У контакта ${n} сделок — сначала удалите или перенесите их` })
    await pool.query('UPDATE crm_contacts SET deleted_at = now() WHERE id = $1', [c.id])
    return { ok: true }
  })
}
