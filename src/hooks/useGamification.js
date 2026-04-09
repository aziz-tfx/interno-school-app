import { useMemo } from 'react'
import { useData } from '../contexts/DataContext'
import {
  ACHIEVEMENTS,
  computeXP,
  getLevel,
  getLevelProgress,
} from '../data/gamification'

export default function useGamification(studentId) {
  const {
    lmsProgress,
    lmsSubmissions,
    lmsLessons,
    lmsModules,
    attendance,
    studentGameData,
    students,
    groups,
    courses,
  } = useData()

  const gamification = useMemo(() => {
    if (!studentId) return null

    // Completed lessons
    const myProgress = lmsProgress.filter(p => p.studentId === studentId)
    const completedLessons = myProgress.length

    // Submissions
    const mySubmissions = lmsSubmissions.filter(s => s.studentId === studentId)
    const bestGrade = mySubmissions.reduce((max, s) => Math.max(max, s.grade || 0), 0)

    // Attendance
    const myAttendance = attendance.filter(a => a.studentId === studentId)
    const attendancePresent = myAttendance.filter(a => a.status === 'present').length
    const attendanceLate = myAttendance.filter(a => a.status === 'late').length
    const totalClasses = myAttendance.length
    const attendanceRate = totalClasses > 0
      ? Math.round(((attendancePresent + attendanceLate) / totalClasses) * 100)
      : 0

    // Streak data
    const gameData = studentGameData.find(d => d.id === studentId) || {}
    const currentStreak = gameData.currentStreak || 0
    const maxStreak = gameData.maxStreak || 0
    const streakBonusesClaimed = gameData.streakBonusesClaimed || []

    // Check if student has completed any course fully
    const student = students.find(s => s.id === studentId)
    const studentGroups = student
      ? groups.filter(g => g.name === student.group || g.id === student.groupId)
      : []
    let hasCompletedCourse = false
    for (const g of studentGroups) {
      const courseLessons = lmsLessons.filter(l => l.courseId === g.courseId || l.groupId === g.id)
      if (courseLessons.length > 0) {
        const allDone = courseLessons.every(l =>
          myProgress.some(p => p.lessonId === l.id)
        )
        if (allDone) { hasCompletedCourse = true; break }
      }
    }

    // Compute XP
    const xp = computeXP({
      completedLessons,
      submissions: mySubmissions,
      attendancePresent,
      attendanceLate,
      streakBonusesClaimed,
    })

    // Level
    const level = getLevel(xp.total)
    const levelProgress = getLevelProgress(xp.total)

    // Stats object for achievement checks
    const stats = {
      completedLessons,
      maxStreak,
      currentStreak,
      hasCompletedCourse,
      bestGrade,
      submittedCount: mySubmissions.length,
      attendanceRate,
      totalClasses,
      totalXP: xp.total,
    }

    // Achievements
    const achievements = ACHIEVEMENTS.map(a => ({
      ...a,
      unlocked: a.check(stats),
    }))
    const unlockedCount = achievements.filter(a => a.unlocked).length

    return {
      xp,
      level,
      levelProgress,
      streak: { current: currentStreak, max: maxStreak },
      achievements,
      unlockedCount,
      stats,
    }
  }, [studentId, lmsProgress, lmsSubmissions, attendance, studentGameData, students, groups, lmsLessons, lmsModules, courses])

  // Leaderboard for a group
  const getLeaderboard = useMemo(() => {
    return (groupId) => {
      if (!groupId) return []
      const group = groups.find(g => g.id === groupId || g.name === groupId)
      if (!group) return []

      const groupStudents = students.filter(s => s.group === group.name || s.groupId === group.id)

      return groupStudents.map(s => {
        const progress = lmsProgress.filter(p => p.studentId === s.id)
        const subs = lmsSubmissions.filter(sub => sub.studentId === s.id)
        const att = attendance.filter(a => a.studentId === s.id)
        const gd = studentGameData.find(d => d.id === s.id) || {}

        const xp = computeXP({
          completedLessons: progress.length,
          submissions: subs,
          attendancePresent: att.filter(a => a.status === 'present').length,
          attendanceLate: att.filter(a => a.status === 'late').length,
          streakBonusesClaimed: gd.streakBonusesClaimed || [],
        })

        return {
          studentId: s.id,
          name: s.name || s.fullName || 'Студент',
          xp: xp.total,
          level: getLevel(xp.total),
        }
      }).sort((a, b) => b.xp - a.xp)
    }
  }, [groups, students, lmsProgress, lmsSubmissions, attendance, studentGameData])

  return { ...gamification, getLeaderboard }
}
