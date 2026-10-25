// PostgreSQL access: one shared pool plus a transaction helper.

import pg from 'pg'

// Return BIGINT/NUMERIC as JS numbers. Money is stored in сум (no
// fractions) and counts are small, so they fit Number.MAX_SAFE_INTEGER.
pg.types.setTypeParser(20, Number)    // int8
pg.types.setTypeParser(1700, Number)  // numeric
// DATE columns stay 'YYYY-MM-DD' strings — the frontend works with those.
pg.types.setTypeParser(1082, v => v)

export function createPool(databaseUrl) {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 })
}

/**
 * Run fn(client) inside BEGIN/COMMIT, rolling back on any error.
 * @template T
 * @param {pg.Pool} pool
 * @param {(client: pg.PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function tx(pool, fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
