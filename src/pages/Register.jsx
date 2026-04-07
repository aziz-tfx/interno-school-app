import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, ROLE_LABELS } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useLanguage } from '../contexts/LanguageContext'
import {
  Eye, EyeOff, UserPlus, ArrowLeft, User, Phone, Lock, Briefcase,
  Building2, BookOpen, DollarSign, CheckCircle2, AlertCircle,
} from 'lucide-react'
import Logo from '../components/Logo'

const ALLOWED_ROLES = [
  'branch_director', 'rop', 'sales', 'accountant', 'financier', 'hr', 'smm', 'teacher',
]

const ROLE_ICONS = {
  branch_director: Building2,
  rop: Briefcase,
  sales: DollarSign,
  accountant: DollarSign,
  financier: DollarSign,
  hr: User,
  smm: Briefcase,
  teacher: BookOpen,
}

const ROLE_COLORS = {
  branch_director: 'from-indigo-500 to-blue-500',
  rop: 'from-teal-500 to-emerald-500',
  sales: 'from-emerald-500 to-green-500',
  accountant: 'from-amber-500 to-orange-500',
  financier: 'from-orange-500 to-red-500',
  hr: 'from-pink-500 to-rose-500',
  smm: 'from-cyan-500 to-blue-500',
  teacher: 'from-purple-500 to-violet-500',
}

const COMPANY_WIDE_ROLES = ['accountant', 'financier', 'hr', 'smm']

