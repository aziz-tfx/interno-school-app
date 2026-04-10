import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

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
export const db = getFirestore(app)
export const storage = getStorage(app)
export default app
