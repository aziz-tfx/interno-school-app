import { useState, useEffect } from 'react'
import { Bot, RefreshCw, Save, CheckCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { loadIntegrations, saveIntegrationSection } from '../utils/tenantIntegrations'
import { DEFAULT_TENANT_ID } from '../utils/tenancy'
import { toast } from '../components/Toaster'
import AiAgentSettings from '../components/AiAgentSettings'
import AiAgentLog from '../components/AiAgentLog'

// Instagram AI agent (amoCRM Salesbot): settings, test chat and conversation log.
// Config lives in tenantIntegrations/{tenantId}.aiAgent, next to the amoCRM keys.
export default function AiAgent() {
  const { user } = useAuth()
  const tenantId = user?.tenantId || DEFAULT_TENANT_ID

  const [cfg, setCfg] = useState(null) // { aiAgent, amocrm, … }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadIntegrations(tenantId)
      .then(async (data) => {
        // Secret for the amo webhook URL — generated once per school
        if (!data.aiAgent.webhookKey) {
          data.aiAgent.webhookKey = crypto.randomUUID().replace(/-/g, '')
          await saveIntegrationSection(tenantId, 'aiAgent', data.aiAgent)
        }
        if (!cancelled) setCfg(data)
      })
      .catch(err => console.error('Failed to load integrations:', err))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tenantId])

  const updateAgent = (patch) => setCfg(prev => ({ ...prev, aiAgent: { ...prev.aiAgent, ...patch } }))

  const save = async () => {
    setSaving(true)
    try {
      await saveIntegrationSection(tenantId, 'aiAgent', cfg.aiAgent)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    } catch (err) {
      toast.error('Ошибка сохранения: ' + err.message)
    }
    setSaving(false)
  }

  if (user?.role !== 'owner' && user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Bot size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 text-lg font-medium">Доступ ограничен</p>
          <p className="text-slate-400 text-sm mt-1">Настройки ИИ-агента доступны только администраторам</p>
        </div>
      </div>
    )
  }

  if (loading || !cfg) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={32} className="animate-spin text-slate-400" />
      </div>
    )
  }

  const saveButton = (
    <button onClick={save} disabled={saving}
      className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 text-white ${
        savedFlash ? 'bg-emerald-500' : 'bg-fuchsia-600 hover:bg-fuchsia-700 shadow-lg shadow-fuchsia-500/25'
      }`}>
      {saving ? <><RefreshCw size={16} className="animate-spin" /> Сохранение...</>
        : savedFlash ? <><CheckCircle size={16} /> Сохранено!</>
        : <><Save size={16} /> Сохранить</>}
    </button>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-slate-900">ИИ-агент</h2>
        <p className="text-slate-500 mt-1">
          Ответы ChatGPT на заявки из Instagram в amoCRM. Ключи amoCRM настраиваются в разделе «Интеграции».
        </p>
      </div>

      <AiAgentSettings
        tenantId={tenantId}
        value={cfg.aiAgent}
        onChange={updateAgent}
        persist={() => saveIntegrationSection(tenantId, 'aiAgent', cfg.aiAgent)}
        saveButton={saveButton}
      />
      <AiAgentLog tenantId={tenantId} amoSubdomain={cfg.amocrm.subdomain} />
    </div>
  )
}
