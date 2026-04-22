import { useState, useEffect } from 'react'
import { X, Save, Loader, Copy } from 'lucide-react'
import { db } from '../firebase'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { DEFAULT_TENANT_ID } from '../utils/tenancy'

const METRIC_FIELDS = [
  { key: 'leadsNew',      label: 'Кол-во "Новая заявка"' },
  { key: 'leadsInWork',   label: 'Кол-во "Взяли в работу"' },
  { key: 'qualified',     label: 'Квалифицированных' },
  { key: 'trialAssigned', label: 'ПУ назначено' },
  { key: 'trialAttended', label: 'ПУ проведено' },
  { key: 'termsAgreed',   label: 'Условия согласованы' },
  { key: 'sales',         label: 'Продажи' },
  { key: 'revenue',       label: 'Выручка (сум)' },
]

const emptyPlan = () => Object.fromEntries(METRIC_FIELDS.map(f => [f.key, 0]))

export default function AmoPlanEditor({ isOpen, onClose, month, users, onSaved }) {
  const { user } = useAuth()
  const tenantId = user?.tenantId || DEFAULT_TENANT_ID
  const [plans, setPlans] = useState({})      // { [userId]: {...metrics} }
  const [workingDays, setWorkingDays] = useState(26)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen || !month) return
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const snap = await getDoc(doc(db, 'amoPlans', `${tenantId}_${month}`))
        if (snap.exists()) {
          const d = snap.data()
          setPlans(d.managers || {})
          setWorkingDays(d.workingDays || 26)
        } else {
          // Попробовать скопировать из предыдущего месяца
          const [y, m] = month.split('-').map(Number)
          const prevDate = new Date(y, m - 2, 1)
          const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
          const prevSnap = await getDoc(doc(db, 'amoPlans', `${tenantId}_${prevMonth}`))
          if (prevSnap.exists()) {
            setPlans(prevSnap.data().managers || {})
            setWorkingDays(prevSnap.data().workingDays || 26)
          } else {
            setPlans({})
          }
        }
      } catch (e) {
        setError('Не удалось загрузить план: ' + e.message)
      }
      setLoading(false)
    }
    load()
  }, [isOpen, month, tenantId])

  const setMetric = (userId, key, value) => {
    setPlans(prev => ({
      ...prev,
      [userId]: { ...(prev[userId] || emptyPlan()), [key]: Number(value) || 0 },
    }))
  }

  const copyFromUser = (fromUserId, toUserId) => {
    if (!plans[fromUserId]) return
    setPlans(prev => ({ ...prev, [toUserId]: { ...plans[fromUserId] } }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'amoPlans', `${tenantId}_${month}`), {
        tenantId,
        month,
        managers: plans,
        workingDays,
        updatedAt: serverTimestamp(),
      })
      onSaved?.(plans, workingDays)
      onClose()
    } catch (e) {
      setError('Ошибка сохранения: ' + e.message)
    }
    setSaving(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">План на {month}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Заполните месячный план для каждого менеджера</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm text-slate-700">Рабочих дней в месяце:</label>
            <input type="number" min="1" max="31" value={workingDays}
              onChange={e => setWorkingDays(Number(e.target.value) || 26)}
              className="w-20 px-2 py-1 border border-slate-200 rounded-md text-sm" />
          </div>

          {error && (
            <div className="mb-3 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
          )}

          {loading ? (
            <div className="py-12 flex items-center justify-center text-slate-400">
              <Loader size={20} className="animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500">
                    <th className="text-left px-3 py-2 sticky left-0 bg-slate-50">Менеджер</th>
                    {METRIC_FIELDS.map(f => (
                      <th key={f.key} className="text-right px-2 py-2 min-w-[110px]">{f.label}</th>
                    ))}
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && (
                    <tr><td colSpan={METRIC_FIELDS.length + 2} className="text-center py-6 text-slate-400 text-sm">
                      Пользователи amoCRM ещё не загружены. Откройте страницу «amoCRM эффективность» и повторите.
                    </td></tr>
                  )}
                  {users.map(u => (
                    <tr key={u.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-700 sticky left-0 bg-white">{u.name}</td>
                      {METRIC_FIELDS.map(f => (
                        <td key={f.key} className="px-1 py-1">
                          <input
                            type="number"
                            min="0"
                            value={plans[u.id]?.[f.key] ?? ''}
                            onChange={e => setMetric(u.id, f.key, e.target.value)}
                            className="w-full px-2 py-1.5 text-right border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                      ))}
                      <td className="px-1">
                        {users.find(o => o.id !== u.id && plans[o.id]) && (
                          <button
                            onClick={() => {
                              const src = users.find(o => o.id !== u.id && plans[o.id])
                              if (src) copyFromUser(src.id, u.id)
                            }}
                            title="Скопировать от другого менеджера"
                            className="p-1 text-slate-400 hover:text-blue-600"
                          >
                            <Copy size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
            Отмена
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
            {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
            Сохранить план
          </button>
        </div>
      </div>
    </div>
  )
}

export { METRIC_FIELDS, emptyPlan }
