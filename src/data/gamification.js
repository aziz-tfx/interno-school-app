// ─── XP Rules ───
export const XP_RULES = {
  LESSON_COMPLETE: 50,
  ASSIGNMENT_SUBMITTED: 30,
  ASSIGNMENT_GRADE_MULTIPLIER: 5, // grade × 5
  ATTENDANCE_PRESENT: 20,
  ATTENDANCE_LATE: 10,
  STREAK_BONUSES: { 7: 100, 14: 200, 30: 500 },
}

// ─── Levels (20) ───
export const LEVELS = [
  { level: 1,  minXP: 0,     title: 'Новичок',      emoji: '🌱' },
  { level: 2,  minXP: 200,   title: 'Ученик',       emoji: '📖' },
  { level: 3,  minXP: 500,   title: 'Студент',      emoji: '✏️' },
  { level: 4,  minXP: 1000,  title: 'Знаток',       emoji: '🧠' },
  { level: 5,  minXP: 1800,  title: 'Практик',      emoji: '💪' },
  { level: 6,  minXP: 2800,  title: 'Мастер',       emoji: '⚡' },
  { level: 7,  minXP: 4000,  title: 'Эксперт',      emoji: '🎯' },
  { level: 8,  minXP: 5500,  title: 'Профи',        emoji: '🔥' },
  { level: 9,  minXP: 7500,  title: 'Виртуоз',      emoji: '💎' },
  { level: 10, minXP: 10000, title: 'Гуру',         emoji: '🏆' },
  { level: 11, minXP: 13000, title: 'Наставник',    emoji: '🌟' },
  { level: 12, minXP: 16500, title: 'Легенда',      emoji: '👑' },
  { level: 13, minXP: 20500, title: 'Титан',        emoji: '🗿' },
  { level: 14, minXP: 25000, title: 'Чемпион',      emoji: '🥇' },
  { level: 15, minXP: 30000, title: 'Грандмастер',  emoji: '♛' },
  { level: 16, minXP: 36000, title: 'Феникс',       emoji: '🦅' },
  { level: 17, minXP: 43000, title: 'Архитектор',   emoji: '🏛️' },
  { level: 18, minXP: 51000, title: 'Визионер',     emoji: '🔮' },
  { level: 19, minXP: 60000, title: 'Мудрец',       emoji: '📜' },
  { level: 20, minXP: 70000, title: 'Магистр',      emoji: '✨' },
]

// ─── Achievements ───
export const ACHIEVEMENTS = [
  {
    id: 'first_lesson',
    icon: '🎓',
    title: 'Первый шаг',
    description: 'Пройди свой первый урок',
    check: (s) => s.completedLessons >= 1,
  },
  {
    id: 'five_lessons',
    icon: '📚',
    title: 'Книжный червь',
    description: 'Пройди 5 уроков',
    check: (s) => s.completedLessons >= 5,
  },
  {
    id: 'twenty_lessons',
    icon: '🚀',
    title: 'Ракета знаний',
    description: 'Пройди 20 уроков',
    check: (s) => s.completedLessons >= 20,
  },
  {
    id: 'fifty_lessons',
    icon: '🏅',
    title: 'Полсотни',
    description: 'Пройди 50 уроков',
    check: (s) => s.completedLessons >= 50,
  },
  {
    id: 'streak_7',
    icon: '🔥',
    title: 'Неделя огня',
    description: 'Стрик 7 дней подряд',
    check: (s) => s.maxStreak >= 7,
  },
  {
    id: 'streak_30',
    icon: '🌋',
    title: 'Месяц без перерыва',
    description: 'Стрик 30 дней подряд',
    check: (s) => s.maxStreak >= 30,
  },
  {
    id: 'course_complete',
    icon: '🏆',
    title: 'Курс завершён',
    description: 'Пройди все уроки курса',
    check: (s) => s.hasCompletedCourse,
  },
  {
    id: 'assignment_ace',
    icon: '💯',
    title: 'Отличник',
    description: 'Получи оценку 9 или выше',
    check: (s) => s.bestGrade >= 9,
  },
  {
    id: 'ten_assignments',
    icon: '📝',
    title: 'Трудяга',
    description: 'Сдай 10 заданий',
    check: (s) => s.submittedCount >= 10,
  },
  {
    id: 'attendance_star',
    icon: '⭐',
    title: 'Звезда посещаемости',
    description: '95%+ посещаемость (минимум 10 занятий)',
    check: (s) => s.attendanceRate >= 95 && s.totalClasses >= 10,
  },
  {
    id: 'xp_1000',
    icon: '💰',
    title: 'Тысячник',
    description: 'Набери 1000 XP',
    check: (s) => s.totalXP >= 1000,
  },
  {
    id: 'xp_5000',
    icon: '👑',
    title: 'Король опыта',
    description: 'Набери 5000 XP',
    check: (s) => s.totalXP >= 5000,
  },
]

