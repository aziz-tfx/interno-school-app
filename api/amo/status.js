// Vercel Serverless Function — check amoCRM connection status
// GET /api/amo/status

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { AMO_SUBDOMAIN, AMO_ACCESS_TOKEN } = process.env

  if (!AMO_SUBDOMAIN || !AMO_ACCESS_TOKEN) {
    return res.status(200).json({
      connected: false,
      message: 'amoCRM не настроен. Добавьте AMO_SUBDOMAIN и AMO_ACCESS_TOKEN в Vercel.',
    })
  }

  try {
    const accountRes = await fetch(`https://${AMO_SUBDOMAIN}.amocrm.ru/api/v4/account`, {
      headers: { 'Authorization': `Bearer ${AMO_ACCESS_TOKEN}` },
    })

    if (!accountRes.ok) {
      return res.status(200).json({
        connected: false,
        message: 'Токен amoCRM невалиден или истёк. Обновите AMO_ACCESS_TOKEN.',
      })
    }

    const account = await accountRes.json()

    return res.status(200).json({
      connected: true,
      account: account.name,
      subdomain: AMO_SUBDOMAIN,
      message: `Подключено к ${account.name}`,
    })

  } catch (err) {
    return res.status(200).json({
      connected: false,
      message: `Ошибка подключения: ${err.message}`,
    })
  }
}
