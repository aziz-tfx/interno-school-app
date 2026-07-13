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
