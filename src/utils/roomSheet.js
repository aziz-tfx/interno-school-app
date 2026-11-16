// Reads the school's room grid from Google Sheets («Кабинеты»): one block per
// day pattern (Пн/Ср/Пт, Вт/Чт/Сб), rooms across, time slots down, and in
// each cell a free-text card the admins type by hand:
//
//   18:30-20:00
//   Спикер: Отабек (Ревит)
//   Дата Старта: 28 августа
//   Дата Окончание: 28 декабря
//   Направление: Дизайн Интерьера
//   Наименование в тг: 28.08 Студенты: 7 оффлайн   прошли 2 урока по ревиту
//
// parseRoomSheet(rows) turns the raw CSV rows into blocks of slots and cards
// with those fields pulled out. Anything it can't place stays in `notes`, so
// nothing the admins wrote is lost.

const DAY_KEYS = { пн: 'mon', вт: 'tue', ср: 'wed', чт: 'thu', пт: 'fri', сб: 'sat', вс: 'sun' }
const DAY_LABEL = { mon: 'Пн', tue: 'Вт', wed: 'Ср', thu: 'Чт', fri: 'Пт', sat: 'Сб', sun: 'Вс' }
export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] // Date#getDay order

const TIME_RE = /(\d{1,2})\s*[:.]\s*(\d{2})\s*[-–—]\s*(\d{1,2})\s*[:.]\s*(\d{2})/

const LABELS = [
  ['speaker', 'спикер'],
  ['startText', 'дата\\s*старта'],
  ['endText', 'дата\\s*оконч[а-яё]*'],
  ['direction', 'напр[а-яё]*ние'],
  ['tgName', 'наименование(?:\\s+в)?\\s+тг'],
  ['students', 'студенты'],
]
const LABEL_RE = new RegExp(LABELS.map(([k, re]) => `(?<${k}>${re})\\s*:?`).join('|'), 'giu')

const MONTHS = [
  ['янв', 0], ['фев', 1], ['мар', 2], ['апр', 3], ['май', 4], ['мая', 4], ['июн', 5],
  ['июл', 6], ['авг', 7], ['сен', 8], ['окт', 9], ['ноя', 10], ['дек', 11],
]

const pad = (n) => String(n).padStart(2, '0')
const clean = (s) => String(s ?? '').replace(/\r/g, '').trim()

/** "16:00- 18:00" → { start: '16:00', end: '18:00' } or null */
export function parseTimeRange(text) {
  const m = String(text || '').match(TIME_RE)
  if (!m) return null
  return { start: `${pad(m[1])}:${m[2]}`, end: `${pad(m[3])}:${m[4]}` }
}

export const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}

/** "5 го октября", "14 Феврал", "15.09" → { day, month } or null */
export function parseDayMonth(text) {
  const s = clean(text).toLowerCase()
  if (!s) return null
  const num = s.match(/^(\d{1,2})[./](\d{1,2})\b/)
  if (num) {
    const day = +num[1], month = +num[2] - 1
    return day >= 1 && day <= 31 && month >= 0 && month <= 11 ? { day, month } : null
  }
  const m = s.match(/(\d{1,2})\s*(?:-?\s*го)?\s+([а-яё]+)/u)
  if (!m) return null
  const stem = m[2].slice(0, 3)
  const month = MONTHS.find(([k]) => k === stem)?.[1]
  const day = +m[1]
  return month === undefined || day < 1 || day > 31 ? null : { day, month }
}

const DAY_MS = 86_400_000
const at = (y, { day, month }) => new Date(y, month, day)

/**
 * Dates in the sheet have no year. A course's start is taken as the latest
 * one not more than two months ahead of today; its end as the first one on
 * or after the start.
 */
export function resolveDates(startText, endText, today = new Date()) {
  const s = parseDayMonth(startText), e = parseDayMonth(endText)
  let start = null, end = null
  if (s) {
    start = at(today.getFullYear(), s)
    if (start - today > 60 * DAY_MS) start = at(today.getFullYear() - 1, s)
  }
  if (e) {
    if (start) {
      end = at(start.getFullYear(), e)
      if (end < start) end = at(start.getFullYear() + 1, e)
    } else {
      end = at(today.getFullYear(), e)
      if (today - end > 180 * DAY_MS) end = at(today.getFullYear() + 1, e)
    }
  }
  return { start, end }
}

function splitValue(segment) {
  const lines = clean(segment).split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return { value: '', rest: [] }
  // admins often keep typing on the same line after a run of spaces
  const [value, ...tail] = lines[0].split(/\s{3,}/)
  return { value: value.trim(), rest: [...tail.map(t => t.trim()), ...lines.slice(1)].filter(Boolean) }
}

