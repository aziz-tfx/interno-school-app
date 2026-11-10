// What the app needs to show "what's waiting for me" and the whole story of
// one client, without the browser loading the CRM to work it out.
//
//   GET /api/notifications
//       The CRM side of the notification centre (the bell): new leads nobody
//       answered yet, my overdue tasks, tasks other people gave me and — for
//       the school's admins — dialogs the AI agent handed to a human.
//       Everything is derived from current data, nothing is stored: an item
//       disappears by itself once it is dealt with (lead answered, task done).
//       Payments, signed contracts and attendance are added by the frontend
//       from the data it already has.
//
//   GET /api/crm/students/:studentId/history
//       The CRM history of a student for the client card: their contact(s),
//       deals and the timeline of calls, messages, notes and stage moves.
//       Contacts are matched by the link made at the sale (student_id) and by
//       phone, so a student whose deal was never linked still gets a history.

import { notFound } from '../lib/errors.js'
import { isAdmin, isStudent } from '../collections.js'
import { normalizePhone } from '../lib/phone.js'
import { CRM_ROLES, mapContact, mapLead, mapActivity } from '../crm/service.js'

// How far back "new" goes. Older things belong to reports, not to a bell.
const NEW_LEAD_DAYS = 7
const NEW_TASK_DAYS = 3
const HANDOFF_DAYS = 3
const PER_KIND = 30

