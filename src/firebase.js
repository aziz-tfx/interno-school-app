import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
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

export const db = getFirestore(app)
export const storage = getStorage(app)
export default app
