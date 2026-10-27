// OnlinePBX in the CRM:
//
//   POST /api/crm/calls/sync                 pull new calls now (managers; the server
//                                            also does it every 5 minutes)
//   GET  /api/crm/activities/:id/record      { url } of a call's recording, asked from
//                                            OnlinePBX when the call is played

import { forbidden, notFound, badRequest } from '../../lib/errors.js'
import { CRM_ROLES, CRM_MANAGER_ROLES } from '../../crm/service.js'
import { isUuid } from '../../crm/leadQuery.js'
import { syncCalls } from '../../crm/telephony.js'
import { resolveOnpbx, loadTenantIntegration } from '../../vercel/_lib/tenantConfig.js'
import { fetchHistory, authenticate, postForm, API_BASE } from '../../vercel/onpbx/calls.js'

/** Sync calls for one school; null when OnlinePBX isn't set up there. */
export async function syncTenantCalls(pool, tenantId) {
  const cfg = await resolveOnpbx({ query: { tenantId } })
  if (!cfg.domain || !cfg.apiKey || cfg.domain.startsWith('api.')) return null
  const { autoLeads } = await loadTenantIntegration(tenantId, 'onpbx')
  // one sync per school at a time (timer + "sync now" button)
  const client = await pool.connect()
  try {
    const { rows: [{ ok }] } = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [`onpbx-sync:${tenantId}`])
    if (!ok) return { busy: true }
    try {
      return await syncCalls(pool, tenantId, { cfg, autoLeads: autoLeads === true, fetchHistory })
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`onpbx-sync:${tenantId}`])
    }
  } finally {
    client.release()
  }
}

/** Every school that may have OnlinePBX: the ones with a tenants row, plus the original one. */
export async function syncAllCalls(pool, log) {
  const { rows } = await pool.query(`SELECT id FROM tenants WHERE coalesce(data->>'status', 'active') = 'active'`)
  const ids = [...new Set([...rows.map(r => r.id), 'default'])]
  for (const id of ids) {
    try {
      const stats = await syncTenantCalls(pool, id)
      if (stats?.stored || stats?.leadsCreated) log.info({ tenantId: id, stats }, 'onlinepbx calls synced')
    } catch (err) {
      log.warn({ tenantId: id, err: err.message }, 'onlinepbx sync failed')
    }
  }
}

export default async function crmTelephonyRoutes(app, { pool }) {
  const guard = (roles, message) => ({
    preHandler: [app.authenticate, async (req) => { if (!roles.has(req.user.role)) throw forbidden(message) }],
  })

  app.post('/api/crm/calls/sync', guard(CRM_MANAGER_ROLES, 'Это может руководитель'), async (req) => {
    const stats = await syncTenantCalls(pool, req.user.tenantId)
    if (!stats) throw badRequest('OnlinePBX не настроен: заполните домен и ключ в «Интеграциях»')
    return stats
  })

  // The recording lives in OnlinePBX; it is looked up by the call's uuid.
  app.get('/api/crm/activities/:id/record', guard(CRM_ROLES, 'Нет доступа к CRM'), async (req) => {
    if (!isUuid(req.params.id)) throw notFound()
    const { rows: [a] } = await pool.query(
      `SELECT meta FROM crm_activities WHERE id = $1 AND tenant_id = $2 AND type = 'call'`, [req.params.id, req.user.tenantId]
    )
    if (!a) throw notFound('Звонок не найден')
    if (a.meta?.link) return { url: a.meta.link } // amo-imported calls carry the link
    if (!a.meta?.uuid) throw notFound('У звонка нет записи')
    const cfg = await resolveOnpbx({ query: { tenantId: req.user.tenantId } })
    if (!cfg.domain || !cfg.apiKey) throw badRequest('OnlinePBX не настроен')
    const { keyId, key } = await authenticate(cfg.domain, cfg.apiKey)
    const resp = await postForm(`${API_BASE}/${cfg.domain}/mongo_history/search.json`,
      { 'x-pbx-authentication': `${keyId}:${key}` }, { uuid: a.meta.uuid, download: 1 })
    // download=1 answers with a link to the recording
    const url = typeof resp?.data === 'string' ? resp.data
      : resp?.data?.url || resp?.data?.[0]?.url || resp?.data?.[0]?.download_url || null
    if (!url || !/^https?:\/\//.test(url)) {
      req.log.warn({ keys: Object.keys(resp || {}), dataType: typeof resp?.data }, 'onlinepbx record: unexpected answer')
      throw notFound('Запись недоступна')
    }
    return { url }
  })
}
