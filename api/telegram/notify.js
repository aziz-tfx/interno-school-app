// Vercel Serverless Function — Telegram Sales Notification
// POST /api/telegram/notify
// Sends sale/payment notification to branch-specific Telegram group

import { resolveTelegram } from '../_lib/tenantConfig.js'

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    clientName,
    phone,
    course,
    group,
    amount,
    method,
    date,
    courseStartDate,
    branch,
    branchKey,
    tariff,
    discount,
    contractNumber,
    debt,
    totalCoursePrice,
    trancheNumber,
    managerName,
    salesFact,
    comment,
    learningFormat,
    contractUrl,
  } = req.body

  if (!clientName || !amount) {
    return res.status(400).json({ error: 'clientName and amount are required' })
  }

  // ─── Per-tenant bot token + chat mapping ───
  const tg = await resolveTelegram(req)
  if (!tg.enabled) {
    return res.status(400).json({ error: 'Telegram integration is disabled for this tenant' })
  }
  const botToken = tg.botToken
  if (!botToken) {
    return res.status(500).json({ error: 'Telegram bot token not configured for this tenant' })
  }
  // Resolve the chat id with priority:
  //   1. branchKey — canonical slug derived client-side from the branch
  //      object (works for new tenants whose branch ids are random)
  //   2. branch — legacy path: when branch already equals one of the
  //      canonical slugs (INTERNO seed data) it matches directly
  //   3. tashkent fallback so we never hard-fail
  const chatId = (branchKey && tg.chats[branchKey]) || tg.chats[branch] || tg.chats.tashkent
  if (!chatId) {
    return res.status(400).json({ error: `No Telegram chat configured for branch: ${branchKey || branch}` })
  }

  // ─── Format amount with spaces (3 000 000) ───
  const fmt = (n) => {
    if (!n || n === 0) return '0'
    return Number(n).toLocaleString('ru-RU').replace(/,/g, ' ')
  }

  // ─── Build message ───
  const isNewSale = trancheNumber <= 1
  const tag = isNewSale ? '#Оплата' : '#Доплата'

  let message = `${tag}\n`
  message += `📅 Дата оплаты: ${date || new Date().toISOString().split('T')[0]}\n`
  if (courseStartDate) message += `🎓 Старт курса: ${courseStartDate}\n`
  message += `👤 Имя Клиента: ${clientName}\n`
  if (course) message += `📚 Курс: ${course}\n`
  if (group) message += `👥 Группа: ${group}\n`
  message += `💳 Вид оплаты: ${method || 'Не указан'}\n`
  message += `💰 Сумма: ${fmt(amount)} сум\n`

  if (totalCoursePrice) {
    message += `📋 Стоимость курса: ${fmt(totalCoursePrice)} сум\n`
  }

  if (debt !== undefined && debt !== null) {
    message += `📊 Долг: ${fmt(debt)} сум\n`
  }

  if (contractNumber) message += `📝 Номер договора: ${contractNumber}\n`

  if (tariff || learningFormat) {
    const parts = [learningFormat, tariff].filter(Boolean).join(' ')
    if (parts) message += `📦 Тариф: ${parts}\n`
  }

  if (discount) message += `🏷 Скидка: ${discount}\n`

  if (comment) message += `💬 Комментарий: ${comment}\n`
  if (phone) message += `📞 Номер телефона: ${phone}\n`

  if (trancheNumber > 1) {
    message += `🔄 Транш №${trancheNumber}\n`
  }

  if (contractUrl) message += `📄 Договор: ${contractUrl}\n`

  if (managerName) message += `\n👔 Менеджер: ${managerName}`
  if (salesFact) message += `\n📈 ${salesFact}`

  // ─── Send via Telegram Bot API ───
  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        disable_web_page_preview: true,
      }),
    })

    const tgData = await tgRes.json()

    if (!tgData.ok) {
      console.error('Telegram API error:', tgData)
      return res.status(500).json({ success: false, error: tgData.description })
    }

    return res.status(200).json({
      success: true,
      messageId: tgData.result?.message_id,
      chatId,
    })
  } catch (err) {
    console.error('Telegram send failed:', err)
    return res.status(500).json({ success: false, error: err.message })
  }
}
