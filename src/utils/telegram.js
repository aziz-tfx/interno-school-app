// Client-side helper to push sale notifications to Telegram via serverless API

export async function pushSaleToTelegram(saleData) {
  try {
    const res = await fetch('/api/telegram/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saleData),
    })
    const data = await res.json()
    return data
  } catch (err) {
    console.warn('Telegram notification failed:', err.message)
    return { success: false, error: err.message }
  }
}
