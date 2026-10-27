// CRM API client (server backend only — see server/src/routes/crm).

import { api, apiFetch, ApiError } from './api'
import { live } from './serverStore'

const qs = (params) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== '') p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}
const json = (method, body) => ({ method, body })

export const crm = {
  pipelines: () => api('/api/crm/pipelines'),
  createPipeline: (body) => api('/api/crm/pipelines', json('POST', body)),
  updatePipeline: (id, body) => api(`/api/crm/pipelines/${id}`, json('PATCH', body)),
  addStage: (pipelineId, body) => api(`/api/crm/pipelines/${pipelineId}/stages`, json('POST', body)),
  updateStage: (id, body) => api(`/api/crm/stages/${id}`, json('PATCH', body)),
  deleteStage: (id) => api(`/api/crm/stages/${id}`, { method: 'DELETE' }),

  board: (params) => api(`/api/crm/board${qs(params)}`),
  leads: (params) => api(`/api/crm/leads${qs(params)}`),
  lead: (id) => api(`/api/crm/leads/${id}`),
  createLead: (body) => api('/api/crm/leads', json('POST', body)),
  updateLead: (id, body) => api(`/api/crm/leads/${id}`, json('PATCH', body)),
  deleteLead: (id) => api(`/api/crm/leads/${id}`, { method: 'DELETE' }),

  activities: (leadId) => api(`/api/crm/leads/${leadId}/activities`),
  addNote: (leadId, body) => api(`/api/crm/leads/${leadId}/notes`, json('POST', { body })),
  logActivity: (leadId, body) => api(`/api/crm/leads/${leadId}/activities`, json('POST', body)),

  contacts: (params) => api(`/api/crm/contacts${qs(params)}`),
  contact: (id) => api(`/api/crm/contacts/${id}`),
  contactActivities: (id) => api(`/api/crm/contacts/${id}/activities`),
  createContact: (body) => api('/api/crm/contacts', json('POST', body)),
  updateContact: (id, body) => api(`/api/crm/contacts/${id}`, json('PATCH', body)),
  deleteContact: (id) => api(`/api/crm/contacts/${id}`, { method: 'DELETE' }),
  duplicates: () => api('/api/crm/contacts/duplicates'),
  mergeContacts: (id, ids) => api(`/api/crm/contacts/${id}/merge`, json('POST', { ids })),

  tasks: (params) => api(`/api/crm/tasks${qs(params)}`),
  createTask: (body) => api('/api/crm/tasks', json('POST', body)),
  updateTask: (id, body) => api(`/api/crm/tasks/${id}`, json('PATCH', body)),

  funnel: (params) => api(`/api/crm/analytics/funnel${qs(params)}`),
  insights: (params) => api(`/api/crm/analytics/insights${qs(params)}`),

  leadIds: (params) => api(`/api/crm/leads/ids${qs(params)}`),
  bulk: (body) => api('/api/crm/leads/bulk', json('POST', body)),
  exportLeads: (params) => download(`/api/crm/leads/export${qs(params)}`, `crm-${new Date().toISOString().slice(0, 10)}.csv`),
  tags: () => api('/api/crm/tags'),

  fields: () => api('/api/crm/fields'),
  createField: (body) => api('/api/crm/fields', json('POST', body)),
  updateField: (id, body) => api(`/api/crm/fields/${id}`, json('PATCH', body)),
  deleteField: (id) => api(`/api/crm/fields/${id}`, { method: 'DELETE' }),

  files: (leadId) => api(`/api/crm/leads/${leadId}/files`),
  uploadFile: async (leadId, file) => {
    const res = await apiFetch(`/api/crm/leads/${leadId}/files${qs({ name: file.name, type: file.type })}`, {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file,
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new ApiError(res.status, res.status === 413 ? 'Файл больше 25 МБ' : (data?.error || 'Не удалось загрузить файл'), data)
    return data
  },
  downloadFile: (file) => download(`/api/crm/files/${file.id}`, file.name),
  deleteFile: (id) => api(`/api/crm/files/${id}`, { method: 'DELETE' }),

  callRecord: (activityId) => api(`/api/crm/activities/${activityId}/record`),
  syncCalls: () => api('/api/crm/calls/sync', { method: 'POST' }),
}

/** Fetch with the login token and hand the result to the browser as a file. */
async function download(path, filename) {
  const res = await apiFetch(path)
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new ApiError(res.status, data?.error || 'Не удалось скачать', data)
  }
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Live CRM changes: calls onChange(evt) for each event on the given tables. */
export function watchCrm(tables, onChange) {
  const stops = tables.map(t => live.listenTable(t, onChange))
  return () => stops.forEach(stop => stop())
}

// ─── Display helpers shared by the CRM screens ─────────────────────────

export const SOURCES = {
  instagram: { label: 'Instagram', color: 'bg-pink-100 text-pink-700' },
  instagram_comment: { label: 'IG комментарий', color: 'bg-pink-100 text-pink-700' },
  telegram: { label: 'Telegram', color: 'bg-sky-100 text-sky-700' },
  landing: { label: 'Лендинг', color: 'bg-violet-100 text-violet-700' },
  call: { label: 'Звонок', color: 'bg-amber-100 text-amber-700' },
  manual: { label: 'Вручную', color: 'bg-slate-100 text-slate-600' },
  amo: { label: 'amoCRM', color: 'bg-blue-100 text-blue-700' },
}

export const sourceMeta = (source) => SOURCES[source] || { label: source || '—', color: 'bg-slate-100 text-slate-600' }

export function formatPhone(digits) {
  const d = String(digits || '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('998')) {
    return `+998 ${d.slice(3, 5)} ${d.slice(5, 8)}-${d.slice(8, 10)}-${d.slice(10)}`
  }
  return digits || ''
}

export function formatSum(n) {
  return `${Number(n || 0).toLocaleString('ru-RU').replace(/,/g, ' ')} сум`
}

/** "5 мин", "3 ч", "2 дн" since an ISO date. */
export function ago(iso) {
  if (!iso) return ''
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000))
  if (min < 60) return `${min} мин`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} ч`
  return `${Math.round(h / 24)} дн`
}

export function formatDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