export default function Register() {
  const navigate = useNavigate()
  const { addEmployee, employees } = useAuth()
  const { branches, addTeacher } = useData()
  const { t } = useLanguage()

  const [step, setStep] = useState(1) // 1=personal, 2=role, 3=credentials
  const [form, setForm] = useState({
    name: '',
    phone: '',
    role: '',
    branch: 'tashkent',
    login: '',
    password: '',
    confirmPassword: '',
    subject: '',
    salary: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  const set = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setError('')
  }

  const needsBranch = !COMPANY_WIDE_ROLES.includes(form.role)

  // ─── Validation per step ─────────────────────────────────────────
  const validateStep1 = () => {
    if (!form.name.trim()) { setError('Введите ФИО'); return false }
    if (form.name.trim().split(' ').length < 2) { setError('Введите имя и фамилию'); return false }
    return true
  }

  const validateStep2 = () => {
    if (!form.role) { setError('Выберите должность'); return false }
    if (needsBranch && !form.branch) { setError('Выберите филиал'); return false }
    return true
  }

  const validateStep3 = () => {
    if (!form.login.trim()) { setError('Введите логин'); return false }
    if (form.login.trim().length < 3) { setError('Логин должен быть не менее 3 символов'); return false }
    if (employees.some(e => e.login === form.login.trim())) { setError('Этот логин уже занят'); return false }
    if (!form.password) { setError('Введите пароль'); return false }
    if (form.password.length < 4) { setError('Пароль должен быть не менее 4 символов'); return false }
    if (form.password !== form.confirmPassword) { setError('Пароли не совпадают'); return false }
    return true
  }

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2)
    else if (step === 2 && validateStep2()) setStep(3)
  }

  const handleBack = () => {
    setError('')
    if (step > 1) setStep(step - 1)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateStep3()) return

    setSaving(true)
    try {
      const employeeData = {
        name: form.name.trim(),
        login: form.login.trim(),
        password: form.password,
        role: form.role,
        branch: COMPANY_WIDE_ROLES.includes(form.role) ? 'all' : form.branch,
        phone: form.phone || '',
      }

      const newEmp = await addEmployee(employeeData)

      // If teacher, create teacher record
      if (form.role === 'teacher') {
        await addTeacher({
          name: form.name.trim(),
          branch: form.branch,
          subject: form.subject || '',
          salary: Number(form.salary) || 0,
          groups: 0,
          students: 0,
          rating: 0,
          employeeId: newEmp.id,
        })
      }

      setSuccess(true)
    } catch (err) {
      console.error(err)
      setError('Ошибка при регистрации. Попробуйте ещё раз.')
    }
    setSaving(false)
  }

  // ─── Success screen ──────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-blue-900 to-violet-950 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-green-500/20 rounded-full blur-3xl" />

        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-8">
            <Logo size="xl" variant="light" />
          </div>

          <div className="glass-strong rounded-3xl shadow-2xl shadow-black/20 p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-green-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
              <CheckCircle2 size={40} className="text-white" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900">Регистрация завершена!</h2>
              <p className="text-sm text-slate-500 mt-2">
                Аккаунт <b>{form.name}</b> успешно создан.<br />
                Используйте логин <b>{form.login}</b> для входа.
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 text-left space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Должность:</span>
                <span className="font-medium text-slate-900">{ROLE_LABELS[form.role]}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Логин:</span>
                <span className="font-medium text-slate-900">{form.login}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Пароль:</span>
                <span className="font-medium text-slate-900">{form.password}</span>
              </div>
            </div>

            <button
              onClick={() => navigate('/login')}
              className="w-full bg-gradient-to-r from-blue-600 to-violet-600 text-white py-3 rounded-xl font-medium hover:from-blue-700 hover:to-violet-700 transition-all shadow-lg shadow-blue-500/25"
            >
              Войти в систему
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Step indicators ─────────────────────────────────────────────
  const steps = [
    { num: 1, label: 'Личные данные' },
    { num: 2, label: 'Должность' },
    { num: 3, label: 'Аккаунт' },
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
            {step > 1 && (
              <button onClick={handleBack} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
                <ArrowLeft size={18} className="text-slate-600" />
              </button>
            )}
            <div className="flex-1">
              <h2 className="text-lg font-bold text-slate-900">Регистрация сотрудника</h2>
              <p className="text-xs text-slate-500">Шаг {step} из 3 · {steps[step - 1].label}</p>
            </div>
          </div>

          {/* Progress bar */}
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
            {/* ═══ Step 1: Personal info ═══ */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">ФИО</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text" value={form.name} onChange={e => set('name', e.target.value)}
                      placeholder="Иванов Иван Иванович"
                      className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Телефон</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                      placeholder="+998 90 123 45 67"
                      className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <button type="button" onClick={handleNext}
                  className="w-full bg-gradient-to-r from-blue-600 to-violet-600 text-white py-3 rounded-xl font-medium hover:from-blue-700 hover:to-violet-700 transition-all shadow-lg shadow-blue-500/25 mt-2">
                  Далее
                </button>
              </div>
            )}

            {/* ═══ Step 2: Role ═══ */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">Выберите должность</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ALLOWED_ROLES.map(role => {
                      const Icon = ROLE_ICONS[role] || Briefcase
                      const isSelected = form.role === role
                      return (
                        <button
                          key={role} type="button"
                          onClick={() => {
                            set('role', role)
                            if (COMPANY_WIDE_ROLES.includes(role)) set('branch', 'all')
                            else if (form.branch === 'all') set('branch', 'tashkent')
                          }}
                          className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-all text-sm ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-500/10'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected ? `bg-gradient-to-br ${ROLE_COLORS[role]} text-white shadow-sm` : 'bg-slate-100 text-slate-500'
                          }`}>
                            <Icon size={15} />
                          </div>
                          <span className={`font-medium leading-tight ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                            {ROLE_LABELS[role]}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Branch (only if role needs it) */}
                {form.role && needsBranch && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Филиал</label>
                    <div className="relative">
                      <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <select value={form.branch} onChange={e => set('branch', e.target.value)}
                        className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 appearance-none">
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Teacher fields */}
                {form.role === 'teacher' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Предмет</label>
                      <input type="text" value={form.subject} onChange={e => set('subject', e.target.value)}
                        placeholder="Напр. Математика"
                        className="w-full px-4 py-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Зарплата</label>
                      <input type="number" value={form.salary} onChange={e => set('salary', e.target.value)}
                        placeholder="0" min="0"
                        className="w-full px-4 py-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400" />
                    </div>
                  </div>
                )}

                <button type="button" onClick={handleNext} disabled={!form.role}
                  className="w-full bg-gradient-to-r from-blue-600 to-violet-600 text-white py-3 rounded-xl font-medium hover:from-blue-700 hover:to-violet-700 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed mt-2">
                  Далее
                </button>
              </div>
            )}

            {/* ═══ Step 3: Credentials ═══ */}
            {step === 3 && (
              <div className="space-y-4">
                {/* Summary card */}
                <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl p-4 flex items-center gap-3 border border-slate-200/60">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${ROLE_COLORS[form.role] || 'from-blue-500 to-violet-500'} text-white flex items-center justify-center font-bold text-lg shadow-lg`}>
                    {form.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{form.name}</p>
                    <p className="text-xs text-slate-500">{ROLE_LABELS[form.role]}{form.phone ? ` · ${form.phone}` : ''}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Логин</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text" value={form.login} onChange={e => set('login', e.target.value)}
                      placeholder="Придумайте логин"
                      className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Пароль</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)}
                      placeholder="Придумайте пароль"
                      className="w-full pl-10 pr-12 py-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400"
                    />
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
                    <input
                      type={showPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)}
                      placeholder="Повторите пароль"
                      className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400"
                    />
                  </div>
                  {form.password && form.confirmPassword && form.password === form.confirmPassword && (
                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><CheckCircle2 size={12} /> Пароли совпадают</p>
                  )}
                </div>

                <button type="submit" disabled={saving}
                  className="w-full bg-gradient-to-r from-emerald-600 to-green-600 text-white py-3 rounded-xl font-medium hover:from-emerald-700 hover:to-green-700 transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 disabled:opacity-50 mt-2">
                  {saving ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <UserPlus size={18} />
                      Зарегистрироваться
                    </>
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