/** One cell's text → a lesson card, or null for an empty / filler cell. */
export function parseLesson(raw, today = new Date()) {
  const text = clean(raw)
  if (!text || /^[-–—_.\s]+$/.test(text)) return null

  const lesson = {
    raw: text, time: null, speaker: '', tags: [], direction: '', tgName: '',
    students: '', startText: '', endText: '', start: null, end: null, notes: [],
  }

  const marks = [...text.matchAll(LABEL_RE)].map(m => ({
    key: Object.entries(m.groups).find(([, v]) => v !== undefined)[0],
    from: m.index, to: m.index + m[0].length,
  }))

  const prefix = clean(text.slice(0, marks[0]?.from ?? text.length))
  if (prefix) {
    const t = parseTimeRange(prefix)
    if (t) lesson.time = t
    const leftover = prefix.replace(TIME_RE, '').replace(/[()]/g, '').trim()
    if (leftover) lesson.notes.push(...leftover.split('\n').map(l => l.trim()).filter(Boolean))
  }

  marks.forEach((mk, i) => {
    const { value, rest } = splitValue(text.slice(mk.to, marks[i + 1]?.from ?? text.length))
    lesson.notes.push(...rest)
    if (!value || lesson[mk.key]) return
    if (mk.key === 'speaker') {
      let v = value
      const t = parseTimeRange(v)
      if (t) { lesson.time = lesson.time || t; v = v.replace(/\(?\s*\d{1,2}\s*[:.]\s*\d{2}\s*[-–—]\s*\d{1,2}\s*[:.]\s*\d{2}\s*\)?/, '') }
      lesson.tags = [...v.matchAll(/\(([^)]*)\)/g)].map(m => m[1].trim()).filter(Boolean)
      lesson.speaker = v.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
    } else {
      lesson[mk.key] = value
    }
  })

  if (!marks.length) lesson.notes = [text]
  const { start, end } = resolveDates(lesson.startText, lesson.endText, today)
  lesson.start = start
  lesson.end = end
  lesson.status = lessonStatus(lesson, today)
  return lesson
}

/** 'ended' | 'upcoming' | 'active' */
export function lessonStatus({ start, end }, today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (end && end < d) return 'ended'
  if (start && start > d) return 'upcoming'
  return 'active'
}

/** Same direction typed differently ("Интерьер Дизайн" / "Дизайн интерьера") → one key. */
export function directionKey(direction) {
  return String(direction || '').toLowerCase()
    .split(/[^a-zа-яё]+/u).filter(w => w.length > 2).map(w => w.slice(0, 5)).sort().join(' ')
}

function parseDays(text) {
  const keys = [...String(text || '').toLowerCase().matchAll(/(пн|вт|ср|чт|пт|сб|вс)/gu)].map(m => DAY_KEYS[m[1]])
  return [...new Set(keys)]
}

/** "1(8)" → { name: 'Кабинет 1', capacity: 8 }, "Онлайн" → { name: 'Онлайн' } */
export function parseRoom(header) {
  const h = clean(header)
  const m = h.match(/^(\d+)\s*\((\d+)\)$/)
  if (m) return { name: `Кабинет ${m[1]}`, short: m[1], capacity: +m[2], online: false }
  const n = h.match(/^(\d+)$/)
  if (n) return { name: `Кабинет ${n[1]}`, short: n[1], capacity: null, online: false }
  return { name: h, short: h, capacity: null, online: /онлайн|online/i.test(h) }
}

const isTimeLabel = (cell) => !!parseTimeRange(cell)

function isHeaderRow(row) {
  if (!row?.length || isTimeLabel(row[0])) return false
  const rest = row.slice(1).map(clean).filter(Boolean)
  return rest.length >= 2 && rest.every(c => c.length <= 20 && !c.includes('\n') && !/спикер/i.test(c))
}

/**
 * rows (array of arrays of strings) → {
 *   blocks: [{ id, label, days, rooms, slots: [{ label, start, end, cells }], notes }]
 * }
 */
