// Client for the INTERNO server (server/ in this repo).
//
// The app talks to one of two backends, picked at build time:
//   VITE_BACKEND unset     → Firebase (Firestore), as before
//   VITE_BACKEND=server    → our PostgreSQL API at VITE_API_URL
//
// The session token lives in localStorage. Any 401 clears it and fires
// 'interno:unauthorized' so AuthContext can drop the user (fired employee,
// password changed elsewhere, expired session).

export const USE_SERVER = import.meta.env.VITE_BACKEND === 'server'
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

if (USE_SERVER && !API_URL) {
  // Relative /api/... would hit the Vercel functions, not the server.
  console.error('VITE_BACKEND=server needs VITE_API_URL (e.g. https://api.interno.uz)')
}

const TOKEN_KEY = 'interno_token'

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' }
}
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* private mode — the session just won't survive a reload */ }
}

// Firestore-style error codes, so existing error handling keeps working.
const CODES = { 400: 'invalid-argument', 401: 'unauthenticated', 403: 'permission-denied', 404: 'not-found', 409: 'already-exists' }

export class ApiError extends Error {
  constructor(status, message, body) {
    super(message)
    this.status = status
    this.code = CODES[status] || 'unavailable'
    this.body = body
  }
}

/**
 * Call the API. Returns the parsed JSON body; throws ApiError on non-2xx
 * and on network failure (status 0).
 */
export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = auth ? getToken() : ''
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(API_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch (err) {
    throw new ApiError(0, 'Нет связи с сервером', null)
  }
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }

  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken('')
      window.dispatchEvent(new Event('interno:unauthorized'))
    }
    throw new ApiError(res.status, data?.error || `Ошибка сервера (${res.status})`, data)
  }
  return data
}

/**
 * fetch() for the endpoints that used to be Vercel functions (/api/amo/…,
 * /api/onpbx/…, /api/telegram/notify, /api/ai/…, /api/pay/payme). In server
 * mode they live on the INTERNO server and need the login token; the server
 * takes the school from the token, not from the request. Returns the plain
 * Response, like fetch().
 */
export function apiFetch(path, init = {}) {
  if (!USE_SERVER) return fetch(path, init)
  const headers = { ...(init.headers || {}) }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(API_URL + path, { ...init, headers })
}
