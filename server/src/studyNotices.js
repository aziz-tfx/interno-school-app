// Telegram notices to students about their studies — next to the payment
// reminders of the daily automations, but about learning:
//
//   grade     the teacher checked a work                       (as it happens)
//   message   the teacher wrote in the chat and it isn't read  (as it happens)
//   deadline  homework is due tomorrow and nothing is handed in (from 10:00)
//   module    a new module opened this week, online students    (from 09:00)
//   streak    N days in a row and nothing done today            (from 19:00)
//
// A sweep runs every few minutes (see index.js). Everything is derived from
// current data; what was already sent is remembered in student_notices, whose
// row is the claim — so a notice goes out once, whatever the restarts.
//
// Who gets them: a student who linked the bot (students.telegramChatId), is
// studying (not frozen / archived, LMS open) and has not switched the kind
// off in the cabinet (students.studyNotify.<kind> === false). The school can
// switch all of it off on the Automations page (studyNotifications: false).
// Nothing is sent at night: 09:00–21:00 Tashkent; a grade put at 23:00
// arrives in the morning.

import { miniAppKeyboard } from './telegram.js'

const TZ_OFFSET_MS = 5 * 3600_000 // Asia/Tashkent, no DST
const HOUR_MS = 3600_000
const DAY_MS = 24 * HOUR_MS

export const NOTICE_KINDS = ['grade', 'message', 'deadline', 'module', 'streak']

// How far back an event still counts as news (also covers the night)
const GRADE_LOOKBACK_MS = 36 * HOUR_MS
const MESSAGE_LOOKBACK_MS = 24 * HOUR_MS
const QUIET_FROM = 21, QUIET_TO = 9
const DEADLINE_FROM = 10, STREAK_FROM = 19, STREAK_MIN = 3

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const cut = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10)

/** How many modules an online group has open at `now` — same rule as src/utils/lessonAccess.js. */
export function unlockedModuleCount(startDate, now) {
  if (!startDate) return 999
  const start = new Date(startDate)
  if (Number.isNaN(start.getTime())) return 999
  if (now < start) return 1
  // the first Monday after the start (a start on Monday → the next one), 00:01 Tashkent
  const local = new Date(start.getTime() + TZ_OFFSET_MS)
  const day = local.getUTCDay()
  const add = day === 1 ? 7 : day === 0 ? 1 : 8 - day
  let monday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + add, 0, 1) - TZ_OFFSET_MS
  let count = 1
  while (monday <= now.getTime()) { count++; monday += 7 * DAY_MS }
  return count
}

/**
 * One sweep over every school.
 * @param {import('pg').Pool} pool
 * @param {{ now?: Date, send: Function, loadTelegram: Function, dryRun?: boolean, tenantIds?: string[] }} deps
 */
