import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import Logo from '../components/Logo'

export default function Login() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { login, error, setError } = useAuth()
  const [form, setForm] = useState({ login: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)

  // Prefill credentials handed off from the course landing registration
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('interno_prefill_login') || 'null')
      if (saved?.login) {
        setForm({ login: saved.login, password: saved.password || '' })
        localStorage.removeItem('interno_prefill_login')
      }
    } catch {}
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    login(form.login, form.password)
  }

  return (
    <div className="min-h-[100dvh] bg-[#f5f6f8] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Pastel accent shapes — soft crayon-box washes on the white canvas */}
      <div className="absolute top-[-15%] left-[-8%] w-[440px] h-[440px] bg-[#bcfe90]/50 rounded-full blur-3xl" />
      <div className="absolute bottom-[-18%] right-[-8%] w-[480px] h-[480px] bg-[#abf0ff]/60 rounded-full blur-3xl" />
      <div className="absolute top-[25%] right-[15%] w-[300px] h-[300px] bg-[#eddff7]/80 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <Logo size="xl" variant="dark" />
        </div>

        <form onSubmit={handleSubmit} className="glass-strong rounded-[24px] p-8 space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-[#333333] tracking-tight">{t('login.heading')}</h2>
            <p className="text-sm text-[#535768] mt-1">{t('login.subtitle')}</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#43465a] mb-1.5">{t('login.label_login')}</label>
              <input
                type="text"
                value={form.login}
                onChange={(e) => { setForm({ ...form, login: e.target.value }); setError('') }}
                placeholder={t('login.placeholder_login')}
                className="w-full px-4 py-3 bg-white border border-[#dddfeb] rounded-md text-sm placeholder:text-[#808080]"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#43465a] mb-1.5">{t('login.label_password')}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => { setForm({ ...form, password: e.target.value }); setError('') }}
                  placeholder={t('login.placeholder_password')}
                  className="w-full px-4 py-3 bg-white border border-[#dddfeb] rounded-md text-sm pr-12 placeholder:text-[#808080]"
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
            className="w-full bg-[#6161ff] text-white py-3 rounded-full font-medium hover:bg-[#4f4fe6] transition-all flex items-center justify-center gap-2"
          >
            <LogIn size={18} />
            {t('login.btn_submit')}
          </button>

          <div className="text-center mt-4 pt-4 border-t border-[#eceef4] space-y-2">
            <p className="text-sm text-[#535768]">
              Нет аккаунта?{' '}
              <button type="button" onClick={() => navigate('/register')} className="text-[#5a5af5] font-medium hover:text-[#4747d1]">
                Зарегистрироваться
              </button>
            </p>
            <p className="text-sm text-[#535768]">
              Хотите подключить свою школу?{' '}
              <button type="button" onClick={() => navigate('/register-school')} className="text-[#2a5c4e] font-medium hover:text-[#1e4a3d]">
                Создать школу
              </button>
            </p>
          </div>

        </form>
      </div>
    </div>
  )
}
