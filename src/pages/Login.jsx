import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import Logo from '../components/Logo'

export default function Login() {
  const { t } = useLanguage()
  const { login, error, setError } = useAuth()
  const [form, setForm] = useState({ login: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    login(form.login, form.password)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-blue-900 to-violet-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative blurred circles */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-violet-500/20 rounded-full blur-3xl" />
      <div className="absolute top-[30%] right-[20%] w-[300px] h-[300px] bg-cyan-500/10 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <Logo size="xl" variant="light" />
        </div>

        <form onSubmit={handleSubmit} className="glass-strong rounded-3xl shadow-2xl shadow-black/20 p-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t('login.heading')}</h2>
            <p className="text-sm text-slate-500 mt-1">{t('login.subtitle')}</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-200/50 text-red-700 px-4 py-3 rounded-xl text-sm backdrop-blur-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('login.label_login')}</label>
              <input
                type="text"
                value={form.login}
                onChange={(e) => { setForm({ ...form, login: e.target.value }); setError('') }}
                placeholder={t('login.placeholder_login')}
                className="w-full px-4 py-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('login.label_password')}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => { setForm({ ...form, password: e.target.value }); setError('') }}
                  placeholder={t('login.placeholder_password')}
                  className="w-full px-4 py-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 pr-12 placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-blue-600 to-violet-600 text-white py-3 rounded-xl font-medium hover:from-blue-700 hover:to-violet-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
          >
            <LogIn size={18} />
            {t('login.btn_submit')}
          </button>

          <div className="border-t border-slate-200/50 pt-4">
            <p className="text-xs text-slate-400 mb-3">{t('login.test_accounts')}</p>
            <div className="grid grid-cols-1 gap-2 text-xs">
              <div className="flex justify-between glass-input px-3 py-2 rounded-xl bg-amber-50 border-amber-200">
                <span className="text-amber-800"><strong className="text-amber-900">DEMO:</strong> demo / demo123</span>
                <span className="text-amber-600 font-medium">{t('login.test_admin_access')}</span>
              </div>
              <div className="flex justify-between glass-input px-3 py-2 rounded-xl">
                <span className="text-slate-600"><strong className="text-slate-800">{t('login.test_admin')}</strong> admin / admin123</span>
                <span className="text-blue-600 font-medium">{t('login.test_admin_access')}</span>
              </div>
              <div className="flex justify-between glass-input px-3 py-2 rounded-xl">
                <span className="text-slate-600"><strong className="text-slate-800">{t('login.test_sales')}</strong> sales1 / sales123</span>
                <span className="text-emerald-600 font-medium">{t('login.test_sales_access')}</span>
              </div>
              <div className="flex justify-between glass-input px-3 py-2 rounded-xl">
                <span className="text-slate-600"><strong className="text-slate-800">{t('login.test_teacher')}</strong> teacher1 / teach123</span>
                <span className="text-purple-600 font-medium">{t('login.test_teacher_access')}</span>
              </div>
              <div className="flex justify-between glass-input px-3 py-2 rounded-xl">
                <span className="text-slate-600"><strong className="text-slate-800">{t('login.test_student')}</strong> {t('login.test_student_note')}</span>
                <span className="text-slate-500 font-medium">{t('login.test_student_access')}</span>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
