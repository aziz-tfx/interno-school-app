// One-time move of the school's room grid from Google Sheets into the
// system. The admins kept the real schedule (кабинеты × время) in a sheet;
// «Расписание» → «Кабинеты» → «Перенести из Google Таблицы» reads that tab
// once, the admin checks the preview, and the client creates / updates the
// groups (room, days, time, teacher, dates). After that groups are added in
// the system as usual and the sheet is no longer read.
//
//   POST /api/admin/schedule/sheet-rows {url}  owner/admin: the tab's cells
//                                              { rows: string[][] }
//
// The sheet must be shared «по ссылке»: one tab (gid) is read as CSV through
// Google's public export, so the other tabs never leave Google.

import { isAdmin } from '../collections.js'
import { badRequest, forbidden, HttpError } from '../lib/errors.js'

const MAX_BYTES = 2 * 1024 * 1024

/** Google Sheets link → { id, gid } or null. gid is null when the link names no tab. */
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
  const admins = async (req) => { if (!isAdmin(req.user)) throw forbidden() }

  app.post('/api/admin/schedule/sheet-rows', {
    preHandler: [app.authenticate, admins],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const ref = parseSheetUrl(req.body?.url)
    if (!ref) throw badRequest('Это не ссылка на Google Таблицу')
    if (!ref.gid) throw badRequest('В ссылке нет листа: откройте лист с расписанием и скопируйте ссылку из адресной строки (в ней есть #gid=…)')
    reply.header('Cache-Control', 'private, no-store')
    return { rows: await fetchSheetRows(ref) }
  })
}
