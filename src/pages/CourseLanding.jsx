import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../firebase'
import { collection, query, where, getDocs, addDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import {
  Play, Lock, CheckCircle2, Clock, Users, BookOpen, Star,
  ChevronDown, ChevronRight, Phone, User, ArrowRight,
  GraduationCap, Award, Video, Zap, X, KeyRound,
} from 'lucide-react'
import Logo from '../components/Logo'
import { toast } from '../components/Toaster'

const STORAGE_KEY = 'interno_lead'

export default function CourseLanding() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const { login: authLogin } = useAuth()

  const [course, setCourse] = useState(null)
  const [modules, setModules] = useState([])
  const [lessons, setLessons] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedModule, setExpandedModule] = useState(null)

  const [showRegForm, setShowRegForm] = useState(false)
  const [regForm, setRegForm] = useState({ name: '', phone: '' })
  const [submitting, setSubmitting] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [credentials, setCredentials] = useState(null)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`${STORAGE_KEY}_${courseId}`) || 'null')
      if (saved?.registered) {
        setRegistered(true)
        if (saved.credentials) setCredentials(saved.credentials)
      }
    } catch {}
  }, [courseId])

  useEffect(() => {
    (async () => {
      try {
        const docSnap = await getDoc(doc(db, 'courses', courseId))
        let courseData = null
        if (docSnap.exists()) {
          courseData = { id: docSnap.id, ...docSnap.data() }
          setCourse(courseData)
        }

        const modSnap = await getDocs(query(collection(db, 'lmsModules'), where('courseId', '==', courseId)))
        setModules(modSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)))

        const lessSnap = await getDocs(query(collection(db, 'lmsLessons'), where('courseId', '==', courseId)))
        setLessons(lessSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)))

        // Load groups of this course (to attach landing students to one)
        if (courseData?.name) {
          const grpSnap = await getDocs(query(collection(db, 'groups'), where('course', '==', courseData.name)))
          setGroups(grpSnap.docs.map(d => ({ id: d.id, ...d.data() })))
        }

        const m = modSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0))
        if (m.length > 0) setExpandedModule(m[0].id)
      } catch (err) {
        console.error('Failed to load course:', err)
      }
      setLoading(false)
    })()
  }, [courseId])

  // First module lessons are the "free" ones for registered students
  const firstModuleId = useMemo(() => {
    if (modules.length === 0) return null
    return [...modules].sort((a, b) => (a.order || 1) - (b.order || 1))[0]?.id
  }, [modules])

  const freeLessonIds = useMemo(() => {
    if (firstModuleId) return lessons.filter(l => l.moduleId === firstModuleId).map(l => l.id)
    return lessons.slice(0, 3).map(l => l.id)
  }, [firstModuleId, lessons])

  const tryAutoLogin = (login, password, attempts = 0) => {
    const ok = authLogin(login, password)
    if (ok) { navigate('/'); return }
    if (attempts < 5) setTimeout(() => tryAutoLogin(login, password, attempts + 1), 1000)
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    if (!regForm.name.trim() || !regForm.phone.trim()) {
      toast.error("Ism va telefon raqamini kiriting")
      return
    }
    setSubmitting(true)
    try {
      const tenantId = course?.tenantId || 'default'
      const phoneDigits = regForm.phone.replace(/\D/g, '')
      const login = phoneDigits
      const password = String(100000 + Math.floor(Math.random() * 900000))

      // Reuse account if this phone already registered
      let finalLogin = login, finalPassword = password
      const empSnap = await getDocs(query(collection(db, 'employees'), where('login', '==', login)))
      const existing = empSnap.docs.map(d => d.data()).find(e => e.role === 'student')

      if (existing) {
        finalLogin = existing.login
        finalPassword = existing.password
      } else {
        // Attach to first active group of the course (so cabinet shows the course)
        const courseGroup = groups.find(g => g.status === 'active') || groups[0] || null
        const studentData = {
          name: regForm.name.trim(),
          phone: regForm.phone.trim(),
          course: course.name,
          group: courseGroup?.name || '',
          groupId: courseGroup?.id || '',
          branch: courseGroup?.branch || 'online',
          learningFormat: 'Онлайн',
          status: 'active',
          balance: 0,
          totalCoursePrice: 0,
          lmsAccess: true,
          freeAccess: true,        // grants only the first module
          source: 'landing',
          startDate: new Date().toISOString().split('T')[0],
          lmsLogin: finalLogin,
          lmsPassword: finalPassword,
          tenantId,
        }
        const studentRef = await addDoc(collection(db, 'students'), studentData)
        const empId = Date.now()
        await setDoc(doc(collection(db, 'employees'), String(empId)), {
          id: empId,
          login: finalLogin,
          password: finalPassword,
          name: regForm.name.trim(),
          role: 'student',
          branch: courseGroup?.branch || 'online',
          avatar: regForm.name.trim().charAt(0).toUpperCase(),
          phone: regForm.phone.trim(),
          studentId: studentRef.id,
          tenantId,
        })
      }

      // Save lead + push to amoCRM
      await addDoc(collection(db, 'leads'), {
        name: regForm.name.trim(),
        phone: regForm.phone.trim(),
        courseId,
        courseName: course?.name || '',
        source: 'landing',
        status: 'new',
        createdAt: new Date().toISOString(),
        tenantId,
      })
      try {
        await fetch('/api/amo/push-sale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
          body: JSON.stringify({
            tenantId,
            clientName: regForm.name.trim(),
            phone: regForm.phone.trim(),
            course: course?.name || '',
            amount: 0,
            comment: `🎯 Lid landingdan (bepul 1-modul) — kurs «${course?.name || ''}». Manba: reklama → ochiq kurs sahifasi.`,
            managerName: 'Landing (avto)',
          }),
        })
      } catch (e) { console.warn('amo push failed:', e) }

      const creds = { login: finalLogin, password: finalPassword }
      setCredentials(creds)
      setRegistered(true)
      setShowRegForm(false)
      localStorage.setItem(`${STORAGE_KEY}_${courseId}`, JSON.stringify({ registered: true, credentials: creds }))
      toast.success("Ro'yxatdan o'tdingiz! 1-modul ochildi.")

      // Auto-login into the cabinet
      setTimeout(() => tryAutoLogin(finalLogin, finalPassword, 0), 900)
    } catch (err) {
      console.error(err)
      toast.error("Xatolik yuz berdi. Qaytadan urinib ko'ring.")
    }
    setSubmitting(false)
  }

  const handleLessonClick = (lesson) => {
    const isFree = freeLessonIds.includes(lesson.id)
    if (!isFree || !registered) { setShowRegForm(true); return }
    navigate(`/lms/lesson/${lesson.id}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-blue-900 to-violet-950 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-blue-900 to-violet-950 flex items-center justify-center text-white text-center p-4">
        <div>
          <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-xl font-bold">Kurs topilmadi</p>
        </div>
      </div>
    )
  }

  const totalLessons = lessons.length
  const features = course.features || []
  const pricing = course.pricing || {}
  const landing = course.landing || {}
  const tagline = landing.tagline || course.description || ''
  const forWhom = landing.forWhom || []
  const results = landing.results || []

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950">
      <header className="sticky top-0 z-40 bg-black/30 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Logo size="sm" variant="light" />
          <button onClick={() => registered ? navigate('/') : setShowRegForm(true)}
            className="px-5 py-2 bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity">
            {registered ? "✓ Shaxsiy kabinet" : "Bepul boshlash"}
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-violet-500 rounded-full blur-[128px]" />
          <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] bg-blue-500 rounded-full blur-[128px]" />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 pt-16 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-violet-500/20 border border-violet-400/30 rounded-full text-violet-300 text-sm mb-6">
            <Zap size={14} /> YANGI KURS
          </div>
          <div className="text-6xl mb-4">{course.icon || '📚'}</div>
          <h1 className="text-4xl md:text-6xl font-extrabold text-white leading-tight mb-6">{course.name}</h1>
          {tagline && <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto mb-8">{tagline}</p>}
          <div className="flex items-center justify-center gap-6 text-white/50 text-sm mb-10">
            <span className="flex items-center gap-1.5"><BookOpen size={16} /> {totalLessons} dars</span>
            <span className="flex items-center gap-1.5"><Clock size={16} /> {course.duration || '3 oy'}</span>
            <span className="flex items-center gap-1.5"><Award size={16} /> Sertifikat</span>
          </div>
          <button onClick={() => registered ? navigate('/') : setShowRegForm(true)}
            className="px-8 py-4 bg-gradient-to-r from-violet-600 to-blue-600 text-white text-lg font-bold rounded-2xl hover:scale-105 transition-transform shadow-2xl shadow-violet-500/30">
            {registered ? "✓ Shaxsiy kabinetga o'tish" : "🎯 Bepul boshlash — 1-modul ochiq"}
          </button>

          {/* Credentials after registration */}
          {registered && credentials && (
            <div className="mt-8 max-w-sm mx-auto bg-white/10 border border-white/15 rounded-2xl p-5 text-left">
              <div className="flex items-center gap-2 mb-3">
                <KeyRound size={16} className="text-emerald-400" />
                <p className="text-sm font-semibold text-white">Kirish ma'lumotlari</p>
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                <span className="text-white/50">Login:</span>
                <span className="font-mono font-bold text-white">{credentials.login}</span>
                <span className="text-white/50">Parol:</span>
                <span className="font-mono font-bold text-white">{credentials.password}</span>
              </div>
              <p className="text-xs text-white/40 mt-3">Bu ma'lumotlarni saqlab qo'ying — keyingi safar kirish uchun kerak bo'ladi.</p>
            </div>
          )}
        </div>
      </section>

      {landing.about && (
        <section className="max-w-3xl mx-auto px-4 py-12">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
            <h2 className="text-2xl font-bold text-white mb-4">Kurs haqida</h2>
            <p className="text-white/70 leading-relaxed whitespace-pre-wrap">{landing.about}</p>
          </div>
        </section>
      )}

      {forWhom.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 py-12">
          <h2 className="text-2xl font-bold text-white mb-8 text-center">Bu kurs kimlar uchun</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {forWhom.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-5 bg-gradient-to-br from-violet-500/10 to-blue-500/10 border border-violet-400/20 rounded-2xl">
                <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <Users size={16} className="text-violet-300" />
                </div>
                <p className="text-sm text-white/80 leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {results.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 py-12">
          <h2 className="text-2xl font-bold text-white mb-8 text-center">Nimaga erishasiz</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-5 bg-emerald-500/5 border border-emerald-400/20 rounded-2xl">
                <Star size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-white/80 leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Course Content */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-white mb-8 text-center">Kurs dasturi</h2>
        <div className="space-y-3">
          {modules.length > 0 ? modules.map((mod, modIdx) => {
            const modLessons = lessons.filter(l => l.moduleId === mod.id)
            const isOpen = expandedModule === mod.id
            return (
              <div key={mod.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                <button onClick={() => setExpandedModule(isOpen ? null : mod.id)}
                  className="w-full flex items-center gap-4 p-5 text-left hover:bg-white/5 transition-colors">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${
                    modIdx === 0 ? 'bg-gradient-to-br from-violet-500 to-blue-600 text-white' : 'bg-white/10 text-white/60'
                  }`}>{modIdx + 1}</div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">{mod.title}</p>
                    <p className="text-sm text-white/40">{modLessons.length} dars{modIdx === 0 ? ' · BEPUL' : ''}</p>
                  </div>
                  {isOpen ? <ChevronDown size={18} className="text-white/40" /> : <ChevronRight size={18} className="text-white/40" />}
                </button>
                {isOpen && (
                  <div className="border-t border-white/5 divide-y divide-white/5">
                    {modLessons.map((lesson) => {
                      const isFree = freeLessonIds.includes(lesson.id)
                      const canWatch = isFree && registered
                      return (
                        <button key={lesson.id} onClick={() => handleLessonClick(lesson)}
                          className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-white/5 transition-colors">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            canWatch ? 'bg-emerald-500/20 text-emerald-400' : isFree ? 'bg-violet-500/20 text-violet-400' : 'bg-white/5 text-white/20'
                          }`}>
                            {(canWatch || isFree) ? <Play size={16} /> : <Lock size={14} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${canWatch || isFree ? 'text-white' : 'text-white/40'}`}>{lesson.title}</p>
                            {lesson.description && <p className="text-xs text-white/30 truncate">{lesson.description}</p>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {lesson.videoUrl && <span className="text-xs text-white/30 flex items-center gap-1"><Video size={12} /> Video</span>}
                            {isFree && !registered && <span className="text-[10px] bg-violet-500/30 text-violet-300 px-2 py-0.5 rounded-full font-semibold">BEPUL</span>}
                            {canWatch && <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full font-semibold">KO'RISH</span>}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }) : lessons.map((lesson) => {
            const isFree = freeLessonIds.includes(lesson.id)
            const canWatch = isFree && registered
            return (
              <button key={lesson.id} onClick={() => handleLessonClick(lesson)}
                className="w-full flex items-center gap-4 p-5 bg-white/5 border border-white/10 rounded-2xl text-left hover:bg-white/8 transition-colors">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold ${
                  canWatch ? 'bg-emerald-500/20 text-emerald-400' : isFree ? 'bg-violet-500/20 text-violet-400' : 'bg-white/5 text-white/20'
                }`}>{(canWatch || isFree) ? <Play size={18} /> : <Lock size={16} />}</div>
                <div className="flex-1"><p className={`font-medium ${canWatch || isFree ? 'text-white' : 'text-white/40'}`}>{lesson.title}</p></div>
                {isFree && !registered && <span className="text-xs bg-violet-500/30 text-violet-300 px-2 py-0.5 rounded-full">BEPUL</span>}
              </button>
            )
          })}
        </div>
      </section>

      {features.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold text-white mb-8 text-center">Nimani o'rganasiz</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((f, i) => (
              <div key={i} className="flex items-start gap-3 p-4 bg-white/5 border border-white/10 rounded-xl">
                <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-white/80">{f}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {Object.keys(pricing).length > 0 && (
        <section className="max-w-4xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold text-white mb-8 text-center">Tariflar</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(pricing).map(([region, tariffs]) => (
              <div key={region} className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <p className="text-xs font-semibold text-violet-400 uppercase tracking-wide mb-4">
                  {region === 'tashkent' ? 'Toshkent' : region === 'fergana' ? 'Viloyatlar' : region === 'online' ? 'Onlayn' : region}
                </p>
                <div className="space-y-3">
                  {Object.entries(tariffs).map(([tariff, prices]) => (
                    <div key={tariff} className="flex justify-between items-center">
                      <span className="text-sm text-white/60 capitalize">{tariff === 'standard' ? 'Standart' : tariff}</span>
                      <span className="text-lg font-bold text-white">
                        {typeof prices === 'object' ? (prices.full || prices.monthly || '—').toLocaleString('ru-RU') : prices.toLocaleString('ru-RU')}
                        <span className="text-xs text-white/40 ml-1">so'm</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="bg-gradient-to-r from-violet-600/20 to-blue-600/20 border border-violet-400/20 rounded-3xl p-10">
          <h2 className="text-2xl font-bold text-white mb-4">
            {registered ? "1-modulga ruxsat ochildi!" : "Bepul o'rganishni boshlang"}
          </h2>
          <p className="text-white/50 mb-6">
            {registered ? "Yuqoriga o'ting va ochiq darslarni bosing yoki shaxsiy kabinetga kiring" : "Ro'yxatdan o'ting va kursning birinchi moduliga bepul ruxsat oling"}
          </p>
          <button onClick={() => registered ? navigate('/') : setShowRegForm(true)}
            className="px-8 py-4 bg-gradient-to-r from-violet-600 to-blue-600 text-white text-lg font-bold rounded-2xl hover:scale-105 transition-transform shadow-2xl shadow-violet-500/30">
            {registered ? "Shaxsiy kabinetga o'tish" : "Bepul ruxsat olish"}
          </button>
        </div>
      </section>

      <footer className="border-t border-white/5 py-8 text-center">
        <Logo size="sm" variant="light" />
        <p className="text-white/30 text-xs mt-3">© {new Date().getFullYear()} INTERNO School</p>
      </footer>

      {/* Registration modal */}
      {showRegForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowRegForm(false)} />
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-[scaleIn_200ms_ease-out]">
            <div className="bg-gradient-to-r from-violet-600 to-blue-600 px-8 pt-8 pb-6 text-center">
              <GraduationCap size={40} className="mx-auto text-white/80 mb-3" />
              <h3 className="text-xl font-bold text-white">Bepul ruxsat</h3>
              <p className="text-white/60 text-sm mt-1">«{course.name}» kursining 1-modulini bepul oling</p>
            </div>
            <button onClick={() => setShowRegForm(false)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white">
              <X size={16} />
            </button>
            <form onSubmit={handleRegister} className="p-8 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Ismingiz *</label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" value={regForm.name} onChange={e => setRegForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Ism Familiya" required autoFocus
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Telefon raqami *</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="tel" value={regForm.phone} onChange={e => setRegForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+998 90 123 45 67" required
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                </div>
              </div>
              <button type="submit" disabled={submitting}
                className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity shadow-lg shadow-violet-500/25">
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><ArrowRight size={18} /> Ruxsat olish</>
                )}
              </button>
              <p className="text-[11px] text-slate-400 text-center">
                Tugmani bosish orqali shaxsiy ma'lumotlarni qayta ishlashga rozilik bildirasiz
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
