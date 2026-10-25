// Minimal SQL migration runner: applies migrations/NNN_*.sql in order, each
// in its own transaction, and records them in schema_migrations.

import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { tx } from './db.js'

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

export async function migrate(pool, log = console.log) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`)
  const { rows } = await pool.query('SELECT name FROM schema_migrations')
  const applied = new Set(rows.map(r => r.name))

  const files = (await readdir(MIGRATIONS_DIR)).filter(f => f.endsWith('.sql')).sort()
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8')
    await tx(pool, async (c) => {
      await c.query(sql)
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
    })
    log(`applied ${file}`)
  }
}
