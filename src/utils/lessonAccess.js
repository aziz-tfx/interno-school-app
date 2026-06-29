// ─── Lesson Access Logic ─────────────────────────────────────────
// Offline students: all lessons available only when fully paid (debt = 0)
// Online students: modules unlock weekly every Monday 00:01 from group start date

// Synthetic group id prefix for landing students with freeAccess=true who
// have no real group attached. The cabinet / LMS rely on a group object to
// list a student's course; this lets us "show" the course without polluting
// Firestore with a placeholder group document.
export const FREE_GROUP_PREFIX = 'free-'

/**
 * Build a synthetic group for a landing student so the cabinet/LMS can show
 * their course. Returns null if the student doesn't qualify (no freeAccess,
 * or no course name, or the matching course can't be found).
 */
export function buildFreeAccessGroup(student, courses) {
  if (!student?.freeAccess || !student.course) return null
  const course = (courses || []).find(c => c.name === student.course)
  if (!course) return null
  return {
    id: `${FREE_GROUP_PREFIX}${course.id}`,
    name: 'Bepul (1-modul)',
    course: course.name,
    courseId: course.id,
    branch: student.branch || 'online',
    status: 'active',
    teacherId: null,
    startDate: student.startDate || new Date().toISOString().split('T')[0],
    schedule: '',
    synthetic: true,
  }
}

/**
 * Resolve a student's groups, falling back to a synthetic free-access group
 * when no real group is attached. Returns [] when nothing can be resolved.
 */
export function resolveStudentGroups(student, groups, courses) {
  if (!student) return []
  const real = (groups || []).filter(
    g => (student.groupId && g.id === student.groupId) ||
         (student.group && g.name === student.group)
  )
  if (real.length > 0) return real
  const synth = buildFreeAccessGroup(student, courses)
  return synth ? [synth] : []
}

/**
 * Resolve a group by id, materializing a synthetic free-access group when
 * the id has the free- prefix. Returns null when no match.
 */
export function resolveGroupById(groupId, groups, courses, student) {
  if (!groupId) return null
  const real = (groups || []).find(g => g.id === groupId)
  if (real) return real
  if (groupId.startsWith(FREE_GROUP_PREFIX)) {
    const courseId = groupId.slice(FREE_GROUP_PREFIX.length)
    const course = (courses || []).find(c => c.id === courseId)
    if (!course) return null
    return {
      id: groupId,
      name: 'Bepul (1-modul)',
      course: course.name,
      courseId: course.id,
      branch: student?.branch || 'online',
      status: 'active',
      teacherId: null,
      startDate: student?.startDate || new Date().toISOString().split('T')[0],
      schedule: '',
      synthetic: true,
    }
  }
  return null
}

/**
 * Contract-signing gate: a student with payments must have at least one
 * signed contract to access the LMS. Students with no payments at all are
 * not blocked by this rule (they're gated by payment/lmsAccess logic).
 *
 * @param {string|number} studentId
 * @param {Array} payments - all payments
 * @returns {{ needsContract: boolean, signed: boolean, unsignedPaymentId: string|null }}
 */
export function getContractGate(studentId, payments) {
  const studentPays = (payments || []).filter(
    p => p.type === 'income' && String(p.studentId) === String(studentId)
  )
  if (studentPays.length === 0) {
    return { needsContract: false, signed: false, unsignedPaymentId: null }
  }
  const isSigned = (p) => p.contractSigned === true || !!p.signatureData
  const signed = studentPays.some(isSigned)
  const unsigned =
    studentPays.find(p => !isSigned(p) && p.contractNumber) ||
    studentPays.find(p => !isSigned(p))
  return { needsContract: true, signed, unsignedPaymentId: unsigned?.id || null }
}

/**
 * Calculate how many modules are unlocked for an online group
 * @param {string} startDate - Group start date (ISO format: YYYY-MM-DD)
 * @returns {number} Number of unlocked modules (1-based)
 */
export function getUnlockedModuleCount(startDate) {
  if (!startDate) return 999 // No start date = all unlocked

  const start = new Date(startDate)
  const now = new Date()

  // Find the first Monday on or after the start date
  const startDay = start.getDay() // 0=Sun, 1=Mon, ...
  const firstMonday = new Date(start)
  if (startDay === 0) {
    firstMonday.setDate(firstMonday.getDate() + 1) // Sunday → next Monday
  } else if (startDay > 1) {
    firstMonday.setDate(firstMonday.getDate() + (8 - startDay)) // Tue-Sat → next Monday
  }
  // If startDay === 1, firstMonday is already Monday

  // Module 1 is available from the start date
  // Module 2 opens on the first Monday after start (or the next Monday if start is Monday)
  // Module N opens on Monday of week N-1

  if (now < start) return 1 // Course hasn't started yet but module 1 is always available

  // Calculate weeks since start date
  const msPerDay = 24 * 60 * 60 * 1000
  const daysSinceStart = Math.floor((now - start) / msPerDay)

  // Find how many Mondays have passed since start
  // Module 1 = available from day 0
  // Each subsequent Monday unlocks the next module
  let mondaysPassed = 0
  const checkDate = new Date(start)

  // Move to the first Monday at or after start
  const sd = checkDate.getDay()
  if (sd === 0) checkDate.setDate(checkDate.getDate() + 1)
  else if (sd > 1) checkDate.setDate(checkDate.getDate() + (8 - sd))
  else if (sd === 1 && checkDate.getTime() === start.getTime()) {
    // Start IS a Monday, first new module opens next Monday
    checkDate.setDate(checkDate.getDate() + 7)
  }

  // Set to 00:01 on that Monday
  checkDate.setHours(0, 1, 0, 0)

  while (checkDate <= now) {
    mondaysPassed++
    checkDate.setDate(checkDate.getDate() + 7)
  }

  // Module 1 is always available from start, plus one more per Monday
  // Minimum 1 — first module is never locked
  return Math.max(1, 1 + mondaysPassed)
}

