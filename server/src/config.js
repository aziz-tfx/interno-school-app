// Runtime configuration, read once from the environment (see .env.example).

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
    // e.g. "https://interno-school-app.vercel.app,https://app.interno.uz"
    corsOrigins: (env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
    logLevel: env.LOG_LEVEL || (isTest ? 'silent' : 'info'),
    // Login / password attempts per minute per IP (brute-force guard)
    authRateLimit: Number(env.AUTH_RATE_LIMIT || (isTest ? 10_000 : 10)),
  }
}
