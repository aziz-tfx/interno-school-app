// Vercel Serverless Function — Payme Merchant API (JSON-RPC 2.0)
// POST /api/pay/payme?tenantId=<tenant>  — Payme JSON-RPC webhook
// GET  /api/pay/payme?tenantId=<tenant>  — public SAFE config for the
//        student cabinet (payme enabled/merchantId + bot username).
//        Combined into one function to stay within the Vercel Hobby
//        limit of 12 serverless functions per deployment.
//
// Register the POST URL in the Payme merchant cabinet as the endpoint.
// Auth: Payme sends  Authorization: Basic base64("Paycom:<key>")
//
// Checkout links are built client-side as:
//   https://checkout.paycom.uz/<base64(m=MERCHANT;ac.student_id=ID;ac.tenant_id=T;a=AMOUNT_TIYIN)>
//
// Transaction lifecycle (Payme states):
//   1  — created (CreateTransaction)
//   2  — performed (PerformTransaction) → payment doc written
//  -1  — cancelled before perform
//  -2  — cancelled after perform (payment doc voided, balance rolled back)

import { resolvePayme, getDb, loadTenantIntegration, getTenantId } from '../_lib/tenantConfig.js'

// Payme error helper — message must carry ru/uz/en variants
const rpcError = (res, id, code, msg, data) =>
  res.status(200).json({
    id,
    error: { code, message: { ru: msg, uz: msg, en: msg }, ...(data ? { data } : {}) },
  })

const MIN_AMOUNT_TIYIN = 1000 * 100 // 1 000 сум

async function getStudentDebt(db, tenantId, studentId) {
  const stSnap = await db.collection('students').doc(String(studentId)).get()
  if (!stSnap.exists) return { student: null, debt: 0 }
  const student = { id: stSnap.id, ...stSnap.data() }
  if ((student.tenantId || 'default') !== tenantId) return { student: null, debt: 0 }
  const paysSnap = await db.collection('payments')
    .where('tenantId', '==', tenantId)
    .where('studentId', '==', String(studentId))
    .get()
  const totalPaid = paysSnap.docs
    .map(d => d.data())
    .filter(p => p.type === 'income' && !p.cancelled)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const debt = Math.max(0, (Number(student.totalCoursePrice) || 0) - totalPaid)
  return { student, debt, totalPaid, trancheNumber: paysSnap.docs.filter(d => d.data().type === 'income').length + 1 }
}

// Best-effort Telegram notification to the branch chat about an online payment
async function notifyBranch(db, tenantId, student, amountSum) {
  try {
    const tgSnap = await db.collection('tenantIntegrations').doc(tenantId).get()
    const tg = tgSnap.exists ? (tgSnap.data()?.telegram || {}) : {}
    const botToken = tg.botToken || (tenantId === 'default' ? process.env.TG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN : '')
    const chats = tg.chats || {}
    const chatId = chats[student.branch] || chats.tashkent ||
      (tenantId === 'default' ? process.env.TG_CHAT_TASHKENT : '')
    if (!botToken || !chatId) return
    const text = `#Оплата 💳 <b>Payme (онлайн)</b>\n` +
      `👤 ${student.name}\n` +
      (student.course ? `📚 ${student.course}\n` : '') +
      `💰 ${Number(amountSum).toLocaleString('ru-RU')} сум\n` +
      (student.phone ? `📞 ${student.phone}` : '')
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
  } catch { /* non-critical */ }
}

