import { useState, useMemo, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useData } from '../../contexts/DataContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2,
  BookOpen, Play, FileText, Link2, Download, Video,
  Clock, Award, Send, Pencil, AlertCircle, Shield
} from 'lucide-react'

// ─── Content Protection Hook ────────────────────────────────────────
function useContentProtection(enabled = true) {
  useEffect(() => {
    if (!enabled) return

    // Block right-click context menu
    const handleContextMenu = (e) => {
      if (e.target.closest('.lms-protected')) {
        e.preventDefault()
      }
    }

    // Block keyboard shortcuts: Ctrl+S, Ctrl+U, Ctrl+Shift+I, F12, PrintScreen
    const handleKeyDown = (e) => {
      const blocked = [
        e.ctrlKey && e.key === 's',
        e.ctrlKey && e.key === 'u',
        e.ctrlKey && e.shiftKey && e.key === 'I',
        e.ctrlKey && e.shiftKey && e.key === 'J',
        e.ctrlKey && e.shiftKey && e.key === 'C',
        e.key === 'F12',
        e.key === 'PrintScreen',
        e.ctrlKey && e.key === 'p',
      ]
      if (blocked.some(Boolean)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    // Block drag & drop of content
    const handleDragStart = (e) => {
      if (e.target.closest('.lms-protected')) {
        e.preventDefault()
      }
    }

    // Block copy
    const handleCopy = (e) => {
      if (e.target.closest?.('.lms-protected')) {
        e.preventDefault()
      }
    }

    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('dragstart', handleDragStart)
    document.addEventListener('copy', handleCopy)

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('dragstart', handleDragStart)
      document.removeEventListener('copy', handleCopy)
    }
  }, [enabled])
}

// ─── Watermark Component ────────────────────────────────────────────
function Watermark({ studentName }) {
  if (!studentName) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden select-none" aria-hidden="true">
      <div className="absolute inset-0" style={{
        backgroundImage: `repeating-linear-gradient(
          -45deg,
          transparent,
          transparent 200px,
          rgba(0,0,0,0.02) 200px,
          rgba(0,0,0,0.02) 201px
        )`,
      }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="absolute whitespace-nowrap text-slate-300/20 font-bold text-sm"
            style={{
              transform: 'rotate(-35deg)',
              top: `${(i * 120) - 60}px`,
              left: `${(i % 3) * 250 - 100}px`,
              fontSize: '14px',
              letterSpacing: '2px',
            }}>
            {studentName} · INTERNO LMS · {studentName} · INTERNO LMS · {studentName}
          </div>
        ))}
      </div>
    </div>
  )
}

// Parse YouTube URL to embed format
function getYouTubeEmbedUrl(url) {
  if (!url) return null
  let videoId = null
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com')) {
      videoId = u.searchParams.get('v')
    } else if (u.hostname === 'youtu.be') {
      videoId = u.pathname.slice(1)
    }
  } catch {
    const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    if (match) videoId = match[1]
  }
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null
}

