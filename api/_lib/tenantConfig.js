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

/** Load one integration block for a tenant. Returns {} if nothing found. */
export async function loadTenantIntegration(tenantId, key /* telegram|amocrm|onpbx */) {
  if (!tenantId) return {}
  const db = getDb()
  if (!db) return {}
  try {
    const snap = await db.collection('tenantIntegrations').doc(tenantId).get()
    if (!snap.exists) return {}
    const data = snap.data() || {}
    return data[key] || {}
  } catch (e) {
    console.warn('loadTenantIntegration failed:', e.message)
    return {}
  }
}

/** Persist refreshed tokens back to Firestore so future requests use them. */
export async function saveTenantIntegration(tenantId, key, patch) {
  if (!tenantId) return false
  const db = getDb()
  if (!db) return false
  try {
    await db.collection('tenantIntegrations').doc(tenantId).set(
      { [key]: patch, updatedAt: new Date().toISOString() },
      { merge: true }
    )
    return true
  } catch (e) {
    console.warn('saveTenantIntegration failed:', e.message)
    return false
  }
}

// ─── Credential resolvers with env-var fallback ───

export async function resolveTelegram(req) {
  const tenantId = getTenantId(req)
  const cfg = await loadTenantIntegration(tenantId, 'telegram')
  const chats = cfg.chats || {}
  return {
    tenantId,
    source: cfg.botToken ? 'tenant' : 'env',
    botToken: cfg.botToken || process.env.TG_BOT_TOKEN || '',
    chats: {
      tashkent:  chats.tashkent  || process.env.TG_CHAT_TASHKENT  || '',
      samarkand: chats.samarkand || process.env.TG_CHAT_SAMARKAND || '',
      fergana:   chats.fergana   || process.env.TG_CHAT_FERGANA   || '',
      bukhara:   chats.bukhara   || process.env.TG_CHAT_FERGANA   || '',
      online:    chats.online    || chats.tashkent || process.env.TG_CHAT_TASHKENT || '',
    },
    enabled: cfg.enabled !== false,
  }
}

export async function resolveAmo(req) {
  const tenantId = getTenantId(req)
  const cfg = await loadTenantIntegration(tenantId, 'amocrm')
  return {
    tenantId,
    source: cfg.accessToken ? 'tenant' : 'env',
    subdomain:    cfg.subdomain    || process.env.AMO_SUBDOMAIN    || '',
    accessToken:  cfg.accessToken  || process.env.AMO_ACCESS_TOKEN || '',
    refreshToken: cfg.refreshToken || process.env.AMO_REFRESH_TOKEN || '',
    clientId:     cfg.clientId     || process.env.AMO_CLIENT_ID     || '',
    clientSecret: cfg.clientSecret || process.env.AMO_CLIENT_SECRET || '',
    redirectUri:  cfg.redirectUri  || process.env.AMO_REDIRECT_URI  || '',
    pipelineId:   cfg.pipelineId   || process.env.AMO_PIPELINE_ID   || '',
    statusId:     cfg.statusId     || process.env.AMO_STATUS_ID     || '',
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
  const domain = sanitizeOnpbxDomain(cfg.domain || process.env.ONPBX_DOMAIN || '')
  return {
    tenantId,
    source: cfg.domain || cfg.apiKey ? 'tenant' : 'env',
    domain,
    apiKey: cfg.apiKey || process.env.ONPBX_API_KEY || '',
    enabled: cfg.enabled !== false,
  }
}
