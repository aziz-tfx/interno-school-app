// Dates in the device's time zone. toISOString() is UTC — before 05:00 in
// Tashkent it gives yesterday's date.

export const localISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const todayISO = () => localISO(new Date())

export const isoDaysFromNow = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return localISO(d)
}

export const nowHHMM = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// schedule.dayOfWeek values, indexed by Date#getDay()
export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** Whole days from today to an ISO date (negative = in the past). */
export function daysUntil(iso, today = todayISO()) {
  if (!iso) return null
  const a = Date.parse(`${String(iso).slice(0, 10)}T00:00:00`)
  const b = Date.parse(`${today}T00:00:00`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((a - b) / 86400000)
}