export function parseRoomSheet(rows, today = new Date()) {
  const blocks = []
  let block = null
  for (const row of rows || []) {
    if (isHeaderRow(row)) {
      let last = row.length - 1
      while (last > 0 && !clean(row[last])) last--
      block = {
        id: `b${blocks.length}`,
        label: clean(row[0]),
        days: parseDays(row[0]),
        rooms: row.slice(1, last + 1).map(parseRoom),
        slots: [],
        notes: [],
      }
      blocks.push(block)
      continue
    }
    if (!block || !row?.length) continue
    const time = parseTimeRange(row[0])
    if (!time) {
      const text = row.map(clean).filter(Boolean).join(' · ')
      if (text) block.notes.push(text)
      continue
    }
    const cells = block.rooms.map((_, i) => parseLesson(row[i + 1], today))
    for (const extra of row.slice(block.rooms.length + 1)) {
      const text = clean(extra)
      if (text && !/^[-–—_.\s]+$/.test(text)) block.notes.push(`${time.start}–${time.end}: ${text}`)
    }
    block.slots.push({ label: `${time.start}–${time.end}`, ...time, cells })
  }

  // A block typed without a day label is the other half of the week
  const ALL = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  for (const b of blocks) {
    if (b.days.length) continue
    const taken = new Set(blocks.flatMap(x => x.days))
    b.days = taken.size ? ALL.filter(d => !taken.has(d)) : []
  }
  for (const b of blocks) {
    if (!b.label || !parseDays(b.label).length) {
      b.label = b.days.length ? b.days.map(d => DAY_LABEL[d]).join(' / ') : (b.label || `Сетка ${blocks.indexOf(b) + 1}`)
    } else {
      b.label = b.days.map(d => DAY_LABEL[d]).join(' / ')
    }
  }
  return { blocks: blocks.filter(b => b.slots.length) }
}

