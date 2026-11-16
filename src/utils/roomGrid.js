// «Расписание» → «Кабинеты»: the room grid built from the system's groups.
// A group says where and when it meets — room, days, time — either as
// `slots` (groups moved from the Google Sheet may meet in several rooms /
// at several times) or, for groups made in the group form, as `room` +
// the `schedule` line ("Пн, Ср, Пт 14:00-16:00").

import { sameBranch } from './branchMatch'
import { parseTimeRange, toMinutes, DAY_ORDER } from './roomSheet'

const DAY_PREFIX = [
  ['пн', 'mon'], ['пон', 'mon'], ['вт', 'tue'], ['вто', 'tue'], ['ср', 'wed'], ['сре', 'wed'],
  ['чт', 'thu'], ['чет', 'thu'], ['пт', 'fri'], ['пят', 'fri'], ['сб', 'sat'], ['суб', 'sat'],
  ['вс', 'sun'], ['вос', 'sun'],
  ['mon', 'mon'], ['tue', 'tue'], ['wed', 'wed'], ['thu', 'thu'], ['fri', 'fri'], ['sat', 'sat'], ['sun', 'sun'],
  ['dus', 'mon'], ['ses', 'tue'], ['cho', 'wed'], ['pay', 'thu'], ['jum', 'fri'], ['sha', 'sat'], ['yak', 'sun'],
]

function dayOf(word) {
  const w = word.toLowerCase()
  // longest prefix wins ("вос" before "вс"); a word must be a day, not just start like one
  for (const [p, d] of [...DAY_PREFIX].sort((a, b) => b[0].length - a[0].length)) {
    if (w === p || (p.length >= 3 && w.startsWith(p))) return d
  }
  return null
}

/** "Пн, Ср, Пт 14:00-16:00; Вт, Чт 19:00-21:00" → [{ days, start, end }] */
export function parseScheduleLine(line) {
  const out = []
  for (const part of String(line || '').split(';')) {
    const time = parseTimeRange(part)
    if (!time) continue
    const days = [...new Set(part.replace(/\d{1,2}\s*[:.]\s*\d{2}/g, ' ').split(/[^a-zа-яё]+/iu).map(dayOf).filter(Boolean))]
    out.push({ days: DAY_ORDER.filter(d => days.includes(d)), ...time })
  }
  return out
}

/** Where and when a group meets: [{ days, start, end, roomId, online }] */
export function groupSlots(group) {
  if (Array.isArray(group?.slots) && group.slots.length) {
    return group.slots
      .filter(s => s && s.start && s.end)
      .map(s => ({ days: s.days || [], start: s.start, end: s.end, roomId: s.online ? '' : (s.roomId || ''), online: !!s.online }))
  }
  const online = group?.format === 'online'
  return parseScheduleLine(group?.schedule).map(s => ({ ...s, roomId: online ? '' : (group.room || ''), online }))
}

export const BLOCKS = [
  { id: 'mwf', label: 'Пн / Ср / Пт', days: ['mon', 'wed', 'fri'] },
  { id: 'tts', label: 'Вт / Чт / Сб', days: ['tue', 'thu', 'sat'] },
  { id: 'sun', label: 'Вс', days: ['sun'] },
]

// rows by start time, like the sheet: 11:30 sits in 10–12, 19:30 in 18–20
const ROWS = [
  { from: 0, label: 'до 10:00', start: '', end: '10:00', optional: true },
  { from: 600, label: '10:00–12:00', start: '10:00', end: '12:00' },
  { from: 720, label: '12:00–14:00', start: '12:00', end: '14:00' },
  { from: 840, label: '14:00–16:00', start: '14:00', end: '16:00' },
  { from: 960, label: '16:00–18:00', start: '16:00', end: '18:00' },
  { from: 1080, label: '18:00–20:00', start: '18:00', end: '20:00' },
  { from: 1200, label: '20:00–22:00', start: '20:00', end: '22:00' },
]
const rowIndex = (start) => {
  const m = toMinutes(start)
  let i = 0
  ROWS.forEach((r, k) => { if (m >= r.from) i = k })
  return i
}

