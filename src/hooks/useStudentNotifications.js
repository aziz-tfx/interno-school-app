import { useMemo, useState, useEffect, useCallback } from 'react'

// Derives in-app notifications for a student from existing data:
// new lessons, assignment deadlines, payment reminders, graded work,
// new announcements and unread chat messages. Read-state is tracked
// per-student in localStorage (no backend writes needed).

function readDismissed(studentId) {
  try {
    return JSON.parse(localStorage.getItem(`notif_read_${studentId}`) || '[]')
  } catch {
    return []
  }
}

export default function useStudentNotifications({
  studentId, lessons = [], assignments = [], submissions = [],
  announcements = [], payments = [], coursePrice = 0, messages = [],
}) {
  const [dismissed, setDismissed] = useState(() => readDismissed(studentId))

  useEffect(() => { setDismissed(readDismissed(studentId)) }, [studentId])

  const persist = useCallback((ids) => {
    setDismissed(ids)
    try { localStorage.setItem(`notif_read_${studentId}`, JSON.stringify(ids)) } catch { /* ignore */ }
  }, [studentId])

  const notifications = useMemo(() => {
    if (!studentId) return []
    const list = []
    const now = new Date()

    // 1. Assignment deadlines (pending, due within 7 days or overdue)
    const submittedIds = new Set(submissions.map(s => s.assignmentId))
    assignments.forEach(a => {
      if (submittedIds.has(a.id) || !a.deadline) return
      const dl = new Date(a.deadline)
      const days = Math.ceil((dl - now) / (1000 * 60 * 60 * 24))
      if (days <= 7) {
        list.push({
          id: `deadline_${a.id}`,
          type: 'deadline',
          icon: days < 0 ? '⏰' : '📝',
          title: days < 0 ? 'Просрочено задание' : days === 0 ? 'Задание сегодня' : `Задание через ${days} дн.`,
          body: a.title,
          link: a.groupId ? `/lms/course/${a.groupId}` : '/?tab=assignments',
          ts: dl.toISOString(),
          urgent: days <= 1,
        })
      }
    })

    // 2. Graded submissions
    submissions.forEach(s => {
      if (s.grade !== undefined && s.grade !== null) {
        list.push({
          id: `grade_${s.id}`,
          type: 'grade',
          icon: '✅',
          title: 'Работа проверена',
          body: `Оценка: ${s.grade}${s.feedback ? ' — ' + s.feedback : ''}`,
          link: '/?tab=assignments',
          ts: s.gradedAt || s.updatedAt || s.createdAt || now.toISOString(),
        })
      }
    })

    // 3. Payment reminder (outstanding debt)
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0)
    const debt = Math.max(0, coursePrice - totalPaid)
    if (debt > 0) {
      const lastPay = payments.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
      const nextDate = lastPay?.nextPaymentDate
      list.push({
        id: `payment_${nextDate || 'due'}`,
        type: 'payment',
        icon: '💳',
        title: 'Напоминание об оплате',
        body: `Остаток: ${debt.toLocaleString('ru-RU')} сум${nextDate ? ` · до ${nextDate}` : ''}`,
        link: '/?tab=payments',
        ts: nextDate ? new Date(nextDate).toISOString() : now.toISOString(),
        urgent: nextDate ? new Date(nextDate) < now : false,
      })
    }

    // 4. New lessons (added in last 14 days)
    lessons.forEach(l => {
      const created = l.createdAt ? new Date(l.createdAt) : null
      if (created && (now - created) / (1000 * 60 * 60 * 24) <= 14) {
        list.push({
          id: `lesson_${l.id}`,
          type: 'lesson',
          icon: '📚',
          title: 'Новый урок',
          body: l.title,
          link: `/lms/lesson/${l.id}`,
          ts: created.toISOString(),
        })
      }
    })

    // 5. New announcements (last 14 days)
    announcements.forEach(a => {
      const created = a.createdAt ? new Date(a.createdAt) : null
      if (created && (now - created) / (1000 * 60 * 60 * 24) <= 14) {
        list.push({
          id: `ann_${a.id}`,
          type: 'announcement',
          icon: '📢',
          title: a.title || 'Объявление',
          body: a.content || '',
          link: '/?tab=announcements',
          ts: created.toISOString(),
        })
      }
    })

    // 6. Unread chat messages (from teacher)
    const unreadMsgs = messages.filter(m => m.senderId !== studentId && !(m.readBy || []).includes(studentId))
    if (unreadMsgs.length > 0) {
      const last = unreadMsgs.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0]
      list.push({
        id: `chat_${last.id}`,
        type: 'chat',
        icon: '💬',
        title: `Новое сообщение${unreadMsgs.length > 1 ? ` (${unreadMsgs.length})` : ''}`,
        body: last.text || '',
        link: '/?tab=chat',
        ts: last.createdAt || now.toISOString(),
      })
    }

    // Sort newest first, mark read state
    return list
      .map(n => ({ ...n, read: dismissed.includes(n.id) }))
      .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
  }, [studentId, lessons, assignments, submissions, announcements, payments, coursePrice, messages, dismissed])

  const unreadCount = notifications.filter(n => !n.read).length

  const markAllRead = useCallback(() => {
    persist(notifications.map(n => n.id))
  }, [notifications, persist])

  const markRead = useCallback((id) => {
    if (!dismissed.includes(id)) persist([...dismissed, id])
  }, [dismissed, persist])

  return { notifications, unreadCount, markAllRead, markRead }
}
