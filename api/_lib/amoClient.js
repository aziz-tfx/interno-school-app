// Shared amoCRM auth helpers for the serverless functions.
//
// amoCRM OAuth access tokens live ~24h. Nothing refreshes them automatically,
// so any endpoint that uses a stale token gets 401 and fails. These helpers let
// an endpoint verify the token and refresh it once (using the tenant's stored
// OAuth credentials), persisting the fresh pair back to Firestore.

import { saveTenantIntegration } from './tenantConfig.js'

/**
 * Exchange the stored refresh_token for a fresh access/refresh pair and persist
 * it. Returns the amoCRM token response ({ access_token, refresh_token,
 * expires_in, persisted }) or null if refresh isn't possible / failed.
 *
 * @param {object} amo       resolved amo config (from resolveAmo)
 * @param {string} tenantId  tenant to persist the new tokens under
 */
export async function refreshAmoToken(amo, tenantId) {
  const { subdomain, clientId, clientSecret, redirectUri, refreshToken } = amo
  if (!subdomain || !clientId || !clientSecret || !refreshToken) return null

  try {
    const res = await fetch(`https://${subdomain}.amocrm.ru/oauth2/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        redirect_uri: redirectUri || `https://${subdomain}.amocrm.ru`,
      }),
    })

    if (!res.ok) {
      console.error('amo token refresh failed:', res.status, await res.text())
      return null
    }

    const tokens = await res.json()
    const persisted = await saveTenantIntegration(tenantId, 'amocrm', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenRefreshedAt: new Date().toISOString(),
    })
    return { ...tokens, persisted }
  } catch (err) {
    console.error('amo token refresh error:', err.message)
    return null
  }
}

/**
 * Return a valid amoCRM access token for the tenant: pings /account with the
 * current token and, only if it comes back 401, refreshes once. On any other
 * outcome (including network errors) the current token is returned unchanged,
 * so this never makes things worse.
 *
 * @param {object} amo       resolved amo config (from resolveAmo)
 * @param {string} tenantId  tenant id (for persisting a refreshed token)
 * @returns {Promise<string>} a (possibly refreshed) access token
 */
export async function ensureAmoToken(amo, tenantId) {
  if (!amo.subdomain || !amo.accessToken) return amo.accessToken

  try {
    const ping = await fetch(`https://${amo.subdomain}.amocrm.ru/api/v4/account`, {
      headers: { Authorization: `Bearer ${amo.accessToken}` },
    })
    if (ping.status !== 401) return amo.accessToken
  } catch {
    // Network hiccup on the ping — keep the existing token, don't force a refresh.
    return amo.accessToken
  }

  const refreshed = await refreshAmoToken(amo, tenantId)
  return (refreshed && refreshed.access_token) || amo.accessToken
}

/**
 * Minimal amoCRM REST client for jobs that run without a user (e.g. the AI
 * agent): on a 401 it refreshes the token once via refreshAmoToken and retries.
 * Accepts a path ("/api/v4/…") or a full amo URL (e.g. Salesbot return_url).
 *
 * @param {object} amo  resolved amo config (from resolveAmo, includes tenantId)
 */
export function createAmoClient(amo) {
  const state = { ...amo }
  const base = `https://${amo.subdomain}.amocrm.ru`

  async function request(method, pathOrUrl, body) {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${base}${pathOrUrl}`
    const doFetch = () => fetch(url, {
      method,
      headers: { Authorization: `Bearer ${state.accessToken}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    let r = await doFetch()
    if (r.status === 401) {
      const refreshed = await refreshAmoToken(state, amo.tenantId)
      if (refreshed?.access_token) {
        state.accessToken = refreshed.access_token
        state.refreshToken = refreshed.refresh_token
        r = await doFetch()
      }
    }
    if (r.status === 204) return null
    const text = await r.text()
    if (!r.ok) throw new Error(`amoCRM ${method} ${url} → ${r.status}: ${text.slice(0, 300)}`)
    return text ? JSON.parse(text) : null
  }

  return {
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b),
    patch: (p, b) => request('PATCH', p, b),
    request,
  }
}
