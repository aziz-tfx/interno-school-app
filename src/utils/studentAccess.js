import { sameBranch, branchKey } from './branchMatch'

// Extra branches whose students a branch's sales staff may also work with.
// Keys and values are canonical branch slugs (see utils/branchSlug).
// Tashkent managers sell to and take доплаты from Samarkand clients.
export const EXTRA_BRANCH_ACCESS = {
  tashkent: ['samarkand'],
}
const SALES_ROLES = ['sales', 'rop', 'branch_director']

/** True when the user's role+branch grants access to the student's branch. */
function hasExtraBranchAccess(student, user, branches) {
  if (!SALES_ROLES.includes(user.role)) return false
  const extra = EXTRA_BRANCH_ACCESS[branchKey(user.branch, branches)]
  if (!extra?.length) return false
  return extra.includes(branchKey(student.branch, branches))
}

// Which students a branch-scoped employee (manager, ROP, branch director)
// may see and take payments for.
//
// Branch alone isn't enough: managers close cross-branch sales (a Tashkent
// manager selling to a Samarkand client), and the student card is often
// created by someone else — another branch's manager, an admin, or an
// existing card matched by phone at checkout. The manager must still be
// able to find that student to add a доплата, so a student is visible when
//   • they belong to the employee's branch, or
//   • the employee created the student card, or
//   • the employee has an income payment for them (own sale or split share), or
//   • the student's branch is in EXTRA_BRANCH_ACCESS for the employee's
//     branch (all Samarkand students are open to Tashkent sales staff).

/** Ids of students the user has income payments for (as seller or split). */
export function studentIdsWithMyPayments(payments, user) {
  const ids = new Set()
  if (!user) return ids
  const myId = user.id != null ? String(user.id) : null
  const myMgr = user.managerId || null
  for (const p of payments || []) {
    if (p.type !== 'income' || p.studentId == null || p.studentId === '') continue
    const mine =
      (myId && String(p.createdBy) === myId) ||
      (myMgr && p.managerId === myMgr) ||
      (myMgr && Array.isArray(p.splits) && p.splits.some(s => s?.managerId === myMgr))
    if (mine) ids.add(String(p.studentId))
  }
  return ids
}

/**
 * @param {object} student
 * @param {object} user
 * @param {Array} branches
 * @param {Set<string>} myPaidStudentIds  from studentIdsWithMyPayments()
 */
export function isMyStudent(student, user, branches, myPaidStudentIds) {
  if (!student || !user) return false
  if (sameBranch(student.branch, user.branch, branches)) return true
  if (hasExtraBranchAccess(student, user, branches)) return true
  if (student.createdBy != null && String(student.createdBy) === String(user.id)) return true
  return !!myPaidStudentIds?.has(String(student.id))
}