export const formatShortDate = (d) => (d ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}` : '')
export const isoDate = (d) => (d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '')

// ─── Moving the sheet into the system ─────────────────────────────────

export const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const dayLabel = (d) => DAY_LABEL[d] || d
const sortDays = (days) => DAY_ORDER.filter(d => days.includes(d))

/** "07.09" and "7.09", extra spaces, case → the same name */
export const normalizeGroupName = (s) =>
  clean(s).toLowerCase().replace(/\s+/g, ' ').replace(/(^|[^\d])0(\d)/g, '$1$2')

/**
 * The sheet's cards → one item per group. The same group often sits in
 * several cells (both halves of the week, a second room, the «Онлайн»
 * column): cards with the same speaker, Telegram name, direction and start
 * date are one group with several slots { days, start, end, room }.
 */
export function sheetGroups(parsed) {
  const items = new Map()
  for (const b of parsed?.blocks || []) {
    for (const s of b.slots) {
      s.cells.forEach((c, i) => {
        if (!c || (!c.speaker && !c.tgName && !c.direction)) return
        const time = c.time || { start: s.start, end: s.end }
        const room = b.rooms[i]
        const key = [
          c.speaker.toLowerCase(), normalizeGroupName(c.tgName), directionKey(c.direction), isoDate(c.start),
          c.tgName ? '' : `${time.start}-${time.end}`, // without a Telegram name only an identical card is the same group
        ].join('|')
        let it = items.get(key)
        if (!it) {
          it = {
            key, speaker: c.speaker, tags: [], direction: c.direction, tgName: c.tgName, students: c.students,
            notes: [], startDate: isoDate(c.start), endDate: isoDate(c.end), slots: [], raw: [],
          }
          items.set(key, it)
        }
        for (const t of c.tags) if (!it.tags.includes(t)) it.tags.push(t)
        for (const n of c.notes) if (!it.notes.includes(n)) it.notes.push(n)
        if (!it.endDate) it.endDate = isoDate(c.end)
        if (!it.students) it.students = c.students
        it.raw.push(c.raw)
        const online = !!room?.online
        const slotKey = `${time.start}-${time.end}|${online ? 'online' : room?.short}`
        let slot = it.slots.find(x => x.key === slotKey)
        if (!slot) it.slots.push(slot = { key: slotKey, days: [], start: time.start, end: time.end, room: online ? null : room, online })
        slot.days = sortDays([...new Set([...slot.days, ...b.days])])
      })
    }
  }

  // names: the Telegram name; else «Спикер ДД.ММ». Clashes get a suffix.
  const list = [...items.values()]
  for (const it of list) {
    const [y, m, d] = it.startDate.split('-')
    it.name = it.tgName || [it.speaker, d && `${d}.${m}`].filter(Boolean).join(' ')
  }
  const byName = new Map()
  for (const it of list) {
    const k = normalizeGroupName(it.name)
    byName.set(k, [...(byName.get(k) || []), it])
  }
  for (const same of byName.values()) {
    if (same.length < 2) continue
    const speakersDiffer = new Set(same.map(x => x.speaker)).size > 1
    same.forEach(x => { x.name = `${x.name} · ${speakersDiffer ? x.speaker : x.direction || x.speaker}` })
  }
  return list
}

/** Slots → the human schedule line other screens (and contracts) show. */
export function scheduleLine(slots) {
  const parts = []
  for (const s of slots) {
    const p = parts.find(x => x.start === s.start && x.end === s.end)
    if (p) p.days = sortDays([...new Set([...p.days, ...s.days])])
    else parts.push({ start: s.start, end: s.end, days: [...s.days] })
  }
  return parts.map(p => `${p.days.map(dayLabel).join(', ')} ${p.start}-${p.end}`).join('; ')
}

const stems = (s) => directionKey(s).split(' ').filter(Boolean)
function similarity(a, b) {
  const A = stems(a), B = stems(b)
  if (!A.length || !B.length) return 0
  return A.filter(x => B.includes(x)).length / Math.max(A.length, B.length)
}

/** Best catalog course for a sheet direction, or '' */
export function matchCourse(direction, courses) {
  let best = '', score = 0
  for (const c of courses || []) {
    const s = similarity(direction, c.name)
    if (s > score) { best = c.name; score = s }
  }
  return score >= 0.5 ? best : ''
}

/** The one teacher whose name contains the speaker's name, or '' */
export function matchTeacher(speaker, teachers) {
  const sp = clean(speaker).toLowerCase().split(/\s+/)[0]
  if (!sp) return ''
  const hits = (teachers || []).filter(t =>
    clean(t.name).toLowerCase().split(/[\s.,()-]+/).some(w => w === sp || (sp.length >= 4 && w.startsWith(sp))))
  return hits.length === 1 ? hits[0].id : ''
}

/** Existing room of the branch with the sheet room's number ("1(8)" ↔ «Кабинет 1»), or '' */
export function matchRoom(sheetRoom, rooms) {
  if (!sheetRoom?.short) return ''
  const hits = (rooms || []).filter(r => (String(r.name || '').match(/\d+/) || [])[0] === sheetRoom.short)
  return hits.length === 1 ? hits[0].id : ''
}

/**
 * The preview the admin checks before the move.
 *   items       sheetGroups() output
 *   groups      all groups of the school
 *   branchRooms / branchTeachers / branchGroups  — of the chosen branch
 * → { rooms: [{ short, name, capacity, roomId }], rows: [{ ...item, groupId, course, teacherId, include }] }
 * roomId / groupId '' means «создать».
 */
export function planImport(items, { courses, branchTeachers, teachers, branchRooms, branchGroups }) {
  const rooms = []
  for (const it of items) {
    for (const s of it.slots) {
      if (s.online || !s.room || rooms.some(r => r.short === s.room.short)) continue
      rooms.push({ short: s.room.short, name: s.room.name, capacity: s.room.capacity, roomId: matchRoom(s.room, branchRooms) })
    }
  }
  rooms.sort((a, b) => (parseInt(a.short) || 0) - (parseInt(b.short) || 0))

  const claimed = new Set()
  const rows = items.map(it => {
    const teacherId = matchTeacher(it.speaker, branchTeachers) || matchTeacher(it.speaker, teachers)
    const names = new Set([normalizeGroupName(it.name), it.tgName && normalizeGroupName(it.tgName)].filter(Boolean))
    let candidates = (branchGroups || []).filter(g => names.has(normalizeGroupName(g.name)))
    if (candidates.length > 1 && teacherId) candidates = candidates.filter(g => String(g.teacherId) === String(teacherId))
    const match = candidates.length === 1 && !claimed.has(candidates[0].id) ? candidates[0] : null
    if (match) claimed.add(match.id)
    return {
      ...it,
      groupId: match?.id || '',
      course: matchCourse(it.direction, courses) || match?.course || '',
      teacherId: teacherId || (match?.teacherId ?? ''),
      include: true,
    }
  })
  return { rooms, rows }
}

/**
 * One preview row → the fields written to the group.
 * roomIds: sheet room short → room id in the system.
 */
export function groupDocFromRow(row, { branch, roomIds, rooms, existing, now = new Date() }) {
  const slots = row.slots.map(s => ({
    days: s.days, start: s.start, end: s.end, online: s.online, roomId: s.online ? '' : (roomIds[s.room.short] || ''),
  }))
  const offline = slots.filter(s => !s.online)
  const firstRoomId = offline.find(s => s.roomId)?.roomId || ''
  const capacity = rooms.find(r => r.id === firstRoomId)?.capacity
  const note = [row.tags.join(', '), row.students && `Студенты: ${row.students}`, ...row.notes].filter(Boolean).join(' · ')
  const doc = {
    branch,
    course: row.course || row.direction || '',
    schedule: scheduleLine(row.slots),
    slots,
    room: firstRoomId,
    format: !offline.length ? 'online' : offline.length < slots.length ? 'hybrid' : 'offline',
    startDate: row.startDate || '',
    endDate: row.endDate || null,
    status: existing?.status === 'full' ? 'full' : 'active',
    teacherId: row.teacherId === '' || row.teacherId == null ? null : row.teacherId,
    teacherName: row.speaker || '',
    importedFrom: 'sheet',
    importedAt: now.toISOString(),
    sheetNote: note,
  }
  if (!existing) {
    doc.name = row.name
    doc.maxOffline = capacity || 15
    doc.language = 'ru'
  }
  return doc
}
