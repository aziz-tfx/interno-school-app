// «Расписание» → «Кабинеты (Google Таблица)»: the school keeps its live room
// grid (кабинеты × время) in a Google Sheet. The admin links one tab of it
// once; the platform reads that tab and shows it, so nobody has to retype it.
//
//   GET  /api/schedule/sheet              staff who manage the schedule:
//                                         { configured, url, rows, fetchedAt }
//                                         ?refresh=1 skips the 60 s cache
//   POST /api/admin/schedule/sheet {url}  owner/admin: link a tab ('' unlinks)
//
// The link lives in tenant_integrations.data.scheduleSheet.url. The sheet must
// be shared «по ссылке»: it is read as CSV through Google's public export of
// that single tab (gid), so the other tabs never leave Google.

import { isAdmin, isStudent } from '../collections.js'
import { badRequest, forbidden, HttpError } from '../lib/errors.js'
import { loadTenantIntegration, saveTenantIntegration } from '../vercel/_lib/tenantConfig.js'

const CACHE_MS = 60_000
const MIN_REFRESH_MS = 5_000
const MAX_BYTES = 2 * 1024 * 1024

/** Google Sheets link → { id, gid } or null. The tab (gid) is required. */
export function parseSheetUrl(url) {
  const s = String(url || '').trim()
  const id = s.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/)?.[1]
  if (!id) return null
  const gid = s.match(/[#?&]gid=(\d+)/)?.[1]
  return { id, gid: gid ?? null }
}

/** RFC 4180 CSV → array of rows (quoted fields may hold newlines). */
export function parseCsv(text) {
  const rows = []
  let row = [], field = '', quoted = false
  const src = String(text).replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  // trailing empty cells and rows carry nothing
  for (const r of rows) while (r.length && r[r.length - 1] === '') r.pop()
  while (rows.length && rows[rows.length - 1].length === 0) rows.pop()
  return rows
}

async function fetchSheetRows({ id, gid }) {
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
  let res
  try {
    res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) })
  } catch {
    throw new HttpError(502, 'Google Таблица не ответила, попробуйте ещё раз')
  }
  const type = res.headers.get('content-type') || ''
  // a closed sheet answers with Google's sign-in page (HTML), not CSV
  if (res.status === 401 || res.status === 403 || (res.ok && !/text\/csv/i.test(type))) {
    throw new HttpError(422, 'Нет доступа к таблице: откройте доступ «Все, у кого есть ссылка» (просмотр)')
  }
  if (res.status === 404 || res.status === 400) throw new HttpError(422, 'Лист не найден: проверьте ссылку (нужна ссылка на конкретный лист, с #gid=…)')
  if (!res.ok) throw new HttpError(502, `Google Таблица ответила ошибкой (${res.status})`)
  const text = await res.text()
  if (text.length > MAX_BYTES) throw new HttpError(422, 'Лист слишком большой для расписания')
  return parseCsv(text)
}

export default async function scheduleSheetRoutes(app) {
  const cache = new Map() // tenantId → { url, rows, at }

  // the roles that see the school-wide schedule (not teachers / students)
  const managers = async (req) => {
    if (isStudent(req.user) || req.user.role === 'teacher') throw forbidden()
  }
  const admins = async (req) => { if (!isAdmin(req.user)) throw forbidden() }

  app.get('/api/schedule/sheet', { preHandler: [app.authenticate, managers] }, async (req, reply) => {
    const tenantId = req.user.tenantId
    const { url = '' } = await loadTenantIntegration(tenantId, 'scheduleSheet')
    reply.header('Cache-Control', 'private, no-store')
    const ref = parseSheetUrl(url)
    if (!ref?.gid) return { configured: false, url: url || '' }

    const hit = cache.get(tenantId)
    const age = hit && hit.url === url ? Date.now() - hit.at : Infinity
    const wantFresh = req.query?.refresh === '1' && age > MIN_REFRESH_MS
    if (age < CACHE_MS && !wantFresh) return { configured: true, url, rows: hit.rows, fetchedAt: new Date(hit.at).toISOString() }

    const rows = await fetchSheetRows(ref)
    const at = Date.now()
    cache.set(tenantId, { url, rows, at })
    return { configured: true, url, rows, fetchedAt: new Date(at).toISOString() }
  })

  app.post('/api/admin/schedule/sheet', { preHandler: [app.authenticate, admins] }, async (req) => {
    const tenantId = req.user.tenantId
    const url = String(req.body?.url || '').trim()
    if (url) {
      const ref = parseSheetUrl(url)
      if (!ref) throw badRequest('Это не ссылка на Google Таблицу')
      if (!ref.gid) throw badRequest('В ссылке нет листа: откройте лист с расписанием и скопируйте ссылку из адресной строки (в ней есть #gid=…)')
      await fetchSheetRows(ref) // fail now, while the admin is looking, not later
    }
    const ok = await saveTenantIntegration(tenantId, 'scheduleSheet', { url })
    if (!ok) throw new HttpError(500, 'Не удалось сохранить ссылку')
    cache.delete(tenantId)
    return { ok: true, url }
  })
}
