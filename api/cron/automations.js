// Vercel Cron Job — runs daily at 09:00 UTC (14:00 UZT)
// Processes automation rules for all active tenants:
//   1. Payment reminders (Telegram to student/branch chat)
//   2. Auto-debtor status (mark overdue students)
//   3. Auto-block LMS for expired access
//
// Cron schedule: see vercel.json  { "crons": [{ "path": "/api/cron/automations", "schedule": "0 9 * * *" }] }
// Can also be called manually: GET /api/cron/automations?secret=<CRON_SECRET>

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

let _db = null
function getDb() {
  if (_db) return _db
  if (!getApps().length) {
    const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    if (!key) return null
    try {
      initializeApp({ credential: cert(typeof key === 'string' ? JSON.parse(key) : key) })
    } catch (e) { return null }
  }
  _db = getFirestore()
  return _db
}

async function sendTelegram(botToken, chatId, text) {
  if (!botToken || !chatId) return false
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
    return true
  } catch { return false }
}

export default async function handler(req, res) {
  // Security: only allow Vercel Cron or requests with the secret
  const isVercelCron = req.headers['x-vercel-cron'] === '1'
  const secret = process.env.CRON_SECRET
  const hasSecret = secret && req.query.secret === secret
  if (!isVercelCron && !hasSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const db = getDb()
  if (!db) return res.status(500).json({ error: 'Database unavailable' })

  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const results = { tenants: 0, reminders: 0, studentReminders: 0, debtors: 0, blocked: 0, managerAlerts: 0, errors: [] }

  try {
    // Load all active tenants
    const tenantsSnap = await db.collection('tenants').where('status', '==', 'active').get()
    const tenants = tenantsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    // Also process default tenant (may not be in tenants collection)
    if (!tenants.find(t => t.id === 'default')) {
      tenants.push({ id: 'default', status: 'active' })
    }
    results.tenants = tenants.length

    for (const tenant of tenants) {
      try {
        // Load automation settings for this tenant
        const settingsSnap = await db.collection('automationSettings').doc(tenant.id).get()
        const settings = settingsSnap.exists ? settingsSnap.data() : {}

        // Load Telegram config for notifications
        let tgConfig = {}
        try {
          const tgSnap = await db.collection('tenantIntegrations').doc(tenant.id).get()
          if (tgSnap.exists) tgConfig = tgSnap.data()?.telegram || {}
        } catch {}
        // Fallback for default tenant: use env vars
        const isDefault = !tenant.id || tenant.id === 'default'
        if (isDefault) {
          if (!tgConfig.botToken) tgConfig.botToken = process.env.TELEGRAM_BOT_TOKEN || ''
          if (!tgConfig.chats || Object.keys(tgConfig.chats).length === 0) {
            tgConfig.chats = {
              tashkent:  process.env.TG_CHAT_TASHKENT  || '',
              samarkand: process.env.TG_CHAT_SAMARKAND || '',
              fergana:   process.env.TG_CHAT_FERGANA   || '',
              bukhara:   process.env.TG_CHAT_BUKHARA   || '',
              online:    process.env.TG_CHAT_TASHKENT  || '',
            }
          }
        }

        // Load students for this tenant
        const studentsSnap = await db.collection('students').where('tenantId', '==', tenant.id).get()
        const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

        // Load payments for this tenant
        const paymentsSnap = await db.collection('payments').where('tenantId', '==', tenant.id).get()
        const payments = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

        // Load employees for manager notifications
        const employeesSnap = await db.collection('employees').where('tenantId', '==', tenant.id).get()
        const employees = employeesSnap.docs.map(d => ({ id: d.id, ...d.data() }))

        // ─── Rule 1: Payment reminders ─────────────────────────
        if (settings.paymentReminders !== false) {
          const reminderDays = settings.reminderDaysBefore || 3

          for (const student of students) {
            if (student.status === 'frozen' || student.status === 'archived') continue

            const studentPayments = payments.filter(p =>
              p.type === 'income' && String(p.studentId) === String(student.id)
            )
            const totalPaid = studentPayments.reduce((s, p) => s + (p.amount || 0), 0)
            const coursePrice = student.totalCoursePrice || 0
            const debt = Math.max(0, coursePrice - totalPaid)
            if (debt <= 0) continue

            const nextDate = student.nextPaymentDate || studentPayments
              .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]?.nextPaymentDate

            if (!nextDate) continue

            const daysUntil = Math.ceil((new Date(nextDate) - now) / (1000 * 60 * 60 * 24))

            if (daysUntil === reminderDays || daysUntil === 0 || daysUntil === -1) {
              const chatId = tgConfig.chats?.[student.branch] || tgConfig.chats?.tashkent
              if (chatId && tgConfig.botToken) {
                const emoji = daysUntil <= 0 ? '🔴' : '🔔'
                const urgency = daysUntil < 0 ? 'ПРОСРОЧЕНО' : daysUntil === 0 ? 'СЕГОДНЯ' : `через ${daysUntil} дн.`
                const text = `${emoji} <b>Напоминание об оплате</b>\n\n` +
                  `👤 ${student.name}\n` +
                  `📚 ${student.course || '—'}\n` +
                  `💰 Долг: ${debt.toLocaleString('ru-RU')} сум\n` +
                  `📅 Срок: ${nextDate} (${urgency})\n` +
                  `📞 ${student.phone || '—'}`
                const sent = await sendTelegram(tgConfig.botToken, chatId, text)
                if (sent) results.reminders++
              }
            }
          }
        }

        // ─── Rule 5: PERSONAL payment reminders to students ────
        // Students who linked their Telegram via the cabinet deep link
        // (students/{id}.telegramChatId) get a direct reminder 3 days
        // before, 1 day before, on the due date, and when overdue.
        // Includes a Payme checkout link when the tenant has Payme set up.
        if (settings.studentReminders !== false) {
          // Payme config for pay-now links (optional)
          let paymeCfg = {}
          try {
            const piSnap = await db.collection('tenantIntegrations').doc(tenant.id).get()
            if (piSnap.exists) paymeCfg = piSnap.data()?.payme || {}
          } catch {}
          if (isDefault && !paymeCfg.merchantId) {
            paymeCfg = { merchantId: process.env.PAYME_MERCHANT_ID || '', enabled: !!process.env.PAYME_MERCHANT_ID }
          }
          const paymeReady = paymeCfg.enabled !== false && !!paymeCfg.merchantId

          for (const student of students) {
            if (!student.telegramChatId) continue
            if (student.status === 'frozen' || student.status === 'archived') continue
            // Dedup: at most one personal reminder per day
            if (student.lastStudentReminderDate === todayStr) continue

            const studentPayments = payments.filter(p =>
              p.type === 'income' && !p.cancelled && String(p.studentId) === String(student.id)
            )
            const totalPaid = studentPayments.reduce((s, p) => s + (p.amount || 0), 0)
            const coursePrice = student.totalCoursePrice || 0
            const debt = Math.max(0, coursePrice - totalPaid)
            if (debt <= 0) continue

            const nextDate = student.nextPaymentDate || studentPayments
              .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]?.nextPaymentDate
            if (!nextDate) continue

            const daysUntil = Math.ceil((new Date(nextDate) - now) / (1000 * 60 * 60 * 24))
            // 3 days before, 1 day before, due today, or overdue (every day)
            if (!(daysUntil === 3 || daysUntil === 1 || daysUntil === 0 || daysUntil < 0)) continue

            const debtStr = debt.toLocaleString('ru-RU')
            let header
            if (daysUntil < 0) header = `🔴 <b>Оплата просрочена на ${Math.abs(daysUntil)} дн.</b>`
            else if (daysUntil === 0) header = `🟡 <b>Сегодня день оплаты</b>`
            else header = `🔔 <b>Оплата через ${daysUntil} дн.</b>`

            let text = `${header}\n\n` +
              `Здравствуйте, ${student.name}!\n` +
              (student.course ? `📚 Курс: ${student.course}\n` : '') +
              `💰 К оплате: <b>${debtStr} сум</b>\n` +
              `📅 Срок: ${nextDate}\n`

            if (paymeReady) {
              const amountTiyin = Math.round(debt * 100)
              const payload = Buffer.from(
                `m=${paymeCfg.merchantId};ac.student_id=${student.id};ac.tenant_id=${tenant.id};a=${amountTiyin}`
              ).toString('base64')
              text += `\n💳 Оплатить онлайн: https://checkout.paycom.uz/${payload}\n`
            }
            text += `\nПосле оплаты доступ к урокам продлевается автоматически.`

            const sent = await sendTelegram(tgConfig.botToken, student.telegramChatId, text)
            if (sent) {
              results.studentReminders++
              await db.collection('students').doc(student.id)
                .update({ lastStudentReminderDate: todayStr })
                .catch(() => {})
            }
          }
        }

        // ─── Rule 2: Auto-debtor status ────────────────────────
        if (settings.autoDebtor !== false) {
          const graceDays = settings.debtorGraceDays || 0

          for (const student of students) {
            if (student.status !== 'active') continue

            const studentPayments = payments.filter(p =>
              p.type === 'income' && String(p.studentId) === String(student.id)
            )
            const totalPaid = studentPayments.reduce((s, p) => s + (p.amount || 0), 0)
            const coursePrice = student.totalCoursePrice || 0
            if (coursePrice <= 0 || totalPaid >= coursePrice) continue

            const nextDate = student.nextPaymentDate || studentPayments
              .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]?.nextPaymentDate

            if (!nextDate) continue

            const daysOverdue = Math.ceil((now - new Date(nextDate)) / (1000 * 60 * 60 * 24))
            if (daysOverdue > graceDays) {
              await db.collection('students').doc(student.id).update({ status: 'debtor' })
              results.debtors++
            }
          }
        }

        // ─── Rule 3: Auto-block LMS ────────────────────────────
        if (settings.autoBlockLms !== false) {
          for (const student of students) {
            if (!student.lmsAccess) continue

            // Block if expired
            if (student.lmsExpiresAt && new Date(student.lmsExpiresAt) < now) {
              await db.collection('students').doc(student.id).update({ lmsAccess: false })
              results.blocked++
              continue
            }

            // Block if debtor and setting requires it
            if (settings.blockLmsOnDebt && student.status === 'debtor') {
              await db.collection('students').doc(student.id).update({ lmsAccess: false })
              results.blocked++
            }
          }
        }

        // ─── Rule 4: Manager doplata alerts ───────────────────
        // Send each manager a personal summary of their students'
        // upcoming / overdue installments via Telegram bot PM.
        if (settings.managerDoplataAlerts !== false) {
          // Group students with debt by their responsible manager
          const managerStudents = {}
          for (const student of students) {
            if (student.status === 'frozen' || student.status === 'archived') continue
            const studentPays = payments.filter(p =>
              p.type === 'income' && String(p.studentId) === String(student.id)
            ).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
            const totalPaid = studentPays.reduce((s, p) => s + (p.amount || 0), 0)
            const coursePrice = student.totalCoursePrice || 0
            const debt = Math.max(0, coursePrice - totalPaid)
            if (debt <= 0 || studentPays.length === 0) continue

            const nextDate = student.nextPaymentDate || studentPays[0]?.nextPaymentDate
            const daysUntil = nextDate ? Math.ceil((new Date(nextDate) - now) / (1000 * 60 * 60 * 24)) : null

            // Find responsible manager via managerId on last payment
            const mgrId = studentPays[0]?.managerId || studentPays[0]?.createdBy
            if (!mgrId) continue

            if (!managerStudents[mgrId]) managerStudents[mgrId] = []
            managerStudents[mgrId].push({
              name: student.name,
              phone: student.phone || '',
              course: student.course || '',
              debt,
              nextDate: nextDate || '',
              daysUntil,
              overdue: daysUntil !== null && daysUntil < 0,
              urgent: daysUntil !== null && daysUntil >= 0 && daysUntil <= 3,
            })
          }

          // Send each manager their summary
          for (const [mgrId, studs] of Object.entries(managerStudents)) {
            if (studs.length === 0) continue
            // Find the manager's employee to get their Telegram chat ID
            const mgr = employees.find(e =>
              String(e.managerId) === String(mgrId) ||
              String(e.id) === String(mgrId) ||
              String(e._docId) === String(mgrId)
            )
            if (!mgr) continue
            const mgrChatId = mgr.telegramChatId
            if (!mgrChatId || !tgConfig.botToken) continue

            // Sort: overdue first, then by days until
            studs.sort((a, b) => (a.daysUntil ?? 999) - (b.daysUntil ?? 999))

            const overdueCount = studs.filter(s => s.overdue).length
            const urgentCount = studs.filter(s => s.urgent).length
            const totalDebt = studs.reduce((s, st) => s + st.debt, 0)

            let text = `📋 <b>Ваши ожидаемые доплаты</b>\n`
            text += `Всего: ${studs.length} студентов · ${totalDebt.toLocaleString('ru-RU')} сум\n`
            if (overdueCount > 0) text += `🔴 Просрочено: ${overdueCount}\n`
            if (urgentCount > 0) text += `🟡 Ближайшие 3 дня: ${urgentCount}\n`
            text += `\n`

            for (const s of studs.slice(0, 15)) {
              const emoji = s.overdue ? '🔴' : s.urgent ? '🟡' : '⚪️'
              const dateStr = s.nextDate
                ? `${s.nextDate} (${s.overdue ? 'просрочено ' + Math.abs(s.daysUntil) + ' дн.' : s.daysUntil === 0 ? 'СЕГОДНЯ' : s.daysUntil + ' дн.'})`
                : 'дата не указана'
              text += `${emoji} <b>${s.name}</b>\n`
              text += `   💰 ${s.debt.toLocaleString('ru-RU')} сум · 📅 ${dateStr}\n`
              if (s.phone) text += `   📞 ${s.phone}\n`
            }
            if (studs.length > 15) text += `\n... и ещё ${studs.length - 15}`

            const sent = await sendTelegram(tgConfig.botToken, mgrChatId, text)
            if (sent) results.managerAlerts++
          }

          // Also send summary to branch chats (for directors/ROPs)
          const branchSummary = {}
          for (const student of students) {
            if (student.status === 'frozen' || student.status === 'archived') continue
            const studentPays = payments.filter(p =>
              p.type === 'income' && String(p.studentId) === String(student.id)
            )
            const totalPaid = studentPays.reduce((s, p) => s + (p.amount || 0), 0)
            const coursePrice = student.totalCoursePrice || 0
            const debt = Math.max(0, coursePrice - totalPaid)
            if (debt <= 0) continue
            const nextDate = student.nextPaymentDate || studentPays.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]?.nextPaymentDate
            const daysUntil = nextDate ? Math.ceil((new Date(nextDate) - now) / (1000 * 60 * 60 * 24)) : null
            if (daysUntil === null) continue
            // Only alert for overdue or due within 3 days
            if (daysUntil > 3) continue
            const branch = student.branch || 'tashkent'
            if (!branchSummary[branch]) branchSummary[branch] = []
            branchSummary[branch].push({ name: student.name, debt, daysUntil, nextDate, phone: student.phone || '' })
          }

          for (const [branch, studs] of Object.entries(branchSummary)) {
            if (studs.length === 0) continue
            const chatId = tgConfig.chats?.[branch] || tgConfig.chats?.tashkent
            if (!chatId || !tgConfig.botToken) continue
            studs.sort((a, b) => a.daysUntil - b.daysUntil)
            let text = `📊 <b>Доплаты — срочные (${branch})</b>\n\n`
            for (const s of studs.slice(0, 20)) {
              const emoji = s.daysUntil < 0 ? '🔴' : s.daysUntil === 0 ? '🟡' : '⚪️'
              text += `${emoji} ${s.name} · ${s.debt.toLocaleString('ru-RU')} сум · ${s.nextDate}${s.daysUntil < 0 ? ' (просрочено)' : s.daysUntil === 0 ? ' (сегодня)' : ` (${s.daysUntil} дн.)`}\n`
            }
            await sendTelegram(tgConfig.botToken, chatId, text)
            results.managerAlerts++
          }
        }

      } catch (err) {
        results.errors.push(`${tenant.id}: ${err.message}`)
      }
    }
  } catch (err) {
    results.errors.push(err.message)
  }

  return res.status(200).json({
    ok: true,
    timestamp: now.toISOString(),
    ...results,
  })
}