export async function runStudyNotices(pool, { now = new Date(), send, loadTelegram, dryRun = false, tenantIds: only }) {
  const results = { grade: 0, message: 0, deadline: 0, module: 0, streak: 0, errors: [] }
  const local = new Date(now.getTime() + TZ_OFFSET_MS)
  const hour = local.getUTCHours()
  if (hour >= QUIET_FROM || hour < QUIET_TO) return { ...results, quiet: true }
  const tomorrow = isoDay(local.getTime() + DAY_MS)
  // streaks are counted in UTC days by the app (data/gamification.js)
  const utcToday = isoDay(now.getTime())
  const utcYesterday = isoDay(now.getTime() - DAY_MS)

  let tenantIds = only
  if (!tenantIds) {
    const { rows } = await pool.query(`SELECT id FROM tenants WHERE data->>'status' = 'active'`)
    tenantIds = rows.map(r => r.id)
    if (!tenantIds.includes('default')) tenantIds.push('default')
  }

  for (const tenantId of tenantIds) {
    try {
      const { rows: [settingsRow] } = await pool.query('SELECT data FROM automation_settings WHERE id = $1', [tenantId])
      if (settingsRow?.data?.studyNotifications === false) continue
      const tg = await loadTelegram(tenantId)
      if (!tg.botToken) continue

      // Only students who can be written to — usually a small part of the school
      const { rows: studentRows } = await pool.query(
        `SELECT id, data FROM students
          WHERE tenant_id = $1 AND data->>'telegramChatId' IS NOT NULL
            AND coalesce(data->>'status', 'active') NOT IN ('frozen', 'archived')
            AND data->>'lmsAccess' = 'true'`, [tenantId])
      if (!studentRows.length) continue
      const students = new Map(studentRows.map(r => [r.id, { ...r.data, id: r.id }]))
      const ids = [...students.keys()]
      const wants = (student, kind) => student.studyNotify?.[kind] !== false
      const button = miniAppKeyboard(tg.miniAppUrl, '📱 Открыть кабинет')

      /** Send once: the inserted row is the claim; a failed send gives it back. */
      const notify = async (student, kind, key, text) => {
        if (!wants(student, kind)) return false
        if (dryRun) { results[kind]++; return true }
        const { rowCount } = await pool.query(
          'INSERT INTO student_notices (tenant_id, student_id, key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [tenantId, student.id, key])
        if (!rowCount) return false
        const ok = await send(tg.botToken, student.telegramChatId, text, button)
        if (ok) results[kind]++
        else await pool.query('DELETE FROM student_notices WHERE tenant_id = $1 AND student_id = $2 AND key = $3', [tenantId, student.id, key])
        return ok
      }

      const { rows: assignmentRows } = await pool.query('SELECT id, data FROM lms_assignments WHERE tenant_id = $1', [tenantId])
      const assignments = new Map(assignmentRows.map(r => [r.id, { ...r.data, id: r.id }]))

      // ─── grade: a work was checked ──────────────────────────────────
      const { rows: graded } = await pool.query(
        `SELECT id, data FROM lms_submissions
          WHERE tenant_id = $1 AND student_id = ANY($2) AND data->>'status' = 'reviewed'
            AND data->>'gradedAt' > $3`,
        [tenantId, ids, new Date(now.getTime() - GRADE_LOOKBACK_MS).toISOString()])
      for (const { id, data: s } of graded) {
        const student = students.get(String(s.studentId))
        if (!student) continue
        const a = assignments.get(s.assignmentId)
        const hasGrade = s.grade !== undefined && s.grade !== null && s.grade !== ''
        await notify(student, 'grade', `grade:${id}:${s.gradedAt}`,
          `✅ <b>Работа проверена</b> · Ish tekshirildi\n\n`
          + (a?.title ? `📝 ${esc(a.title)}\n` : '')
          + (hasGrade ? `⭐ Оценка: <b>${esc(s.grade)}${a?.maxScore ? `/${esc(a.maxScore)}` : ''}</b>\n` : '')
          + (s.feedback ? `\n💬 ${esc(cut(s.feedback, 400))}\n` : ''))
      }

      // ─── message: the teacher wrote and it is still unread ──────────
      const { rows: unread } = await pool.query(
        `SELECT id, data FROM messages
          WHERE tenant_id = $1 AND student_id = ANY($2) AND data->>'senderRole' = 'teacher'
            AND data->>'createdAt' > $3
          ORDER BY data->>'createdAt'`,
        [tenantId, ids, new Date(now.getTime() - MESSAGE_LOOKBACK_MS).toISOString()])
      const byStudent = new Map()
      for (const { id, data: m } of unread) {
        const sid = String(m.studentId)
        if ((m.readBy || []).map(String).includes(sid)) continue
        if (!byStudent.has(sid)) byStudent.set(sid, [])
        byStudent.get(sid).push({ ...m, id })
      }
      for (const [sid, list] of byStudent) {
        const student = students.get(sid)
        if (!student || !wants(student, 'message')) continue
        // several messages in a row → one notice (the newest text); the older ones are marked as covered
        const { rows: known } = await pool.query(
          'SELECT key FROM student_notices WHERE tenant_id = $1 AND student_id = $2 AND key = ANY($3)',
          [tenantId, sid, list.map(m => `msg:${m.id}`)])
        const sent = new Set(known.map(r => r.key))
        const fresh = list.filter(m => !sent.has(`msg:${m.id}`))
        if (!fresh.length) continue
        const last = fresh[fresh.length - 1]
        const ok = await notify(student, 'message', `msg:${last.id}`,
          `💬 <b>Сообщение от преподавателя</b> · O'qituvchidan xabar\n\n`
          + (last.senderName ? `👤 ${esc(last.senderName)}\n` : '')
          + `${esc(cut(last.text, 500))}`
          + (fresh.length > 1 ? `\n\n…и ещё ${fresh.length - 1}` : ''))
        if (ok && !dryRun) {
          for (const m of fresh.slice(0, -1)) {
            await pool.query('INSERT INTO student_notices (tenant_id, student_id, key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [tenantId, sid, `msg:${m.id}`])
          }
        }
      }

      // Students by group: an assignment / a module belongs to a group
      const { rows: groupRows } = await pool.query('SELECT id, data FROM groups WHERE tenant_id = $1', [tenantId])
      const groups = new Map(groupRows.map(r => [r.id, { ...r.data, id: r.id }]))
      const groupOf = (student) => groups.get(student.groupId) || [...groups.values()].find(g => g.name && g.name === student.group) || null

      // ─── deadline: due tomorrow, nothing handed in ──────────────────
      if (hour >= DEADLINE_FROM) {
        const due = [...assignments.values()].filter(a => String(a.deadline || '').slice(0, 10) === tomorrow)
        if (due.length) {
          const { rows: subs } = await pool.query(
            'SELECT student_id, data->>\'assignmentId\' AS assignment_id FROM lms_submissions WHERE tenant_id = $1 AND student_id = ANY($2)',
            [tenantId, ids])
          const handedIn = new Set(subs.map(r => `${r.student_id}:${r.assignment_id}`))
          for (const a of due) {
            for (const student of students.values()) {
              const g = groupOf(student)
              if (a.groupId !== 'all' && (!g || g.id !== a.groupId)) continue
              if (handedIn.has(`${student.id}:${a.id}`)) continue
              await notify(student, 'deadline', `deadline:${a.id}:${tomorrow}`,
                `⏰ <b>Завтра срок сдачи задания</b> · Ertaga topshirish muddati\n\n`
                + `📝 ${esc(a.title || 'Домашнее задание')}\n`
                + (a.description ? `${esc(cut(a.description, 300))}\n` : ''))
            }
          }
        }
      }

      // ─── module: a new module opened (online, weekly) ───────────────
      // Only where the weekly schedule is what opens lessons: online students
      // who have paid less than half (from 50% the whole course is open).
      const online = [...students.values()].filter(s => s.learningFormat === 'Онлайн' && !s.freeAccess)
      if (online.length) {
        const [{ rows: pays }, { rows: moduleRows }, { rows: courseRows }] = await Promise.all([
          pool.query(
            `SELECT student_id, sum(amount) AS paid FROM payments
              WHERE tenant_id = $1 AND type = 'income' AND student_id = ANY($2)
                AND coalesce((data->>'cancelled')::boolean, false) = false
              GROUP BY student_id`, [tenantId, online.map(s => s.id)]),
          pool.query('SELECT id, data FROM lms_modules WHERE tenant_id = $1', [tenantId]),
          pool.query('SELECT id, data FROM courses WHERE tenant_id = $1', [tenantId]),
        ])
        const paidBy = new Map(pays.map(r => [r.student_id, Number(r.paid) || 0]))
        const courseIdByName = new Map(courseRows.map(r => [r.data.name, r.id]))
        for (const student of online) {
          const price = Number(student.totalCoursePrice) || 0
          if (price > 0 && (paidBy.get(student.id) || 0) / price >= 0.5) continue
          const g = groupOf(student)
          if (!g?.startDate) continue
          const count = unlockedModuleCount(g.startDate, now)
          // opened within the last day — not "has been open for a month"
          if (count < 2 || unlockedModuleCount(g.startDate, new Date(now.getTime() - DAY_MS)) >= count) continue
          const mods = moduleRows.map(r => r.data).filter(m => m.courseId === courseIdByName.get(g.course))
            .sort((a, b) => (a.order || 0) - (b.order || 0))
          const opened = mods[count - 1]
          if (!opened) continue // the course has no such module — nothing new to show
          await notify(student, 'module', `module:${g.id}:${count}`,
            `🔓 <b>Открылся новый модуль</b> · Yangi modul ochildi\n\n`
            + `📚 ${esc(g.course || '')}\n▶️ ${esc(opened.title || `Модуль ${count}`)}`)
        }
      }

      // ─── streak: N days in a row, nothing done today ────────────────
      if (hour >= STREAK_FROM) {
        const { rows: games } = await pool.query('SELECT id, data FROM student_game_data WHERE tenant_id = $1 AND id = ANY($2)', [tenantId, ids])
        for (const { id, data: gd } of games) {
          const student = students.get(id)
          const streak = Number(gd.currentStreak) || 0
          if (!student || streak < STREAK_MIN || gd.lastActivityDate !== utcYesterday) continue
          await notify(student, 'streak', `streak:${utcToday}`,
            `🔥 <b>${streak} дн. подряд — не прерывайте серию!</b>\n`
            + `Ketma-ket ${streak} kun — seriyani uzmang!\n\n`
            + 'Пройдите сегодня один урок, чтобы серия продолжилась.')
        }
      }
    } catch (err) {
      results.errors.push(`${tenantId}: ${err.message}`)
    }
  }

  // old claims are of no use: nothing looks further back than a couple of days
  if (!dryRun) {
    await pool.query(`DELETE FROM student_notices WHERE sent_at < now() - interval '60 days'`).catch(() => {})
  }
  return results
}

/** Sweep every 5 minutes; overlapping runs are skipped. */
export function startStudyNotices(pool, deps, log) {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const results = await runStudyNotices(pool, deps)
      const sent = NOTICE_KINDS.reduce((n, k) => n + results[k], 0)
      if (sent || results.errors.length) log.info({ results }, 'study notices')
    } catch (err) {
      log.error({ err }, 'study notices failed')
    } finally {
      running = false
    }
  }
  const first = setTimeout(tick, 90_000)
  const timer = setInterval(tick, 5 * 60_000)
  first.unref()
  timer.unref()
  return () => { clearTimeout(first); clearInterval(timer) }
}
