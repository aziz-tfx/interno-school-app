// Calls from OnlinePBX into the CRM timeline (what amo's telephony widget
// did). Every few minutes the new part of the call history is fetched and
// each call to or from a known client lands in that client's deal:
//
//   client number      incoming → caller_id_number, outgoing → destination_number
//   deal               the contact's newest open deal, else their newest deal
//   manager            employee whose «Добавочный OnlinePBX» (data.pbxExt) is the extension
//   unknown number     an incoming call creates a deal in «Неразобранное» when the
//                      school turned that on (tenant_integrations.onpbx.autoLeads)
//
// Each call is stored once (amo_key 'onpbx:<uuid>'), so overlapping windows
// and re-runs are harmless.

import { tx } from '../db.js'
import { normalizePhone } from '../lib/phone.js'
import { addActivity, createLead } from './service.js'
import { classifyCall } from '../vercel/onpbx/calls.js'

const OVERLAP_SEC = 10 * 60
const FIRST_WINDOW_SEC = 24 * 3600

/** Client's phone of a call, normalised; null for internal calls. */
export function clientNumber(call, type) {
  const raw = type === 'incoming' ? call.caller_id_number : type === 'outgoing' ? call.destination_number : null
  const digits = String(raw || '').replace(/\D/g, '')
  return digits.length >= 9 ? normalizePhone(digits) : null
}

const callKey = (call, phone, ext) => `onpbx:${call.uuid || `${call.start_stamp}:${phone}:${ext}`}`

/**
 * Store a batch of raw OnlinePBX calls for one school.
 * @returns {{ calls, stored, skipped, leadsCreated }}
 */
export async function storeCalls(pool, tenantId, calls, { autoLeads = false } = {}) {
  const stats = { calls: calls.length, stored: 0, skipped: 0, leadsCreated: 0 }
  const { rows: emps } = await pool.query(
    `SELECT id, data->>'pbxExt' AS ext FROM employees WHERE tenant_id = $1 AND coalesce(data->>'pbxExt', '') <> ''`, [tenantId]
  )
  const byExt = Object.fromEntries(emps.map(e => [String(e.ext).trim(), e.id]))

  for (const call of calls) {
    const c = classifyCall(call)
    const phone = clientNumber(call, c.type)
    if (!phone) { stats.skipped++; continue }
    const key = callKey(call, phone, c.ext)
    const startedAt = call.start_stamp ? new Date(Number(call.start_stamp) * 1000) : new Date()

    await tx(pool, async (db) => {
      const { rows: [seen] } = await db.query('SELECT 1 FROM crm_activities WHERE tenant_id = $1 AND amo_key = $2', [tenantId, key])
      if (seen) { stats.skipped++; return }

      const { rows: [contact] } = await db.query(
        `SELECT id FROM crm_contacts WHERE tenant_id = $1 AND deleted_at IS NULL AND phones @> ARRAY[$2] ORDER BY created_at LIMIT 1`,
        [tenantId, phone]
      )
      let leadId = null
      let contactId = contact?.id || null
      if (contactId) {
        const { rows: [lead] } = await db.query(
          `SELECT l.id FROM crm_leads l JOIN crm_stages s ON s.id = l.stage_id
            WHERE l.contact_id = $1 AND l.deleted_at IS NULL
            ORDER BY (s.kind = 'open') DESC, l.created_at DESC LIMIT 1`, [contactId]
        )
        leadId = lead?.id || null
      }
      if (!contactId && autoLeads && c.type === 'incoming') {
        const lead = await createLead(db, tenantId, {
          source: 'call', title: `Звонок +${phone}`, contact: { name: '', phone },
          responsibleId: byExt[c.ext] || null, createdAt: startedAt,
        })
        leadId = lead.id
        contactId = lead.contact_id
        stats.leadsCreated++
      }
      if (!contactId) { stats.skipped++; return }

      await addActivity(db, tenantId, {
        leadId, contactId, type: 'call', direction: c.type === 'incoming' ? 'in' : 'out', channel: 'onlinepbx',
        authorId: byExt[c.ext] || null,
        body: c.answered ? null : (c.type === 'incoming' ? 'Пропущенный' : 'Не дозвонились'),
        meta: { duration: c.duration, waitTime: c.waitTime, ext: c.ext || null, answered: c.answered, uuid: call.uuid || null, phone },
        createdAt: startedAt, amoKey: key,
      })
      stats.stored++
    })
  }
  return stats
}

/**
 * Fetch the calls since the last sync and store them. The window start is
 * kept in scheduled_runs ('onpbx-sync:<tenant>'), with some overlap so a
 * call that showed up in the history late isn't missed.
 */
export async function syncCalls(pool, tenantId, { cfg, autoLeads, fetchHistory, now = new Date() }) {
  const runKey = `onpbx-sync:${tenantId}`
  const nowTs = Math.floor(now.getTime() / 1000)
  const { rows: [last] } = await pool.query('SELECT last_date FROM scheduled_runs WHERE name = $1', [runKey])
  const fromTs = last ? Math.floor(Date.parse(last.last_date) / 1000) - OVERLAP_SEC : nowTs - FIRST_WINDOW_SEC
  const { calls } = await fetchHistory(cfg.domain, cfg.apiKey, fromTs, nowTs)
  const stats = await storeCalls(pool, tenantId, calls, { autoLeads })
  await pool.query(
    `INSERT INTO scheduled_runs (name, last_date) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET last_date = EXCLUDED.last_date, ran_at = now()`,
    [runKey, now.toISOString()]
  )
  return stats
}
