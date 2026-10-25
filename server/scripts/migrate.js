// Apply pending SQL migrations:  npm run migrate
import { createPool } from '../src/db.js'
import { migrate } from '../src/migrate.js'

const pool = createPool(process.env.DATABASE_URL)
try {
  await migrate(pool)
  console.log('migrations up to date')
} finally {
  await pool.end()
}