const roomNumber = (r) => parseInt(String(r.name || '').match(/\d+/)?.[0] || '', 10)
const byRoomName = (a, b) => {
  const na = roomNumber(a), nb = roomNumber(b)
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb
  return String(a.name || '').localeCompare(String(b.name || ''), 'ru')
}

const overlap = (a, b) =>
  a.days.some(d => b.days.includes(d)) && toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end)

/**
 * → [{ ...block, columns: [{ id, name, capacity, kind: 'room'|'online'|'none' }],
 *      rows: [{ label, start, end, cells: [[{ group, slot, days, partial, conflict }]] }],
 *      stats: { groups, busy, free, ended } }]
 */
export function buildRoomGrid({ groups, rooms, branchId, branches, today = new Date() }) {
  const inBranch = (ref) => !branchId || branchId === 'all' || sameBranch(ref, branchId, branches)
  const branchRooms = (rooms || []).filter(r => inBranch(r.branchId || r.branch)).sort(byRoomName)
  const roomIds = new Set(branchRooms.map(r => r.id))
  const live = (groups || []).filter(g => g.status !== 'archived' && inBranch(g.branch))
  const day0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  const blocks = BLOCKS.map(b => {
    const placements = []
    for (const group of live) {
      for (const slot of groupSlots(group)) {
        const days = slot.days.filter(d => b.days.includes(d))
        if (!days.length) continue
        const col = slot.online ? 'online' : roomIds.has(slot.roomId) ? slot.roomId : 'none'
        placements.push({ group, slot, days, partial: days.length < b.days.length, col, row: rowIndex(slot.start) })
      }
    }
    const columns = branchRooms.map(r => ({ id: r.id, name: r.name, capacity: r.capacity || null, kind: 'room' }))
    if (placements.some(p => p.col === 'online')) columns.push({ id: 'online', name: 'Онлайн', capacity: null, kind: 'online' })
    if (placements.some(p => p.col === 'none')) columns.push({ id: 'none', name: 'Без кабинета', capacity: null, kind: 'none' })

    const rows = ROWS
      .map((r, i) => ({ ...r, index: i }))
      .filter(r => !r.optional || placements.some(p => p.row === r.index))
      .map(r => ({
        label: r.label, start: r.start, end: r.end,
        cells: columns.map(c => placements
          .filter(p => p.row === r.index && p.col === c.id)
          .sort((a, b) => toMinutes(a.slot.start) - toMinutes(b.slot.start))),
      }))

    // two groups in one room at the same time on the same day
    for (const p of placements) {
      if (p.col === 'online') continue
      p.conflict = placements.some(q => q !== p && q.col === p.col && q.group.id !== p.group.id &&
        overlap({ ...p.slot, days: p.days }, { ...q.slot, days: q.days }))
    }

    const roomCells = rows.flatMap(r => r.cells.filter((_, i) => columns[i].kind === 'room'))
    const busy = roomCells.filter(c => c.length).length
    const ids = new Set(placements.map(p => p.group.id))
    const ended = [...ids].filter(id => {
      const g = live.find(x => x.id === id)
      return g?.endDate && new Date(`${g.endDate}T23:59:59`) < day0
    }).length
    return { ...b, columns, rows, stats: { groups: ids.size, busy, free: roomCells.length - busy, ended } }
  })

  // Sunday only when someone studies on Sunday
  return blocks.filter(b => b.id !== 'sun' || b.stats.groups > 0)
}

/** Groups of the branch that have no time at all (not on the grid). */
export function groupsWithoutTime({ groups, branchId, branches }) {
  return (groups || []).filter(g => g.status !== 'archived' &&
    (!branchId || branchId === 'all' || sameBranch(g.branch, branchId, branches)) &&
    groupSlots(g).length === 0)
}
