// ─── Зачёт продаж по порогу «месячная оплата курса» ────────────────────────
// Небольшая предоплата (бронь) после открытого урока — например 100–500 тыс.
// при курсе за 5–6 млн — не считается продажей: клиент ещё может не выкупить
// остаток. Продажа засчитывается за тем платежом, с которым суммарно
// оплаченное учеником ВПЕРВЫЕ достигает стоимости одного месяца курса.
// Все последующие платежи — доплаты, они тоже не продажи: один ученик даёт
// максимум одну продажу. Выручка (revenue) при этом всегда учитывается
// полностью, включая брони и доплаты.

// Порядок платежей ученика: по дате оплаты, затем по времени создания.
const paymentOrder = (a, b) =>
  (a.date || '').localeCompare(b.date || '') ||
  (a.createdAt || '').localeCompare(b.createdAt || '')

// Порог зачёта для набора платежей одного ученика: явная месячная цена
// тарифа (monthlyPrice — пишется формой оплаты у новых платежей), иначе
// стоимость курса, делённая на длительность; 0 — когда цена курса неизвестна
// (легаси-данные без totalCoursePrice).
export function monthlyThresholdFor(studentPays) {
  const newestFirst = [...studentPays].sort((a, b) => paymentOrder(b, a))
  for (const p of newestFirst) {
    const monthly = Number(p.monthlyPrice)
    if (monthly > 0) return monthly
  }
  for (const p of newestFirst) {
    const total = Number(p.totalCoursePrice)
    if (total > 0) {
      const months = Number(p.durationMonths) > 0 ? Number(p.durationMonths) : 3
      return total / months
    }
  }
  return 0
}

// Считает продажей ли данный платёж переход через порог: до него оплачено
// меньше месяца, вместе с ним — не меньше. При неизвестном пороге (0)
// продажей остаётся первый платёж ученика — прежнее поведение для легаси.
export function crossesThreshold(paidBefore, amount, threshold) {
  if (threshold > 0) return paidBefore < threshold && paidBefore + amount >= threshold
  return paidBefore === 0
}

// Возвращает Set из id платежей, которые засчитываются как продажи.
// Принимает весь массив payments (любые типы) — фильтрует сам.
export function computeCountedSaleIds(payments) {
  const counted = new Set()
  const byStudent = new Map()
  for (const p of payments || []) {
    if (p.type !== 'income' || p.cancelled) continue
    if (!p.studentId) {
      // Платёж без привязки к ученику (легаси): старое правило «первый транш».
      if ((p.trancheNumber || 1) <= 1) counted.add(p.id)
      continue
    }
    const key = String(p.studentId)
    if (!byStudent.has(key)) byStudent.set(key, [])
    byStudent.get(key).push(p)
  }
  for (const pays of byStudent.values()) {
    pays.sort(paymentOrder)
    const threshold = monthlyThresholdFor(pays)
    let paid = 0
    for (const p of pays) {
      const amount = Number(p.amount) || 0
      if (crossesThreshold(paid, amount, threshold)) {
        counted.add(p.id)
        break
      }
      paid += amount
    }
  }
  return counted
}
