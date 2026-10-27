// Daily automations — port of api/cron/automations.js (Vercel cron) to the
// server, working on PostgreSQL. Runs once a day at 14:00 Tashkent time
// (the old cron was 09:00 UTC) for every active school:
//
//   1. payment reminders to the branch Telegram chat (N days before, on the
//      day, the day after)
//   2. personal reminders to students who linked Telegram (3 and 1 days
//      before, on the day, every day when overdue; once a day)
//   3. «должник» status once the payment date has passed (+ grace days)
//   4. LMS access off when it expired (or for debtors, if enabled)
//   5. each manager's list of expected installments + urgent list per branch
//
// Settings come from the automationSettings document of the school, edited
// on the Automations page. The rules match the old cron one for one, so
// nothing changes for students and managers except where the data lives.
//
// dryRun: count what would be sent/changed, without sending or writing —
// to preview the first run on real data.
//
// Student reminders carry a Payme pay-now link when the school has Payme on
// (deps.loadPayme).

const DAY_MS = 86_400_000
const RUN_HOUR_TASHKENT = 14
const TZ_OFFSET_MS = 5 * 3600_000 // Asia/Tashkent, no DST

const num = (v) => Number(v) || 0
const fmt = (n) => num(n).toLocaleString('ru-RU')

/** Same rule as the old cron: income payments of this student. */
function paymentsOf(payments, studentId, { skipCancelled = false } = {}) {
  return payments.filter(p => p.type === 'income' && String(p.studentId) === String(studentId)
    && !(skipCancelled && p.cancelled))
}

