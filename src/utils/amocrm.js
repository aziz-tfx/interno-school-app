// amoCRM integration — client-side helper
// Calls our Vercel serverless API which forwards to amoCRM

const API_BASE = '/api/amo'

/**
 * Push a sale (payment) to amoCRM.
 * Creates/updates contact + creates a lead with all details.
 */
export async function pushSaleToAmo(saleData) {
  try {
    const res = await fetch(`${API_BASE}/push-sale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saleData),
    })

    const data = await res.json()

    if (!res.ok) {
      console.warn('amoCRM push failed:', data)
      return { success: false, error: data.error || 'Unknown error' }
    }

    return { success: true, contactId: data.contactId, leadId: data.leadId }
  } catch (err) {
    // Don't throw — amoCRM failure shouldn't block the sale
    console.warn('amoCRM push error (non-blocking):', err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Check amoCRM connection status.
 */
export async function checkAmoStatus() {
  try {
    const res = await fetch(`${API_BASE}/status`)
    return await res.json()
  } catch (err) {
    return { connected: false, message: err.message }
  }
}

/**
 * Fetch aggregated manager/ROP effectiveness for a period.
 * @param {{ from: string, to: string }} params — YYYY-MM-DD dates
 */
export async function fetchAmoPerformance({ from, to }) {
  try {
    const res = await fetch(`${API_BASE}/performance?from=${from}&to=${to}`)
    const data = await res.json()
    if (!res.ok) {
      return { success: false, error: data.error || 'Unknown error', details: data.details }
    }
    return { success: true, ...data }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * V2: Детальная аналитика по этапам воронки + дневная разбивка.
 * @param {{ month: string }} params — 'YYYY-MM'
 */
export async function fetchAmoPerformanceV2({ month }) {
  try {
    const res = await fetch(`${API_BASE}/performance-v2?month=${month}`)
    const data = await res.json()
    if (!res.ok) {
      return { success: false, error: data.error || 'Unknown error', details: data.details }
    }
    return { success: true, ...data }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
