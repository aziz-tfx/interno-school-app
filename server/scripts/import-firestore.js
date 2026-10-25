// Copy all ERP data from Firestore into PostgreSQL.
//
//   FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account",…}' \
//   DATABASE_URL=postgres://… npm run import:firestore -- [--only=students,payments] [--dry-run] [--prune]
//
// The service-account key is the same JSON the Vercel functions use
// (Firebase console → Project settings → Service accounts). Reads only —
// Firestore is never modified. Safe to re-run; see src/firestoreImport.js.

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldPath } from 'firebase-admin/firestore'
import { createPool } from '../src/db.js'
import { migrate } from '../src/migrate.js'
import { importFromFirestore } from '../src/firestoreImport.js'

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=')
  return [k, v ?? true]
}))

const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
if (!key) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY is not set')
  process.exit(1)
}
initializeApp({ credential: cert(JSON.parse(key)) })
const fs = getFirestore()

// Page through a collection by document id — a single .get() on a large
// collection would hold everything in memory and can time out.
const source = {
  async *docs(collection) {
    let last = null
    for (;;) {
      let q = fs.collection(collection).orderBy(FieldPath.documentId()).limit(500)
      if (last) q = q.startAfter(last)
      const snap = await q.get()
      for (const d of snap.docs) yield { id: d.id, data: d.data() }
      if (snap.size < 500) return
      last = snap.docs.at(-1).id
    }
  },
}

const pool = createPool(process.env.DATABASE_URL)
try {
  await migrate(pool, () => {})
  const stats = await importFromFirestore({
    pool,
    source,
    only: typeof args.only === 'string' ? args.only.split(',') : undefined,
    dryRun: !!args['dry-run'],
    prune: !!args.prune,
    log: (m) => console.log(m),
  })
  const total = Object.values(stats).reduce((n, s) => n + s.read, 0)
  console.log(`done: ${total} documents read${args['dry-run'] ? ' (dry run, nothing written)' : ''}`)
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await pool.end()
}
