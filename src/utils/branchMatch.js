import { branchToSlug } from './branchSlug'

// Two branch conventions coexist in the data: the legacy INTERNO tenant
// stores canonical slugs ('tashkent', …) as branch ids, while branches
// created through the UI get random Firestore ids. As a result one
// employee can have branch='tashkent' while their colleagues (and the
// ROP, and the branch filter) use the random id of the same branch —
// so naive `e.branch === filter` comparisons drop them.
//
// branchKey() collapses any branch reference (slug, random id, or a
// branch document) to a single canonical key so the same physical
// branch always compares equal.

/**
 * @param {string|object|null|undefined} ref  branch id / slug / branch doc
 * @param {Array} branches  the branches collection (to resolve ids → slug)
 * @returns {string|null}  canonical key, or the raw ref when unresolvable
 */
export function branchKey(ref, branches) {
  if (!ref || ref === 'all') return ref || null
  // Direct slug?
  const asSlug = branchToSlug(ref)
  if (asSlug) return asSlug
  // Resolve a random Firestore id → its branch document → slug
  const doc = (branches || []).find(b => b.id === ref)
  if (doc) {
    const slug = branchToSlug(doc)
    if (slug) return slug
  }
  // Unresolvable — return the raw value so exact matches still work
  return typeof ref === 'string' ? ref : (ref?.id || null)
}

/**
 * True when a and b point at the same physical branch, tolerant of the
 * slug-vs-random-id mismatch. 'all' matches nothing here (callers handle
 * the "all branches" case before calling).
 */
export function sameBranch(a, b, branches) {
  if (!a || !b) return false
  if (a === b) return true
  const ka = branchKey(a, branches)
  const kb = branchKey(b, branches)
  return !!ka && ka === kb
}