export default async function workdayRoutes(app, { pool }) {
  const auth = { preHandler: [app.authenticate] }
  const T = (req) => req.user.tenantId
  const me = (req) => req.user.employeeId

  app.get('/api/notifications', auth, async (req) => {
    if (isStudent(req.user)) return { items: [] }
    const items = []
    const tenantId = T(req)

    if (CRM_ROLES.has(req.user.role)) {
      const [leads, overdue, assigned] = await Promise.all([
        // Came in and nobody has reacted: mine, or not assigned to anyone yet.
        // A deal I created myself is not news to me.
        pool.query(`
          SELECT l.id, l.title, l.source, l.created_at, l.responsible_id, c.name AS contact_name
            FROM crm_leads l
            JOIN crm_stages s ON s.id = l.stage_id
            LEFT JOIN crm_contacts c ON c.id = l.contact_id
           WHERE l.tenant_id = $1 AND l.deleted_at IS NULL AND s.kind = 'open'
             AND l.first_response_at IS NULL
             AND l.created_at > now() - make_interval(days => $3)
             AND l.created_by IS DISTINCT FROM $2
             AND (l.responsible_id = $2 OR l.responsible_id IS NULL)
           ORDER BY l.created_at DESC LIMIT ${PER_KIND}`, [tenantId, me(req), NEW_LEAD_DAYS]),
        pool.query(`
          SELECT t.id, t.text, t.due_at, t.lead_id, l.title AS lead_title
            FROM crm_tasks t LEFT JOIN crm_leads l ON l.id = t.lead_id
           WHERE t.tenant_id = $1 AND t.assignee_id = $2 AND t.done_at IS NULL AND t.due_at < now()
             AND (l.id IS NULL OR l.deleted_at IS NULL)
           ORDER BY t.due_at DESC LIMIT ${PER_KIND}`, [tenantId, me(req)]),
        pool.query(`
          SELECT t.id, t.text, t.due_at, t.created_at, t.created_by, t.lead_id, l.title AS lead_title
            FROM crm_tasks t LEFT JOIN crm_leads l ON l.id = t.lead_id
           WHERE t.tenant_id = $1 AND t.assignee_id = $2 AND t.done_at IS NULL AND t.due_at >= now()
             AND t.created_by IS NOT NULL AND t.created_by <> $2
             AND t.created_at > now() - make_interval(days => $3)
             AND (l.id IS NULL OR l.deleted_at IS NULL)
           ORDER BY t.created_at DESC LIMIT ${PER_KIND}`, [tenantId, me(req), NEW_TASK_DAYS]),
      ])
      for (const r of leads.rows) {
        items.push({
          id: `lead_new:${r.id}`, type: 'lead_new', at: r.created_at,
          leadId: r.id, title: r.contact_name || r.title || '', source: r.source,
          unassigned: !r.responsible_id,
        })
      }
      for (const r of overdue.rows) {
        items.push({
          id: `task_overdue:${r.id}`, type: 'task_overdue', at: r.due_at,
          taskId: r.id, leadId: r.lead_id, title: r.text, leadTitle: r.lead_title,
        })
      }
      for (const r of assigned.rows) {
        items.push({
          id: `task_new:${r.id}`, type: 'task_new', at: r.created_at,
          taskId: r.id, leadId: r.lead_id, title: r.text, leadTitle: r.lead_title,
          dueAt: r.due_at, authorId: r.created_by,
        })
      }
    }

    // The agent stopped answering and waits for a person. Only the fields the
    // bell shows are read — the document also holds the whole conversation.
    if (isAdmin(req.user)) {
      const since = new Date(Date.now() - HANDOFF_DAYS * 86400_000).toISOString()
      const { rows } = await pool.query(`
        SELECT id, data->>'handoffReason' AS reason, data->>'updatedAt' AS updated_at,
               data->>'contactName' AS contact_name, data->>'channel' AS channel
          FROM ai_agent_conversations
         WHERE tenant_id = $1 AND data->>'paused' = 'true' AND data->>'handoffReason' IS NOT NULL
           AND data->>'updatedAt' > $2
         ORDER BY data->>'updatedAt' DESC LIMIT ${PER_KIND}`, [tenantId, since])
      for (const r of rows) {
        items.push({
          id: `ai_handoff:${r.id}`, type: 'ai_handoff', at: r.updated_at,
          title: r.contact_name || '', reason: r.reason, channel: r.channel,
        })
      }
    }

    return { items }
  })

  app.get('/api/crm/students/:studentId/history', {
    preHandler: [app.authenticate, async (req) => {
      if (!CRM_ROLES.has(req.user.role)) throw notFound()
    }],
  }, async (req) => {
    const tenantId = T(req)
    const { rows: [student] } = await pool.query(
      'SELECT id, phone_digits FROM students WHERE id = $1 AND tenant_id = $2',
      [String(req.params.studentId), tenantId]
    )
    if (!student) throw notFound('Ученик не найден')

    // Too short to be a phone number → would match half the contacts
    const phone = student.phone_digits?.length >= 9 ? normalizePhone(student.phone_digits) : ''
    const { rows: contacts } = await pool.query(`
      SELECT * FROM crm_contacts
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND (student_id = $2 OR ($3 <> '' AND phones @> ARRAY[$3]::text[]))
       ORDER BY (student_id = $2) DESC NULLS LAST, created_at
       LIMIT 5`, [tenantId, student.id, phone])
    const contactIds = contacts.map(c => c.id)

    // Deals of those contacts, plus deals linked to the student directly
    const { rows: leads } = await pool.query(`
      SELECT l.*, s.name AS stage_name, s.kind AS stage_kind, s.color AS stage_color
        FROM crm_leads l JOIN crm_stages s ON s.id = l.stage_id
       WHERE l.tenant_id = $1 AND l.deleted_at IS NULL
         AND (l.student_id = $2 OR l.contact_id = ANY($3::uuid[]))
       ORDER BY l.created_at DESC LIMIT 50`, [tenantId, student.id, contactIds])
    const leadIds = leads.map(l => l.id)

    const limit = Math.min(Number(req.query.limit) || 200, 500)
    const { rows: activities } = (contactIds.length || leadIds.length)
      ? await pool.query(`
          SELECT a.*, l.title AS lead_title
            FROM crm_activities a LEFT JOIN crm_leads l ON l.id = a.lead_id
           WHERE a.tenant_id = $1 AND (a.contact_id = ANY($2::uuid[]) OR a.lead_id = ANY($3::uuid[]))
           ORDER BY a.created_at DESC LIMIT ${limit}`, [tenantId, contactIds, leadIds])
      : { rows: [] }

    return {
      contacts: contacts.map(mapContact),
      leads: leads.map(l => ({
        ...mapLead(l), stage: { name: l.stage_name, kind: l.stage_kind, color: l.stage_color },
      })),
      activities: activities.map(a => ({ ...mapActivity(a), leadTitle: a.lead_title })),
    }
  })
}
