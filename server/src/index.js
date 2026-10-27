import { loadConfig } from './config.js'
import { createPool } from './db.js'
import { migrate } from './migrate.js'
import { buildApp } from './app.js'
import { startAutomationScheduler } from './automations.js'
import { loadTelegramConfig, sendTelegram } from './telegram.js'
import { runFollowUps } from './vercel/_lib/aiAgent.js'
import { resolvePayme } from './vercel/_lib/tenantConfig.js'

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
setInterval(() => {
  runFollowUps().catch((err) => app.log.error({ err }, 'AI agent follow-ups failed'))
}, 5 * 60_000).unref()

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close()
    await pool.end()
    process.exit(0)
  })
}

await app.listen({ port: config.port, host: config.host })
