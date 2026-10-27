// Per-tenant integration credentials for the former Vercel functions, now
// read from this server's tenant_integrations table (the document the
// «Интеграции» page edits). Falls back to env vars for the original school.
//
// Shape:  tenant_integrations[tenantId].data = {
//   telegram: { botToken, chats: { tashkent, samarkand, fergana, bukhara, online }, enabled },
//   amocrm:   { subdomain, accessToken, refreshToken, clientId, clientSecret,
//               redirectUri, pipelineId, statusId, enabled },
//   onpbx:    { domain, apiKey, enabled },
//   payme:    { merchantId, key, enabled },
//   aiAgent:  { openaiKey, model, systemPrompt, knowledge, … , enabled },
// }
//
// Same exports as the Vercel version, so the handlers didn't change.

import { getDb as firestoreDb, setPool } from './firestore.js'
import { mergeDoc } from '../../lib/patch.js'

let pool = null
/** Called once at startup with the server's pg pool. */
export function initTenantConfig(p) {
  pool = p
  setPool(p)
}

/** Firestore-compatible handle over the server's document tables. */
export function getDb() { return firestoreDb() }

/** Extract tenantId from request (body → query → header). The server sets
 *  all three to the signed-in user's school before calling a handler. */
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
export async function loadTenantIntegration(tenantId, key /* telegram|amocrm|onpbx|payme|aiAgent */) {
  if (!tenantId || !pool) return {}
  try {
    const { rows: [row] } = await pool.query('SELECT data FROM tenant_integrations WHERE id = $1', [tenantId])
    return row?.data?.[key] || {}
  } catch (e) {
    console.warn('loadTenantIntegration failed:', e.message)
    return {}
  }
}

/** Merge `patch` into one integration block (e.g. refreshed amo tokens). */
export async function saveTenantIntegration(tenantId, key, patch) {
  if (!tenantId || !pool) return false
  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: [row] } = await client.query('SELECT data FROM tenant_integrations WHERE id = $1 FOR UPDATE', [tenantId])
      const data = mergeDoc(row?.data || { tenantId }, { [key]: patch, updatedAt: new Date().toISOString() })
      await client.query(
        `INSERT INTO tenant_integrations (id, tenant_id, data) VALUES ($1, $1, $2)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`, [tenantId, data])
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
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

// Payme merchant credentials. merchantId is public (it's embedded in every
// checkout link); key is the webhook Basic-auth secret and must never leave
// the server.
export async function resolvePayme(req) {
  const tenantId = getTenantId(req)
  const cfg = await loadTenantIntegration(tenantId, 'payme')
  const useEnv = isDefaultTenant(tenantId)
  return {
    tenantId: tenantId || DEFAULT_TENANT_ID,
    merchantId: cfg.merchantId || envIf(useEnv, process.env.PAYME_MERCHANT_ID),
    key: cfg.key || envIf(useEnv, process.env.PAYME_KEY),
    enabled: cfg.enabled === true || (!!envIf(useEnv, process.env.PAYME_MERCHANT_ID) && cfg.enabled !== false),
  }
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

export async function resolveAiAgent(req) {
  const tenantId = getTenantId(req)
  const cfg = await loadTenantIntegration(tenantId, 'aiAgent')
  const useEnv = isDefaultTenant(tenantId)
  return {
    tenantId,
    openaiKey:         cfg.openaiKey || envIf(useEnv, process.env.OPENAI_API_KEY),
    model:             cfg.model || 'gpt-4o-mini',
    systemPrompt:      cfg.systemPrompt || '',
    knowledge:         cfg.knowledge || '',
    includeCourses:    cfg.includeCourses !== false,
    handoffStatusId:   cfg.handoffStatusId || '',
    handoffTag:        cfg.handoffTag || 'ИИ: нужен менеджер',
    pauseTag:          cfg.pauseTag || 'бот-стоп',
    maxRepliesPerLead: Number(cfg.maxRepliesPerLead) || 30,
    webhookKey:        cfg.webhookKey || '',
    replyFieldId:      cfg.replyFieldId || '',
    contactReplyFieldId: cfg.contactReplyFieldId || '',
    qualifiedStatusId: cfg.qualifiedStatusId || '',
    openLessonStatusId: cfg.openLessonStatusId || '',
    openLessonFrom:    cfg.openLessonFrom || '10:00',
    openLessonTo:      cfg.openLessonTo || '20:00',
    salesbotId:        cfg.salesbotId || '',
    replyInstagram:    cfg.replyInstagram !== false,
    replyComments:     cfg.replyComments !== false,
    replyTelegram:     cfg.replyTelegram !== false,
    // legacy: onlyInstagram=false meant «answer in every channel»
    replyOtherChannels: cfg.replyOtherChannels ?? (cfg.onlyInstagram === false),
    testMode:          cfg.testMode !== false,
    testTag:           cfg.testTag || 'ии-тест',
    followUpEnabled:   cfg.followUpEnabled !== false,
    followUpHours:     cfg.followUpHours ?? '2, 20',
    notifyChatId:      cfg.notifyChatId || '',
    notifyHandoff:     cfg.notifyHandoff !== false,
    notifyErrors:      cfg.notifyErrors !== false,
    enabled: cfg.enabled === true,
  }
}
