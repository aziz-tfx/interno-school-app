import { db } from '../firebase'
import { collection, addDoc } from 'firebase/firestore'

const auditRef = collection(db, 'auditLog')

/**
 * Log an action to the audit trail.
 * @param {Object} params
 * @param {string} params.action - 'create' | 'update' | 'delete'
 * @param {string} params.collection - Firestore collection name (e.g. 'students')
 * @param {string} params.documentId - ID of the affected document
 * @param {Object} params.user - { id, name, role }
 * @param {Object} [params.before] - Document state before the change
 * @param {Object} [params.after] - Document state after the change
 * @param {string} [params.description] - Human-readable description
 */
export async function logAudit({ action, collection: col, documentId, user, before, after, description }) {
  try {
    await addDoc(auditRef, {
      action,
      collection: col,
      documentId: String(documentId || ''),
      userId: user?.id || user?._docId || '',
      userName: user?.name || '',
      userRole: user?.role || '',
      before: before || null,
      after: after || null,
      description: description || '',
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Audit log error:', err)
  }
}
