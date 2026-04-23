import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, MapPin, Monitor, Check, X, Pencil } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'

const REGION_OPTIONS = [
  { key: 'tashkent', tKey: 'courseForm.region_tashkent', icon: MapPin },
  { key: 'fergana', tKey: 'courseForm.region_fergana', icon: MapPin },
  { key: 'online', tKey: 'courseForm.region_online', icon: Monitor },
]

const TARIFF_OPTIONS = [
  { key: 'standard', tKey: 'courseForm.tariff_standard', color: 'bg-blue-500' },
  { key: 'vip', tKey: 'courseForm.tariff_vip', color: 'bg-purple-500' },
  { key: 'premium', tKey: 'courseForm.tariff_premium', color: 'bg-amber-500' },
  { key: 'individual', tKey: 'courseForm.tariff_individual', color: 'bg-emerald-500' },
  { key: 'budget', tKey: 'courseForm.tariff_budget', color: 'bg-cyan-500' },
]

const ICON_OPTIONS = ['📚', '🎨', '🇬🇧', '📝', '📐', '💻', '🇷🇺', '🇰🇷', '🎓', '🤖', '📊', '🎵', '🏃', '🔬', '📷', '✏️', '🌐', '🧮', '🎭', '🧪']

const emptyTariff = () => ({ full: '', d10: '', d15: '', d20: '', monthly: false })

function buildDefaultPricing() {
  return {
    tashkent: { standard: emptyTariff() },
  }
}

