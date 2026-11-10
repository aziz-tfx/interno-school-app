import { sameBranch } from './branchMatch'
import { todayISO, daysUntil } from './dates'

// Students who have started paying for their course and still owe the rest —
// the «ждём доплату» list behind the bell, «Мой день» and the debtors screens.
//
// Whose list it is:
//   • sales manager — clients whose latest payment they took (the same rule
//     as the debts tab in «Продажи» and the daily Telegram reminders);
//   • anyone tied to one branch — that branch;
//   • everyone else (owner, admin, accountant) — the whole school.

const byNewest = (a, b) =>
  (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')

/**
 * @returns {Array<{ student, debt, paid, nextPaymentDate, daysUntil, lastPayment }>}
 *   soonest / most overdue first; entries without a date last
 */
export function expectedPayments({ students, getStudentIncome, user, branches, today = todayISO() }) {
  if (!user) return []
  const isSales = user.role === 'sales'
  const branchScoped = user.branch && user.branch !== 'all'
  const out = []
  for (const s of students || []) {
    if (s.status === 'archived') continue
    const price = Number(s.totalCoursePrice) || 0
    if (price <= 0) continue
    const pays = getStudentIncome(s.id).filter(p => !p.cancelled)
    if (!pays.length) continue
    const paid = pays.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    if (paid <= 0 || paid >= price) continue
    const last = [...pays].sort(byNewest)[0]
    if (isSales) {
      const mine = (user.managerId && last.managerId === user.managerId) ||
        (user.id != null && last.createdBy != null && String(last.createdBy) === String(user.id))
      if (!mine) continue
    } else if (branchScoped && !sameBranch(s.branch, user.branch, branches)) {
      continue
    }
    const nextPaymentDate = s.nextPaymentDate || last.nextPaymentDate || ''
    out.push({
      student: s, debt: price - paid, paid, nextPaymentDate,
      daysUntil: daysUntil(nextPaymentDate, today), lastPayment: last,
    })
  }
  return out.sort((a, b) => (a.daysUntil ?? 99999) - (b.daysUntil ?? 99999))
}

/** "12,5 млн" / "850 тыс" — compact sums for tiles and one-line rows. */
export function shortSum(n) {
  const v = Number(n) || 0
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1).replace('.', ',')} млн`
  if (Math.abs(v) >= 1e3) return `${Math.round(v / 1e3)} тыс`
  return String(Math.round(v))
}
