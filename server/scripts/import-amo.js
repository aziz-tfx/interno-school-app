// Import amoCRM data into the CRM tables.
//
//   npm run import:amo -- --tenant=default [--events-since=2025-01-01]
//
// Credentials come from tenant_integrations.<tenant>.data.amocrm (imported
// from Firestore by import:firestore — the same block the Vercel functions
// use), or from AMO_SUBDOMAIN + AMO_ACCESS_TOKEN env vars.
//
// Expired token: amo invalidates the old refresh token on every refresh, so
// refreshing here would silently break the live Vercel integration that
// still reads Firestore. The new pair is therefore written to Firestore too
// (needs FIREBASE_SERVICE_ACCOUNT_KEY); without it the import stops and asks
// for a fresh access token instead.
//
// Run import:firestore FIRST: leads are linked to employees (amoUserId) and
// students (by phone) that must already be in Postgres.

import { createPool } from '../src/db.js'
import { migrate } from '../src/migrate.js'
import { importFromAmo } from '../src/crm/amoImport.js'

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')))
const tenantId = args.tenant || 'default'
const MIN_INTERVAL_MS = 160 // amo allows 7 requests/s per integration; stay under it

const pool = createPool(process.env.DATABASE_URL)

async function loadAmoConfig() {
  const { rows } = await pool.query('SELECT data FROM tenant_integrations WHERE id = $1', [tenantId])
  const cfg = rows[0]?.data?.amocrm || {}
  return {
    subdomain: cfg.subdomain || process.env.AMO_SUBDOMAIN,
    accessToken: cfg.accessToken || process.env.AMO_ACCESS_TOKEN,
    refreshToken: cfg.refreshToken || process.env.AMO_REFRESH_TOKEN,
    clientId: cfg.clientId || process.env.AMO_CLIENT_ID,
    clientSecret: cfg.clientSecret || process.env.AMO_CLIENT_SECRET,
    redirectUri: cfg.redirectUri || process.env.AMO_REDIRECT_URI,
  }
}

async function firestore() {
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (!key) return null
  const { initializeApp, getApps, cert } = await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(key)) })
  return getFirestore()
}

async function refresh(cfg) {
  if (!cfg.refreshToken || !cfg.clientId || !cfg.clientSecret) return false
  const fs = await firestore()
  if (!fs) {
    throw new Error('amo access token expired. Set FIREBASE_SERVICE_ACCOUNT_KEY so the refreshed tokens can be '
      + 'saved to Firestore as well, or pass a fresh token in AMO_ACCESS_TOKEN.')
  }
  const res = await fetch(`https://${cfg.subdomain}.amocrm.ru/oauth2/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'refresh_token',
      refresh_token: cfg.refreshToken, redirect_uri: cfg.redirectUri || `https://${cfg.subdomain}.amocrm.ru`,
    }),
  })
  if (!res.ok) return false
  const t = await res.json()
  cfg.accessToken = t.access_token
  cfg.refreshToken = t.refresh_token
  // amo just invalidated the old refresh token: store the new pair in both
  // places so neither the live integration nor this server loses access.
  await fs.collection('tenantIntegrations').doc(tenantId).set({
    amocrm: { accessToken: t.access_token, refreshToken: t.refresh_token, tokenRefreshedAt: new Date().toISOString() },
  }, { merge: true })
  await pool.query(
    `UPDATE tenant_integrations SET data = jsonb_set(jsonb_set(data, '{amocrm,accessToken}', to_jsonb($2::text)),
       '{amocrm,refreshToken}', to_jsonb($3::text)) WHERE id = $1 AND data ? 'amocrm'`,
    [tenantId, t.access_token, t.refresh_token]
  )
  console.log('amo token refreshed (saved to Firestore and Postgres)')
  return true
}

function createClient(cfg) {
  let last = 0
  async function get(path, retried = false) {
    const wait = last + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    last = Date.now()
    const res = await fetch(`https://${cfg.subdomain}.amocrm.ru${path}`, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
    })
    if (res.status === 401 && !retried && await refresh(cfg)) return get(path, true)
    if (res.status === 429 && !retried) {
      await new Promise(r => setTimeout(r, 2000))
      return get(path, true)
    }
    if (res.status === 204) return null
    if (!res.ok) throw new Error(`amoCRM GET ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`)
    return res.json()
  }
  return { get }
}

try {
  await migrate(pool, () => {})
  const cfg = await loadAmoConfig()
  if (!cfg.subdomain || !cfg.accessToken) {
    throw new Error(`No amoCRM credentials for tenant "${tenantId}" (tenant_integrations or AMO_* env vars)`)
  }
  console.log(`importing ${cfg.subdomain}.amocrm.ru → tenant ${tenantId}`)
  const stats = await importFromAmo({
    pool, tenantId, amo: createClient(cfg), eventsSince: args['events-since'], log: (m) => console.log(m),
  })
  console.log('done', stats)
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
