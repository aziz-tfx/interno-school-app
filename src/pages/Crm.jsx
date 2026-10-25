// CRM: deals board, tasks and funnel report on top of the INTERNO server
// (replaces amoCRM). Only routed when VITE_BACKEND=server — see App.jsx.
//
// The open deal lives in the URL (?lead=<id>) so it can be linked to and
// the back button closes it; the tab lives in ?tab=.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Settings2, SquareKanban, ListTodo, BarChart3, Loader } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { crm, watchCrm, formatPhone } from '../backend/crm'
import { toast } from '../components/Toaster'
import Modal from '../components/Modal'
import PaymentForm from '../components/PaymentForm'
import CrmBoard from '../components/crm/CrmBoard'
import LeadModal from '../components/crm/LeadModal'
import NewLeadForm from '../components/crm/NewLeadForm'
import CrmTasks from '../components/crm/CrmTasks'
import CrmAnalytics from '../components/crm/CrmAnalytics'
import PipelineSettings from '../components/crm/PipelineSettings'
import { LossReasonDialog, WonDialog } from '../components/crm/StageDialogs'

// Same lists as the server (server/src/crm/service.js).
export const CRM_ROLES = ['owner', 'admin', 'branch_director', 'branch_admin', 'rop', 'sales', 'smm']
const MANAGER_ROLES = ['owner', 'admin', 'branch_director', 'rop']
const PIPELINE_KEY = 'interno_crm_pipeline'

const TABS = [
  { id: 'board', label: 'Сделки', icon: SquareKanban },
  { id: 'tasks', label: 'Задачи', icon: ListTodo },
  { id: 'analytics', label: 'Аналитика', icon: BarChart3 },
]

