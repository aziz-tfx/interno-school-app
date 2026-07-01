// Shared helper for Vercel serverless functions.
// Loads per-tenant integration credentials from Firestore.
// Falls back to global env vars if the tenant hasn't configured their own.
//
// Firestore shape:  tenantIntegrations/{tenantId} = {
//   telegram: { botToken, chats: { tashkent, samarkand, fergana, bukhara, online }, enabled },
//   amocrm:   { subdomain, accessToken, refreshToken, clientId, clientSecret,
//               redirectUri, pipelineId, statusId, enabled },
//   onpbx:    { domain, apiKey, enabled },
// }
//
// Required env var for Firestore access:  FIREBASE_SERVICE_ACCOUNT_KEY (JSON string)
// If absent, Firestore lookup is skipped and env-var fallback is used.

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

let _db = null

function getDb() {
  if (_db) return _db
  if (!getApps().length) {
    const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    if (!key) return null
    try {
      const sa = typeof key === 'string' ? JSON.parse(key) : key
      initializeApp({ credential: cert(sa) })
    } catch (e) {
      console.warn('firebase-admin init failed:', e.message)
      return null
    }
  }
  _db = getFirestore()
  return _db
}

/** Extract tenantId from request (body → query → header). */
export function getTenantId(req) {
  return (
    req?.body?.tenantId ||
    req?.query?.tenantId ||
    req?.headers?.['x-tenant-id'] ||
    req?.headers?.['X-Tenant-Id'] ||
    ''
  ).toString().trim()
}

// ─── In-memory TTL cache for tenantIntegrations ──────────────────────────
// Vercel serverless functions keep module state across warm invocations,
// so caching here means the same warm instance doesn't re-read Firestore
// on every request. Big deal for cron jobs and amoCRM sync that fire
// every few minutes for the same tenant.
//
// TTL is short enough that config edits in the UI take effect quickly.
const INTEGRATION_TTL_MS = 60 * 1000 // 60 seconds
const _integrationCache = new Map() // tenantId → { data, expiresAt }

function readCache(tenantId) {
  const entry = _integrationCache.get(tenantId)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    _integrationCache.delete(tenantId)
    return null
  }
  return entry.data
}

function writeCache(tenantId, data) {
  _integrationCache.set(tenantId, { data, expiresAt: Date.now() + INTEGRATION_TTL_MS })
}

/** Invalidate the cache — call after saveTenantIntegration so the next
 *  read picks up the fresh value. */
function invalidateCache(tenantId) {
  if (tenantId) _integrationCache.delete(tenantId)
}

/** Load one integration block for a tenant. Returns {} if nothing found.
 *  Cached in-memory for INTEGRATION_TTL_MS to reduce Firestore reads. */
export async function loadTenantIntegration(tenantId, key /* telegram|amocrm|onpbx */) {
  if (!tenantId) return {}
  // Cache holds the WHOLE tenantIntegrations doc; slice out the requested key.
  const cached = readCache(tenantId)
  if (cached) return cached[key] || {}
  const db = getDb()
  if (!db) return {}
  try {
    const snap = await db.collection('tenantIntegrations').doc(tenantId).get()
    const data = snap.exists ? (snap.data() || {}) : {}
    writeCache(tenantId, data)
    return data[key] || {}
  } catch (e) {
    console.warn('loadTenantIntegration failed:', e.message)
    return {}
  }
}

/** Persist refreshed tokens back to Firestore so future requests use them.
 *  Invalidates the in-memory cache so the next read picks up the new value. */
export async function saveTenantIntegration(tenantId, key, patch) {
  if (!tenantId) return false
  const db = getDb()
  if (!db) return false
  try {
    await db.collection('tenantIntegrations').doc(tenantId).set(
      { [key]: patch, updatedAt: new Date().toISOString() },
      { merge: true }
    )
    invalidateCache(tenantId)
    return true
  } catch (e) {
    console.warn('saveTenantIntegration failed:', e.message)
    return false
  }
}

