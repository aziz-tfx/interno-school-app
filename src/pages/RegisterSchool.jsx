import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  Eye, EyeOff, Building2, User, Phone, Lock, Mail,
  CheckCircle2, AlertCircle, ArrowLeft, Rocket, GraduationCap,
} from 'lucide-react'
import Logo from '../components/Logo'
import { createTenant, DEFAULT_TENANT_ID } from '../utils/tenancy'
import { db } from '../firebase'
import { collection, doc, setDoc, getDocs, query, where } from 'firebase/firestore'

export default function RegisterSchool() {
  const navigate = useNavigate()
  const { login: authLogin } = useAuth()

  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    schoolName: '',
    ownerName: '',
    phone: '',
    email: '',
    login: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const set = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setError('')
  }

  const validateStep1 = () => {
    if (!form.schoolName.trim()) { setError('Введите название школы'); return false }
    if (form.schoolName.trim().length < 3) { setError('Название должно быть не менее 3 символов'); return false }
    if (!form.ownerName.trim()) { setError('Введите ваше ФИО'); return false }
    if (form.ownerName.trim().split(' ').length < 2) { setError('Введите имя и фамилию'); return false }
    return true
  }

  const validateStep2 = () => {
    if (!form.login.trim()) { setError('Введите логин'); return false }
    if (form.login.trim().length < 3) { setError('Логин должен быть не менее 3 символов'); return false }
    if (!form.password) { setError('Введите пароль'); return false }
    if (form.password.length < 4) { setError('Пароль должен быть не менее 4 символов'); return false }
    if (form.password !== form.confirmPassword) { setError('Пароли не совпадают'); return false }
    return true
  }

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateStep2()) return

    setSaving(true)
    setError('')

    try {
      // Check if login already exists across all tenants
      const empSnap = await getDocs(collection(db, 'employees'))
      const loginExists = empSnap.docs.some(d => d.data().login === form.login.trim())
      if (loginExists) {
        setError('Этот логин уже занят. Выберите другой.')
        setSaving(false)
        return
      }

      // Create tenant
      const tenantId = `tenant_${Date.now()}`
      await createTenant({
        id: tenantId,
        name: form.schoolName.trim(),
        plan: 'free',
        ownerName: form.ownerName.trim(),
        ownerPhone: form.phone || '',
        ownerEmail: form.email || '',
        limits: { students: 50, employees: 10, branches: 2 },
      })

      // Create owner employee for this tenant
      const ownerId = Date.now()
      const ownerData = {
        id: ownerId,
        login: form.login.trim(),
        password: form.password,
        name: form.ownerName.trim(),
        role: 'owner',
        branch: 'all',
        avatar: form.ownerName.trim().charAt(0).toUpperCase(),
        phone: form.phone || '',
        tenantId,
      }
      await setDoc(doc(collection(db, 'employees'), String(ownerId)), ownerData)

      // Create a default branch for the new school
      const branchData = {
        name: form.schoolName.trim(),
        status: 'active',
        students: 0,
        teachers: 0,
        courses: 0,
        groups: 0,
        capacity: 100,
        monthlyRevenue: 0,
        monthlyExpenses: 0,
        rating: 0,
        color: '#3b82f6',
        tenantId,
      }
      const { addDoc } = await import('firebase/firestore')
      await addDoc(collection(db, 'branches'), branchData)

      // Auto-login
      setTimeout(() => {
        const loginOk = authLogin(form.login.trim(), form.password)
        if (loginOk) {
          navigate('/')
        } else {
          setSuccess(true)
        }
      }, 500)

    } catch (err) {
      console.error('School registration error:', err)
      setError('Ошибка при регистрации. Попробуйте ещё раз.')
      setSaving(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-blue-900 to-violet-950 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-green-500/20 rounded-full blur-3xl" />
        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-8"><Logo size="xl" variant="light" /></div>
          <div className="glass-strong rounded-3xl shadow-2xl shadow-black/20 p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-green-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
              <CheckCircle2 size={40} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Школа зарегистрирована!</h2>
              <p className="text-sm text-slate-500 mt-2">
                <b>{form.schoolName}</b> успешно создана. Войдите с вашими данными.
              </p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-left space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Школа:</span>
                <span className="font-medium text-slate-900">{form.schoolName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Логин:</span>
                <span className="font-medium text-slate-900">{form.login}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Роль:</span>
                <span className="font-medium text-emerald-600">Владелец</span>
              </div>
            </div>
            <button onClick={() => navigate('/login')}
              className="w-full bg-gradient-to-r from-blue-600 to-violet-600 text-white py-3 rounded-xl font-medium hover:from-blue-700 hover:to-violet-700 transition-all shadow-lg shadow-blue-500/25">
              Войти
            </button>
          </div>
        </div>
      </div>
    )
  }

  const steps = [
    { num: 1, label: 'О школе' },
    { num: 2, label: 'Аккаунт' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-blue-900 to-violet-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-violet-500/20 rounded-full blur-3xl" />
      <div className="absolute top-[30%] right-[20%] w-[300px] h-[300px] bg-cyan-500/10 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-6">
          <Logo size="xl" variant="light" />
        </div>

        <div className="glass-strong rounded-3xl shadow-2xl shadow-black/20 p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            {step > 1 ? (
              <button onClick={() => { setStep(step - 1); setError('') }}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
                <ArrowLeft size={18} className="text-slate-600" />
              </button>
            ) : (
              <button onClick={() => navigate('/login')}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
                <ArrowLeft size={18} className="text-slate-600" />
              </button>
            )}
            <div className="flex-1">
              <h2 className="text-lg font-bold text-slate-900">Регистрация школы</h2>
              <p className="text-xs text-slate-500">Шаг {step} из 2 · {steps[step - 1].label}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
              <GraduationCap size={20} className="text-white" />
            </div>
          </div>

          {/* Progress */}
          <div className="flex gap-2 mb-6">
            {steps.map(s => (
              <div key={s.num} className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${s.num <= step ? 'bg-gradient-to-r from-blue-500 to-violet-500' : 'bg-slate-200'}`} />
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-200/50 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Step 1: School info */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Название школы / учебного центра</label>
                  <div className="relative">
                    <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" value={form.schoolName} onChange={e => set('schoolName', e.target.value)}
                      placeholder="Например: IT Academy" autoFocus
                      className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">ФИО директора / владельца</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" value={form.ownerName} onChange={e => set('ownerName', e.target.value)}
                      placeholder="Иванов Иван Иванович"
                      className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Телефон</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                      placeholder="+998 90 123 45 67"
                      className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email (необязательно)</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                      placeholder="school@example.com"
                      className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400" />
                  </div>
                </div>

                <button type="button" onClick={handleNext}
                  className="w-full bg-gradient-to-r from-blue-600 to-violet-600 text-white py-3 rounded-xl font-medium hover:from-blue-700 hover:to-violet-700 transition-all shadow-lg shadow-blue-500/25 mt-2">
                  Далее
                </button>
              </div>
            )}

            {/* Step 2: Account credentials */}
            {step === 2 && (
              <div className="space-y-4">
                {/* Summary card */}
                <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl p-4 flex items-center gap-3 border border-slate-200/60">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 text-white flex items-center justify-center font-bold text-lg shadow-lg">
                    {form.schoolName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{form.schoolName}</p>
                    <p className="text-xs text-slate-500">{form.ownerName}{form.phone ? ` · ${form.phone}` : ''}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Логин</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" value={form.login} onChange={e => set('login', e.target.value)}
                      placeholder="Придумайте логин" autoFocus
                      className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Пароль</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)}
                      placeholder="Придумайте пароль"
                      className="w-full pl-10 pr-12 py-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Подтвердите пароль</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type={showPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)}
                      placeholder="Повторите пароль"
                      className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400" />
                  </div>
                  {form.password && form.confirmPassword && form.password === form.confirmPassword && (
                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><CheckCircle2 size={12} /> Пароли совпадают</p>
                  )}
                </div>

                {/* What you get */}
                <div className="bg-blue-50/50 border border-blue-200/60 rounded-xl p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-blue-700">Что вы получите (Free):</p>
                  <p className="text-xs text-blue-600">• До 50 студентов, 10 сотрудников, 2 филиала</p>
                  <p className="text-xs text-blue-600">• LMS, расписание, финансы, аналитика</p>
                  <p className="text-xs text-blue-600">• Telegram-уведомления</p>
                </div>

                <button type="submit" disabled={saving}
                  className="w-full bg-gradient-to-r from-emerald-600 to-green-600 text-white py-3 rounded-xl font-medium hover:from-emerald-700 hover:to-green-700 transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 disabled:opacity-50 mt-2">
                  {saving ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><Rocket size={18} /> Создать школу</>
                  )}
                </button>
              </div>
            )}
          </form>

          {/* Link to login */}
          <div className="text-center mt-6 pt-4 border-t border-slate-200/60">
            <p className="text-sm text-slate-500">
              Уже есть аккаунт?{' '}
              <button onClick={() => navigate('/login')} className="text-blue-600 font-medium hover:text-blue-700">
                Войти
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
