// Client-side CRUD for per-tenant integration credentials.
// Stored in Firestore at: tenantIntegrations/{tenantId}
// Shape: { telegram: {...}, amocrm: {...}, onpbx: {...}, updatedAt }

import { db } from '../firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'

const COLLECTION = 'tenantIntegrations'

const EMPTY = {
  telegram: {
    botToken: '',
    chats: { tashkent: '', samarkand: '', fergana: '', bukhara: '', online: '' },
    enabled: true,
  },
  amocrm: {
    subdomain: '',
    accessToken: '',
    refreshToken: '',
    clientId: '',
    clientSecret: '',
    redirectUri: '',
    pipelineId: '',
    statusId: '',
    enabled: false,
  },
  onpbx: {
    domain: '',
    apiKey: '',
    enabled: false,
  },
}

function mergeDefaults(data) {
  const merged = JSON.parse(JSON.stringify(EMPTY))
  if (!data) return merged
  for (const key of Object.keys(EMPTY)) {
    merged[key] = { ...EMPTY[key], ...(data[key] || {}) }
    if (key === 'telegram') {
      merged.telegram.chats = { ...EMPTY.telegram.chats, ...((data.telegram || {}).chats || {}) }
    }
  }
  return merged
}

export async function loadIntegrations(tenantId) {
  if (!tenantId) return mergeDefaults(null)
  const snap = await getDoc(doc(db, COLLECTION, tenantId))
  return mergeDefaults(snap.exists() ? snap.data() : null)
}

export async function saveIntegrationSection(tenantId, section, data) {
  if (!tenantId) throw new Error('tenantId is required')
  await setDoc(
    doc(db, COLLECTION, tenantId),
    { [section]: data, updatedAt: new Date().toISOString() },
    { merge: true }
  )
}
