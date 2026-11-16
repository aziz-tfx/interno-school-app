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
  if (m) return { name: `Кабинет ${m[1]}`, short: m[1], capacity: +m[2] }
  const n = h.match(/^(\d+)$/)
  if (n) return { name: `Кабинет ${n[1]}`, short: n[1], capacity: null }
  return { name: h, short: h, capacity: null }
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

/** Counts for the summary line of one block. */
export function blockStats(block) {
  let total = 0, busy = 0, ended = 0, upcoming = 0
  for (const s of block.slots) {
    for (const c of s.cells) {
      total++
      if (!c) continue
      busy++
      if (c.status === 'ended') ended++
      if (c.status === 'upcoming') upcoming++
    }
  }
  return { total, busy, free: total - busy, ended, upcoming }
}

export const formatShortDate = (d) => (d ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}` : '')