// ─── Helpers ───

export function getLevel(xp) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].minXP) return LEVELS[i]
  }
  return LEVELS[0]
}

export function getLevelProgress(xp) {
  const current = getLevel(xp)
  const idx = LEVELS.findIndex(l => l.level === current.level)
  const next = LEVELS[idx + 1] || null

  if (!next) return { currentLevel: current, nextLevel: null, progressPercent: 100 }

  const range = next.minXP - current.minXP
  const progress = xp - current.minXP
  return {
    currentLevel: current,
    nextLevel: next,
    progressPercent: Math.min(100, Math.round((progress / range) * 100)),
  }
}

export function computeXP({ completedLessons, submissions, attendancePresent, attendanceLate, streakBonusesClaimed }) {
  const lessons = completedLessons * XP_RULES.LESSON_COMPLETE
  const assignmentBase = (submissions?.length || 0) * XP_RULES.ASSIGNMENT_SUBMITTED
  const assignmentGrades = (submissions || []).reduce(
    (sum, s) => sum + (s.grade ? s.grade * XP_RULES.ASSIGNMENT_GRADE_MULTIPLIER : 0), 0
  )
  const attendance = (attendancePresent || 0) * XP_RULES.ATTENDANCE_PRESENT +
    (attendanceLate || 0) * XP_RULES.ATTENDANCE_LATE
  const streakBonuses = (streakBonusesClaimed || []).reduce(
    (sum, m) => sum + (XP_RULES.STREAK_BONUSES[m] || 0), 0
  )

  return {
    lessons,
    assignments: assignmentBase + assignmentGrades,
    attendance,
    streakBonuses,
    total: lessons + assignmentBase + assignmentGrades + attendance + streakBonuses,
  }
}

export async function updateStreak(gameDataArray, studentId, updateFn) {
  const today = new Date().toISOString().slice(0, 10)
  const data = gameDataArray?.find(d => d.id === studentId) || {
    currentStreak: 0, maxStreak: 0, lastActivityDate: null, streakBonusesClaimed: []
  }

  if (data.lastActivityDate === today) return data

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)

  const newStreak = data.lastActivityDate === yesterdayStr
    ? (data.currentStreak || 0) + 1
    : 1

  const newMax = Math.max(data.maxStreak || 0, newStreak)

  const bonuses = [...(data.streakBonusesClaimed || [])]
  for (const m of Object.keys(XP_RULES.STREAK_BONUSES)) {
    const milestone = Number(m)
    if (newStreak >= milestone && !bonuses.includes(milestone)) {
      bonuses.push(milestone)
    }
  }

  const updates = {
    currentStreak: newStreak,
    maxStreak: newMax,
    lastActivityDate: today,
    streakBonusesClaimed: bonuses,
  }

  await updateFn(studentId, updates)
  return { ...data, ...updates, id: studentId }
}
