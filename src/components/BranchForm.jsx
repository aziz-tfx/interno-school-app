import { useState, useEffect } from 'react'

export default function BranchForm({ branch, onSave, onClose }) {
  const isEdit = !!branch

  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    director: '',
    openDate: new Date().toISOString().split('T')[0],
    capacity: 100,
    monthlyRevenue: 0,
    monthlyExpenses: 0,
    rating: 0,
  })

  useEffect(() => {
    if (branch) {
      setForm({
        name: branch.name || '',
        address: branch.address || '',
        phone: branch.phone || '',
        director: branch.director || '',
        openDate: branch.openDate || '',
        capacity: branch.capacity || 100,
        monthlyRevenue: branch.monthlyRevenue || 0,
        monthlyExpenses: branch.monthlyExpenses || 0,
        rating: branch.rating || 0,
      })
    }
  }, [branch])

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...form,
      capacity: Number(form.capacity),
      monthlyRevenue: Number(form.monthlyRevenue),
      monthlyExpenses: Number(form.monthlyExpenses),
      rating: Number(form.rating),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Название филиала *</label>
          <input type="text" value={form.name} onChange={e => set('name', e.target.value)} required
            placeholder="Ташкент"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Адрес *</label>
          <input type="text" value={form.address} onChange={e => set('address', e.target.value)} required
            placeholder="ул. Амира Темура, 45"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Телефон</label>
          <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
            placeholder="+998 71 200-00-01"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Директор</label>
          <input type="text" value={form.director} onChange={e => set('director', e.target.value)}
            placeholder="Каримов Азиз"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Дата открытия</label>
          <input type="date" value={form.openDate} onChange={e => set('openDate', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Вместимость (учеников)</label>
          <input type="number" min="1" value={form.capacity} onChange={e => set('capacity', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {isEdit && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ежемесячный доход (сум)</label>
              <input type="number" min="0" step="1000000" value={form.monthlyRevenue} onChange={e => set('monthlyRevenue', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ежемесячные расходы (сум)</label>
              <input type="number" min="0" step="1000000" value={form.monthlyExpenses} onChange={e => set('monthlyExpenses', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Рейтинг (1-5)</label>
              <input type="number" min="0" max="5" step="0.1" value={form.rating} onChange={e => set('rating', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
          Отмена
        </button>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          {isEdit ? 'Сохранить' : 'Добавить филиал'}
        </button>
      </div>
    </form>
  )
}