/**
 * Check if a specific lesson is accessible to a student
 * @param {Object} params
 * @param {Object} params.lesson - The lesson object
 * @param {Object} params.student - The student object
 * @param {Object} params.group - The group object
 * @param {Array}  params.modules - All modules for the course (sorted by order)
 * @param {number} params.debt - Student's remaining debt
 * @returns {{ accessible: boolean, reason: string|null }}
 */
export function isLessonAccessible({ lesson, student, group, modules, debt }) {
  if (!lesson || !student || !group) {
    return { accessible: false, reason: 'no_data' }
  }

  // ─── Free/landing students: only the FIRST module is accessible ───
  if (student.freeAccess) {
    const sorted = [...(modules || [])].sort((a, b) => (a.order || 1) - (b.order || 1))
    const firstModuleId = sorted[0]?.id
    if (lesson.moduleId && firstModuleId) {
      if (lesson.moduleId === firstModuleId) return { accessible: true, reason: null }
      return { accessible: false, reason: 'free_locked', message: "Bu dars to'liq kurs uchun. To'lov qiling yoki menejer bilan bog'laning." }
    }
    // No modules — allow first 3 lessons by order
    if ((lesson.order || 1) <= 3) return { accessible: true, reason: null }
    return { accessible: false, reason: 'free_locked', message: "Bu dars to'liq kurs uchun. To'lov qiling yoki menejer bilan bog'laning." }
  }

  const isOnline = student.learningFormat === 'Онлайн'
  const coursePrice = student.totalCoursePrice || 0
  const paid = coursePrice - debt
  const paidPercent = coursePrice > 0 ? (paid / coursePrice) * 100 : 0

  // Paid 50%+ of course price → all modules/lessons unlocked
  if (paidPercent >= 50) {
    return { accessible: true, reason: null }
  }

  if (!isOnline) {
    // ─── OFFLINE ───
    // Fully paid → all lessons open (covered above)
    // Paid < 50% but has payments → only module 1
    // No payments → nothing
    const hasPaid = paid > 0

    if (!hasPaid) {
      return { accessible: false, reason: 'debt', message: 'Для доступа к урокам необходимо произвести оплату' }
    }

    // Partial payment (<50%): first module only
    if (lesson.moduleId) {
      const lessonModule = modules.find(m => m.id === lesson.moduleId)
      if (lessonModule && (lessonModule.order || 1) === 1) {
        return { accessible: true, reason: null }
      }
      return { accessible: false, reason: 'partial_debt', message: 'Для доступа ко всем модулям необходимо оплатить 50% стоимости курса' }
    }

    if (modules.length === 0) {
      if ((lesson.order || 1) === 1) {
        return { accessible: true, reason: null }
      }
      return { accessible: false, reason: 'partial_debt', message: 'Для доступа ко всем урокам необходимо оплатить 50% стоимости курса' }
    }

    return { accessible: false, reason: 'partial_debt', message: 'Для доступа необходимо оплатить 50% стоимости курса' }
  }

  // ─── ONLINE: modules unlock weekly ───
  const unlockedCount = getUnlockedModuleCount(group.startDate)

  if (lesson.moduleId) {
    // Find the module and check its order
    const lessonModule = modules.find(m => m.id === lesson.moduleId)
    if (lessonModule) {
      const moduleOrder = lessonModule.order || 1
      if (moduleOrder > unlockedCount) {
        return {
          accessible: false,
          reason: 'schedule',
          message: `Модуль откроется в понедельник (неделя ${moduleOrder})`,
          moduleOrder,
          unlockedCount,
        }
      }
      return { accessible: true, reason: null }
    }
  }

  // Lessons without module: treat by lesson order as pseudo-modules
  // or allow if no modules exist
  if (modules.length === 0) {
    // No module structure — use lesson order as week number
    const lessonOrder = lesson.order || 1
    if (lessonOrder > unlockedCount) {
      return {
        accessible: false,
        reason: 'schedule',
        message: `Урок откроется в понедельник (неделя ${lessonOrder})`,
      }
    }
    return { accessible: true, reason: null }
  }

  // Lesson has no moduleId but modules exist — allow it (ungrouped)
  return { accessible: true, reason: null }
}

/**
 * Check if a module is unlocked for an online group
 * @param {number} moduleOrder - Module order (1-based)
 * @param {string} startDate - Group start date
 * @param {boolean} isOnline - Whether student is online format
 * @returns {boolean}
 */
/**
 * @param {number} moduleOrder - Module order (1-based)
 * @param {string} startDate - Group start date
 * @param {boolean} isOnline - Whether student is online format
 * @param {number} [debt=0] - Student remaining debt (for offline partial payment)
 * @param {boolean} [hasPaid=true] - Whether student has made any payment
 */
export function isModuleUnlocked(moduleOrder, startDate, isOnline, debt = 0, hasPaid = true, coursePrice = 0) {
  // No course price set → all modules open (same as isLessonAccessible)
  if (coursePrice <= 0) return true
  const paid = coursePrice - debt
  const paidPercent = (paid / coursePrice) * 100
  // 50%+ paid → all modules open
  if (paidPercent >= 50) return true

  if (!isOnline) {
    if (debt <= 0) return true
    if (hasPaid) return (moduleOrder || 1) === 1
    return false
  }
  const unlockedCount = getUnlockedModuleCount(startDate)
  return (moduleOrder || 1) <= unlockedCount
}
