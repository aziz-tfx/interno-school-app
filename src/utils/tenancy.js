import { db } from '../firebase'
import { collection, doc, getDocs, updateDoc, setDoc, writeBatch } from 'firebase/firestore'

export const DEFAULT_TENANT_ID = 'default'

export const TENANT_COLLECTIONS = [
  'branches', 'courses', 'groups', 'students', 'teachers',
  'payments', 'rooms', 'schedule',
  'lmsLessons', 'lmsAssignments', 'lmsSubmissions',
  'lmsAnnouncements', 'lmsModules', 'lmsProgress',
  'studentGameData', 'contractTemplates',
]

export const TENANT_META_DOCS = [
  { collection: 'attendance', docId: '_meta' },
  { collection: 'salesPlans', docId: '_meta' },
]

export async function createDefaultTenant(tenantName) {
  const tenantRef = doc(db, 'tenants', DEFAULT_TENANT_ID)
  await setDoc(tenantRef, {
    id: DEFAULT_TENANT_ID,
    name: tenantName || 'INTERNO School',
    plan: 'enterprise',
    status: 'active',
    limits: { students: 99999, employees: 99999, branches: 99999 },
    createdAt: new Date().toISOString(),
  }, { merge: true })
}

export async function migrateExistingData(tenantId = DEFAULT_TENANT_ID) {
  const results = { updated: 0, skipped: 0, errors: 0 }

  for (const colName of TENANT_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, colName))
      const batch = writeBatch(db)
      let batchCount = 0

      for (const d of snap.docs) {
        if (d.data().tenantId) {
          results.skipped++
          continue
        }
        batch.update(doc(db, colName, d.id), { tenantId })
        batchCount++
        results.updated++

        if (batchCount >= 400) {
          await batch.commit()
          batchCount = 0
        }
      }

      if (batchCount > 0) await batch.commit()
    } catch (err) {
      console.error(`Migration error for ${colName}:`, err)
      results.errors++
    }
  }

  // Employees
  try {
    const empSnap = await getDocs(collection(db, 'employees'))
    const batch = writeBatch(db)
    let bc = 0
    for (const d of empSnap.docs) {
      if (d.data().tenantId) { results.skipped++; continue }
      batch.update(doc(db, 'employees', d.id), { tenantId })
      bc++
      results.updated++
      if (bc >= 400) { await batch.commit(); bc = 0 }
    }
    if (bc > 0) await batch.commit()
  } catch (err) {
    console.error('Migration error for employees:', err)
    results.errors++
  }

  // Meta docs (attendance, salesPlans)
  for (const { collection: colName, docId } of TENANT_META_DOCS) {
    try {
      const ref = doc(db, colName, docId)
      await updateDoc(ref, { tenantId }).catch(() => {})
      results.updated++
    } catch (err) {
      results.skipped++
    }
  }

  // Create default tenant record
  await createDefaultTenant()

  return results
}

export async function getTenants() {
  const snap = await getDocs(collection(db, 'tenants'))
  return snap.docs.map(d => ({ ...d.data(), id: d.id }))
}

export async function createTenant(tenant) {
  const id = tenant.id || `tenant_${Date.now()}`
  const data = {
    id,
    name: tenant.name,
    plan: tenant.plan || 'free',
    status: 'active',
    limits: tenant.limits || { students: 50, employees: 10, branches: 2 },
    createdAt: new Date().toISOString(),
    ...tenant,
  }
  await setDoc(doc(db, 'tenants', id), data)
  return data
}

export async function updateTenant(id, updates) {
  await updateDoc(doc(db, 'tenants', id), updates)
}
