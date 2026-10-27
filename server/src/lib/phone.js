// Phone normalisation for duplicate detection. Uzbekistan numbers are stored
// as 12 digits with the country code: '998901234567'. People type them as
// "+998 90 123-45-67", "90 123 45 67", "8 90 …", so a 9-digit local number
// gets 998 prepended. Anything else is kept as bare digits.

export function normalizePhone(raw) {
  const d = String(raw ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length === 12 && d.startsWith('998')) return d
  if (d.length === 9) return '998' + d
  if (d.length === 10 && d.startsWith('8')) return '998' + d.slice(1)
  return d
}

/** Normalise and dedupe a list of phones, dropping empties. */
export function normalizePhones(list) {
  return [...new Set((list || []).map(normalizePhone).filter(Boolean))]
}
