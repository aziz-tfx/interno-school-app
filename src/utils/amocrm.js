// amoCRM integration — client-side helper
// Calls our Vercel serverless API which forwards to amoCRM
// Every request is tagged with the current tenantId so the server can
// load the right school's credentials from Firestore.

const API_BASE = '/api/amo'

// Module-level tenantId; AuthContext sets this on login via setApiTenantId()
let _tenantId = ''
export function setApiTenantId(tid) {
  _tenantId = tid || ''
}
function tenantHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    ...(_tenantId ? { 'X-Tenant-Id': _tenantId } : {}),
    ...extra,
  }
}
function withTenant(url) {
  if (!_tenantId) return url
  return url + (url.includes('?') ? '&' : '?') + 'tenantId=' + encodeURIComponent(_tenantId)
}

/**
 * Push a sale (payment) to amoCRM.
 * Creates/updates contact + creates a lead with all details.
 */
export async function pushSaleToAmo(saleData) {
  try {
    const res = await fetch(`${API_BASE}/push-sale`, {
      method: 'POST',
      headers: tenantHeaders(),
      body: JSON.stringify({ ...saleData, tenantId: _tenantId }),
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
    const res = await fetch(withTenant(`${API_BASE}/status`), { headers: tenantHeaders() })
    return await res.json()
  } catch (err) {
    return { connected: false, message: err.message }
  }
}

/**
 * Fetch aggregated manager/ROP effectiveness for a period.
 */
export async function fetchAmoPerformance({ from, to }) {
  try {
    const res = await fetch(withTenant(`${API_BASE}/performance?from=${from}&to=${to}`), {
      headers: tenantHeaders(),
    })
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
 */
export async function fetchAmoPerformanceV2({ month }) {
  try {
    const res = await fetch(withTenant(`${API_BASE}/performance-v2?month=${month}`), {
      headers: tenantHeaders(),
    })
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
 * Время реакции менеджеров на новые заявки.
 */
export async function fetchAmoResponseTimes({ month }) {
  try {
    const res = await fetch(withTenant(`${API_BASE}/response-times?month=${month}`), {
      headers: tenantHeaders(),
    })
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
 * Аналитика звонков из OnlinePBX за период.
 */
export async function fetchOnpbxCalls({ from, to }) {
  try {
    const res = await fetch(withTenant(`/api/onpbx/calls?from=${from}&to=${to}`), {
      headers: tenantHeaders(),
    })
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
 * Refresh amoCRM OAuth token for current tenant.
 */
export async function refreshAmoToken() {
  try {
    const res = await fetch(`${API_BASE}/token-refresh`, {
      method: 'POST',
      headers: tenantHeaders(),
      body: JSON.stringify({ tenantId: _tenantId }),
    })
    return await res.json()
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Status probe for OnlinePBX.
 */
export async function checkOnpbxStatus() {
  try {
    const res = await fetch(withTenant('/api/onpbx/status'), { headers: tenantHeaders() })
    return await res.json()
  } catch (err) {
    return { connected: false, message: err.message }
  }
}
