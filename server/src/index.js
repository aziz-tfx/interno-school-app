import { loadConfig } from './config.js'
import { createPool } from './db.js'
import { migrate } from './migrate.js'
import { buildApp } from './app.js'
import { startAutomationScheduler } from './automations.js'
import { loadTelegramConfig, sendTelegram } from './telegram.js'
import { runFollowUps } from './vercel/_lib/aiAgent.js'
import { agentTraffic } from './vercel/_lib/runtime.js'
import { resolvePayme } from './vercel/_lib/tenantConfig.js'
import { syncAllCalls } from './routes/crm/telephony.js'

const config = loadConfig()
const pool = createPool(config.databaseUrl)

// Migrations run on every start, so a deploy is just "pull + restart".
await migrate(pool, (msg) => console.log(msg))

const app = await buildApp({ config, pool })

if (config.automations) {
  startAutomationScheduler(pool, {
    send: sendTelegram,
    loadTelegram: (tenantId) => loadTelegramConfig(pool, tenantId),
    loadPayme: (tenantId) => resolvePayme({ query: { tenantId } }),
  }, app.log)
  app.log.info('daily automations: on (14:00 Asia/Tashkent)')
}

// AI sales agent: nudge clients who went silent (on Vercel this needed an
// external cron). Each due conversation is claimed, so overlaps are harmless.
// Only once amo's webhooks arrive here — before that the agent still runs on
// Vercel and these would duplicate its follow-ups.
setInterval(() => {
  if (!agentTraffic.seen) return
  runFollowUps().catch((err) => app.log.error({ err }, 'AI agent follow-ups failed'))
}, 5 * 60_000).unref()

// OnlinePBX calls into the CRM timeline (schools without OnlinePBX are skipped)
let syncingCalls = false
setInterval(async () => {
  if (syncingCalls) return
  syncingCalls = true
  try { await syncAllCalls(pool, app.log) } finally { syncingCalls = false }
}, 5 * 60_000).unref()

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close()
    await pool.end()
    process.exit(0)
  })
}

await app.listen({ port: config.port, host: config.host })