export default function Crm() {
  const { user, employees } = useAuth()
  const { courses } = useData()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'board'
  const openLeadId = params.get('lead')

  const [pipelines, setPipelines] = useState(null)
  const [pipelineId, setPipelineId] = useState(() => {
    try { return localStorage.getItem(PIPELINE_KEY) || '' } catch { return '' }
  })
  const [newLeadOpen, setNewLeadOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Stage moves that need a question first (lost → reason, won → payment?)
  const [pendingMove, setPendingMove] = useState(null) // { lead, stage }
  const [saleFor, setSaleFor] = useState(null) // { lead, stage? }
  // Bumped after a change made here, so the board refreshes immediately
  const [refreshKey, setRefreshKey] = useState(0)

  const me = user?._docId
  const isManager = MANAGER_ROLES.includes(user?.role)

  // People who can own deals, and a lookup for names by employee doc id
  const staff = useMemo(
    () => employees.filter(e => CRM_ROLES.includes(e.role) && e.status !== 'fired' && !e.deleted)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru')),
    [employees]
  )
  const people = useMemo(() => Object.fromEntries(employees.map(e => [e._docId, e])), [employees])

  const loadPipelines = useCallback(async () => {
    try {
      setPipelines(await crm.pipelines())
    } catch (err) {
      toast(err.message, 'error')
      setPipelines([])
    }
  }, [])

  useEffect(() => { loadPipelines() }, [loadPipelines])

  // Stage edits by another manager show up live
  const reloadTimer = useRef(null)
  useEffect(() => watchCrm(['crm_stages'], () => {
    clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(loadPipelines, 300)
  }), [loadPipelines])

  const pipeline = useMemo(() => {
    if (!pipelines?.length) return null
    return pipelines.find(p => p.id === pipelineId) || pipelines.find(p => p.isDefault) || pipelines[0]
  }, [pipelines, pipelineId])

  const allStages = useMemo(
    () => Object.fromEntries((pipelines || []).flatMap(p => p.stages.map(s => [s.id, s]))),
    [pipelines]
  )

  const selectPipeline = (id) => {
    setPipelineId(id)
    try { localStorage.setItem(PIPELINE_KEY, id) } catch { /* not critical */ }
  }

  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: key === 'tab' })
  }
  const openLead = (id) => setParam('lead', id)

  // ─── Stage moves (board drag & drop and the deal card share this) ─────
  const applyMove = async (lead, stage, extra = {}) => {
    try {
      await crm.updateLead(lead.id, { stageId: stage.id, ...extra })
      setRefreshKey(k => k + 1)
      return true
    } catch (err) {
      toast(err.message, 'error')
      setRefreshKey(k => k + 1) // undo the optimistic move
      return false
    }
  }

  /** Returns true if the move happened right away (no dialog). */
  const moveLead = async (lead, stage) => {
    if (!stage || stage.id === lead.stageId) return false
    if (stage.kind === 'lost' || stage.kind === 'won') {
      setPendingMove({ lead, stage })
      return false
    }
    return applyMove(lead, stage)
  }

  // After a payment made from a deal: close the deal as won and link the
  // payment and the student to it (and the contact to the student).
  const onSaleSaved = async ({ paymentId, studentId }) => {
    const { lead, stage } = saleFor || {}
    if (!lead) return
    const target = stage || Object.values(allStages).find(s => s.pipelineId === lead.pipelineId && s.kind === 'won')
    try {
      await crm.updateLead(lead.id, {
        ...(target && { stageId: target.id }),
        paymentId, ...(studentId && { studentId }),
      })
      if (studentId && lead.contactId && !lead.contact?.studentId) {
        await crm.updateContact(lead.contactId, { studentId }).catch(() => {})
      }
      toast('Оплата проведена, сделка закрыта как успешная', 'success')
      setRefreshKey(k => k + 1)
    } catch (err) {
      toast(`Оплата сохранена, но сделку обновить не удалось: ${err.message}`, 'error')
    }
  }

  if (pipelines === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader size={24} className="animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">CRM</h2>
          <p className="text-slate-500 mt-1 text-sm">Заявки, сделки и задачи отдела продаж</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {pipelines.length > 1 && (
            <select value={pipeline?.id || ''} onChange={e => selectPipeline(e.target.value)}
              className="bg-white/70 text-sm rounded-xl px-3 py-2 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {isManager && (
            <button onClick={() => setSettingsOpen(true)} title="Настроить воронку"
              className="p-2.5 rounded-xl bg-white/70 border border-slate-200 text-slate-600 hover:bg-white transition-colors">
              <Settings2 size={18} />
            </button>
          )}
          <button onClick={() => setNewLeadOpen(true)} disabled={!pipeline}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25 flex items-center gap-2 disabled:opacity-50">
            <Plus size={16} /> Новая сделка
          </button>
        </div>
      </div>

      <div className="flex gap-1 glass rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setParam('tab', t.id === 'board' ? '' : t.id)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {!pipeline ? (
        <div className="glass-card rounded-2xl p-10 text-center text-slate-500">Воронок пока нет.</div>
      ) : tab === 'tasks' ? (
        <CrmTasks me={me} isManager={isManager} people={people} onOpenLead={openLead} />
      ) : tab === 'analytics' ? (
        <CrmAnalytics pipeline={pipeline} people={people} />
      ) : (
        <CrmBoard
          pipeline={pipeline} me={me} staff={staff} people={people}
          refreshKey={refreshKey} onOpenLead={openLead} onMove={moveLead}
        />
      )}

      {openLeadId && (
        <LeadModal
          leadId={openLeadId} me={me} isManager={isManager}
          pipelines={pipelines} allStages={allStages} staff={staff} people={people} courses={courses}
          onClose={() => setParam('lead', '')}
          onMove={moveLead}
          onSale={(lead) => setSaleFor({ lead })}
          onChanged={() => setRefreshKey(k => k + 1)}
        />
      )}

      <Modal isOpen={newLeadOpen} onClose={() => setNewLeadOpen(false)} title="Новая сделка">
        <NewLeadForm
          pipeline={pipeline} me={me} staff={staff} courses={courses}
          onCancel={() => setNewLeadOpen(false)}
          onCreated={(lead) => { setNewLeadOpen(false); setRefreshKey(k => k + 1); openLead(lead.id) }}
        />
      </Modal>

      {settingsOpen && pipeline && (
        <PipelineSettings
          pipeline={pipeline} pipelines={pipelines}
          onClose={() => setSettingsOpen(false)}
          onChanged={loadPipelines}
          onSelect={selectPipeline}
        />
      )}

      {pendingMove?.stage.kind === 'lost' && (
        <LossReasonDialog
          lead={pendingMove.lead}
          onCancel={() => { setPendingMove(null); setRefreshKey(k => k + 1) }}
          onConfirm={async (reason) => {
            const { lead, stage } = pendingMove
            setPendingMove(null)
            await applyMove(lead, stage, { lossReason: reason })
          }}
        />
      )}

      {pendingMove?.stage.kind === 'won' && (
        <WonDialog
          lead={pendingMove.lead}
          onCancel={() => { setPendingMove(null); setRefreshKey(k => k + 1) }}
          onJustMove={async () => {
            const { lead, stage } = pendingMove
            setPendingMove(null)
            await applyMove(lead, stage)
          }}
          onPayment={() => {
            setSaleFor({ lead: pendingMove.lead, stage: pendingMove.stage })
            setPendingMove(null)
          }}
        />
      )}

      <Modal isOpen={!!saleFor} onClose={() => { setSaleFor(null); setRefreshKey(k => k + 1) }} title="Оформить оплату" size="xl">
        {saleFor && (
          <PaymentForm
            onClose={() => { setSaleFor(null); setRefreshKey(k => k + 1) }}
            preselectedStudentId={saleFor.lead.studentId || saleFor.lead.contact?.studentId || undefined}
            prefill={{
              clientName: saleFor.lead.contact?.name || saleFor.lead.title,
              phone: formatPhone(saleFor.lead.contact?.phones?.[0]),
              course: courses.find(c => c.id === saleFor.lead.courseId)?.name || '',
            }}
            onSaved={onSaleSaved}
          />
        )}
      </Modal>
    </div>
  )
}
