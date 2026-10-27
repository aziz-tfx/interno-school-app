// amoCRM integration — client-side helper
// Calls our server API (/api/amo/*, /api/onpbx/*), which forwards to amoCRM /
// OnlinePBX with the school's credentials from its integration settings.

import { apiFetch } from '../backend/api'

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
    const res = await apiFetch(`${API_BASE}/push-sale`, {
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
    const res = await apiFetch(withTenant(`${API_BASE}/status`), { headers: tenantHeaders() })
    return await res.json()
  } catch (err) {
    return { connected: false, message: err.message }
  }
}

/**
 * Fetch amoCRM call counts per user for a period (incoming + outgoing).
 * Returns { byUser: { [uid]: { in, out, total } }, totals }.
 */
export async function fetchAmoCalls({ from, to }) {
  try {
    const res = await apiFetch(withTenant(`${API_BASE}/calls?from=${from}&to=${to}`), {
      headers: tenantHeaders(),
    })
    const data = await res.json()
    if (!res.ok) return { success: false, error: data.error || 'Unknown error', byUser: {} }
    return { success: true, ...data }
  } catch (err) {
    return { success: false, error: err.message, byUser: {} }
  }
}

/**
 * Fetch amoCRM users (id, name, email). Used by the employee form so admins
 * can pick a user from a dropdown instead of typing the numeric id.
 */
export async function fetchAmoUsers() {
  try {
    const res = await apiFetch(withTenant(`${API_BASE}/users`), { headers: tenantHeaders() })
    const data = await res.json()
    if (!res.ok) return { success: false, error: data.error || 'Unknown error', users: [] }
    return { success: true, users: data.users || [] }
  } catch (err) {
    return { success: false, error: err.message, users: [] }
  }
}

/**
 * Fetch aggregated manager/ROP effectiveness for a period.
 */
export async function fetchAmoPerformance({ from, to }) {
  try {
    const month = (from || '').slice(0, 7) || new Date().toISOString().slice(0, 7)
    const res = await apiFetch(withTenant(`${API_BASE}/performance-v2?month=${month}`), {
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
    const res = await apiFetch(withTenant(`${API_BASE}/performance-v2?month=${month}`), {
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
    const res = await apiFetch(withTenant(`${API_BASE}/response-times?month=${month}`), {
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
    const res = await apiFetch(withTenant(`/api/onpbx/calls?from=${from}&to=${to}`), {
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
// With `code` (authorization code of a new external integration) the server
// exchanges it for the first token pair instead of refreshing.
export async function refreshAmoToken(code) {
  try {
    const res = await apiFetch(`${API_BASE}/token-refresh`, {
      method: 'POST',
      headers: tenantHeaders(),
      body: JSON.stringify({ tenantId: _tenantId, ...(code ? { code } : {}) }),
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
    const res = await apiFetch(withTenant('/api/onpbx/calls?status=1'), { headers: tenantHeaders() })
    return await res.json()
  } catch (err) {
    return { connected: false, message: err.message }
  }
}