export default function LMSLessonView() {
  const { t } = useLanguage()
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const {
    groups, students, courses, lmsLessons, lmsAssignments,
    lmsSubmissions, lmsProgress, addLmsProgress, deleteLmsProgress,
    addLmsSubmission, updateLmsSubmission,
  } = useData()

  const isStudent = user?.role === 'student'
  const [answerText, setAnswerText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Enable content protection for students
  useContentProtection(isStudent)

  // Find lesson
  const lesson = lmsLessons.find(l => l.id === lessonId)

  // Find course directly via courseId on lesson, or fallback via group
  const course = useMemo(() => {
    if (!lesson) return null
    if (lesson.courseId) return courses.find(c => c.id === lesson.courseId) || null
    // Legacy fallback: find via groupId
    const g = groups.find(g => g.id === lesson.groupId)
    return g ? courses.find(c => c.name === g.course) || null : null
  }, [lesson, courses, groups])

  // Find group (for student context)
  const group = groups.find(g => g.id === lesson?.groupId)

  // Find student
  const myStudent = useMemo(() => {
    if (!isStudent) return null
    return students.find(s => s.name === user?.name || s.phone === user?.phone) || null
  }, [students, user, isStudent])

  // All lessons in the same course, sorted
  const allLessons = useMemo(() => {
    if (!lesson) return []
    if (lesson.courseId) {
      return lmsLessons
        .filter(l => l.courseId === lesson.courseId)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
    }
    // Legacy fallback
    return lmsLessons
      .filter(l => l.groupId === lesson.groupId)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
  }, [lmsLessons, lesson])

  const currentIndex = allLessons.findIndex(l => l.id === lessonId)
  const prevLesson = allLessons[currentIndex - 1]
  const nextLesson = allLessons[currentIndex + 1]

  // Is this lesson completed?
  const isCompleted = useMemo(() => {
    if (!myStudent) return false
    return lmsProgress.some(p => p.studentId === myStudent.id && p.lessonId === lessonId)
  }, [lmsProgress, myStudent, lessonId])

  // Find assignment linked to this lesson
  const linkedAssignment = useMemo(() => {
    if (!lesson) return null
    return lmsAssignments.find(a =>
      (a.lessonId === lesson.id || a.lessonOrder === lesson.order) &&
      (a.courseId === lesson.courseId || a.groupId === lesson.groupId)
    ) || null
  }, [lmsAssignments, lesson])

  // Find submission for linked assignment
  const mySubmission = useMemo(() => {
    if (!linkedAssignment || !myStudent) return null
    return lmsSubmissions.find(s =>
      s.assignmentId === linkedAssignment.id && s.studentId === myStudent.id
    ) || null
  }, [lmsSubmissions, linkedAssignment, myStudent])

  const handleToggleComplete = async () => {
    if (!myStudent) return
    if (isCompleted) {
      const prog = lmsProgress.find(p => p.studentId === myStudent.id && p.lessonId === lessonId)
      if (prog) await deleteLmsProgress(prog.id)
    } else {
      await addLmsProgress({
        studentId: myStudent.id,
        lessonId,
        groupId: lesson.groupId,
        courseId: course?.id || '',
        completedAt: new Date().toISOString(),
      })
    }
  }

  const handleSubmitAnswer = async () => {
    if (!answerText.trim() || !linkedAssignment || !myStudent) return
    setSubmitting(true)
    try {
      if (mySubmission) {
        await updateLmsSubmission(mySubmission.id, {
          answer: answerText.trim(),
          updatedAt: new Date().toISOString(),
        })
      } else {
        await addLmsSubmission({
          assignmentId: linkedAssignment.id,
          groupId: lesson.groupId,
          studentId: myStudent.id,
          studentName: myStudent.name,
          answer: answerText.trim(),
          createdAt: new Date().toISOString(),
        })
      }
      setAnswerText('')
    } finally {
      setSubmitting(false)
    }
  }

  const embedUrl = getYouTubeEmbedUrl(lesson?.videoUrl)

  if (!lesson) {
    return (
      <div className="text-center py-20">
        <BookOpen size={48} className="mx-auto text-slate-300 mb-4" />
        <p className="text-slate-500">{t('lms.group_not_found')}</p>
        <button onClick={() => navigate('/lms')} className="mt-4 text-blue-600 hover:underline text-sm">{t('lms.go_back')}</button>
      </div>
    )
  }

  return (
    <div className={`max-w-4xl mx-auto space-y-6 ${isStudent ? 'lms-protected' : ''}`}
      style={isStudent ? { userSelect: 'none', WebkitUserSelect: 'none' } : undefined}>

      {/* Content Protection Badge */}
      {isStudent && (
        <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
          <Shield size={14} />
          <span>{t('lms.content_protected')}</span>
        </div>
      )}

      {/* Top navigation bar */}
      <div className="flex items-center justify-between gap-4">
        <button onClick={() => navigate(`/lms/course/${lesson.groupId}`)}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 transition-colors flex-shrink-0">
          <ArrowLeft size={16} /> {t('lms.back_to_course')}
        </button>

        <div className="flex items-center gap-2">
          {prevLesson && (
            <button onClick={() => navigate(`/lms/lesson/${prevLesson.id}`)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
              <ChevronLeft size={14} /> {t('lms.prev_lesson')}
            </button>
          )}
          {nextLesson && (
            <button onClick={() => navigate(`/lms/lesson/${nextLesson.id}`)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
              {t('lms.next_lesson')} <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Lesson header */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <span>{group?.course}</span>
          <span>·</span>
          <span>{group?.name}</span>
          <span>·</span>
          <span>{t('lms.lesson_number')} {currentIndex + 1}/{allLessons.length}</span>
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 mb-2">{lesson.title}</h1>
        {lesson.description && (
          <p className="text-sm text-slate-500">{lesson.description}</p>
        )}
        {lesson.date && (
          <div className="flex items-center gap-1.5 mt-3 text-xs text-slate-400">
            <Clock size={12} />
            {lesson.date}
          </div>
        )}
      </div>

      {/* Video player with protection */}
      {embedUrl && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src={embedUrl}
              title={lesson.title}
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
              sandbox="allow-scripts allow-same-origin allow-presentation"
            />
            {/* Watermark overlay on video */}
            {isStudent && <Watermark studentName={myStudent?.name || user?.name} />}
          </div>
        </div>
      )}

      {/* Lesson content with watermark */}
      {lesson.content && (
        <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
          {isStudent && <Watermark studentName={myStudent?.name || user?.name} />}
          <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap leading-relaxed relative z-0">
            {lesson.content}
          </div>
        </div>
      )}

      {/* Materials */}
      {lesson.materials?.length > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <FileText size={16} className="text-blue-500" />
            {t('lms.lesson_materials')} ({lesson.materials.length})
          </h3>
          <div className="space-y-2">
            {lesson.materials.map((mat, i) => (
              <a key={i} href={mat.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-blue-50 hover:border-blue-200 transition-all"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  {mat.type === 'file' ? <Download size={16} className="text-blue-500" /> : <Link2 size={16} className="text-blue-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{mat.name || mat.url}</p>
                  <p className="text-xs text-slate-400 truncate">{mat.url}</p>
                </div>
                <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Assignment section */}
      {linkedAssignment && isStudent && (
        <div className="glass-card rounded-2xl p-5 border-2 border-purple-100">
          <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
            <AlertCircle size={16} className="text-purple-500" />
            {t('lms.homework')}: {linkedAssignment.title}
          </h3>
          {linkedAssignment.description && (
            <p className="text-sm text-slate-500 mb-3">{linkedAssignment.description}</p>
          )}
          {linkedAssignment.deadline && (
            <p className="text-xs text-red-500 mb-3 flex items-center gap-1">
              <Clock size={12} /> {linkedAssignment.deadline}
            </p>
          )}

          {/* Grade display */}
          {mySubmission?.grade !== undefined && mySubmission?.grade !== null && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-3">
              <div className="flex items-center gap-2">
                <Award size={18} className="text-emerald-500" />
                <span className="text-sm font-semibold text-emerald-800">
                  {t('lms.your_grade')}: {mySubmission.grade}/{linkedAssignment.maxScore || 100}
                </span>
              </div>
              {mySubmission.feedback && (
                <p className="text-sm text-emerald-700 mt-2">{mySubmission.feedback}</p>
              )}
            </div>
          )}

          {/* Answer section */}
          {mySubmission && !mySubmission.grade && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
              <p className="text-xs text-amber-600 font-medium">{t('lms.not_graded_yet')}</p>
              <p className="text-sm text-slate-700 mt-1">{mySubmission.answer}</p>
            </div>
          )}

          {(!mySubmission || mySubmission.grade === undefined) && (
            <div className="space-y-2">
              <textarea
                value={answerText || mySubmission?.answer || ''}
                onChange={e => setAnswerText(e.target.value)}
                placeholder={t('lms.submission_placeholder')}
                rows={4}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
              <button
                onClick={handleSubmitAnswer}
                disabled={submitting || !answerText.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                <Send size={14} />
                {mySubmission ? t('lms.submission_update') : t('lms.submit_homework')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mark as complete button */}
      {isStudent && (
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              {isCompleted ? (
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 size={20} />
                  <span className="font-semibold">{t('lms.lesson_completed')}</span>
                </div>
              ) : (
                <p className="text-sm text-slate-500">{t('lms.mark_complete')}</p>
              )}
            </div>
            <button
              onClick={handleToggleComplete}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                isCompleted
                  ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              <CheckCircle2 size={16} />
              {isCompleted ? t('lms.mark_incomplete') : t('lms.mark_complete')}
            </button>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
            {prevLesson ? (
              <button onClick={() => navigate(`/lms/lesson/${prevLesson.id}`)}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600 transition-colors">
                <ChevronLeft size={16} />
                <div className="text-left">
                  <p className="text-[10px] text-slate-400">{t('lms.prev_lesson')}</p>
                  <p className="text-sm font-medium truncate max-w-[200px]">{prevLesson.title}</p>
                </div>
              </button>
            ) : <div />}

            {nextLesson ? (
              <button onClick={() => navigate(`/lms/lesson/${nextLesson.id}`)}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition-colors">
                <div className="text-right">
                  <p className="text-[10px] text-slate-400">{t('lms.next_lesson')}</p>
                  <p className="text-sm font-medium truncate max-w-[200px]">{nextLesson.title}</p>
                </div>
                <ChevronRight size={16} />
              </button>
            ) : <div />}
          </div>
        </div>
      )}
    </div>
  )
}
