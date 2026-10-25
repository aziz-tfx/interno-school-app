// Drop-in for 'firebase/firestore': the same functions, backed by Firestore
// or by the INTERNO server depending on VITE_BACKEND (see ./api.js).
// Import from here instead of 'firebase/firestore' everywhere in the app.

import * as firestore from 'firebase/firestore'
import * as server from './serverStore'
import { USE_SERVER } from './api'

const pick = (name) => (USE_SERVER ? server[name] : firestore[name])

export const collection = pick('collection')
export const doc = pick('doc')
export const query = pick('query')
export const where = pick('where')
export const orderBy = pick('orderBy')
export const limit = pick('limit')
export const getDoc = pick('getDoc')
export const getDocs = pick('getDocs')
export const addDoc = pick('addDoc')
export const setDoc = pick('setDoc')
export const updateDoc = pick('updateDoc')
export const deleteDoc = pick('deleteDoc')
export const onSnapshot = pick('onSnapshot')
export const writeBatch = pick('writeBatch')
export const increment = pick('increment')
export const serverTimestamp = pick('serverTimestamp')