// ─── Credential resolvers ───
// Env-var fallback is SCOPED to the original INTERNO tenant ('default').
// Other tenants MUST configure their own integrations; otherwise empty config
// is returned and the endpoint will respond with "not configured for this tenant".
// This prevents cross-tenant data leakage via the global env vars.

const DEFAULT_TENANT_ID = 'default'
const isDefaultTenant = (tid) => !tid || tid === DEFAULT_TENANT_ID

function envIf(defaultTenant, value) {
  return defaultTenant ? (value || '') : ''
}

export async function resolveTelegram(req) {
  const tenantId = getTenantId(req)
  const cfg = await loadTenantIntegration(tenantId, 'telegram')
  const chats = cfg.chats || {}
  const useEnv = isDefaultTenant(tenantId)
  return {
    tenantId,
    source: cfg.botToken ? 'tenant' : (useEnv ? 'env' : 'none'),
    botToken: cfg.botToken || envIf(useEnv, process.env.TG_BOT_TOKEN),
    chats: {
      tashkent:  chats.tashkent  || envIf(useEnv, process.env.TG_CHAT_TASHKENT),
      samarkand: chats.samarkand || envIf(useEnv, process.env.TG_CHAT_SAMARKAND),
      fergana:   chats.fergana   || envIf(useEnv, process.env.TG_CHAT_FERGANA),
      bukhara:   chats.bukhara   || envIf(useEnv, process.env.TG_CHAT_FERGANA),
      online:    chats.online    || chats.tashkent || envIf(useEnv, process.env.TG_CHAT_TASHKENT),
    },
    enabled: cfg.enabled !== false,
  }
}

export async function resolveAmo(req) {
  const tenantId = getTenantId(req)
  const cfg = await loadTenantIntegration(tenantId, 'amocrm')
  const useEnv = isDefaultTenant(tenantId)
  return {
    tenantId,
    source: cfg.accessToken ? 'tenant' : (useEnv ? 'env' : 'none'),
    subdomain:    cfg.subdomain    || envIf(useEnv, process.env.AMO_SUBDOMAIN),
    accessToken:  cfg.accessToken  || envIf(useEnv, process.env.AMO_ACCESS_TOKEN),
    refreshToken: cfg.refreshToken || envIf(useEnv, process.env.AMO_REFRESH_TOKEN),
    clientId:     cfg.clientId     || envIf(useEnv, process.env.AMO_CLIENT_ID),
    clientSecret: cfg.clientSecret || envIf(useEnv, process.env.AMO_CLIENT_SECRET),
    redirectUri:  cfg.redirectUri  || envIf(useEnv, process.env.AMO_REDIRECT_URI),
    pipelineId:   cfg.pipelineId   || envIf(useEnv, process.env.AMO_PIPELINE_ID),
    statusId:     cfg.statusId     || envIf(useEnv, process.env.AMO_STATUS_ID),
    enabled: cfg.enabled !== false,
  }
}

function sanitizeOnpbxDomain(raw) {
  if (!raw) return ''
  let v = String(raw).trim()
  v = v.replace(/^https?:\/\//i, '').replace(/^\/+|\/+$/g, '').replace(/,+$/g, '')
  return v
}

export async function resolveOnpbx(req) {
  const tenantId = getTenantId(req)
  const cfg = await loadTenantIntegration(tenantId, 'onpbx')
  const useEnv = isDefaultTenant(tenantId)
  return {
    tenantId,
    source: (cfg.domain || cfg.apiKey) ? 'tenant' : (useEnv ? 'env' : 'none'),
    domain: sanitizeOnpbxDomain(cfg.domain || envIf(useEnv, process.env.ONPBX_DOMAIN)),
    apiKey: cfg.apiKey || envIf(useEnv, process.env.ONPBX_API_KEY),
    enabled: cfg.enabled !== false,
  }
}
