// Derive a Telegram-config slug from a branch document.
//
// The integration page stores chat ids keyed by canonical slugs
// (tashkent / samarkand / fergana / bukhara / online). For the legacy
// INTERNO tenant the branch documents already use those slugs as
// their Firestore ids, so user.branch === 'tashkent' worked directly.
//
// New tenants create branches through the UI, which gives each branch
// a random Firestore id. The Telegram router needs to map that random
// id back to one of the canonical slugs so notifications still land
// in the right group. We do that by:
//   1. honoring an explicit `slug` field on the branch document
//   2. accepting the id when it's already a known slug
//   3. fuzzy-matching the branch name in Russian / English / Uzbek

const KNOWN_SLUGS = ['tashkent', 'samarkand', 'fergana', 'bukhara', 'online']

const NAME_PATTERNS = [
  { slug: 'tashkent',  patterns: [/ташкент/i, /tashkent/i, /тошкент/i] },
  { slug: 'samarkand', patterns: [/самарканд/i, /samarkand/i, /самарқанд/i, /samarqand/i] },
  { slug: 'fergana',   patterns: [/фергана/i, /fergana/i, /фарғона/i, /farg'?ona/i] },
  { slug: 'bukhara',   patterns: [/бухара/i, /bukhara/i, /бухоро/i, /buxoro/i] },
  { slug: 'online',    patterns: [/онлайн/i, /online/i] },
]

/**
 * @param {object|string|null|undefined} branch — branch document, just the
 *   id, or any falsy value. Returns a canonical slug or null.
 */
export function branchToSlug(branch) {
  if (!branch) return null
  if (typeof branch === 'string') {
    if (KNOWN_SLUGS.includes(branch)) return branch
    return null
  }
  if (branch.slug && KNOWN_SLUGS.includes(branch.slug)) return branch.slug
  if (branch.id && KNOWN_SLUGS.includes(branch.id)) return branch.id
  const name = branch.name || ''
  for (const { slug, patterns } of NAME_PATTERNS) {
    if (patterns.some(rx => rx.test(name))) return slug
  }
  return null
}
