import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useData } from '../../contexts/DataContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  ArrowLeft, BookOpen, FileText, CheckCircle2, Bell, Plus, Pencil, Trash2, X,
  Clock, Calendar, Upload, Download, Users, ChevronDown, ChevronUp, Send, Award,
  Video, Link2, File, Image as ImageIcon, ExternalLink, Settings2, Save, Info, CheckCircle
} from 'lucide-react'

// ─── Lesson Form ─────────────────────────────────────────────────────
function LessonForm({ lesson, groupId, courseId, onSave, onClose }) {
  const { t } = useLanguage()
  const [form, setForm] = useState({
    title: lesson?.title || '',
    description: lesson?.description || '',
    content: lesson?.content || '',
    videoUrl: lesson?.videoUrl || '',
    materials: lesson?.materials || [],
    date: lesson?.date || new Date().toISOString().split('T')[0],
    order: lesson?.order || 1,
  })
  const [newMaterial, setNewMaterial] = useState({ name: '', url: '', type: 'link' })

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const addMaterial = () => {
    if (!newMaterial.name || !newMaterial.url) return
    set('materials', [...form.materials, { ...newMaterial, id: Date.now().toString() }])
    setNewMaterial({ name: '', url: '', type: 'link' })
  }

  const removeMaterial = (id) => {
    set('materials', form.materials.filter(m => m.id !== id))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...form,
      courseId: courseId || lesson?.courseId || '',
      order: Number(form.order),
      updatedAt: new Date().toISOString(),
      ...(!lesson ? { createdAt: new Date().toISOString() } : {}),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.lesson_form_title')}</label>
        <input type="text" value={form.title} onChange={e => set('title', e.target.value)} required
          placeholder={t('lms.lesson_form_placeholder')}
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.lesson_form_date')}</label>
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.lesson_form_order')}</label>
          <input type="number" min="1" value={form.order} onChange={e => set('order', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.lesson_form_description')}</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)}
          rows={2} placeholder="О чём этот урок..."
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.lesson_form_content')}</label>
        <textarea value={form.content} onChange={e => set('content', e.target.value)}
          rows={6} placeholder="Полный текст урока, теория, примеры..."
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono" />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.lesson_form_video')}</label>
        <input type="url" value={form.videoUrl} onChange={e => set('videoUrl', e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Materials */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">{t('lms.lesson_form_materials')}</label>
        {form.materials.length > 0 && (
          <div className="space-y-1 mb-2">
            {form.materials.map(m => (
              <div key={m.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5 text-sm">
                {m.type === 'link' ? <Link2 size={14} className="text-blue-500" /> : <File size={14} className="text-slate-500" />}
                <span className="flex-1 truncate">{m.name}</span>
                <button type="button" onClick={() => removeMaterial(m.id)} className="text-slate-400 hover:text-red-500">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input type="text" value={newMaterial.name} onChange={e => setNewMaterial(prev => ({ ...prev, name: e.target.value }))}
            placeholder={t('lms.lesson_form_material_name')} className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
          <input type="url" value={newMaterial.url} onChange={e => setNewMaterial(prev => ({ ...prev, url: e.target.value }))}
            placeholder={t('lms.lesson_form_material_url')} className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
          <button type="button" onClick={addMaterial}
            className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-sm hover:bg-blue-100">
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">
          {t('lms.btn_cancel')}
        </button>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
          {lesson ? t('lms.lesson_btn_save') : t('lms.lesson_btn_create')}
        </button>
      </div>
    </form>
  )
}

// ─── Assignment Form ─────────────────────────────────────────────────
function AssignmentForm({ assignment, groupId, onSave, onClose }) {
  const { t } = useLanguage()
  const [form, setForm] = useState({
    title: assignment?.title || '',
    description: assignment?.description || '',
    deadline: assignment?.deadline || '',
    maxScore: assignment?.maxScore || 100,
  })

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...form,
      groupId,
      maxScore: Number(form.maxScore),
      updatedAt: new Date().toISOString(),
      ...(!assignment ? { createdAt: new Date().toISOString() } : {}),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.assignment_form_title')}</label>
        <input type="text" value={form.title} onChange={e => set('title', e.target.value)} required
          placeholder={t('lms.assignment_form_placeholder')}
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.assignment_form_description')}</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)}
          rows={4} placeholder="Подробное описание задания, требования, критерии оценки..."
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.assignment_form_deadline')}</label>
          <input type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.assignment_form_max_score')}</label>
          <input type="number" min="1" value={form.maxScore} onChange={e => set('maxScore', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">
          {t('lms.btn_cancel')}
        </button>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700">
          {assignment ? t('lms.assignment_btn_save') : t('lms.assignment_btn_create')}
        </button>
      </div>
    </form>
  )
}

// ─── Announcement Form ───────────────────────────────────────────────
function AnnouncementForm({ groupId, onSave, onClose }) {
  const { t } = useLanguage()
  const [form, setForm] = useState({ title: '', content: '' })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({ ...form, groupId, createdAt: new Date().toISOString() })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.announcement_form_title')}</label>
        <input type="text" value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} required
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.announcement_form_content')}</label>
        <textarea value={form.content} onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
          rows={3} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
      </div>
      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">{t('lms.btn_cancel')}</button>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700">{t('lms.announcement_btn_publish')}</button>
      </div>
    </form>
  )
}

// ─── Submission + Grading ────────────────────────────────────────────
function SubmissionView({ assignment, groupId }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const { students, lmsSubmissions, addLmsSubmission, updateLmsSubmission } = useData()
  const isTeacher = user?.role === 'teacher'
  const isStudent = user?.role === 'student'

  const groupStudents = students.filter(s => s.groupId === groupId || s.group === groupId)
  const submissions = lmsSubmissions.filter(s => s.assignmentId === assignment.id)

  const myStudent = isStudent ? students.find(s => s.name === user?.name || s.phone === user?.phone) : null
  const mySubmission = myStudent ? submissions.find(s => s.studentId === myStudent.id) : null

  const [answer, setAnswer] = useState(mySubmission?.answer || '')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!answer.trim() || !myStudent) return
    setSubmitting(true)
    try {
      if (mySubmission) {
        await updateLmsSubmission(mySubmission.id, { answer, updatedAt: new Date().toISOString() })
      } else {
        await addLmsSubmission({
          assignmentId: assignment.id,
          groupId,
          studentId: myStudent.id,
          studentName: myStudent.name,
          answer,
          createdAt: new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error(err)
    }
    setSubmitting(false)
  }

  const handleGrade = async (submissionId, grade, feedback) => {
    await updateLmsSubmission(submissionId, {
      grade: Number(grade),
      feedback: feedback || '',
      gradedAt: new Date().toISOString(),
      gradedBy: user?.name,
    })
  }

  // Student view
  if (isStudent) {
    return (
      <div className="mt-4 p-4 bg-slate-50 rounded-xl">
        <h5 className="text-sm font-semibold text-slate-700 mb-2">
          {mySubmission ? t('lms.submission_your_answer') : t('lms.submission_submit_work')}
        </h5>
        {mySubmission?.grade !== undefined && mySubmission?.grade !== null ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Award size={16} className="text-emerald-500" />
              <span className="text-lg font-bold text-emerald-600">{mySubmission.grade}/{assignment.maxScore}</span>
            </div>
            {mySubmission.feedback && (
              <p className="text-sm text-slate-600 bg-white rounded-lg p-3">{mySubmission.feedback}</p>
            )}
            <p className="text-xs text-slate-400">{t('lms.your_answer_label')} {mySubmission.answer}</p>
          </div>
        ) : (
          <>
            <textarea value={answer} onChange={e => setAnswer(e.target.value)}
              rows={3} placeholder={t('lms.submission_placeholder')}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-2" />
            <button onClick={handleSubmit} disabled={submitting || !answer.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              <Send size={14} /> {mySubmission ? t('lms.submission_update') : t('lms.submission_send')}
            </button>
          </>
        )}
      </div>
    )
  }

  // Teacher view — grade submissions
  if (isTeacher) {
    return (
      <div className="mt-4">
        <h5 className="text-sm font-semibold text-slate-700 mb-2">{t('lms.submission_student_answers')} ({submissions.length})</h5>
        {submissions.length === 0 ? (
          <p className="text-sm text-slate-400">{t('lms.submission_no_answers')}</p>
        ) : (
          <div className="space-y-2">
            {submissions.map(sub => (
              <GradeCard key={sub.id} submission={sub} maxScore={assignment.maxScore} onGrade={handleGrade} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return null
}

function GradeCard({ submission, maxScore, onGrade }) {
  const { t } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [grade, setGrade] = useState(submission.grade ?? '')
  const [feedback, setFeedback] = useState(submission.feedback || '')

  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-slate-900">{submission.studentName}</span>
        {submission.grade !== undefined && submission.grade !== null ? (
          <span className="text-sm font-bold text-emerald-600">{submission.grade}/{maxScore}</span>
        ) : (
          <span className="text-xs text-amber-500">{t('lms.submission_not_graded')}</span>
        )}
      </div>
      <p className="text-xs text-slate-600 mb-2">{submission.answer}</p>
      {editing ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input type="number" min="0" max={maxScore} value={grade} onChange={e => setGrade(e.target.value)}
              placeholder={t('lms.submission_score_placeholder')} className="w-24 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm" />
            <input type="text" value={feedback} onChange={e => setFeedback(e.target.value)}
              placeholder={t('lms.submission_feedback_placeholder')} className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => { onGrade(submission.id, grade, feedback); setEditing(false) }}
              className="px-3 py-1 text-xs bg-emerald-600 text-white rounded-lg">{t('lms.submission_save_grade')}</button>
            <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs bg-slate-200 rounded-lg">{t('lms.btn_cancel')}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="text-xs text-blue-600 hover:underline">
          {submission.grade !== undefined ? t('lms.submission_change_grade') : t('lms.submission_grade')}
        </button>
      )}
    </div>
  )
}

// ─── Course & Group Settings Tab ─────────────────────────────────────
function CourseSettingsTab({ group, course, canEdit, canManage }) {
  const { t } = useLanguage()
  const { updateGroup, updateCourse, teachers, branches } = useData()
  const [groupForm, setGroupForm] = useState({
    name: group?.name || '',
    schedule: group?.schedule || '',
    maxOffline: group?.maxOffline || 15,
    teacherId: group?.teacherId || '',
    status: group?.status || 'active',
  })
  const [courseForm, setCourseForm] = useState({
    description: course?.description || '',
    featuresText: (course?.features || []).join('\n'),
    duration: course?.duration || '3 мес',
  })
  const [savingGroup, setSavingGroup] = useState(false)
  const [savingCourse, setSavingCourse] = useState(false)
  const [savedGroup, setSavedGroup] = useState(false)
  const [savedCourse, setSavedCourse] = useState(false)

  const branchTeachers = teachers.filter(t => t.branch === group?.branch)

  const handleSaveGroup = async () => {
    setSavingGroup(true)
    try {
      await updateGroup(group.id, {
        ...groupForm,
        teacherId: groupForm.teacherId ? Number(groupForm.teacherId) : null,
        maxOffline: Number(groupForm.maxOffline),
      })
      setSavedGroup(true)
      setTimeout(() => setSavedGroup(false), 2000)
    } catch (err) { console.error(err) }
    setSavingGroup(false)
  }

  const handleSaveCourse = async () => {
    if (!course) return
    setSavingCourse(true)
    try {
      const features = courseForm.featuresText
        ? courseForm.featuresText.split('\n').map(f => f.trim()).filter(Boolean)
        : []
      await updateCourse(course.id, {
        description: courseForm.description,
        features,
        duration: courseForm.duration,
      })
      setSavedCourse(true)
      setTimeout(() => setSavedCourse(false), 2000)
    } catch (err) { console.error(err) }
    setSavingCourse(false)
  }

  return (
    <div className="space-y-6">
      {/* Group Settings */}
      <div className="glass-card rounded-2xl p-5">
        <h4 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Settings2 size={18} className="text-blue-500" />
          {t('lms.settings_group_title')}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.settings_group_name')}</label>
            <input type="text" value={groupForm.name}
              onChange={e => setGroupForm(prev => ({ ...prev, name: e.target.value }))}
              disabled={!canManage}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm disabled:opacity-50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.settings_schedule')}</label>
            <input type="text" value={groupForm.schedule}
              onChange={e => setGroupForm(prev => ({ ...prev, schedule: e.target.value }))}
              disabled={!canEdit}
              placeholder="Пн/Ср/Пт 09:00-10:30"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm disabled:opacity-50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.settings_teacher')}</label>
            <select value={groupForm.teacherId}
              onChange={e => setGroupForm(prev => ({ ...prev, teacherId: e.target.value }))}
              disabled={!canManage}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm disabled:opacity-50">
              <option value="">{t('lms.settings_no_teacher')}</option>
              {branchTeachers.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.subject})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.settings_max_offline')}</label>
            <input type="number" min="1" max="100" value={groupForm.maxOffline}
              onChange={e => setGroupForm(prev => ({ ...prev, maxOffline: e.target.value }))}
              disabled={!canManage}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm disabled:opacity-50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.settings_status')}</label>
            <select value={groupForm.status}
              onChange={e => setGroupForm(prev => ({ ...prev, status: e.target.value }))}
              disabled={!canManage}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm disabled:opacity-50">
              <option value="active">{t('lms.settings_status_active')}</option>
              <option value="full">{t('lms.settings_status_full')}</option>
              <option value="archived">{t('lms.settings_status_archived')}</option>
            </select>
          </div>
          <div className="flex items-end">
            {(canEdit || canManage) && (
              <button onClick={handleSaveGroup} disabled={savingGroup}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  savedGroup ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}>
                {savedGroup ? <CheckCircle size={14} /> : <Save size={14} />}
                {savingGroup ? t('lms.settings_saving') : savedGroup ? t('lms.settings_saved') : t('lms.settings_save_group')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Course Settings */}
      {course && (
        <div className="glass-card rounded-2xl p-5">
          <h4 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <span className="text-xl">{course.icon || '📚'}</span>
            {t('lms.settings_course_title')} {course.name}
          </h4>

          {/* Course info (read-only) */}
          <div className="bg-blue-50/50 rounded-xl p-3 mb-4 flex items-start gap-2">
            <Info size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-slate-500">
              {t('lms.settings_course_note')}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.settings_course_duration')}</label>
              <select value={courseForm.duration}
                onChange={e => setCourseForm(prev => ({ ...prev, duration: e.target.value }))}
                disabled={!canManage}
                className="w-full sm:w-48 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm disabled:opacity-50">
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                  <option key={m} value={`${m} мес`}>{m} мес</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.settings_course_description')}</label>
              <textarea value={courseForm.description}
                onChange={e => setCourseForm(prev => ({ ...prev, description: e.target.value }))}
                disabled={!canEdit}
                rows={3}
                placeholder="Краткое описание курса..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm disabled:opacity-50 resize-none" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('lms.settings_course_program')} <span className="text-slate-400 font-normal">{t('lms.courseForm_program_hint')}</span>
              </label>
              <textarea value={courseForm.featuresText}
                onChange={e => setCourseForm(prev => ({ ...prev, featuresText: e.target.value }))}
                disabled={!canEdit}
                rows={5}
                placeholder={"Планировка и зонирование\n3D-визуализация\nРабота с заказчиком"}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm disabled:opacity-50 resize-none font-mono" />
            </div>

            {/* Preview features */}
            {courseForm.featuresText && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{t('lms.settings_preview')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {courseForm.featuresText.split('\n').filter(f => f.trim()).map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                      <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                      {f.trim()}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(canEdit || canManage) && (
              <button onClick={handleSaveCourse} disabled={savingCourse}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  savedCourse ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}>
                {savedCourse ? <CheckCircle size={14} /> : <Save size={14} />}
                {savingCourse ? t('lms.settings_saving') : savedCourse ? t('lms.settings_saved') : t('lms.settings_save_course')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pricing preview (read-only) */}
      {course?.pricing && (
        <div className="glass-card rounded-2xl p-5">
          <h4 className="text-base font-bold text-slate-900 mb-3">{t('lms.settings_pricing_title')}</h4>
          <p className="text-xs text-slate-400 mb-3">{t('lms.settings_pricing_note')} {course.name} {t('lms.settings_pricing_edit')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(course.pricing).map(([region, tariffs]) => (
              <div key={region} className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                  {region === 'tashkent' ? t('lms.region_tashkent') : region === 'fergana' ? t('lms.region_fergana') : t('lms.region_online')}
                </p>
                {Object.entries(tariffs).map(([tariff, prices]) => (
                  <div key={tariff} className="flex justify-between text-sm py-0.5">
                    <span className="text-slate-600 capitalize">{tariff === 'standard' ? t('lms.tariff_standard') : tariff === 'vip' ? 'VIP' : tariff === 'premium' ? t('lms.tariff_premium') : t('lms.tariff_individual')}</span>
                    <span className="font-semibold text-slate-900">
                      {new Intl.NumberFormat('ru-RU').format(prices.full)}{prices.monthly ? '/мес' : ''}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Group View ─────────────────────────────────────────────────
export default function LMSGroupView() {
  const { t } = useLanguage()
  const { groupId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const {
    groups, courses, students, teachers, branches,
    updateGroup, updateCourse,
    lmsLessons, lmsAssignments, lmsAnnouncements,
    addLmsLesson, updateLmsLesson, deleteLmsLesson,
    addLmsAssignment, updateLmsAssignment, deleteLmsAssignment,
    addLmsAnnouncement, deleteLmsAnnouncement,
  } = useData()

  const { hasPermission } = useAuth()
  const isTeacher = user?.role === 'teacher'
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'
  const canEdit = hasPermission('lms', 'create_content')
  const canGrade = hasPermission('lms', 'grade')
  const canManage = hasPermission('lms', 'manage')

  const isStudent = user?.role === 'student'

  const group = groups.find(g => g.id === groupId)
  const course = courses.find(c => c.name === group?.course)

  // Check student LMS access
  const myStudent = isStudent ? students.find(s => s.name === user?.name || s.phone === user?.phone) : null
  const studentBlocked = isStudent && (!myStudent || myStudent.lmsAccess !== true || myStudent.status !== 'active')

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'lessons')
  const [showModal, setShowModal] = useState(searchParams.get('action') || null)
  const [editingItem, setEditingItem] = useState(null)
  const [expandedLesson, setExpandedLesson] = useState(searchParams.get('lesson') || null)
  const [expandedAssignment, setExpandedAssignment] = useState(null)

  // Lessons belong to the COURSE level (shared across all groups of the same course)
  const lessons = useMemo(() => {
    if (course) {
      return lmsLessons.filter(l => l.courseId === course.id).sort((a, b) => (a.order || 0) - (b.order || 0))
    }
    // Legacy fallback: lessons with groupId
    return lmsLessons.filter(l => l.groupId === groupId).sort((a, b) => (a.order || 0) - (b.order || 0))
  }, [lmsLessons, course, groupId])

  const assignments = useMemo(() =>
    lmsAssignments.filter(a => a.groupId === groupId).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [lmsAssignments, groupId]
  )

  const announcements = useMemo(() =>
    lmsAnnouncements.filter(a => a.groupId === groupId || a.groupId === 'all').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [lmsAnnouncements, groupId]
  )

  const groupStudents = students.filter(s => s.group === group?.name || s.groupId === groupId)

  if (!group) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">{t('lms.group_not_found')}</p>
        <button onClick={() => navigate('/lms')} className="text-blue-600 text-sm mt-2 hover:underline">{t('lms.go_back')}</button>
      </div>
    )
  }

  // Block student from accessing group content if debtor/frozen/no access
  if (studentBlocked) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-red-100 mx-auto mb-4 flex items-center justify-center">
          <X size={28} className="text-red-500" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">{t('lms.access_restricted')}</h3>
        <p className="text-slate-500 text-sm max-w-sm mx-auto">
          {myStudent?.status === 'debtor'
            ? t('lms.blocked_debtor')
            : myStudent?.status === 'frozen'
              ? t('lms.blocked_frozen')
              : t('lms.blocked_no_payment')}
        </p>
        <button onClick={() => navigate('/lms')} className="text-blue-600 text-sm mt-4 hover:underline">← {t('lms.back')}</button>
      </div>
    )
  }

  const handleSaveLesson = async (data) => {
    if (editingItem) {
      await updateLmsLesson(editingItem.id, data)
    } else {
      await addLmsLesson(data)
    }
    setShowModal(null)
    setEditingItem(null)
  }

  const handleSaveAssignment = async (data) => {
    if (editingItem) {
      await updateLmsAssignment(editingItem.id, data)
    } else {
      await addLmsAssignment(data)
    }
    setShowModal(null)
    setEditingItem(null)
  }

  const handleSaveAnnouncement = async (data) => {
    await addLmsAnnouncement(data)
    setShowModal(null)
  }

  const tabs = [
    { id: 'lessons', label: t('lms.tab_lessons'), icon: BookOpen, count: lessons.length },
    { id: 'assignments', label: t('lms.tab_assignments'), icon: CheckCircle2, count: assignments.length },
    { id: 'announcements', label: t('lms.tab_announcements'), icon: Bell, count: announcements.length },
    ...(canEdit ? [{ id: 'students', label: t('lms.tab_students'), icon: Users, count: groupStudents.length }] : []),
    ...(canEdit ? [{ id: 'settings', label: t('lms.tab_settings'), icon: Settings2 }] : []),
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/lms')} className="p-2 rounded-xl hover:bg-slate-100 transition-colors mt-1">
          <ArrowLeft size={20} className="text-slate-500" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{course?.icon || '📚'}</span>
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">{group.course}</h2>
          </div>
          <p className="text-slate-500 mt-1">{group.name} · {group.schedule || t('lms.no_schedule')}</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => { setEditingItem(null); setShowModal('newLesson') }}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700">
              <Plus size={14} /> {t('lms.tab_lessons')}
            </button>
            <button onClick={() => { setEditingItem(null); setShowModal('newAssignment') }}
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white text-sm rounded-xl hover:bg-purple-700">
              <Plus size={14} /> {t('lms.tab_assignments')}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
              activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon size={14} />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="text-xs bg-slate-200 px-1.5 py-0.5 rounded-full ml-1">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'lessons' && (
        <div className="space-y-3">
          {lessons.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center text-slate-400">
              <BookOpen size={32} className="mx-auto mb-2 opacity-50" />
              <p>{t('lms.no_lessons')}</p>
              {canEdit && <p className="text-xs mt-1">{t('lms.add_first_lesson')}</p>}
            </div>
          ) : (
            lessons.map((lesson, i) => (
              <div key={lesson.id} className="glass-card rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedLesson(expandedLesson === lesson.id ? null : lesson.id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/30 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600 flex-shrink-0">
                    {lesson.order || i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-slate-900 text-sm truncate">{lesson.title}</h4>
                    {lesson.description && <p className="text-xs text-slate-500 truncate">{lesson.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{lesson.date}</span>
                    {lesson.videoUrl && <Video size={14} className="text-red-400" />}
                    {lesson.materials?.length > 0 && <File size={14} className="text-slate-400" />}
                    {expandedLesson === lesson.id ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                  </div>
                </button>

                {expandedLesson === lesson.id && (
                  <div className="px-4 pb-4 border-t border-slate-100">
                    {lesson.content && (
                      <div className="mt-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 rounded-xl p-4">
                        {lesson.content}
                      </div>
                    )}

                    {lesson.videoUrl && (
                      <a href={lesson.videoUrl} target="_blank" rel="noopener noreferrer"
                        className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2 hover:bg-red-100 transition-colors">
                        <Video size={16} /> {t('lms.watch_video')}
                        <ExternalLink size={12} />
                      </a>
                    )}

                    {lesson.materials?.length > 0 && (
                      <div className="mt-3">
                        <h5 className="text-xs font-semibold text-slate-500 uppercase mb-1.5">{t('lms.lesson_form_materials')}</h5>
                        <div className="space-y-1">
                          {lesson.materials.map(m => (
                            <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg px-3 py-1.5 transition-colors">
                              <Link2 size={14} /> {m.name} <ExternalLink size={10} />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {canEdit && (
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => { setEditingItem(lesson); setShowModal('newLesson') }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">
                          <Pencil size={12} /> {t('lms.btn_edit')}
                        </button>
                        <button onClick={() => deleteLmsLesson(lesson.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 bg-red-50 rounded-lg hover:bg-red-100">
                          <Trash2 size={12} /> {t('lms.btn_delete')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'assignments' && (
        <div className="space-y-3">
          {assignments.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center text-slate-400">
              <CheckCircle2 size={32} className="mx-auto mb-2 opacity-50" />
              <p>{t('lms.no_assignments')}</p>
            </div>
          ) : (
            assignments.map(assignment => {
              const isOverdue = assignment.deadline && assignment.deadline < new Date().toISOString().split('T')[0]
              return (
                <div key={assignment.id} className="glass-card rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedAssignment(expandedAssignment === assignment.id ? null : assignment.id)}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/30"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isOverdue ? 'bg-red-100' : 'bg-purple-100'}`}>
                      <CheckCircle2 size={16} className={isOverdue ? 'text-red-500' : 'text-purple-500'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-900 text-sm">{assignment.title}</h4>
                      <p className="text-xs text-slate-400">{t('lms.max_score')}: {assignment.maxScore}</p>
                    </div>
                    {assignment.deadline && (
                      <span className={`text-xs px-2 py-1 rounded-lg ${isOverdue ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                        <Calendar size={10} className="inline mr-1" />
                        {assignment.deadline}
                      </span>
                    )}
                    {expandedAssignment === assignment.id ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                  </button>

                  {expandedAssignment === assignment.id && (
                    <div className="px-4 pb-4 border-t border-slate-100">
                      {assignment.description && (
                        <p className="mt-3 text-sm text-slate-600 whitespace-pre-wrap">{assignment.description}</p>
                      )}

                      <SubmissionView assignment={assignment} groupId={groupId} />

                      {canEdit && (
                        <div className="mt-3 flex gap-2">
                          <button onClick={() => { setEditingItem(assignment); setShowModal('newAssignment') }}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">
                            <Pencil size={12} /> {t('lms.btn_edit')}
                          </button>
                          <button onClick={() => deleteLmsAssignment(assignment.id)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 bg-red-50 rounded-lg hover:bg-red-100">
                            <Trash2 size={12} /> {t('lms.btn_delete')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {activeTab === 'announcements' && (
        <div className="space-y-3">
          {canEdit && (
            <button onClick={() => setShowModal('newAnnouncement')}
              className="w-full glass-card rounded-xl p-3 flex items-center gap-2 text-sm text-amber-600 hover:bg-amber-50 transition-colors">
              <Plus size={16} /> {t('lms.new_announcement')}
            </button>
          )}
          {announcements.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center text-slate-400">
              <Bell size={32} className="mx-auto mb-2 opacity-50" />
              <p>{t('lms.no_announcements_group')}</p>
            </div>
          ) : (
            announcements.map(a => (
              <div key={a.id} className="glass-card rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-slate-900 text-sm">{a.title}</h4>
                    <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{a.content}</p>
                    <p className="text-xs text-slate-400 mt-2">{a.createdAt?.split('T')[0]}</p>
                  </div>
                  {canEdit && (
                    <button onClick={() => deleteLmsAnnouncement(a.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'students' && canEdit && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/40 border-b border-white/30">
                <th className="text-left py-3 px-4 text-slate-500 font-medium">{t('lms.table_student')}</th>
                <th className="text-left py-3 px-4 text-slate-500 font-medium">{t('lms.table_phone')}</th>
                <th className="text-center py-3 px-4 text-slate-500 font-medium">{t('lms.table_format')}</th>
                <th className="text-center py-3 px-4 text-slate-500 font-medium">{t('lms.table_status')}</th>
              </tr>
            </thead>
            <tbody>
              {groupStudents.map(s => (
                <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-medium text-slate-900">{s.name}</td>
                  <td className="py-3 px-4 text-slate-500">{s.phone || '—'}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.learningFormat === 'Онлайн' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                      {s.learningFormat || t('lms.format_offline')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-green-50 text-green-600' : s.status === 'debtor' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                      {s.status === 'active' ? t('lms.status_active') : s.status === 'debtor' ? t('lms.status_debtor') : t('lms.status_frozen')}
                    </span>
                  </td>
                </tr>
              ))}
              {groupStudents.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-slate-400">{t('lms.no_students_in_group')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && canEdit && (
        <CourseSettingsTab group={group} course={course} canEdit={canEdit} canManage={canManage} />
      )}

      {/* Modals */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h3 className="text-lg font-bold text-slate-900">
                {showModal === 'newLesson' ? (editingItem ? t('lms.edit_lesson') : t('lms.new_lesson')) :
                 showModal === 'newAssignment' ? (editingItem ? t('lms.edit_assignment') : t('lms.new_assignment')) :
                 t('lms.new_announcement')}
              </h3>
              <button onClick={() => { setShowModal(null); setEditingItem(null) }} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="p-5">
              {showModal === 'newLesson' && (
                <LessonForm lesson={editingItem} groupId={groupId} courseId={course?.id} onSave={handleSaveLesson} onClose={() => { setShowModal(null); setEditingItem(null) }} />
              )}
              {showModal === 'newAssignment' && (
                <AssignmentForm assignment={editingItem} groupId={groupId} onSave={handleSaveAssignment} onClose={() => { setShowModal(null); setEditingItem(null) }} />
              )}
              {showModal === 'newAnnouncement' && (
                <AnnouncementForm groupId={groupId} onSave={handleSaveAnnouncement} onClose={() => setShowModal(null)} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
