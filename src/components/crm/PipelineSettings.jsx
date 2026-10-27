// Pipeline editor for managers: rename, reorder and recolour stages, add
// and remove them, create more pipelines. Every change is saved right away.

import { useState } from 'react'
import { ArrowUp, ArrowDown, Trash2, Plus, Star } from 'lucide-react'
import Modal from '../Modal'
import { crm } from '../../backend/crm'
import { toast } from '../Toaster'

const KINDS = [['open', 'В работе'], ['won', 'Успешно'], ['lost', 'Отказ']]
const inputCls = 'px-3 py-2 bg-white/70 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function PipelineSettings({ pipeline, pipelines, onClose, onChanged, onSelect }) {
  const [newStage, setNewStage] = useState('')
  const [newPipeline, setNewPipeline] = useState('')
  const [busy, setBusy] = useState(false)
  const stages = pipeline.stages

  const run = async (fn) => {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      toast(err.message, 'error')
    }
    await onChanged()
    setBusy(false)
  }

  // Sorts are rewritten as 0..n in the given order (only changed ones are sent).
  const renumber = (ordered) => Promise.all(
    ordered.map((s, i) => (s.sort === i ? null : crm.updateStage(s.id, { sort: i }))).filter(Boolean)
  )

  const move = (index, delta) => run(async () => {
    const ordered = [...stages]
    const [s] = ordered.splice(index, 1)
    ordered.splice(index + delta, 0, s)
    await renumber(ordered)
  })

  const addStage = () => run(async () => {
    const name = newStage.trim()
    if (!name) return
    const created = await crm.addStage(pipeline.id, { name, color: '#6366f1', kind: 'open' })
    // a new working stage goes before «Успешно» / «Отказ»
    const ordered = [...stages]
    const firstClosed = ordered.findIndex(s => s.kind !== 'open')
    ordered.splice(firstClosed === -1 ? ordered.length : firstClosed, 0, { ...created, sort: -1 })
    await renumber(ordered)
    setNewStage('')
  })

  const removeStage = (stage) => {
    if (!window.confirm(`Удалить этап «${stage.name}»?`)) return
    run(() => crm.deleteStage(stage.id))
  }

  const addPipeline = () => run(async () => {
    const name = newPipeline.trim()
    if (!name) return
    const created = await crm.createPipeline({ name })
    setNewPipeline('')
    onSelect(created.id)
  })

  return (
    <Modal isOpen onClose={onClose} title="Настройка воронки" size="lg">
      <div className={`space-y-6 ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[200px] text-xs text-slate-500">Название воронки
            <input key={pipeline.id + pipeline.name} defaultValue={pipeline.name} className={inputCls + ' w-full mt-1'}
              onBlur={e => { const v = e.target.value.trim(); if (v && v !== pipeline.name) run(() => crm.updatePipeline(pipeline.id, { name: v })) }} />
          </label>
          {pipeline.isDefault ? (
            <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5"><Star size={14} /> Основная — сюда попадают новые заявки</span>
          ) : (
            <button onClick={() => run(() => crm.updatePipeline(pipeline.id, { isDefault: true }))}
              className="text-xs px-3 py-2.5 rounded-xl border border-slate-200 bg-white/70 hover:bg-white">Сделать основной</button>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-800">Этапы</p>
          {stages.map((s, i) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 bg-white/60 rounded-xl p-2 border border-slate-100">
              <input type="color" defaultValue={s.color || '#94a3b8'} title="Цвет"
                onBlur={e => e.target.value !== s.color && run(() => crm.updateStage(s.id, { color: e.target.value }))}
                className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer bg-transparent" />
              <input key={s.id + s.name} defaultValue={s.name} className={inputCls + ' flex-1 min-w-[160px]'}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.name) run(() => crm.updateStage(s.id, { name: v })) }} />
              <select value={s.kind} onChange={e => run(() => crm.updateStage(s.id, { kind: e.target.value }))} className={inputCls}>
                {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <label className="flex items-center gap-1 text-xs text-slate-500" title="Сюда попадают новые заявки из каналов">
                <input type="checkbox" checked={s.isInbox} disabled={s.kind !== 'open'}
                  onChange={e => run(() => crm.updateStage(s.id, { isInbox: e.target.checked }))} />
                Неразобранное
              </label>
              <div className="flex gap-1 ml-auto">
                <button disabled={i === 0} onClick={() => move(i, -1)} className="p-1.5 rounded-lg hover:bg-white disabled:opacity-30"><ArrowUp size={15} /></button>
                <button disabled={i === stages.length - 1} onClick={() => move(i, 1)} className="p-1.5 rounded-lg hover:bg-white disabled:opacity-30"><ArrowDown size={15} /></button>
                <button onClick={() => removeStage(s)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <input value={newStage} onChange={e => setNewStage(e.target.value)} placeholder="Новый этап, например «Пробный урок назначен»"
              onKeyDown={e => e.key === 'Enter' && addStage()} className={inputCls + ' flex-1'} />
            <button onClick={addStage} disabled={!newStage.trim()}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
              <Plus size={15} /> Этап
            </button>
          </div>
          <p className="text-xs text-slate-400">Этап со сделками удалить нельзя — сначала перенесите их.</p>
        </div>

        <div className="space-y-2 pt-4 border-t border-slate-100">
          <p className="text-sm font-semibold text-slate-800">Другие воронки</p>
          {pipelines.filter(p => p.id !== pipeline.id).map(p => (
            <button key={p.id} onClick={() => onSelect(p.id)}
              className="block w-full text-left text-sm px-3 py-2 rounded-xl bg-white/60 hover:bg-white border border-slate-100">
              {p.name} {p.isDefault && <span className="text-xs text-amber-600">· основная</span>}
            </button>
          ))}
          <div className="flex gap-2">
            <input value={newPipeline} onChange={e => setNewPipeline(e.target.value)} placeholder="Новая воронка, например «Корпоративные клиенты»"
              onKeyDown={e => e.key === 'Enter' && addPipeline()} className={inputCls + ' flex-1'} />
            <button onClick={addPipeline} disabled={!newPipeline.trim()}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40">
              <Plus size={15} /> Воронка
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