const latestFirst = (list) => [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

function nextPaymentDate(student, pays) {
  return student.nextPaymentDate || latestFirst(pays)[0]?.nextPaymentDate || null
}

const daysUntil = (date, now) => Math.ceil((new Date(date) - now) / DAY_MS)

/**
 * Run every rule for every active school.
 * @param {import('pg').Pool} pool
 * @param {{ now?: Date, send: (botToken, chatId, text) => Promise<boolean>, loadTelegram: (tenantId) => Promise<object>,
 *           loadPayme?: (tenantId) => Promise<{ enabled, merchantId }>,
 *           dryRun?: boolean, tenantIds?: string[] }} deps   tenantIds: only these schools (default: every active one)
 */
export async function runAutomations(pool, { now = new Date(), send: realSend, loadTelegram, loadPayme = async () => ({}), dryRun = false, tenantIds: only }) {
  const send = dryRun ? async (botToken, chatId) => Boolean(botToken && chatId) : realSend
  const todayStr = now.toISOString().slice(0, 10)
  const results = { tenants: 0, reminders: 0, studentReminders: 0, debtors: 0, blocked: 0, managerAlerts: 0, errors: [] }

  let tenantIds = only
  if (!tenantIds) {
    const { rows } = await pool.query(`SELECT id FROM tenants WHERE data->>'status' = 'active'`)
    tenantIds = rows.map(r => r.id)
    // the original school may have no tenants row (as in the old cron)
    if (!tenantIds.includes('default')) tenantIds.push('default')
  }
  results.tenants = tenantIds.length

  const setStudent = (id, patch) => dryRun ? null
    : pool.query('UPDATE students SET data = data || $2::jsonb WHERE id = $1', [id, patch])

  for (const tenantId of tenantIds) {
    try {
      const { rows: [settingsRow] } = await pool.query('SELECT data FROM automation_settings WHERE id = $1', [tenantId])
      const settings = settingsRow?.data || {}
      const tg = await loadTelegram(tenantId)

      const [students, payments, employees] = await Promise.all([
        pool.query('SELECT id, data FROM students WHERE tenant_id = $1', [tenantId]),
        pool.query(`SELECT id, data FROM payments WHERE tenant_id = $1 AND type = 'income'`, [tenantId]),
        pool.query('SELECT id, data FROM employees WHERE tenant_id = $1', [tenantId]),
      ]).then(([s, p, e]) => [
        s.rows.map(r => ({ ...r.data, id: r.id })),
        p.rows.map(r => ({ ...r.data, id: r.id, amount: num(r.data.amount) })),
        e.rows.map(r => ({ ...r.data, _docId: r.id })),
      ])

      const debtOf = (student, pays) => Math.max(0, num(student.totalCoursePrice) - pays.reduce((s, p) => s + p.amount, 0))
      const chatFor = (branch) => tg.chats?.[branch] || tg.chats?.tashkent

      // ─── 1. Payment reminders to the branch chat ───────────────────
      if (settings.paymentReminders !== false) {
        const reminderDays = settings.reminderDaysBefore || 3
        for (const student of students) {
          if (student.status === 'frozen' || student.status === 'archived') continue
          const pays = paymentsOf(payments, student.id)
          const debt = debtOf(student, pays)
          if (debt <= 0) continue
          const nextDate = nextPaymentDate(student, pays)
          if (!nextDate) continue
          const d = daysUntil(nextDate, now)
          if (d !== reminderDays && d !== 0 && d !== -1) continue
          const chatId = chatFor(student.branch)
          if (!chatId || !tg.botToken) continue
          const urgency = d < 0 ? 'ПРОСРОЧЕНО' : d === 0 ? 'СЕГОДНЯ' : `через ${d} дн.`
          const text = `${d <= 0 ? '🔴' : '🔔'} <b>Напоминание об оплате</b>\n\n`
            + `👤 ${student.name}\n📚 ${student.course || '—'}\n💰 Долг: ${fmt(debt)} сум\n`
            + `📅 Срок: ${nextDate} (${urgency})\n📞 ${student.phone || '—'}`
          if (await send(tg.botToken, chatId, text)) results.reminders++
        }
      }

      // ─── 2. Personal reminders to students ─────────────────────────
      if (settings.studentReminders !== false) {
        const payme = await loadPayme(tenantId)
        const paymeLink = (student, debt) => (payme.enabled && payme.merchantId)
          ? `https://checkout.paycom.uz/${Buffer.from(
            `m=${payme.merchantId};ac.student_id=${student.id};ac.tenant_id=${tenantId};a=${Math.round(debt * 100)}`
          ).toString('base64')}`
          : null
        for (const student of students) {
          if (!student.telegramChatId) continue
          if (student.status === 'frozen' || student.status === 'archived') continue
          if (student.lastStudentReminderDate === todayStr) continue // once a day
          const pays = paymentsOf(payments, student.id, { skipCancelled: true })
          const debt = debtOf(student, pays)
          if (debt <= 0) continue
          const nextDate = nextPaymentDate(student, pays)
          if (!nextDate) continue
          const d = daysUntil(nextDate, now)
          if (!(d === 3 || d === 1 || d === 0 || d < 0)) continue
          const header = d < 0 ? `🔴 <b>Оплата просрочена на ${Math.abs(d)} дн.</b>`
            : d === 0 ? '🟡 <b>Сегодня день оплаты</b>' : `🔔 <b>Оплата через ${d} дн.</b>`
          const text = `${header}\n\nЗдравствуйте, ${student.name}!\n`
            + (student.course ? `📚 Курс: ${student.course}\n` : '')
            + `💰 К оплате: <b>${fmt(debt)} сум</b>\n📅 Срок: ${nextDate}\n`
            + (paymeLink(student, debt) ? `\n💳 Оплатить онлайн: ${paymeLink(student, debt)}\n` : '')
            + '\nПосле оплаты доступ к урокам продлевается автоматически.'
          if (await send(tg.botToken, student.telegramChatId, text)) {
            results.studentReminders++
            await setStudent(student.id, { lastStudentReminderDate: todayStr })
          }
        }
      }

      // ─── 3. Debtor status ──────────────────────────────────────────
      if (settings.autoDebtor !== false) {
        const graceDays = settings.debtorGraceDays || 0
        for (const student of students) {
          if (student.status !== 'active') continue
          const pays = paymentsOf(payments, student.id)
          const coursePrice = num(student.totalCoursePrice)
          if (coursePrice <= 0 || pays.reduce((s, p) => s + p.amount, 0) >= coursePrice) continue
          const nextDate = nextPaymentDate(student, pays)
          if (!nextDate) continue
          if (Math.ceil((now - new Date(nextDate)) / DAY_MS) > graceDays) {
            await setStudent(student.id, { status: 'debtor' })
            results.debtors++
          }
        }
      }

      // ─── 4. LMS access ─────────────────────────────────────────────
      if (settings.autoBlockLms !== false) {
        for (const student of students) {
          if (!student.lmsAccess) continue
          const expired = student.lmsExpiresAt && new Date(student.lmsExpiresAt) < now
          if (expired || (settings.blockLmsOnDebt && student.status === 'debtor')) {
            await setStudent(student.id, { lmsAccess: false })
            results.blocked++
          }
        }
      }

      // ─── 5. Manager installment lists + urgent list per branch ─────
      if (settings.managerDoplataAlerts !== false && tg.botToken) {
        const byManager = {}
        const byBranch = {}
        for (const student of students) {
          if (student.status === 'frozen' || student.status === 'archived') continue
          const pays = latestFirst(paymentsOf(payments, student.id))
          const debt = debtOf(student, pays)
          if (debt <= 0) continue
          const nextDate = nextPaymentDate(student, pays)
          const d = nextDate ? daysUntil(nextDate, now) : null

          const mgrId = pays[0]?.managerId || pays[0]?.createdBy
          if (mgrId && pays.length) {
            (byManager[mgrId] ||= []).push({
              name: student.name, phone: student.phone || '', debt, nextDate: nextDate || '', daysUntil: d,
              overdue: d !== null && d < 0, urgent: d !== null && d >= 0 && d <= 3,
            })
          }
          if (d !== null && d <= 3) {
            (byBranch[student.branch || 'tashkent'] ||= []).push({ name: student.name, debt, daysUntil: d, nextDate })
          }
        }

        for (const [mgrId, list] of Object.entries(byManager)) {
          const mgr = employees.find(e => [e.managerId, e.id, e._docId].some(v => String(v) === String(mgrId)))
          if (!mgr || mgr.status === 'fired' || !mgr.telegramChatId) continue
          list.sort((a, b) => (a.daysUntil ?? 999) - (b.daysUntil ?? 999))
          const overdue = list.filter(s => s.overdue).length
          const urgent = list.filter(s => s.urgent).length
          let text = '📋 <b>Ваши ожидаемые доплаты</b>\n'
            + `Всего: ${list.length} студентов · ${fmt(list.reduce((s, x) => s + x.debt, 0))} сум\n`
            + (overdue ? `🔴 Просрочено: ${overdue}\n` : '')
            + (urgent ? `🟡 Ближайшие 3 дня: ${urgent}\n` : '')
            + '\n'
          for (const s of list.slice(0, 15)) {
            const dateStr = s.nextDate
              ? `${s.nextDate} (${s.overdue ? `просрочено ${Math.abs(s.daysUntil)} дн.` : s.daysUntil === 0 ? 'СЕГОДНЯ' : `${s.daysUntil} дн.`})`
              : 'дата не указана'
            text += `${s.overdue ? '🔴' : s.urgent ? '🟡' : '⚪️'} <b>${s.name}</b>\n   💰 ${fmt(s.debt)} сум · 📅 ${dateStr}\n`
            if (s.phone) text += `   📞 ${s.phone}\n`
          }
          if (list.length > 15) text += `\n... и ещё ${list.length - 15}`
          if (await send(tg.botToken, mgr.telegramChatId, text)) results.managerAlerts++
        }

        for (const [branch, list] of Object.entries(byBranch)) {
          const chatId = chatFor(branch)
          if (!chatId) continue
          list.sort((a, b) => a.daysUntil - b.daysUntil)
          let text = `📊 <b>Доплаты — срочные (${branch})</b>\n\n`
          for (const s of list.slice(0, 20)) {
            const when = s.daysUntil < 0 ? ' (просрочено)' : s.daysUntil === 0 ? ' (сегодня)' : ` (${s.daysUntil} дн.)`
            text += `${s.daysUntil < 0 ? '🔴' : s.daysUntil === 0 ? '🟡' : '⚪️'} ${s.name} · ${fmt(s.debt)} сум · ${s.nextDate}${when}\n`
          }
          await send(tg.botToken, chatId, text)
          results.managerAlerts++
        }
      }
    } catch (err) {
      results.errors.push(`${tenantId}: ${err.message}`)
    }
  }
  return results
}

/** 'YYYY-MM-DD' and hour in Tashkent for a moment in time. */
export function tashkentClock(now = new Date()) {
  const local = new Date(now.getTime() + TZ_OFFSET_MS)
  return { date: local.toISOString().slice(0, 10), hour: local.getUTCHours() }
}

/**
 * Claim today's run: true for exactly one caller per day, even with several
 * API processes or restarts (the row is the lock).
 */
export async function claimDailyRun(pool, name, date) {
  const { rowCount } = await pool.query(
    `INSERT INTO scheduled_runs (name, last_date) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET last_date = EXCLUDED.last_date, ran_at = now()
       WHERE scheduled_runs.last_date < EXCLUDED.last_date`,
    [name, date]
  )
  return rowCount > 0
}

/** Check every minute; after 14:00 Tashkent run once for the day. */
export function startAutomationScheduler(pool, deps, log) {
  const tick = async () => {
    const { date, hour } = tashkentClock()
    if (hour < RUN_HOUR_TASHKENT) return
    try {
      if (!(await claimDailyRun(pool, 'automations', date))) return
      const results = await runAutomations(pool, deps)
      log.info({ results }, 'daily automations done')
    } catch (err) {
      log.error({ err }, 'daily automations failed')
    }
  }
  const timer = setInterval(tick, 60_000)
  timer.unref()
  return () => clearInterval(timer)
}
