// Telegram sales notification
// 1) Tries server-side API (/api/telegram/notify) which uses Vercel env vars
// 2) Falls back to client-side localStorage config if server returns error

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

function buildMessage(saleData) {
  const {
    clientName, phone, course, group, amount, method, date,
    courseStartDate, tariff, discount, contractNumber, debt,
    totalCoursePrice, trancheNumber, managerName, managerFunFact, comment, learningFormat,
    contractUrl,
  } = saleData

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

  if (tariff || learningFormat) {
    const parts = [learningFormat, tariff].filter(Boolean).join(' ')
    if (parts) message += `📦 Тариф: ${parts}\n`
  }

  if (phone) message += `📞 Номер телефона: ${phone}\n`

  if (trancheNumber > 1) {
    message += `🔄 Транш №${trancheNumber}\n`
  }

  if (contractUrl) message += `📄 Договор: ${contractUrl}\n`

  if (managerName) message += `\n👔 Менеджер: ${managerName}`
  if (managerFunFact) message += `\n💡 Факт: ${managerFunFact}`

  return message
}

// Try server-side endpoint first (uses Vercel env vars)
async function tryServerSide(saleData) {
  try {
    const res = await fetch('/api/telegram/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saleData),
    })

    const data = await res.json()

    if (data.success) {
      return { success: true, messageId: data.messageId, chatId: data.chatId, via: 'server' }
    }

    // Server responded but with error — return it so we can try client-side
    return { success: false, error: data.error }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// Fallback: send directly from client via localStorage config
async function tryClientSide(saleData) {
  const config = getConfig()
  if (!config || !config.botToken || !config.enabled) {
    return { success: false, error: 'Telegram не настроен (ни сервер, ни локально)' }
  }

  const chatField = BRANCH_CHAT_MAP[saleData.branch] || 'chatTashkent'
  const chatId = config[chatField]
  if (!chatId) {
    return { success: false, error: `Chat ID не настроен для ${saleData.branch}` }
  }

  const message = buildMessage(saleData)

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
      return { success: false, error: data.description }
    }

    return { success: true, messageId: data.result?.message_id, chatId, via: 'client' }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export async function pushSaleToTelegram(saleData) {
  // 1) Try server-side (Vercel env vars)
  const serverResult = await tryServerSide(saleData)
  if (serverResult.success) {
    console.log('Telegram: отправлено через сервер', serverResult)
    return serverResult
  }

  console.warn('Telegram: сервер не сработал:', serverResult.error, '→ пробуем клиент')

  // 2) Fallback to client-side (localStorage)
  const clientResult = await tryClientSide(saleData)
  if (clientResult.success) {
    console.log('Telegram: отправлено через клиент (localStorage)', clientResult)
  } else {
    console.error('Telegram: не удалось отправить ни через сервер, ни через клиент:', clientResult.error)
  }

  return clientResult
}
