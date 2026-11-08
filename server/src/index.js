import { loadConfig } from './config.js'
import { createPool } from './db.js'
import { migrate } from './migrate.js'
import { buildApp } from './app.js'
import { startAutomationScheduler, claimDailyRun, tashkentClock } from './automations.js'
import { loadTelegramConfig, sendTelegram } from './telegram.js'
import { runFollowUps, runAgentHealthChecks } from './vercel/_lib/aiAgent.js'
import { startAmoMirror } from './vercel/_lib/amoMirror.js'
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

// AI sales agent: answer clients whose reply failed and nudge those who went
// silent. Each due conversation is claimed, so overlaps are harmless. Runs
// from the start (the agent lives only here now), so a restart — e.g. with a
// new amoCRM key — doesn't wait for the next client message to catch up.
const agentSweep = () => runFollowUps().catch((err) => app.log.error({ err }, 'AI agent follow-ups failed'))
setTimeout(agentSweep, 30_000).unref()
setInterval(agentSweep, 5 * 60_000).unref()

// AI agent self-check: amoCRM key (and its expiry), OpenAI and the model.
// Daily at 10:00 Tashkent (once, whatever the restarts) with key-expiry
// reminders; and 2 minutes after every start (a deploy, new keys) — that one
// only speaks up when something is broken.
setTimeout(() => {
  runAgentHealthChecks({ warnings: false }).catch((err) => app.log.error({ err }, 'AI agent health check failed'))
}, 2 * 60_000).unref()
setInterval(async () => {
  const { date, hour } = tashkentClock()
  if (hour < 10) return
  try {
    if (!(await claimDailyRun(pool, 'agent-health', date))) return
    const results = await runAgentHealthChecks()
    app.log.info({ results }, 'AI agent daily health check')
  } catch (err) {
    app.log.error({ err }, 'AI agent daily health check failed')
  }
}, 60_000).unref()

// amoCRM reports read a local copy that this keeps in step (amoMirror.js)
startAmoMirror(app.log)

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
