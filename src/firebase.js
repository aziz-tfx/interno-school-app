import { initializeApp } from 'firebase/app'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
} from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'

const firebaseConfig = {
  apiKey: "AIzaSyDyp-GtBlf6Dt1FmpZV5QD4d8wV7yRE6DU",
  authDomain: "interno-school.firebaseapp.com",
  projectId: "interno-school",
  storageBucket: "interno-school.firebasestorage.app",
  messagingSenderId: "19828548469",
  appId: "1:19828548469:web:5cdae7ee1289e42266e93c",
  measurementId: "G-3L0YTC6DCR"
}

const app = initializeApp(firebaseConfig)

// ─── App Check (blocks requests from unauthorized domains) ───────────────
// Set VITE_RECAPTCHA_SITE_KEY in Vercel env vars after registering the
// reCAPTCHA v3 key in Google Cloud Console and Firebase App Check.
// In development, set VITE_APPCHECK_DEBUG=1 to use a debug token.
const recaptchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY

if (recaptchaKey) {
  if (import.meta.env.VITE_APPCHECK_DEBUG === '1') {
    // eslint-disable-next-line no-undef, no-restricted-globals
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaKey),
      isTokenAutoRefreshEnabled: true,
    })
  } catch (err) {
    console.warn('App Check initialization failed:', err)
  }
}

// ─── Firestore with offline (IndexedDB) persistence ─────────────────────
// A persistent local cache means that once a document/collection has been
// read successfully even once, it's served from the browser's IndexedDB on
// subsequent loads — including while the server is throttling reads (e.g.
// Firestore daily-quota pressure). The UI keeps showing the last-known data
// instead of blanking to zeros. Multi-tab manager keeps several open tabs
// in sync over the same cache.
//
// If persistence can't initialize (private mode, storage disabled, or the
// SDK was already initialized), fall back to the default in-memory Firestore.
let _db
try {
  _db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
} catch (err) {
  console.warn('Firestore persistent cache unavailable, using default:', err)
  _db = getFirestore(app)
}

export const db = _db
export const storage = getStorage(app)
export default app
