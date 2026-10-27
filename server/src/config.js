// Runtime configuration, read once from the environment (see .env.example).

/**
 * "https://a.vercel.app" stays a string; "https://app-*-team.vercel.app"
 * becomes a RegExp where * matches one DNS label part ([a-z0-9-]+) — for
 * Vercel previews, whose URLs change with every deploy.
 */
export function parseOrigin(origin) {
  if (!origin.includes('*')) return origin
  const pattern = origin.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]+')
  return new RegExp(`^${pattern}$`)
}

function required(name) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var ${name}`)
  return v
}

export function loadConfig(env = process.env) {
  const isTest = env.NODE_ENV === 'test'
  const jwtSecret = env.JWT_SECRET || (isTest ? 'test-secret-test-secret-test-secret' : required('JWT_SECRET'))
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters')

  return {
    port: Number(env.PORT || 3000),
    host: env.HOST || '0.0.0.0',
    databaseUrl: env.DATABASE_URL || required('DATABASE_URL'),
    jwtSecret,
    // Session length. Staff stay logged in for a work week; a fired
    // employee is still cut off immediately because every request re-checks
    // the employee's status (see auth plugin).
    jwtTtl: env.JWT_TTL || '7d',
    // Comma-separated list of frontend origins allowed to call the API,
    // e.g. "https://interno-school-app.vercel.app,https://app.interno.uz";
    // * is a wildcard within the host (see parseOrigin)
    corsOrigins: (env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean).map(parseOrigin),
    logLevel: env.LOG_LEVEL || (isTest ? 'silent' : 'info'),
    // https://<API_DOMAIN> — the address Telegram posts bot updates to
    publicUrl: env.PUBLIC_URL || (env.API_DOMAIN ? `https://${env.API_DOMAIN}` : ''),
    // Daily automations (Telegram payment reminders, debtor status, LMS
    // blocking) at 14:00 Tashkent. Off until the switch from Firebase: while
    // the old Vercel cron still runs, both would message the same people.
    automations: env.AUTOMATIONS === 'on',
    // Written by deploy/autodeploy.sh (mounted read-only into the container)
    stateDir: env.STATE_DIR || '/app/state',
    // Login / password attempts per minute per IP (brute-force guard)
    authRateLimit: Number(env.AUTH_RATE_LIMIT || (isTest ? 10_000 : 10)),
  }
}
