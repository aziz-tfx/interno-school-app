// Client-side Telegram sales notification
// Reads bot token + chat IDs from localStorage (set via Integrations page)
// Sends directly to Telegram Bot API — no serverless function needed

const BRANCH_CHAT_MAP = {
  tashkent: 'chatTashkent',
  samarkand: 'chatSamarkand',
  fergana: 'chatFergana',
  bukhara: 'chatFergana',
  online: 'chatTashkent',
}

function getConfig() {
  try {
    const raw = localStorage.getItem('interno_tg_config')
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function fmt(n) {
  if (!n || n === 0) return '0'
  return Number(n).toLocaleString('ru-RU').replace(/,/g, ' ')
}

export async function pushSaleToTelegram(saleData) {
  const config = getConfig()
  if (!config || !config.botToken || !config.enabled) {
    console.warn('Telegram: не настроен (Интеграции → Telegram Bot)')
    return { success: false, error: 'Telegram не настроен' }
  }

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
    tariff,
    discount,
    contractNumber,
    debt,
    totalCoursePrice,
    trancheNumber,
    managerName,
    comment,
    learningFormat,
  } = saleData

  // Determine chat ID from branch
  const chatField = BRANCH_CHAT_MAP[branch] || 'chatTashkent'
  const chatId = config[chatField]
  if (!chatId) {
    console.warn(`Telegram: Chat ID не настроен для филиала "${branch}"`)
    return { success: false, error: `Chat ID не настроен для ${branch}` }
  }

  // ─── Build message matching the exact template ───
  const isNewSale = !trancheNumber || trancheNumber <= 1
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

  // Тариф: "Оффлайн Стандарт"
  if (tariff || learningFormat) {
    const parts = [learningFormat, tariff].filter(Boolean).join(' ')
    if (parts) message += `📦 Тариф: ${parts}\n`
  }

  if (phone) message += `📞 Номер телефона: ${phone}\n`

  if (trancheNumber > 1) {
    message += `🔄 Транш №${trancheNumber}\n`
  }

  if (managerName) message += `\n👔 Менеджер: ${managerName}`

  // ─── Send via Telegram Bot API ───
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        disable_web_page_preview: true,
      }),
    })

    const data = await res.json()

    if (!data.ok) {
      console.error('Telegram API error:', data.description)
      return { success: false, error: data.description }
    }

    return { success: true, messageId: data.result?.message_id, chatId }
  } catch (err) {
    console.error('Telegram send failed:', err)
    return { success: false, error: err.message }
  }
}
