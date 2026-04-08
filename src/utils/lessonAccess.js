// ─── Lesson Access Logic ─────────────────────────────────────────
// Offline students: all lessons available only when fully paid (debt = 0)
// Online students: modules unlock weekly every Monday 00:01 from group start date

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

  if (now < start) return 0 // Course hasn't started yet

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
  return 1 + mondaysPassed
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

  const isOnline = student.learningFormat === 'Онлайн'

  if (!isOnline) {
    // ─── OFFLINE ───
    // Fully paid → all lessons open
    // Partially paid (debt > 0 but has payments) → only module 1
    // No payments → nothing
    if (debt <= 0) {
      return { accessible: true, reason: null }
    }

    // Has partial payment — allow first module only
    const hasPaid = (student.totalCoursePrice || 0) - debt > 0

    if (!hasPaid) {
      return { accessible: false, reason: 'debt', message: 'Для доступа к урокам необходимо произвести оплату' }
    }

    // Partial payment: first module only
    if (lesson.moduleId) {
      const lessonModule = modules.find(m => m.id === lesson.moduleId)
      if (lessonModule && (lessonModule.order || 1) === 1) {
        return { accessible: true, reason: null }
      }
      return { accessible: false, reason: 'partial_debt', message: 'Для доступа ко всем модулям необходимо оплатить курс полностью' }
    }

    // No modules structure — allow first lesson only by order
    if (modules.length === 0) {
      if ((lesson.order || 1) === 1) {
        return { accessible: true, reason: null }
      }
      return { accessible: false, reason: 'partial_debt', message: 'Для доступа ко всем урокам необходимо оплатить курс полностью' }
    }

    // Lesson without moduleId but modules exist — block (ungrouped)
    return { accessible: false, reason: 'partial_debt', message: 'Для доступа необходимо оплатить курс полностью' }
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
export function isModuleUnlocked(moduleOrder, startDate, isOnline, debt = 0, hasPaid = true) {
  if (!isOnline) {
    // Offline: fully paid = all modules; partially paid = module 1 only; no payment = none
    if (debt <= 0) return true
    if (hasPaid) return (moduleOrder || 1) === 1
    return false
  }
  const unlockedCount = getUnlockedModuleCount(startDate)
  return (moduleOrder || 1) <= unlockedCount
}
