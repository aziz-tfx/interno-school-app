import { useState, useEffect } from 'react'
import { FileText, Upload, Trash2, Download, Star, Plus, X, CheckCircle, Copy, Loader } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { DEFAULT_TENANT_ID } from '../utils/tenancy'
import {
  listTemplates, uploadTemplate, deleteTemplate, setAsDefault, updateTemplate,
  TEMPLATE_PLACEHOLDERS,
} from '../utils/contractTemplates'
import Modal from '../components/Modal'

export default function ContractTemplates() {
  const { user } = useAuth()
  const tenantId = user?.tenantId || DEFAULT_TENANT_ID

  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [phHelpOpen, setPhHelpOpen] = useState(false)
  const [copiedKey, setCopiedKey] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const items = await listTemplates(tenantId)
      setTemplates(items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')))
    } catch (e) {
      console.error('listTemplates failed:', e)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [tenantId])

  const handleMakeDefault = async (id) => {
    await setAsDefault(tenantId, id)
    await load()
  }

  const handleDelete = async (tpl) => {
    if (!window.confirm(`Удалить шаблон «${tpl.name}»?`)) return
    await deleteTemplate(tpl)
    await load()
  }

  const copyPlaceholder = (key) => {
    const text = `{${key}}`
    navigator.clipboard?.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1500)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText size={26} className="text-blue-600" />
            Шаблоны договоров
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Загрузите свои .docx шаблоны с плейсхолдерами — они будут подставляться автоматически при создании продажи.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPhHelpOpen(true)}
            className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1.5"
          >
            <FileText size={14} /> Список плейсхолдеров
          </button>
          <button
            onClick={() => setUploadOpen(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-1.5"
          >
            <Plus size={16} /> Загрузить шаблон
          </button>
        </div>
      </div>

      {/* Справка */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Как это работает</h3>
        <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
          <li>Подготовьте свой договор в Word (.docx)</li>
          <li>Впишите плейсхолдеры в фигурных скобках там где должны быть данные: <code className="bg-white px-1.5 py-0.5 rounded">{'{clientName}'}</code>, <code className="bg-white px-1.5 py-0.5 rounded">{'{amount}'}</code>, <code className="bg-white px-1.5 py-0.5 rounded">{'{contractDate}'}</code></li>
          <li>Загрузите файл сюда</li>
          <li>При создании продажи менеджер сможет выбрать нужный шаблон — данные подставятся автоматически</li>
        </ol>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">
          <Loader className="animate-spin mx-auto mb-2" size={24} />
          Загрузка...
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
          <FileText size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-600 font-medium mb-1">Ещё нет шаблонов</p>
          <p className="text-sm text-slate-400 mb-4">Загрузите первый шаблон договора чтобы автоматизировать оформление продаж</p>
          <button
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Upload size={14} /> Загрузить первый шаблон
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {templates.map(tpl => (
            <div key={tpl.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start justify-between gap-4 hover:shadow-md transition-shadow">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-semibold text-slate-900">{tpl.name}</h3>
                  {tpl.isDefault && (
                    <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Star size={10} fill="currentColor" /> По умолчанию
                    </span>
                  )}
                </div>
                {tpl.description && <p className="text-xs text-slate-500 mb-2">{tpl.description}</p>}
                <p className="text-[11px] text-slate-400 font-mono truncate">{tpl.fileName}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {!tpl.isDefault && (
                  <button
                    onClick={() => handleMakeDefault(tpl.id)}
                    title="Сделать шаблоном по умолчанию"
                    className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg"
                  >
                    <Star size={16} />
                  </button>
                )}
                {tpl.downloadUrl && (
                  <a
                    href={tpl.downloadUrl}
                    download={tpl.fileName}
                    title="Скачать оригинал"
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                  >
                    <Download size={16} />
                  </a>
                )}
                <button
                  onClick={() => handleDelete(tpl)}
                  title="Удалить"
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onUploaded={async () => { setUploadOpen(false); await load() }}
          tenantId={tenantId}
          createdBy={user?.id || ''}
        />
      )}

      {phHelpOpen && (
        <Modal isOpen onClose={() => setPhHelpOpen(false)} title="Доступные плейсхолдеры">
          <p className="text-sm text-slate-600 mb-4">
            Вставляйте эти выражения в ваш .docx шаблон — они будут автоматически заменены данными продажи. Нажмите на плейсхолдер чтобы скопировать.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1">
            {TEMPLATE_PLACEHOLDERS.map(ph => (
              <button
                key={ph.key}
                onClick={() => copyPlaceholder(ph.key)}
                className="flex items-center justify-between text-left px-3 py-2 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <code className="text-xs text-blue-700 font-mono">{`{${ph.key}}`}</code>
                  <p className="text-[11px] text-slate-500 truncate">{ph.label}</p>
                </div>
                {copiedKey === ph.key ? (
                  <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                ) : (
                  <Copy size={12} className="text-slate-300 group-hover:text-blue-500 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

function UploadModal({ onClose, onUploaded, tenantId, createdBy }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const [isDefault, setIsDefault] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handleFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.docx')) {
      setError('Поддерживаются только файлы .docx')
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('Максимальный размер файла — 5 MB')
      return
    }
    setError('')
    setFile(f)
    if (!name) setName(f.name.replace(/\.docx$/i, ''))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) { setError('Выберите .docx файл'); return }
    if (!name.trim()) { setError('Введите название шаблона'); return }
    setUploading(true)
    setError('')
    try {
      await uploadTemplate({
        tenantId,
        name: name.trim(),
        description: description.trim(),
        file,
        isDefault,
        createdBy,
      })
      onUploaded()
    } catch (err) {
      console.error('upload failed:', err)
      setError(err.message || 'Ошибка загрузки')
    }
    setUploading(false)
  }

  return (
    <Modal isOpen onClose={onClose} title="Загрузить шаблон договора">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Название *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Например: Стандартный договор 2026"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Описание</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Для каких продаж используется этот шаблон"
            rows={2}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Файл .docx *</label>
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 hover:border-blue-400 transition-colors">
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileChange}
              className="hidden"
              id="template-file-input"
            />
            <label htmlFor="template-file-input" className="cursor-pointer block text-center">
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm text-emerald-700">
                  <FileText size={16} />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
              ) : (
                <div className="text-slate-500 text-sm">
                  <Upload size={20} className="mx-auto mb-1 text-slate-400" />
                  Нажмите чтобы выбрать .docx файл
                </div>
              )}
            </label>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={e => setIsDefault(e.target.checked)}
            className="rounded border-slate-300"
          />
          Сделать шаблоном по умолчанию
        </label>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">
            Отмена
          </button>
          <button type="submit" disabled={uploading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
            {uploading ? <><Loader className="animate-spin" size={14} /> Загрузка...</> : <><Upload size={14} /> Загрузить</>}
          </button>
        </div>
      </form>
    </Modal>
  )
}
