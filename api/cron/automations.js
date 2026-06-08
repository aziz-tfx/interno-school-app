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
  const results = { tenants: 0, reminders: 0, debtors: 0, blocked: 0, errors: [] }

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
        // Fallback for default tenant
        if (tenant.id === 'default' && !tgConfig.botToken) {
          tgConfig.botToken = process.env.TELEGRAM_BOT_TOKEN || ''
        }

        // Load students for this tenant
        const studentsSnap = await db.collection('students').where('tenantId', '==', tenant.id).get()
        const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

        // Load payments for this tenant
        const paymentsSnap = await db.collection('payments').where('tenantId', '==', tenant.id).get()
        const payments = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

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