export default function CourseForm({ course, onClose, onSave }) {
  const { t } = useLanguage()
  const isEdit = !!course
  const [openDropdown, setOpenDropdown] = useState(null) // 'region' | `tariff:${regionKey}` | null
  const dropdownRef = useRef(null)

  // Закрытие dropdown по клику вне
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(null)
      }
    }
    if (openDropdown) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openDropdown])

  const [form, setForm] = useState({
    name: '',
    icon: '📚',
    duration: '3 мес',
    description: '',
    featuresText: '',
  })
  const [pricing, setPricing] = useState(buildDefaultPricing())
  const [durationByRegion, setDurationByRegion] = useState({})
  // Inline creation of custom tariff: { regionKey, label } or null
  const [customDraft, setCustomDraft] = useState(null)
  // Inline rename of existing custom tariff: { regionKey, tariffKey, label } or null
  const [renameDraft, setRenameDraft] = useState(null)

  useEffect(() => {
    if (course) {
      setForm({
        name: course.name || '',
        icon: course.icon || '📚',
        duration: course.duration || '3 мес',
        description: course.description || '',
        featuresText: (course.features || []).join('\n'),
      })
      // Deep clone pricing
      if (course.pricing) {
        setPricing(JSON.parse(JSON.stringify(course.pricing)))
      }
      // Load per-region durations
      if (course.durationByRegion) {
        setDurationByRegion({ ...course.durationByRegion })
      }
    }
  }, [course])

  const set = (field, val) => setForm(prev => ({ ...prev, [field]: val }))

  // ─── Pricing helpers ──────────────────────────────────────────────
  const addRegion = (regionKey) => {
    setPricing(prev => ({
      ...prev,
      [regionKey]: { standard: emptyTariff() },
    }))
  }

  const removeRegion = (regionKey) => {
    setPricing(prev => {
      const copy = { ...prev }
      delete copy[regionKey]
      return copy
    })
  }

  const addTariff = (regionKey, tariffKey, customLabel) => {
    setPricing(prev => ({
      ...prev,
      [regionKey]: {
        ...prev[regionKey],
        [tariffKey]: { ...emptyTariff(), ...(customLabel ? { label: customLabel } : {}) },
      },
    }))
  }

  const commitCustomTariff = (regionKey, rawLabel) => {
    const cleanLabel = (rawLabel || '').trim()
    if (!cleanLabel) {
      setCustomDraft(null)
      return
    }
    const slug = cleanLabel.toLowerCase().replace(/[^\w\u0400-\u04FF]+/g, '_').replace(/^_+|_+$/g, '') || 'custom'
    let key = slug
    let i = 1
    const existing = pricing[regionKey] || {}
    while (existing[key]) {
      key = `${slug}_${i++}`
    }
    addTariff(regionKey, key, cleanLabel)
    setCustomDraft(null)
  }

  const renameTariff = (regionKey, tariffKey, newLabel) => {
    const clean = (newLabel || '').trim()
    if (!clean) {
      setRenameDraft(null)
      return
    }
    setPricing(prev => ({
      ...prev,
      [regionKey]: {
        ...prev[regionKey],
        [tariffKey]: { ...prev[regionKey][tariffKey], label: clean },
      },
    }))
    setRenameDraft(null)
  }

  const removeTariff = (regionKey, tariffKey) => {
    setPricing(prev => {
      const copy = { ...prev }
      const region = { ...copy[regionKey] }
      delete region[tariffKey]
      copy[regionKey] = region
      return copy
    })
  }

  const updateTariffField = (regionKey, tariffKey, field, value) => {
    setPricing(prev => ({
      ...prev,
      [regionKey]: {
        ...prev[regionKey],
        [tariffKey]: {
          ...prev[regionKey][tariffKey],
          [field]: field === 'monthly' ? value : (value === '' ? '' : Number(value) || 0),
        },
      },
    }))
  }

  const autoCalcDiscounts = (regionKey, tariffKey) => {
    const full = pricing[regionKey]?.[tariffKey]?.full
    if (!full) return
    const fullNum = Number(full)
    updateTariffField(regionKey, tariffKey, 'd10', Math.round(fullNum * 0.9))
    updateTariffField(regionKey, tariffKey, 'd15', Math.round(fullNum * 0.85))
    updateTariffField(regionKey, tariffKey, 'd20', Math.round(fullNum * 0.8))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    // Clean pricing: convert empty strings to undefined, remove zero-only tariffs
    const cleanedPricing = {}
    for (const [region, tariffs] of Object.entries(pricing)) {
      cleanedPricing[region] = {}
      for (const [tariff, values] of Object.entries(tariffs)) {
        const cleaned = {
          full: Number(values.full) || 0,
        }
        if (values.d10) cleaned.d10 = Number(values.d10)
        if (values.d15) cleaned.d15 = Number(values.d15)
        if (values.d20) cleaned.d20 = Number(values.d20)
        if (values.monthly) cleaned.monthly = true
        if (values.label) cleaned.label = values.label
        if (cleaned.full > 0) {
          cleanedPricing[region][tariff] = cleaned
        }
      }
      if (Object.keys(cleanedPricing[region]).length === 0) {
        delete cleanedPricing[region]
      }
    }

    const features = form.featuresText
      ? form.featuresText.split('\n').map(f => f.trim()).filter(Boolean)
      : []

    onSave({
      name: form.name,
      icon: form.icon,
      duration: form.duration,
      durationByRegion: Object.keys(durationByRegion).length > 0 ? durationByRegion : null,
      description: form.description || '',
      features,
      pricing: cleanedPricing,
    })
  }

  const existingRegions = Object.keys(pricing)
  const availableRegions = REGION_OPTIONS.filter(r => !existingRegions.includes(r.key))

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
      {/* Basic info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('courseForm.label_name')}</label>
          <input
            type="text"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            required
            placeholder={t('courseForm.placeholder_name')}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('courseForm.label_icon')}</label>
          <div className="flex flex-wrap gap-1.5">
            {ICON_OPTIONS.map(icon => (
              <button
                key={icon}
                type="button"
                onClick={() => set('icon', icon)}
                className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                  form.icon === icon
                    ? 'bg-blue-100 ring-2 ring-blue-500 scale-110'
                    : 'bg-slate-50 hover:bg-slate-100'
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('courseForm.label_duration')}</label>
          <select
            value={form.duration}
            onChange={e => set('duration', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
              <option key={m} value={`${m} мес`}>{m} мес</option>
            ))}
          </select>
          <p className="text-[10px] text-slate-400 mt-1">Общий срок (по умолчанию)</p>
        </div>

        {/* Per-region duration overrides */}
        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-2">Срок обучения по регионам</label>
          <div className="grid grid-cols-3 gap-3">
            {REGION_OPTIONS.map(r => {
              const regionLabel = t(r.tKey)
              const val = durationByRegion[r.key] || ''
              return (
                <div key={r.key} className="flex items-center gap-2">
                  <div className="flex items-center gap-1 min-w-[90px]">
                    <r.icon size={12} className="text-slate-400" />
                    <span className="text-xs text-slate-600">{regionLabel}</span>
                  </div>
                  <select
                    value={val}
                    onChange={e => {
                      const v = e.target.value
                      setDurationByRegion(prev => {
                        if (!v) {
                          const copy = { ...prev }
                          delete copy[r.key]
                          return copy
                        }
                        return { ...prev, [r.key]: v }
                      })
                    }}
                    className="flex-1 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">— по умолч.</option>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                      <option key={m} value={`${m} мес`}>{m} мес</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">Если не указано — используется общий срок выше</p>
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('courseForm.label_description')}</label>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder={t('courseForm.placeholder_description')}
            rows={2}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('courseForm.label_program')} <span className="text-slate-400 font-normal">{t('courseForm.program_hint')}</span></label>
          <textarea
            value={form.featuresText}
            onChange={e => set('featuresText', e.target.value)}
            placeholder={"Планировка и зонирование\n3D-визуализация\nРабота с заказчиком"}
            rows={4}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
          />
        </div>
      </div>

      {/* Pricing by region */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-slate-900">{t('courseForm.pricing_title')}</h4>
          {availableRegions.length > 0 && (
            <div className="relative" ref={openDropdown === 'region' ? dropdownRef : null}>
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'region' ? null : 'region')}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <Plus size={14} /> {t('courseForm.add_region')}
              </button>
              {openDropdown === 'region' && (
                <div className="absolute right-0 top-full mt-1 bg-white shadow-xl rounded-xl border border-slate-200 py-1 z-20 min-w-[180px]">
                  {availableRegions.map(r => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => { addRegion(r.key); setOpenDropdown(null) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                    >
                      <r.icon size={14} /> {t(r.tKey)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {existingRegions.map(regionKey => {
            const regionOption = REGION_OPTIONS.find(r => r.key === regionKey)
            const regionLabel = regionOption ? t(regionOption.tKey) : regionKey
            const regionTariffs = Object.keys(pricing[regionKey] || {})
            const availableTariffs = TARIFF_OPTIONS.filter(t => !regionTariffs.includes(t.key))

            return (
              <div key={regionKey} className="rounded-xl border border-slate-200 overflow-hidden">
                {/* Region header */}
                <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {regionKey === 'online' ? <Monitor size={14} className="text-slate-500" /> : <MapPin size={14} className="text-slate-500" />}
                    <span className="text-sm font-semibold text-slate-700">{regionLabel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative" ref={openDropdown === `tariff:${regionKey}` ? dropdownRef : null}>
                      <button
                        type="button"
                        onClick={() => setOpenDropdown(openDropdown === `tariff:${regionKey}` ? null : `tariff:${regionKey}`)}
                        className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        <Plus size={12} /> {t('courseForm.add_tariff')}
                      </button>
                      {openDropdown === `tariff:${regionKey}` && (
                        <div className="absolute right-0 top-full mt-1 bg-white shadow-xl rounded-xl border border-slate-200 py-1 z-20 min-w-[220px] max-h-[280px] overflow-y-auto">
                          {availableTariffs.map(tf => (
                            <button
                              key={tf.key}
                              type="button"
                              onClick={() => { addTariff(regionKey, tf.key); setOpenDropdown(null) }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                            >
                              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${tf.color}`} /> {t(tf.tKey)}
                            </button>
                          ))}
                          {availableTariffs.length > 0 && <div className="border-t border-slate-100 my-1" />}
                          <button
                            type="button"
                            onClick={() => {
                              setCustomDraft({ regionKey, label: '' })
                              setOpenDropdown(null)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 text-left font-medium"
                          >
                            <Plus size={12} /> Свой тариф...
                          </button>
                        </div>
                      )}
                    </div>

                    {existingRegions.length > 1 && (
                      <button type="button" onClick={() => removeRegion(regionKey)} className="text-red-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Tariff pricing rows */}
                <div className="p-3 space-y-3">
                  {/* Быстрая кнопка «Свой тариф» — видна всегда */}
                  {customDraft?.regionKey !== regionKey && (
                    <button
                      type="button"
                      onClick={() => setCustomDraft({ regionKey, label: '' })}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-blue-600 bg-blue-50/50 hover:bg-blue-100 border border-dashed border-blue-200 rounded-lg transition-colors"
                    >
                      <Plus size={12} /> Добавить свой тариф
                    </button>
                  )}
                  {/* Inline draft для нового кастомного тарифа */}
                  {customDraft?.regionKey === regionKey && (
                    <div className="bg-blue-50/60 border-2 border-dashed border-blue-300 rounded-lg p-3 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
                      <input
                        autoFocus
                        type="text"
                        value={customDraft.label}
                        onChange={e => setCustomDraft({ ...customDraft, label: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commitCustomTariff(regionKey, customDraft.label) }
                          if (e.key === 'Escape') setCustomDraft(null)
                        }}
                        placeholder="Название тарифа (напр. «Рассрочка», «Группа»)"
                        className="flex-1 px-2 py-1.5 bg-white border border-blue-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => commitCustomTariff(regionKey, customDraft.label)}
                        className="p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomDraft(null)}
                        className="p-1.5 rounded-md bg-slate-200 text-slate-600 hover:bg-slate-300"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  {regionTariffs.map(tariffKey => {
                    const tariffOption = TARIFF_OPTIONS.find(to => to.key === tariffKey)
                    const tp = pricing[regionKey][tariffKey]
                    const tariffLabel = tp?.label || (tariffOption ? t(tariffOption.tKey) : tariffKey)
                    const tariffColor = tariffOption?.color || 'bg-slate-500'
                    const isCustom = !tariffOption // нет в предустановленных → пользовательский
                    const isRenaming = renameDraft?.regionKey === regionKey && renameDraft?.tariffKey === tariffKey

                    return (
                      <div key={tariffKey} className="bg-white rounded-lg border border-slate-100 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${tariffColor}`} />
                            {isRenaming ? (
                              <>
                                <input
                                  autoFocus
                                  type="text"
                                  value={renameDraft.label}
                                  onChange={e => setRenameDraft({ ...renameDraft, label: e.target.value })}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') { e.preventDefault(); renameTariff(regionKey, tariffKey, renameDraft.label) }
                                    if (e.key === 'Escape') setRenameDraft(null)
                                  }}
                                  className="flex-1 min-w-0 px-2 py-1 bg-white border border-blue-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => renameTariff(regionKey, tariffKey, renameDraft.label)}
                                  className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                                >
                                  <Check size={10} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRenameDraft(null)}
                                  className="p-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-300"
                                >
                                  <X size={10} />
                                </button>
                              </>
                            ) : (
                              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                {tariffLabel}
                                {isCustom && (
                                  <button
                                    type="button"
                                    onClick={() => setRenameDraft({ regionKey, tariffKey, label: tariffLabel })}
                                    className="text-slate-400 hover:text-blue-600"
                                    title="Переименовать"
                                  >
                                    <Pencil size={10} />
                                  </button>
                                )}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={tp.monthly || false}
                                onChange={e => updateTariffField(regionKey, tariffKey, 'monthly', e.target.checked)}
                                className="rounded border-slate-300"
                              />
                              {t('courseForm.monthly')}
                            </label>
                            {regionTariffs.length > 1 && (
                              <button type="button" onClick={() => removeTariff(regionKey, tariffKey)} className="text-red-400 hover:text-red-600">
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="text-[10px] text-slate-400 mb-0.5 block">{t('courseForm.full_price')}</label>
                            <input
                              type="number"
                              value={tp.full}
                              onChange={e => updateTariffField(regionKey, tariffKey, 'full', e.target.value)}
                              placeholder="8000000"
                              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 mb-0.5 block">{t('courseForm.discount_10')}</label>
                            <input
                              type="number"
                              value={tp.d10}
                              onChange={e => updateTariffField(regionKey, tariffKey, 'd10', e.target.value)}
                              placeholder="7200000"
                              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 mb-0.5 block">{t('courseForm.discount_15')}</label>
                            <input
                              type="number"
                              value={tp.d15}
                              onChange={e => updateTariffField(regionKey, tariffKey, 'd15', e.target.value)}
                              placeholder="6800000"
                              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 mb-0.5 block">{t('courseForm.discount_20')}</label>
                            <input
                              type="number"
                              value={tp.d20}
                              onChange={e => updateTariffField(regionKey, tariffKey, 'd20', e.target.value)}
                              placeholder="6400000"
                              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => autoCalcDiscounts(regionKey, tariffKey)}
                          className="mt-2 text-[10px] text-blue-500 hover:text-blue-700 font-medium"
                        >
                          {t('courseForm.auto_calc')}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
          {t('courseForm.btn_cancel')}
        </button>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          {isEdit ? t('courseForm.btn_save') : t('courseForm.btn_create')}
        </button>
      </div>
    </form>
  )
}