export default async function handler(req, res) {
  // ─── GET: public config for the student cabinet (no secrets) ───
  if (req.method === 'GET') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    const tenantId = getTenantId(req) || 'default'
    const payme = await resolvePayme(req)
    const tg = await loadTenantIntegration(tenantId, 'telegram')
    const botUsername = tg.botUsername ||
      (tenantId === 'default' ? (process.env.TG_BOT_USERNAME || '') : '')
    return res.status(200).json({
      payme: {
        enabled: payme.enabled && !!payme.merchantId,
        merchantId: payme.merchantId || '',
      },
      telegramBotUsername: botUsername.replace(/^@/, ''),
    })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = req.body || {}
  const rpcId = body.id ?? null
  const params = body.params || {}

  const cfg = await resolvePayme(req)
  if (!cfg.key) return rpcError(res, rpcId, -32504, 'Merchant not configured')

  // ─── Basic auth: Paycom:<key> ───
  const auth = req.headers.authorization || ''
  const expected = 'Basic ' + Buffer.from(`Paycom:${cfg.key}`).toString('base64')
  if (auth !== expected) return rpcError(res, rpcId, -32504, 'Invalid authorization')

  const db = getDb()
  if (!db) return rpcError(res, rpcId, -32400, 'Database unavailable')

  const tenantId = cfg.tenantId
  const txCol = db.collection('paymeTransactions')

  try {
    switch (body.method) {
      // ─── Can this payment be made? ───
      case 'CheckPerformTransaction': {
        const studentId = params.account?.student_id
        if (!studentId) return rpcError(res, rpcId, -31050, 'student_id is required')
        const { student, debt } = await getStudentDebt(db, tenantId, studentId)
        if (!student) return rpcError(res, rpcId, -31050, 'Студент не найден')
        if (debt <= 0) return rpcError(res, rpcId, -31051, 'Задолженность отсутствует')
        const amount = Number(params.amount) || 0
        if (amount < MIN_AMOUNT_TIYIN) return rpcError(res, rpcId, -31001, 'Сумма слишком мала')
        if (amount > debt * 100) return rpcError(res, rpcId, -31001, 'Сумма превышает задолженность')
        return res.status(200).json({ id: rpcId, result: { allow: true } })
      }

      // ─── Create (reserve) a transaction ───
      case 'CreateTransaction': {
        const paymeId = String(params.id || '')
        const studentId = params.account?.student_id
        const amount = Number(params.amount) || 0

        const existing = await txCol.doc(paymeId).get()
        if (existing.exists) {
          const tx = existing.data()
          if (tx.state !== 1) return rpcError(res, rpcId, -31008, 'Транзакция уже завершена')
          if (tx.amount !== amount) return rpcError(res, rpcId, -31001, 'Сумма не совпадает')
          return res.status(200).json({
            id: rpcId,
            result: { create_time: tx.createTime, transaction: paymeId, state: 1 },
          })
        }

        const { student, debt } = await getStudentDebt(db, tenantId, studentId)
        if (!student) return rpcError(res, rpcId, -31050, 'Студент не найден')
        if (debt <= 0) return rpcError(res, rpcId, -31051, 'Задолженность отсутствует')
        if (amount < MIN_AMOUNT_TIYIN || amount > debt * 100) {
          return rpcError(res, rpcId, -31001, 'Недопустимая сумма')
        }

        // One in-flight transaction per student at a time
        const pending = await txCol
          .where('tenantId', '==', tenantId)
          .where('studentId', '==', String(studentId))
          .where('state', '==', 1)
          .get()
        if (!pending.empty) return rpcError(res, rpcId, -31099, 'Есть незавершённая транзакция')

        const createTime = Date.now()
        await txCol.doc(paymeId).set({
          paymeId,
          tenantId,
          studentId: String(studentId),
          amount,
          state: 1,
          createTime,
          performTime: 0,
          cancelTime: 0,
          reason: null,
          paymentDocId: null,
        })
        return res.status(200).json({
          id: rpcId,
          result: { create_time: createTime, transaction: paymeId, state: 1 },
        })
      }

      // ─── Money received — write the payment ───
      case 'PerformTransaction': {
        const paymeId = String(params.id || '')
        const txSnap = await txCol.doc(paymeId).get()
        if (!txSnap.exists) return rpcError(res, rpcId, -31003, 'Транзакция не найдена')
        const tx = txSnap.data()

        if (tx.state === 2) {
          return res.status(200).json({
            id: rpcId,
            result: { transaction: paymeId, perform_time: tx.performTime, state: 2 },
          })
        }
        if (tx.state !== 1) return rpcError(res, rpcId, -31008, 'Транзакция отменена')

        const { student, trancheNumber } = await getStudentDebt(db, tenantId, tx.studentId)
        if (!student) return rpcError(res, rpcId, -31050, 'Студент не найден')

        const amountSum = tx.amount / 100
        const todayStr = new Date().toISOString().split('T')[0]

        // Payment document — mirrors what PaymentForm writes
        const paymentDoc = {
          type: 'income',
          student: student.name || '',
          studentId: String(tx.studentId),
          branch: student.branch || 'tashkent',
          amount: amountSum,
          method: 'Payme',
          date: todayStr,
          course: student.course || '',
          group: student.group || '',
          totalCoursePrice: Number(student.totalCoursePrice) || 0,
          trancheNumber,
          comment: 'Онлайн-оплата через Payme',
          phone: student.phone || '',
          managerId: null,
          createdBy: null,
          createdByName: 'Payme (онлайн)',
          createdAt: new Date().toISOString(),
          tenantId,
          paymeTransactionId: paymeId,
          telegramSent: true, // notified below via branch chat
        }
        const payRef = await db.collection('payments').add(paymentDoc)

        // Update the student: balance, status, LMS access (+6 months)
        const lmsExpires = new Date()
        lmsExpires.setMonth(lmsExpires.getMonth() + 6)
        const newBalance = (Number(student.balance) || 0) + amountSum
        const price = Number(student.totalCoursePrice) || 0
        const paidNow = newBalance
        const newStatus = price > 0 && paidNow < price ? 'debtor' : 'active'
        await db.collection('students').doc(String(tx.studentId)).update({
          balance: newBalance,
          status: student.status === 'frozen' ? 'frozen' : newStatus,
          lmsAccess: true,
          lmsExpiresAt: lmsExpires.toISOString(),
        })

        const performTime = Date.now()
        await txCol.doc(paymeId).update({ state: 2, performTime, paymentDocId: payRef.id })

        notifyBranch(db, tenantId, student, amountSum)

        return res.status(200).json({
          id: rpcId,
          result: { transaction: paymeId, perform_time: performTime, state: 2 },
        })
      }

      // ─── Cancel / refund ───
      case 'CancelTransaction': {
        const paymeId = String(params.id || '')
        const txSnap = await txCol.doc(paymeId).get()
        if (!txSnap.exists) return rpcError(res, rpcId, -31003, 'Транзакция не найдена')
        const tx = txSnap.data()

        if (tx.state === -1 || tx.state === -2) {
          return res.status(200).json({
            id: rpcId,
            result: { transaction: paymeId, cancel_time: tx.cancelTime, state: tx.state },
          })
        }

        const cancelTime = Date.now()
        if (tx.state === 1) {
          await txCol.doc(paymeId).update({ state: -1, cancelTime, reason: params.reason ?? null })
          return res.status(200).json({
            id: rpcId,
            result: { transaction: paymeId, cancel_time: cancelTime, state: -1 },
          })
        }

        // state === 2 → void the payment and roll the balance back
        if (tx.paymentDocId) {
          await db.collection('payments').doc(tx.paymentDocId).update({
            cancelled: true,
            cancelledAt: new Date().toISOString(),
            cancelReason: `Payme cancel (reason ${params.reason ?? '—'})`,
          })
        }
        const stSnap = await db.collection('students').doc(String(tx.studentId)).get()
        if (stSnap.exists) {
          const st = stSnap.data()
          const rolledBack = Math.max(0, (Number(st.balance) || 0) - tx.amount / 100)
          const price = Number(st.totalCoursePrice) || 0
          await db.collection('students').doc(String(tx.studentId)).update({
            balance: rolledBack,
            status: st.status === 'frozen' ? 'frozen' : (price > 0 && rolledBack < price ? 'debtor' : 'active'),
          })
        }
        await txCol.doc(paymeId).update({ state: -2, cancelTime, reason: params.reason ?? null })
        return res.status(200).json({
          id: rpcId,
          result: { transaction: paymeId, cancel_time: cancelTime, state: -2 },
        })
      }

      // ─── Status poll ───
      case 'CheckTransaction': {
        const paymeId = String(params.id || '')
        const txSnap = await txCol.doc(paymeId).get()
        if (!txSnap.exists) return rpcError(res, rpcId, -31003, 'Транзакция не найдена')
        const tx = txSnap.data()
        return res.status(200).json({
          id: rpcId,
          result: {
            create_time: tx.createTime,
            perform_time: tx.performTime || 0,
            cancel_time: tx.cancelTime || 0,
            transaction: tx.paymeId,
            state: tx.state,
            reason: tx.reason ?? null,
          },
        })
      }

      // ─── Reconciliation statement ───
      case 'GetStatement': {
        const from = Number(params.from) || 0
        const to = Number(params.to) || Date.now()
        const snap = await txCol
          .where('tenantId', '==', tenantId)
          .where('createTime', '>=', from)
          .where('createTime', '<=', to)
          .get()
        const transactions = snap.docs.map(d => {
          const tx = d.data()
          return {
            id: tx.paymeId,
            time: tx.createTime,
            amount: tx.amount,
            account: { student_id: tx.studentId },
            create_time: tx.createTime,
            perform_time: tx.performTime || 0,
            cancel_time: tx.cancelTime || 0,
            transaction: tx.paymeId,
            state: tx.state,
            reason: tx.reason ?? null,
          }
        })
        return res.status(200).json({ id: rpcId, result: { transactions } })
      }

      default:
        return rpcError(res, rpcId, -32601, 'Метод не поддерживается')
    }
  } catch (err) {
    console.error('Payme handler error:', err)
    return rpcError(res, rpcId, -32400, 'Внутренняя ошибка')
  }
}
