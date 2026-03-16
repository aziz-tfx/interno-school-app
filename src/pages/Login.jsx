import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Eye, EyeOff, LogIn } from 'lucide-react'

export default function Login() {
  const { login, error, setError } = useAuth()
  const [form, setForm] = useState({ login: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    login(form.login, form.password)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white tracking-tight">INTERNO</h1>
          <p className="text-blue-300 mt-2">School Management System</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Вход в систему</h2>
            <p className="text-sm text-slate-500 mt-1">Введите ваши данные для входа</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Логин</label>
              <input
                type="text"
                value={form.login}
                onChange={(e) => { setForm({ ...form, login: e.target.value }); setError('') }}
                placeholder="Введите логин"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Пароль</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => { setForm({ ...form, password: e.target.value }); setError('') }}
                  placeholder="Введите пароль"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-12"
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
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <LogIn size={18} />
            Войти
          </button>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-400 mb-3">Тестовые аккаунты:</p>
            <div className="grid grid-cols-1 gap-2 text-xs">
              <div className="flex justify-between bg-slate-50 px-3 py-2 rounded-lg">
                <span className="text-slate-600"><strong className="text-slate-800">Админ:</strong> admin / admin123</span>
                <span className="text-blue-600 font-medium">Полный доступ</span>
              </div>
              <div className="flex justify-between bg-slate-50 px-3 py-2 rounded-lg">
                <span className="text-slate-600"><strong className="text-slate-800">Продажи:</strong> sales1 / sales123</span>
                <span className="text-emerald-600 font-medium">Ученики + оплаты</span>
              </div>
              <div className="flex justify-between bg-slate-50 px-3 py-2 rounded-lg">
                <span className="text-slate-600"><strong className="text-slate-800">Учитель:</strong> teacher1 / teach123</span>
                <span className="text-purple-600 font-medium">Группы + посещаемость</span>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
