import { useState, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useData } from '../../contexts/DataContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, Clock, CheckCircle2, FileText, Users, Bell,
  ChevronRight, Calendar, Award, TrendingUp, Plus, AlertCircle,
  Lock, CreditCard, ShieldX, Settings, Pencil, Trash2, X,
  Save, Search, Eye, GraduationCap, DollarSign, CheckCircle, Layers,
  Play, BarChart3, Video, Link2, File, ChevronDown, ChevronUp
} from 'lucide-react'

// ─── Lesson Form Modal ─────────────────────────────────────────────
function LessonFormModal({ courseId, lesson, modules, onSave, onClose }) {
  const { t } = useLanguage()
  const [form, setForm] = useState({
    title: lesson?.title || '',
    description: lesson?.description || '',
    content: lesson?.content || '',
    videoUrl: lesson?.videoUrl || '',
    materials: lesson?.materials || [],
    date: lesson?.date || new Date().toISOString().split('T')[0],
    order: lesson?.order || 1,
    moduleId: lesson?.moduleId || '',
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
      courseId,
      order: Number(form.order),
      updatedAt: new Date().toISOString(),
      ...(!lesson ? { createdAt: new Date().toISOString() } : {}),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h3 className="text-lg font-bold text-slate-900">
            {lesson ? t('lms.lesson_btn_save') : t('lms.btn_add_lesson')}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.lesson_form_title')}</label>
            <input type="text" value={form.title} onChange={e => set('title', e.target.value)} required
              placeholder={t('lms.lesson_form_placeholder')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
          </div>

          {modules && modules.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.module_label')}</label>
              <select value={form.moduleId} onChange={e => set('moduleId', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                <option value="">{t('lms.no_module')}</option>
                {modules.map(m => (
                  <option key={m.id} value={m.id}>{m.title}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.lesson_form_date')}</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.lesson_form_order')}</label>
              <input type="number" min="1" value={form.order} onChange={e => set('order', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.lesson_form_description')}</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={2} placeholder="О чём этот урок..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm resize-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.lesson_form_content')}</label>
            <textarea value={form.content} onChange={e => set('content', e.target.value)}
              rows={5} placeholder="Полный текст урока, теория, примеры..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm resize-none font-mono" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.lesson_form_video')}</label>
            <input type="text" value={form.videoUrl} onChange={e => set('videoUrl', e.target.value)}
              placeholder="Kinescope ID или YouTube ссылка"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            <p className="text-[10px] text-slate-400 mt-1">Kinescope: вставьте ID видео или ссылку · YouTube: вставьте ссылку</p>
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
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">
              {t('lms.btn_cancel')}
            </button>
            <button type="submit"
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 flex items-center gap-2">
              <Save size={14} /> {lesson ? t('lms.lesson_btn_save') : t('lms.lesson_btn_create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Module Form Modal ─────────────────────────────────────────────
function ModuleFormModal({ mod, courseId, onSave, onClose, nextOrder }) {
  const { t } = useLanguage()
  const [title, setTitle] = useState(mod?.title || '')
  const [description, setDescription] = useState(mod?.description || '')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    onSave({
      title: title.trim(),
      description: description.trim(),
      courseId,
      order: mod?.order ?? nextOrder,
      ...(mod ? {} : { createdAt: new Date().toISOString() }),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">
            {mod ? t('lms.edit_module') : t('lms.create_module')}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X size={18} className="text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.module_title')} *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              required autoFocus placeholder="Модуль 1: Введение"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.module_description')}</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={3} placeholder="Описание модуля..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm resize-none" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">
              {t('lms.btn_cancel')}
            </button>
            <button type="submit"
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 flex items-center gap-2">
              <Save size={14} /> {mod ? t('lms.save_module') : t('lms.create_module')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── LMS Course Form (Constructor) ─────────────────────────────────
function LMSCourseForm({ course, onSave, onClose }) {
  const { t } = useLanguage()
  const [form, setForm] = useState({
    name: course?.name || '',
    icon: course?.icon || '📚',
    duration: course?.duration || '6 мес',
    description: course?.description || '',
    featuresText: course?.features?.join('\n') || '',
    pricingEnabled: !!course?.pricing,
    tashkent_standard: course?.pricing?.tashkent?.standard?.full || '',
    tashkent_vip: course?.pricing?.tashkent?.vip?.full || '',
    tashkent_premium: course?.pricing?.tashkent?.premium?.full || '',
    tashkent_individual: course?.pricing?.tashkent?.individual?.full || '',
    fergana_standard: course?.pricing?.fergana?.standard?.full || '',
    fergana_vip: course?.pricing?.fergana?.vip?.full || '',
    fergana_premium: course?.pricing?.fergana?.premium?.full || '',
    fergana_individual: course?.pricing?.fergana?.individual?.full || '',
    online_standard: course?.pricing?.online?.standard?.full || '',
    online_vip: course?.pricing?.online?.vip?.full || '',
    online_premium: course?.pricing?.online?.premium?.full || '',
    online_individual: course?.pricing?.online?.individual?.full || '',
  })
  const [activeRegion, setActiveRegion] = useState('tashkent')

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const ICONS = ['📚', '🎨', '💻', '📊', '🇬🇧', '🧮', '📐', '🎭', '🧠', '📸', '🎬', '🏗️', '🎯', '🔬', '✏️', '🌐']
  const REGIONS = [
    { id: 'tashkent', label: t('lms.region_tashkent') },
    { id: 'fergana', label: t('lms.region_fergana') },
    { id: 'online', label: t('lms.region_online') },
  ]
  const TARIFFS = [
    { id: 'standard', label: t('lms.tariff_standard') },
    { id: 'vip', label: 'VIP' },
    { id: 'premium', label: t('lms.tariff_premium') },
    { id: 'individual', label: t('lms.tariff_individual') },
  ]

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return

    const features = form.featuresText
      ? form.featuresText.split('\n').map(f => f.trim()).filter(Boolean)
      : []

    let pricing = undefined
    if (form.pricingEnabled) {
      pricing = {}
      for (const region of REGIONS) {
        pricing[region.id] = {}
        for (const tariff of TARIFFS) {
          const val = Number(form[`${region.id}_${tariff.id}`])
          if (val > 0) {
            pricing[region.id][tariff.id] = {
              full: val,
              monthly: Math.round(val / parseInt(form.duration) || 6),
            }
          }
        }
      }
    }

    const data = {
      name: form.name.trim(),
      icon: form.icon,
      duration: form.duration,
      description: form.description.trim(),
      features,
      ...(pricing ? { pricing } : {}),
    }

    onSave(data)
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h3 className="text-lg font-bold text-slate-900">
            {course ? t('lms.courseForm_edit') : t('lms.courseForm_create')}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.courseForm_name')}</label>
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                required placeholder={t('lms.courseForm_name_placeholder')}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.courseForm_icon')}</label>
              <div className="flex flex-wrap gap-1">
                {ICONS.map(icon => (
                  <button key={icon} type="button" onClick={() => set('icon', icon)}
                    className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                      form.icon === icon ? 'bg-blue-100 ring-2 ring-blue-500' : 'bg-slate-50 hover:bg-slate-100'
                    }`}>{icon}</button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.courseForm_duration')}</label>
            <select value={form.duration} onChange={e => set('duration', e.target.value)}
              className="w-full sm:w-48 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                <option key={m} value={`${m} мес`}>{m} мес</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('lms.courseForm_description')}</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={3} placeholder={t('lms.courseForm_description')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm resize-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('lms.courseForm_program')} <span className="text-slate-400 font-normal">{t('lms.courseForm_program_hint')}</span>
            </label>
            <textarea value={form.featuresText} onChange={e => set('featuresText', e.target.value)}
              rows={4} placeholder={"Планировка и зонирование\n3D-визуализация\nРабота с заказчиком"}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm resize-none font-mono" />
            {form.featuresText && (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {form.featuresText.split('\n').filter(f => f.trim()).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                    <CheckCircle size={12} className="text-emerald-500 flex-shrink-0" /> {f.trim()}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.pricingEnabled}
                onChange={e => set('pricingEnabled', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded" />
              <span className="text-sm font-medium text-slate-700">{t('lms.courseForm_pricing_toggle')}</span>
            </label>
          </div>

          {form.pricingEnabled && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-4">
              <div className="flex gap-1 bg-white rounded-lg p-1">
                {REGIONS.map(r => (
                  <button key={r.id} type="button" onClick={() => setActiveRegion(r.id)}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      activeRegion === r.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}>{r.label}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {TARIFFS.map(tariff => (
                  <div key={tariff.id}>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{tariff.label}</label>
                    <div className="relative">
                      <input type="number" min="0"
                        value={form[`${activeRegion}_${tariff.id}`]}
                        onChange={e => set(`${activeRegion}_${tariff.id}`, e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 pr-16 bg-white border border-slate-200 rounded-lg text-sm" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{t('lms.courseForm_sum')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">
              {t('lms.courseForm_btn_cancel')}
            </button>
            <button type="submit"
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 flex items-center gap-2">
              <Save size={14} /> {course ? t('lms.courseForm_btn_save') : t('lms.courseForm_btn_create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Course Catalog Card (Exode/Qadam style) ────────────────────────
const COURSE_COVERS = {
  'Дизайн интерьера': 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=600&h=340&fit=crop',
  'Дата Аналитика': 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=340&fit=crop',
}
const COURSE_COLORS = ['from-blue-600 to-indigo-700', 'from-emerald-600 to-teal-700', 'from-orange-500 to-red-600', 'from-purple-600 to-pink-600']

function CatalogCourseCard({ courseName, courseIcon, course, group, lessonsCount, completedCount, modulesCount, nextLesson, onClick }) {
  const { t } = useLanguage()
  const percentage = lessonsCount > 0 ? Math.round((completedCount / lessonsCount) * 100) : 0
  const isCompleted = percentage === 100 && lessonsCount > 0
  const isStarted = completedCount > 0
  const coverUrl = COURSE_COVERS[courseName] || course?.coverUrl

  return (
    <div onClick={onClick}
      className="bg-white rounded-2xl overflow-hidden cursor-pointer hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 group border border-slate-200/80"
    >
      {/* Cover image or gradient */}
      <div className="relative h-44 overflow-hidden">
        {coverUrl ? (
          <img src={coverUrl} alt={courseName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${COURSE_COLORS[Math.abs(courseName?.charCodeAt(0) || 0) % COURSE_COLORS.length]} flex items-center justify-center`}>
            <span className="text-6xl opacity-30">{courseIcon || '📚'}</span>
          </div>
        )}
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        {/* Status badge */}
        <div className="absolute top-3 left-3">
          {isCompleted ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500 text-white text-xs font-semibold rounded-full shadow-lg">
              <CheckCircle2 size={12} /> {t('lms.completed')}
            </span>
          ) : isStarted ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-500 text-white text-xs font-semibold rounded-full shadow-lg">
              <Play size={12} /> {t('lms.in_progress')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/90 text-slate-700 text-xs font-semibold rounded-full shadow-lg backdrop-blur-sm">
              {t('lms.new_course')}
            </span>
          )}
        </div>

        {/* Course icon */}
        <div className="absolute top-3 right-3 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-xl flex items-center justify-center text-xl shadow-lg">
          {courseIcon || '📚'}
        </div>

        {/* Bottom info on cover */}
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="text-white font-bold text-lg leading-tight drop-shadow-lg">{courseName}</h3>
          <p className="text-white/80 text-xs mt-1">{group.name} · {course?.duration || ''}</p>
        </div>
      </div>

      {/* Card body */}
      <div className="p-4">
        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
          <span className="flex items-center gap-1"><FileText size={12} className="text-blue-500" /> {lessonsCount} {t('lms.lessons_count')}</span>
          {modulesCount > 0 && <span className="flex items-center gap-1"><Layers size={12} className="text-purple-500" /> {modulesCount} {t('lms.modules')}</span>}
          {group.schedule && <span className="flex items-center gap-1"><Clock size={12} className="text-slate-400" /> {group.schedule}</span>}
        </div>

        {/* Progress */}
        {isStarted && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-500">{t('lms.course_progress')}</span>
              <span className={`font-bold ${isCompleted ? 'text-emerald-600' : 'text-blue-600'}`}>{percentage}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${isCompleted ? 'bg-emerald-500' : 'bg-blue-500'}`}
                style={{ width: `${percentage}%` }} />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{completedCount} из {lessonsCount} {t('lms.completed_lessons')}</p>
          </div>
        )}

        {/* Next lesson hint */}
        {!isCompleted && nextLesson && (
          <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-xl mb-3">
            <Play size={14} className="text-blue-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-blue-500 font-medium uppercase">{t('lms.next_lesson')}</p>
              <p className="text-xs text-slate-700 truncate">{nextLesson.title}</p>
            </div>
          </div>
        )}

        {/* Action button */}
        <button className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
          isCompleted
            ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
            : isStarted
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25'
              : 'bg-slate-900 text-white hover:bg-slate-800'
        }`}>
          {isCompleted ? <><Eye size={15} /> {t('lms.show_details')}</> :
           isStarted ? <><Play size={15} /> {t('lms.continue_learning')}</> :
           <><Play size={15} /> {t('lms.start_learning')}</>}
        </button>
      </div>
    </div>
  )
}

// ─── Main Dashboard ─────────────────────────────────────────────────
export default function LMSDashboard() {
  const { t } = useLanguage()
  const { user, hasPermission } = useAuth()
  const {
    groups, students, courses, lmsLessons, lmsAssignments, lmsSubmissions, lmsAnnouncements, lmsProgress,
    lmsModules,
    addCourse, updateCourse, deleteCourse,
    addLmsLesson, updateLmsLesson, deleteLmsLesson,
    addLmsModule, updateLmsModule, deleteLmsModule,
    updateGroup,
  } = useData()
  const navigate = useNavigate()
  const isTeacher = user?.role === 'teacher'
  const isStudent = user?.role === 'student'
  const canManage = hasPermission('lms', 'manage')
  const canEdit = hasPermission('lms', 'create_content')

  const [showCourseForm, setShowCourseForm] = useState(false)
  const [editingCourse, setEditingCourse] = useState(null)
  const [searchCourse, setSearchCourse] = useState('')
  const [expandedCourse, setExpandedCourse] = useState(null)
  const [expandedGroup, setExpandedGroup] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [showLessonModal, setShowLessonModal] = useState(null) // { courseId, lesson? }
  const [deleteLessonConfirm, setDeleteLessonConfirm] = useState(null)
  const [showModuleModal, setShowModuleModal] = useState(null) // { courseId, module? }
  const [deleteModuleConfirm, setDeleteModuleConfirm] = useState(null)

  const myStudent = useMemo(() => {
    if (!isStudent) return null
    return students.find(s => s.name === user?.name || s.phone === user?.phone) || null
  }, [students, user, isStudent])

  const lmsExpired = isStudent && myStudent?.lmsExpiresAt && new Date(myStudent.lmsExpiresAt) < new Date()

  const hasLmsAccess = useMemo(() => {
    if (!isStudent) return true
    if (!myStudent) return false
    if (lmsExpired) return false
    return myStudent.lmsAccess === true && myStudent.status === 'active'
  }, [isStudent, myStudent, lmsExpired])

  const isBlocked = isStudent && !hasLmsAccess
  const blockReason = useMemo(() => {
    if (!isStudent || !myStudent) return 'no_student'
    if (lmsExpired) return 'expired'
    if (!myStudent.lmsAccess) return 'no_payment'
    if (myStudent.status === 'debtor') return 'debtor'
    if (myStudent.status === 'frozen') return 'frozen'
    return 'unknown'
  }, [isStudent, myStudent, lmsExpired])

  const myGroups = useMemo(() => {
    if (isTeacher) {
      return groups.filter(g => String(g.teacherId) === String(user?.teacherId) && g.status === 'active')
    }
    if (isStudent) {
      if (!myStudent || !hasLmsAccess) return []
      return groups.filter(g => g.name === myStudent.group || g.id === myStudent.groupId)
    }
    return groups.filter(g => g.status === 'active')
  }, [groups, students, user, isTeacher, isStudent, myStudent, hasLmsAccess])

  const myGroupIds = myGroups.map(g => g.id)

  // Map group → course for lookups
  const myCourseIds = useMemo(() => {
    const ids = new Set()
    myGroups.forEach(g => {
      const c = courses.find(c => c.name === g.course)
      if (c) ids.add(c.id)
    })
    return ids
  }, [myGroups, courses])

  // Progress data per course (for students)
  const courseProgressData = useMemo(() => {
    if (!isStudent || !myStudent) return {}
    const myProgressIds = new Set(
      lmsProgress.filter(p => p.studentId === myStudent.id).map(p => p.lessonId)
    )
    const result = {}
    myGroups.forEach(group => {
      const course = courses.find(c => c.name === group.course)
      if (!course) return
      const lessons = lmsLessons.filter(l => l.courseId === course.id).sort((a, b) => (a.order || 0) - (b.order || 0))
      const completed = lessons.filter(l => myProgressIds.has(l.id))
      const nextLesson = lessons.find(l => !myProgressIds.has(l.id))
      result[group.id] = {
        total: lessons.length,
        completed: completed.length,
        nextLesson,
      }
    })
    return result
  }, [lmsLessons, lmsProgress, myStudent, myGroups, courses, isStudent])

  // Lessons for courses that my groups belong to
  const myLessons = useMemo(() => {
    return lmsLessons
      .filter(l => myCourseIds.has(l.courseId))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  }, [lmsLessons, myCourseIds])

  const myAssignments = useMemo(() => {
    return lmsAssignments
      .filter(a => myGroupIds.includes(a.groupId))
      .sort((a, b) => (b.deadline || '').localeCompare(a.deadline || ''))
  }, [lmsAssignments, myGroupIds])

  const mySubmissions = useMemo(() => {
    if (!isStudent) return []
    const ms = students.find(s => s.name === user?.name || s.phone === user?.phone)
    if (!ms) return []
    return lmsSubmissions.filter(s => s.studentId === ms.id)
  }, [lmsSubmissions, students, user, isStudent])

  const pendingAssignments = useMemo(() => {
    if (!isStudent) return []
    const submittedIds = new Set(mySubmissions.map(s => s.assignmentId))
    return myAssignments.filter(a => !submittedIds.has(a.id) && (!a.deadline || a.deadline >= new Date().toISOString().split('T')[0]))
  }, [myAssignments, mySubmissions, isStudent])

  const myAnnouncements = useMemo(() => {
    return lmsAnnouncements
      .filter(a => myGroupIds.includes(a.groupId) || a.groupId === 'all')
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5)
  }, [lmsAnnouncements, myGroupIds])

  const filteredCourses = useMemo(() => {
    if (!searchCourse.trim()) return courses
    const q = searchCourse.toLowerCase()
    return courses.filter(c => c.name?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q))
  }, [courses, searchCourse])

  const totalLessons = myLessons.length
  const totalAssignments = myAssignments.length
  const completedSubmissions = mySubmissions.filter(s => s.grade !== undefined && s.grade !== null).length

  // Overall student progress
  const overallProgress = useMemo(() => {
    if (!isStudent) return { completed: 0, total: 0, percentage: 0 }
    let total = 0, completed = 0
    Object.values(courseProgressData).forEach(p => {
      total += p.total
      completed += p.completed
    })
    return { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 }
  }, [courseProgressData, isStudent])

  const handleSaveCourse = async (data) => {
    if (editingCourse) {
      await updateCourse(editingCourse.id, data)
    } else {
      await addCourse(data)
    }
    setShowCourseForm(false)
    setEditingCourse(null)
  }

  const handleDeleteCourse = async (courseId) => {
    await deleteCourse(courseId)
    setDeleteConfirm(null)
  }

  const handleSaveLesson = async (data) => {
    if (showLessonModal?.lesson) {
      await updateLmsLesson(showLessonModal.lesson.id, data)
    } else {
      await addLmsLesson(data)
    }
    setShowLessonModal(null)
  }

  const handleDeleteLesson = async (lessonId) => {
    await deleteLmsLesson(lessonId)
    setDeleteLessonConfirm(null)
  }

  const handleSaveModule = async (data) => {
    if (showModuleModal?.module) {
      await updateLmsModule(showModuleModal.module.id, data)
    } else {
      await addLmsModule(data)
    }
    setShowModuleModal(null)
  }

  const handleDeleteModule = async (modId) => {
    // Move lessons from this module to unsorted (remove moduleId)
    const moduleLessons = lmsLessons.filter(l => l.moduleId === modId)
    for (const l of moduleLessons) {
      await updateLmsLesson(l.id, { moduleId: null })
    }
    await deleteLmsModule(modId)
    setDeleteModuleConfirm(null)
  }

  // Toggle module open/closed for a group
  const handleToggleGroupModule = async (groupId, moduleId) => {
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    const current = group.openModules || []
    const updated = current.includes(moduleId)
      ? current.filter(id => id !== moduleId)
      : [...current, moduleId]
    await updateGroup(groupId, { openModules: updated })
  }

  // ─── Blocked Screen ─────────────────────────────────────────────────
  if (isBlocked) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">{t('lms.my_learning')}</h2>
          <p className="text-slate-500 mt-1">{t('lms.access_restricted')}</p>
        </div>
        <div className="max-w-lg mx-auto text-center py-12">
          <div className={`w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center ${
            blockReason === 'expired' ? 'bg-orange-100' : blockReason === 'debtor' ? 'bg-red-100' : blockReason === 'frozen' ? 'bg-blue-100' : 'bg-amber-100'
          }`}>
            {blockReason === 'expired' ? <Clock size={36} className="text-orange-500" /> :
             blockReason === 'debtor' ? <CreditCard size={36} className="text-red-500" /> :
             blockReason === 'frozen' ? <ShieldX size={36} className="text-blue-500" /> :
             <Lock size={36} className="text-amber-500" />}
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">
            {blockReason === 'expired' ? 'Срок доступа истёк' :
             blockReason === 'debtor' ? t('lms.access_suspended') :
             blockReason === 'frozen' ? t('lms.learning_frozen') : t('lms.access_not_activated')}
          </h3>
          <p className="text-slate-500 mb-6 leading-relaxed">
            {blockReason === 'expired'
              ? 'Ваш 6-месячный доступ к записям уроков истёк. Для продления обратитесь к администратору или произведите оплату.'
              : blockReason === 'debtor' ? t('lms.suspended_reason')
              : blockReason === 'frozen' ? t('lms.frozen_reason') : t('lms.not_activated_reason')}
          </p>
          {blockReason === 'expired' && myStudent?.lmsExpiresAt && (
            <p className="text-sm text-orange-600 mb-4">Доступ истёк: {new Date(myStudent.lmsExpiresAt).toLocaleDateString('ru-RU')}</p>
          )}
          <div className="glass-card rounded-2xl p-5 text-left space-y-3">
            <h4 className="text-sm font-semibold text-slate-700">{t('lms.info')}</h4>
            {myStudent && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">{t('lms.student_label')}</span>
                  <span className="font-medium">{myStudent.name}</span>
                </div>
                {myStudent.course && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t('lms.course_label')}</span>
                    <span className="font-medium">{myStudent.course}</span>
                  </div>
                )}
                {myStudent.group && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t('lms.group_label')}</span>
                    <span className="font-medium">{myStudent.group}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">{t('lms.status_label')}</span>
                  <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${
                    myStudent.status === 'debtor' ? 'bg-red-100 text-red-600' :
                    myStudent.status === 'frozen' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                  }`}>
                    {myStudent.status === 'debtor' ? t('lms.status_debtor') :
                     myStudent.status === 'frozen' ? t('lms.status_frozen') : t('lms.status_pending')}
                  </span>
                </div>
                {myStudent.nextPaymentDate && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t('lms.next_payment_date')}</span>
                    <span className="font-medium text-red-500">{myStudent.nextPaymentDate}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-6">
            {t('lms.error_contact')} <span className="font-medium text-slate-600">+998 95 387 79 27</span>
          </p>
        </div>
      </div>
    )
  }

  // ─── Student Catalog-style Dashboard ──────────────────────────────
  if (isStudent) {
    return (
      <div className="min-h-screen">
        {/* Catalog Header */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 -mx-4 -mt-4 px-4 pt-8 pb-10 md:px-8 md:-mx-8 md:-mt-8 mb-8 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
          </div>
          <div className="relative z-10 max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <GraduationCap size={22} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">{t('lms.my_courses')}</h1>
                <p className="text-white/60 text-sm mt-0.5">{t('lms.catalog_subtitle')}</p>
              </div>
            </div>

            {/* Progress summary strip */}
            <div className="flex items-center gap-6 mt-6 flex-wrap">
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5">
                <div className="relative w-10 h-10">
                  <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none" stroke={overallProgress.percentage === 100 ? '#10b981' : '#60a5fa'}
                      strokeWidth="3" strokeDasharray={`${overallProgress.percentage}, 100`} strokeLinecap="round" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                    {overallProgress.percentage}%
                  </span>
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">{t('lms.overall_progress')}</p>
                  <p className="text-white/50 text-xs">{overallProgress.completed}/{overallProgress.total} {t('lms.completed_lessons')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5">
                <BookOpen size={16} className="text-blue-400" />
                <span className="text-white text-sm font-medium">{myGroups.length} {t('lms.courses_count')}</span>
              </div>
              {pendingAssignments.length > 0 && (
                <div className="flex items-center gap-2 bg-amber-500/20 backdrop-blur-sm rounded-xl px-4 py-2.5">
                  <AlertCircle size={16} className="text-amber-400" />
                  <span className="text-amber-200 text-sm font-medium">{pendingAssignments.length} {t('lms.pending_tasks')}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto space-y-8">
          {/* Course Catalog Grid */}
          {myGroups.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
              <GraduationCap size={56} className="mx-auto mb-4 text-slate-300" />
              <h3 className="text-lg font-semibold text-slate-700 mb-1">{t('lms.no_enrolled')}</h3>
              <p className="text-sm text-slate-400">{t('lms.no_enrolled_hint')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {myGroups.map(group => {
                const course = courses.find(c => c.name === group.course)
                const progress = courseProgressData[group.id] || { total: 0, completed: 0, nextLesson: null }
                const modulesCount = course ? lmsModules.filter(m => m.courseId === course.id).length : 0

                return (
                  <CatalogCourseCard
                    key={group.id}
                    courseName={group.course}
                    courseIcon={course?.icon}
                    course={course}
                    group={group}
                    lessonsCount={progress.total}
                    completedCount={progress.completed}
                    modulesCount={modulesCount}
                    nextLesson={progress.nextLesson}
                    onClick={() => navigate(`/lms/course/${group.id}`)}
                  />
                )
              })}
            </div>
          )}

          {/* Bottom section: Pending + Announcements */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Pending assignments */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                  <AlertCircle size={16} className="text-amber-500" />
                </div>
                {t('lms.pending_homework')} ({pendingAssignments.length})
              </h4>
              {pendingAssignments.length === 0 ? (
                <div className="text-center py-6">
                  <CheckCircle2 size={28} className="mx-auto text-emerald-400 mb-2" />
                  <p className="text-sm text-slate-400">{t('lms.no_pending')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingAssignments.slice(0, 5).map(a => {
                    const group = groups.find(g => g.id === a.groupId)
                    return (
                      <button key={a.id}
                        onClick={() => navigate(`/lms/course/${a.groupId}?tab=assignments`)}
                        className="w-full text-left p-3 rounded-xl hover:bg-slate-50 transition-colors border border-slate-100 group"
                      >
                        <p className="text-sm font-medium text-slate-900 truncate group-hover:text-blue-600 transition-colors">{a.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-400">{group?.course}</span>
                          {a.deadline && (
                            <span className="text-xs text-red-500 flex items-center gap-0.5">
                              <Calendar size={10} /> {a.deadline}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Announcements */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                  <Bell size={16} className="text-blue-500" />
                </div>
                {t('lms.announcements')}
              </h4>
              {myAnnouncements.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">{t('lms.no_announcements')}</p>
              ) : (
                <div className="space-y-3">
                  {myAnnouncements.map(a => (
                    <div key={a.id} className="p-3 rounded-xl bg-slate-50/50 border border-slate-100">
                      <p className="text-sm font-medium text-slate-900">{a.title}</p>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{a.content}</p>
                      <p className="text-[10px] text-slate-400 mt-1.5">{a.createdAt?.split('T')[0] || ''}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Teacher / Admin Dashboard ─────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">
            {isTeacher ? t('lms.teacher_panel') : t('lms.admin_title')}
          </h2>
          <p className="text-slate-500 mt-1">
            {isTeacher
              ? `${myGroups.length} ${t('lms.groups_count')} · ${myLessons.length} ${t('lms.lessons_count')}`
              : `${courses.length} ${t('lms.stat_courses')} · ${groups.filter(g => g.status === 'active').length} ${t('lms.active_groups')}`
            }
          </p>
        </div>

        {canManage && (
          <button onClick={() => { setEditingCourse(null); setShowCourseForm(true) }}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700">
            <Plus size={14} /> {t('lms.btn_create_course')}
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card rounded-xl p-4">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mb-2">
            <BookOpen size={16} className="text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{isTeacher ? myGroups.length : courses.length}</p>
          <p className="text-xs text-slate-500">{isTeacher ? t('lms.stat_my_groups') : t('lms.stat_courses')}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center mb-2">
            <FileText size={16} className="text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{totalLessons}</p>
          <p className="text-xs text-slate-500">{t('lms.stat_lessons')}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center mb-2">
            <Clock size={16} className="text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{totalAssignments}</p>
          <p className="text-xs text-slate-500">{t('lms.stat_assignments')}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center mb-2">
            <Award size={16} className="text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{myAnnouncements.length}</p>
          <p className="text-xs text-slate-500">{t('lms.announcements')}</p>
        </div>
      </div>

      {/* COURSES VIEW */}
      {!isTeacher && (
        <div className="space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={searchCourse} onChange={e => setSearchCourse(e.target.value)}
              placeholder={t('lms.search_courses')}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm" />
          </div>

          {filteredCourses.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <GraduationCap size={40} className="mx-auto mb-3 text-slate-300" />
              <p className="text-slate-400">{t('lms.no_courses')}</p>
              {canManage && (
                <button onClick={() => { setEditingCourse(null); setShowCourseForm(true) }}
                  className="mt-3 text-sm text-blue-600 hover:underline">+ {t('lms.btn_create_course')}</button>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {filteredCourses.map(course => {
                const courseGroups = groups.filter(g => g.course === course.name)
                const courseStudents = students.filter(s => s.course === course.name)
                const courseLessons = lmsLessons.filter(l => l.courseId === course.id).sort((a, b) => (a.order || 0) - (b.order || 0))
                const courseModules = lmsModules.filter(m => m.courseId === course.id).sort((a, b) => (a.order || 0) - (b.order || 0))
                const isExpanded = expandedCourse === course.id
                const showLessons = expandedGroup === `course_${course.id}`

                // Group lessons by module
                const lessonsByModule = {}
                courseModules.forEach(m => { lessonsByModule[m.id] = [] })
                lessonsByModule['unsorted'] = []
                courseLessons.forEach(l => {
                  const key = l.moduleId && lessonsByModule[l.moduleId] ? l.moduleId : 'unsorted'
                  lessonsByModule[key].push(l)
                })

                return (
                  <div key={course.id} className="glass-card rounded-2xl overflow-hidden">
                    {/* Course Header */}
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl flex-shrink-0">
                            {course.icon || '📚'}
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900">{course.name}</h4>
                            <p className="text-sm text-slate-500">{course.duration || '—'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {(canManage || canEdit) && (
                            <button onClick={() => setShowLessonModal({ courseId: course.id })}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                              <Plus size={13} /> {t('lms.btn_add_lesson')}
                            </button>
                          )}
                          {canManage && (
                            <>
                              <button onClick={() => { setEditingCourse(course); setShowCourseForm(true) }}
                                className="p-2 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600"><Pencil size={15} /></button>
                              <button onClick={() => setDeleteConfirm(course.id)}
                                className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 size={15} /></button>
                            </>
                          )}
                          <button onClick={() => setExpandedCourse(isExpanded ? null : course.id)}
                            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                            <Settings size={15} />
                          </button>
                        </div>
                      </div>
                      {course.description && <p className="text-sm text-slate-500 mb-3">{course.description}</p>}
                      <div className="flex items-center gap-5 text-sm text-slate-400">
                        <span className="flex items-center gap-1.5"><Layers size={14} /> {courseGroups.length} {t('lms.groups_count')}</span>
                        <span className="flex items-center gap-1.5"><Users size={14} /> {courseStudents.length} {t('lms.students_count')}</span>
                        <span className="flex items-center gap-1.5"><FileText size={14} /> {courseLessons.length} {t('lms.lessons_count')}</span>
                      </div>
                    </div>

                    {/* Course Content — Modules & Lessons */}
                    <div className="border-t border-slate-100">
                      <button
                        onClick={() => setExpandedGroup(showLessons ? null : `course_${course.id}`)}
                        className="w-full flex items-center justify-between px-5 py-3 bg-slate-50/60 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {showLessons ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                          <span className="text-sm font-semibold text-slate-700">
                            {t('lms.course_content')} — {courseModules.length} {t('lms.modules')} · {courseLessons.length} {t('lms.lessons_count')}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">{t('lms.shared_for_all_groups')}</span>
                      </button>

                      {showLessons && (
                        <div className="bg-white">
                          {/* Module management buttons */}
                          {(canManage || canEdit) && (
                            <div className="flex items-center gap-2 px-5 py-2 border-b border-slate-100 bg-slate-50/30">
                              <button onClick={() => setShowModuleModal({ courseId: course.id })}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100">
                                <Plus size={12} /> {t('lms.add_module')}
                              </button>
                              <button onClick={() => setShowLessonModal({ courseId: course.id })}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">
                                <Plus size={12} /> {t('lms.btn_add_lesson')}
                              </button>
                            </div>
                          )}

                          {/* Modules */}
                          {courseModules.map((mod, modIdx) => {
                            const modLessons = lessonsByModule[mod.id] || []
                            const isModOpen = expandedGroup === `mod_${mod.id}`
                            return (
                              <div key={mod.id} className="border-b border-slate-100 last:border-b-0">
                                <div className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50 transition-colors">
                                  <button onClick={() => setExpandedGroup(isModOpen ? `course_${course.id}` : `mod_${mod.id}`)}
                                    className="flex items-center gap-3 flex-1 text-left">
                                    <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                                      <span className="text-xs font-bold text-purple-600">{modIdx + 1}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold text-slate-900">{mod.title}</p>
                                      <p className="text-xs text-slate-400">{modLessons.length} {t('lms.lessons_count')}{mod.description ? ` · ${mod.description}` : ''}</p>
                                    </div>
                                    {isModOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                                  </button>
                                  {(canManage || canEdit) && (
                                    <div className="flex items-center gap-1">
                                      <button onClick={() => setShowModuleModal({ courseId: course.id, module: mod })}
                                        className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600"><Pencil size={12} /></button>
                                      {deleteModuleConfirm === mod.id ? (
                                        <div className="flex items-center gap-1">
                                          <button onClick={() => handleDeleteModule(mod.id)}
                                            className="px-2 py-1 text-[10px] bg-red-600 text-white rounded hover:bg-red-700">{t('lms.btn_delete')}</button>
                                          <button onClick={() => setDeleteModuleConfirm(null)}
                                            className="px-2 py-1 text-[10px] bg-slate-200 text-slate-600 rounded hover:bg-slate-300"><X size={10} /></button>
                                        </div>
                                      ) : (
                                        <button onClick={() => setDeleteModuleConfirm(mod.id)}
                                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
                                      )}
                                    </div>
                                  )}
                                </div>
                                {isModOpen && (
                                  <div className="pl-8 border-t border-slate-50">
                                    {modLessons.length === 0 ? (
                                      <p className="px-5 py-4 text-xs text-slate-400 text-center">{t('lms.no_lessons')}</p>
                                    ) : modLessons.map((lesson, idx) => (
                                      <div key={lesson.id} className="flex items-center gap-3 px-5 py-2 hover:bg-blue-50/30 transition-colors group/lesson">
                                        <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 flex-shrink-0">
                                          {lesson.order || idx + 1}
                                        </div>
                                        <button onClick={() => navigate(`/lms/lesson/${lesson.id}`)} className="flex-1 text-left min-w-0">
                                          <p className="text-sm text-slate-800 truncate">{lesson.title}</p>
                                          <div className="flex items-center gap-2 mt-0.5">
                                            {lesson.videoUrl && <span className="text-[10px] text-purple-500 bg-purple-50 px-1.5 py-0.5 rounded"><Video size={9} className="inline mr-0.5" />Video</span>}
                                            {lesson.materials?.length > 0 && <span className="text-[10px] text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded"><File size={9} className="inline mr-0.5" />{lesson.materials.length}</span>}
                                          </div>
                                        </button>
                                        {(canManage || canEdit) && (
                                          <div className="flex items-center gap-1 opacity-0 group-hover/lesson:opacity-100 transition-opacity">
                                            <button onClick={() => setShowLessonModal({ courseId: course.id, lesson })}
                                              className="p-1 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600"><Pencil size={12} /></button>
                                            {deleteLessonConfirm === lesson.id ? (
                                              <div className="flex items-center gap-1">
                                                <button onClick={() => handleDeleteLesson(lesson.id)} className="px-2 py-0.5 text-[10px] bg-red-600 text-white rounded">{t('lms.btn_delete')}</button>
                                                <button onClick={() => setDeleteLessonConfirm(null)} className="px-1 py-0.5 text-[10px] bg-slate-200 rounded"><X size={9} /></button>
                                              </div>
                                            ) : (
                                              <button onClick={() => setDeleteLessonConfirm(lesson.id)}
                                                className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}

                          {/* Unsorted lessons */}
                          {lessonsByModule['unsorted']?.length > 0 && (
                            <div className="border-b border-slate-100 last:border-b-0">
                              <div className="px-5 py-2 bg-slate-50/50">
                                <p className="text-xs font-semibold text-slate-400">{courseModules.length > 0 ? t('lms.unsorted_lessons') : t('lms.all_lessons')}</p>
                              </div>
                              {lessonsByModule['unsorted'].map((lesson, idx) => (
                                <div key={lesson.id} className="flex items-center gap-3 px-5 py-2 hover:bg-blue-50/30 transition-colors group/lesson">
                                  <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 flex-shrink-0">
                                    {lesson.order || idx + 1}
                                  </div>
                                  <button onClick={() => navigate(`/lms/lesson/${lesson.id}`)} className="flex-1 text-left min-w-0">
                                    <p className="text-sm text-slate-800 truncate">{lesson.title}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      {lesson.videoUrl && <span className="text-[10px] text-purple-500 bg-purple-50 px-1.5 py-0.5 rounded"><Video size={9} className="inline mr-0.5" />Video</span>}
                                      {lesson.materials?.length > 0 && <span className="text-[10px] text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded"><File size={9} className="inline mr-0.5" />{lesson.materials.length}</span>}
                                    </div>
                                  </button>
                                  {(canManage || canEdit) && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover/lesson:opacity-100 transition-opacity">
                                      <button onClick={() => setShowLessonModal({ courseId: course.id, lesson })}
                                        className="p-1 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600"><Pencil size={12} /></button>
                                      {deleteLessonConfirm === lesson.id ? (
                                        <div className="flex items-center gap-1">
                                          <button onClick={() => handleDeleteLesson(lesson.id)} className="px-2 py-0.5 text-[10px] bg-red-600 text-white rounded">{t('lms.btn_delete')}</button>
                                          <button onClick={() => setDeleteLessonConfirm(null)} className="px-1 py-0.5 text-[10px] bg-slate-200 rounded"><X size={9} /></button>
                                        </div>
                                      ) : (
                                        <button onClick={() => setDeleteLessonConfirm(lesson.id)}
                                          className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Empty state */}
                          {courseLessons.length === 0 && courseModules.length === 0 && (
                            <div className="px-5 py-6 text-center">
                              <FileText size={24} className="mx-auto text-slate-200 mb-2" />
                              <p className="text-sm text-slate-400">{t('lms.no_lessons')}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Groups with module access control */}
                    {courseGroups.length > 0 && (
                      <div className="border-t border-slate-100">
                        <div className="px-5 py-2 bg-slate-50/50">
                          <p className="text-xs font-semibold text-slate-400 uppercase">{t('lms.tab_groups')} ({courseGroups.length}) {courseModules.length > 0 ? `· ${t('lms.module_access')}` : ''}</p>
                        </div>
                        <div className="divide-y divide-slate-50">
                          {courseGroups.map(g => {
                            const groupStudents = students.filter(s => s.group === g.name || s.groupId === g.id)
                            const openMods = g.openModules || []
                            const isGroupOpen = expandedGroup === `grp_${g.id}`
                            return (
                              <div key={g.id}>
                                <div className="flex items-center justify-between px-5 py-2.5 hover:bg-blue-50/30 transition-colors">
                                  <button onClick={() => navigate(`/lms/group/${g.id}`)} className="flex-1 text-left">
                                    <p className="text-sm font-medium text-slate-800">{g.name}</p>
                                    <div className="flex items-center gap-3 text-xs text-slate-400">
                                      <span>{g.schedule || t('lms.no_schedule')}</span>
                                      <span className="flex items-center gap-1"><Users size={11} /> {groupStudents.length}</span>
                                      {courseModules.length > 0 && (
                                        <span className="text-emerald-500">{openMods.length}/{courseModules.length} {t('lms.modules_open')}</span>
                                      )}
                                    </div>
                                  </button>
                                  <div className="flex items-center gap-1.5">
                                    {courseModules.length > 0 && canManage && (
                                      <button onClick={() => setExpandedGroup(isGroupOpen ? null : `grp_${g.id}`)}
                                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-purple-600 bg-purple-50 rounded hover:bg-purple-100">
                                        <Lock size={10} /> {t('lms.manage_access')}
                                      </button>
                                    )}
                                    <button onClick={() => navigate(`/lms/group/${g.id}`)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
                                      <ChevronRight size={16} />
                                    </button>
                                  </div>
                                </div>
                                {/* Module access toggles */}
                                {isGroupOpen && courseModules.length > 0 && (
                                  <div className="px-5 py-3 bg-purple-50/30 border-t border-purple-100/50">
                                    <p className="text-xs font-medium text-purple-700 mb-2">{t('lms.open_modules_for')} «{g.name}»:</p>
                                    <div className="space-y-1.5">
                                      {courseModules.map((mod, modIdx) => {
                                        const isOpen = openMods.includes(mod.id)
                                        return (
                                          <label key={mod.id} className="flex items-center gap-3 cursor-pointer group/toggle">
                                            <button
                                              onClick={() => handleToggleGroupModule(g.id, mod.id)}
                                              className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${isOpen ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                            >
                                              <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all shadow-sm ${isOpen ? 'left-[18px]' : 'left-0.5'}`} />
                                            </button>
                                            <span className={`text-sm ${isOpen ? 'text-slate-900 font-medium' : 'text-slate-500'}`}>
                                              {t('lms.module_label')} {modIdx + 1}: {mod.title}
                                            </span>
                                            {isOpen ? (
                                              <CheckCircle2 size={14} className="text-emerald-500" />
                                            ) : (
                                              <Lock size={14} className="text-slate-300" />
                                            )}
                                          </label>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Expanded details — pricing & program */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 p-5 bg-slate-50/50 space-y-4">
                        {course.features?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{t('lms.courseForm_program')}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                              {course.features.map((f, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                                  <CheckCircle size={12} className="text-emerald-500 flex-shrink-0" /> {f}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {course.pricing && (
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{t('lms.tariffs_label')}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {Object.entries(course.pricing).map(([region, tariffs]) => (
                                <div key={region} className="bg-white rounded-lg p-3">
                                  <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1.5">
                                    {region === 'tashkent' ? t('lms.region_tashkent') : region === 'fergana' ? t('lms.region_fergana') : t('lms.region_online')}
                                  </p>
                                  <div className="space-y-1">
                                    {Object.entries(tariffs).map(([tariff, prices]) => (
                                      <div key={tariff} className="flex justify-between text-xs">
                                        <span className="text-slate-500 capitalize">
                                          {tariff === 'standard' ? t('lms.tariff_standard') : tariff === 'vip' ? 'VIP' : tariff === 'premium' ? t('lms.tariff_premium') : t('lms.tariff_individual')}
                                        </span>
                                        <span className="font-semibold text-slate-800">
                                          {new Intl.NumberFormat('ru-RU').format(prices.full)} {t('lms.courseForm_sum')}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {deleteConfirm === course.id && (
                      <div className="border-t border-red-100 bg-red-50 p-3 flex items-center justify-between">
                        <p className="text-xs text-red-600">{t('lms.delete_course_title')}</p>
                        <div className="flex gap-2">
                          <button onClick={() => setDeleteConfirm(null)}
                            className="px-3 py-1 text-xs bg-white rounded-lg hover:bg-slate-50 text-slate-600">{t('lms.btn_cancel')}</button>
                          <button onClick={() => handleDeleteCourse(course.id)}
                            className="px-3 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">{t('lms.btn_delete')}</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TEACHER VIEW — shows their courses with groups inside */}
      {isTeacher && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">{t('lms.my_courses')}</h3>
            {myGroups.length === 0 ? (
              <div className="glass-card rounded-2xl p-8 text-center text-slate-400">
                {t('lms.no_assigned_groups')}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Group teacher's groups by course name */}
                {Object.entries(
                  myGroups.reduce((acc, group) => {
                    const key = group.course || 'Без курса'
                    if (!acc[key]) acc[key] = []
                    acc[key].push(group)
                    return acc
                  }, {})
                ).map(([courseName, courseGroups]) => {
                  const course = courses.find(c => c.name === courseName)
                  return (
                    <div key={courseName} className="glass-card rounded-2xl overflow-hidden">
                      <div className="p-4 flex items-center gap-3 border-b border-slate-100">
                        <span className="text-2xl">{course?.icon || '📚'}</span>
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">{courseName}</h4>
                          <p className="text-xs text-slate-500">{course?.duration || '—'} · {courseGroups.length} {t('lms.groups_count')}</p>
                        </div>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {courseGroups.map(group => {
                          const groupLessons = myLessons.filter(l => l.groupId === group.id)
                          const groupAssignments = myAssignments.filter(a => a.groupId === group.id)
                          const groupStudents = students.filter(s => s.group === group.name || s.groupId === group.id)
                          return (
                            <button key={group.id}
                              onClick={() => navigate(`/lms/group/${group.id}`)}
                              className="w-full flex items-center justify-between p-3 hover:bg-blue-50/50 transition-colors text-left"
                            >
                              <div>
                                <p className="text-sm font-medium text-slate-900">{group.name}</p>
                                <p className="text-xs text-slate-400">{group.schedule || t('lms.no_schedule')}</p>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-400">
                                <span className="flex items-center gap-1"><FileText size={12} /> {groupLessons.length}</span>
                                <span className="flex items-center gap-1"><CheckCircle2 size={12} /> {groupAssignments.length}</span>
                                <span className="flex items-center gap-1"><Users size={12} /> {groupStudents.length}</span>
                                <ChevronRight size={14} className="text-slate-300" />
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {myLessons.length > 0 && (
              <>
                <h3 className="text-lg font-semibold text-slate-900 mt-6">{t('lms.recent_lessons')}</h3>
                <div className="space-y-2">
                  {myLessons.slice(0, 5).map(lesson => {
                    const group = groups.find(g => g.id === lesson.groupId)
                    return (
                      <button key={lesson.id}
                        onClick={() => navigate(`/lms/group/${lesson.groupId}?lesson=${lesson.id}`)}
                        className="w-full glass-card rounded-xl p-3 flex items-center gap-3 text-left hover:shadow-md transition-all"
                      >
                        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                          <BookOpen size={18} className="text-blue-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{lesson.title}</p>
                          <p className="text-xs text-slate-400">{group?.course} · {group?.name}</p>
                        </div>
                        <span className="text-xs text-slate-400">{lesson.date || ''}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          <div className="space-y-4">
            <div className="glass-card rounded-2xl p-4">
              <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Bell size={16} className="text-blue-500" />
                {t('lms.announcements')}
              </h4>
              {myAnnouncements.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">{t('lms.no_announcements')}</p>
              ) : (
                <div className="space-y-3">
                  {myAnnouncements.map(a => (
                    <div key={a.id} className="border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                      <p className="text-sm font-medium text-slate-900">{a.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{a.content}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{a.createdAt?.split('T')[0] || ''}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {myGroups.length > 0 && (
              <div className="glass-card rounded-2xl p-4">
                <h4 className="font-semibold text-slate-900 mb-3">{t('lms.quick_actions')}</h4>
                <div className="space-y-2">
                  <button onClick={() => navigate(`/lms/group/${myGroups[0]?.id}?action=newLesson`)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                    <Plus size={14} /> {t('lms.btn_add_lesson')}
                  </button>
                  <button onClick={() => navigate(`/lms/group/${myGroups[0]?.id}?action=newAssignment`)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
                    <Plus size={14} /> {t('lms.btn_add_assignment')}
                  </button>
                  <button onClick={() => navigate(`/lms/group/${myGroups[0]?.id}?action=newAnnouncement`)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors">
                    <Bell size={14} /> {t('lms.btn_add_announcement')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showCourseForm && (
        <LMSCourseForm
          course={editingCourse}
          onSave={handleSaveCourse}
          onClose={() => { setShowCourseForm(false); setEditingCourse(null) }}
        />
      )}

      {showLessonModal && (
        <LessonFormModal
          courseId={showLessonModal.courseId}
          lesson={showLessonModal.lesson || null}
          modules={lmsModules.filter(m => m.courseId === showLessonModal.courseId).sort((a, b) => (a.order || 0) - (b.order || 0))}
          onSave={handleSaveLesson}
          onClose={() => setShowLessonModal(null)}
        />
      )}

      {showModuleModal && (
        <ModuleFormModal
          mod={showModuleModal.module || null}
          courseId={showModuleModal.courseId}
          nextOrder={(lmsModules.filter(m => m.courseId === showModuleModal.courseId).length) + 1}
          onSave={handleSaveModule}
          onClose={() => setShowModuleModal(null)}
        />
      )}
    </div>
  )
}
