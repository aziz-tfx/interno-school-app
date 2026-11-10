// The student's own corner of the API.
//
//   GET /api/student/notify            which Telegram study notices are on,
//   PUT /api/student/notify  { kind: bool, … }   and switching them
//       (students can't write their student record through /api/collections;
//       this touches only students.data.studyNotify of the caller)
//
//   GET /api/public/portfolio/:token   the public portfolio page — no login.
//       Shows only what the student chose to publish: their name, course and
//       the checked works they picked. Everything is read from the school's
//       data at request time, so hiding a work or unpublishing takes effect
//       at once and nothing private (phone, payments, other works) leaves.

import { forbidden, notFound, badRequest } from '../lib/errors.js'
import { isStudent } from '../collections.js'
import { NOTICE_KINDS } from '../studyNotices.js'

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/

export default async function studentRoutes(app, { pool }) {
  const student = {
    preHandler: [app.authenticate, async (req) => {
      if (!isStudent(req.user) || !req.user.studentId) throw forbidden()
    }],
  }
  const prefs = (data) => {
    const saved = data?.studyNotify || {}
    return {
      linked: Boolean(data?.telegramChatId),
      kinds: Object.fromEntries(NOTICE_KINDS.map(k => [k, saved[k] !== false])),
    }
  }

  app.get('/api/student/notify', student, async (req) => {
    const { rows: [row] } = await pool.query(
      'SELECT data FROM students WHERE id = $1 AND tenant_id = $2', [String(req.user.studentId), req.user.tenantId])
    if (!row) throw notFound('Ученик не найден')
    return prefs(row.data)
  })

  app.put('/api/student/notify', student, async (req) => {
    const body = req.body || {}
    const patch = {}
    for (const kind of NOTICE_KINDS) {
      if (body[kind] === undefined) continue
      if (typeof body[kind] !== 'boolean') throw badRequest(`${kind}: true | false`)
      patch[kind] = body[kind]
    }
    const { rows: [row] } = await pool.query(
      `UPDATE students SET data = jsonb_set(data, '{studyNotify}', coalesce(data->'studyNotify', '{}'::jsonb) || $3::jsonb)
        WHERE id = $1 AND tenant_id = $2 RETURNING data`,
      [String(req.user.studentId), req.user.tenantId, patch])
    if (!row) throw notFound('Ученик не найден')
    return prefs(row.data)
  })

  app.get('/api/public/portfolio/:token', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (req) => {
    const token = String(req.params.token || '')
    if (!TOKEN_RE.test(token)) throw notFound('Портфолио не найдено')
    const { rows: [p] } = await pool.query(
      `SELECT id, tenant_id, data FROM portfolios WHERE data->>'token' = $1 AND data->>'published' = 'true'`, [token])
    if (!p) throw notFound('Портфолио не найдено')
    const tenantId = p.tenant_id
    const { rows: [st] } = await pool.query('SELECT data FROM students WHERE id = $1 AND tenant_id = $2', [p.id, tenantId])
    if (!st) throw notFound('Портфолио не найдено')

    const picked = (Array.isArray(p.data.items) ? p.data.items : []).filter(i => i && i.submissionId && !i.hidden).slice(0, 100)
    const { rows: subs } = picked.length
      ? await pool.query(
        // only this student's works, and only checked ones — whatever ids the document lists
        `SELECT s.id, s.data, a.data AS assignment
           FROM lms_submissions s LEFT JOIN lms_assignments a ON a.id = s.data->>'assignmentId' AND a.tenant_id = s.tenant_id
          WHERE s.tenant_id = $1 AND s.student_id = $2 AND s.id = ANY($3) AND s.data->>'status' = 'reviewed'`,
        [tenantId, p.id, picked.map(i => String(i.submissionId))])
      : { rows: [] }
    const byId = new Map(subs.map(r => [r.id, r]))
    const { rows: [tenant] } = await pool.query('SELECT data FROM tenants WHERE id = $1', [tenantId])

    return {
      school: tenant?.data?.name || '',
      student: { name: st.data.name || '', course: st.data.course || '' },
      title: String(p.data.title || '').slice(0, 200),
      about: String(p.data.about || '').slice(0, 2000),
      updatedAt: p.data.updatedAt || null,
      items: picked.map(i => {
        const r = byId.get(String(i.submissionId))
        if (!r) return null
        const hasGrade = r.data.grade !== undefined && r.data.grade !== null && r.data.grade !== ''
        return {
          id: r.id,
          title: r.assignment?.title || '',
          task: r.assignment?.description || '',
          answer: r.data.answer || '',
          caption: String(i.caption || '').slice(0, 500),
          // the grade and the teacher's words are shown only if the student chose so
          ...(p.data.showGrades !== false && hasGrade && { grade: r.data.grade, maxScore: r.assignment?.maxScore || null }),
          ...(p.data.showFeedback && r.data.feedback && { feedback: r.data.feedback, teacher: r.data.gradedBy || '' }),
          date: r.data.gradedAt || r.data.updatedAt || r.data.createdAt || null,
        }
      }).filter(Boolean),
    }
  })
}
