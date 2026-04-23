// Telegram sales notification
// Server-side API (/api/telegram/notify) loads per-tenant credentials from
// Firestore based on tenantId attached to each request.

// Module-level tenant — set by AuthContext after login
let _tenantId = ''
export function setApiTenantId(tid) {
  _tenantId = tid || ''
}

function fmt(n) {
  if (!n || n === 0) return '0'
  return Number(n).toLocaleString('ru-RU').replace(/,/g, ' ')
}

function buildMessage(saleData) {
  const {
    clientName, phone, course, group, amount, method, date,
    courseStartDate, tariff, discount, contractNumber, debt,
    totalCoursePrice, trancheNumber, managerName, salesFact, comment, learningFormat,
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
  if (salesFact) message += `\n📈 ${salesFact}`

  return message
}

export async function pushSaleToTelegram(saleData) {
  try {
    const res = await fetch('/api/telegram/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(_tenantId ? { 'X-Tenant-Id': _tenantId } : {}),
      },
      body: JSON.stringify({ ...saleData, tenantId: _tenantId }),
    })
    const data = await res.json()
    if (data.success) {
      return { success: true, messageId: data.messageId, chatId: data.chatId, via: 'server' }
    }
    console.warn('Telegram notify failed:', data.error)
    return { success: false, error: data.error || 'Unknown error' }
  } catch (err) {
    console.error('Telegram notify error:', err)
    return { success: false, error: err.message }
  }
}

// Kept exported for potential future debug usage
export { buildMessage }
