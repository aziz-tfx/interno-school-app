import { sameBranch } from './branchMatch'

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
//   • the employee has an income payment for them (own sale or split share).

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
  if (student.createdBy != null && String(student.createdBy) === String(user.id)) return true
  return !!myPaidStudentIds?.has(String(student.id))
}
