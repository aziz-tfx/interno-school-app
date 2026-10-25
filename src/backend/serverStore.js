// The subset of the Firestore modular API the app uses, implemented over the
// INTERNO server: refs/queries map to /api/collections, writes to PUT/PATCH/
// POST, writeBatch to /api/batch, and onSnapshot to an initial fetch plus
// live updates over Server-Sent Events (/api/realtime).
//
// Signatures and snapshot objects mirror Firestore's, so pages and contexts
// don't change — see ./firestore.js for the switch.

import { api, getToken, API_URL } from './api'

export const serverDb = Object.freeze({ type: 'server-db' })

// ─── References & queries ──────────────────────────────────────────────

class CollectionReference {
  constructor(name) {
    this.type = 'collection'
    this.id = name
    this.path = name
  }
}

class DocumentReference {
  constructor(collectionName, id) {
    this.type = 'document'
    this.id = String(id)
    this.parent = new CollectionReference(collectionName)
    this.path = `${collectionName}/${this.id}`
  }
}

class Query {
  constructor(collectionName, constraints) {
    this.type = 'query'
    this.collectionName = collectionName
    this.constraints = constraints
  }
}

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
function autoId() {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  return Array.from(bytes, b => ID_CHARS[b % 62]).join('')
}

export function collection(parent, name, ...rest) {
  if (parent !== serverDb) throw new Error('collection(): only top-level collections are supported')
  if (rest.length) throw new Error(`collection(): subcollections are not supported (${name}/${rest.join('/')})`)
  return new CollectionReference(name)
}

/** doc(db, 'col', id) · doc(collectionRef, id) · doc(collectionRef) → auto id */
export function doc(parent, ...segments) {
  if (parent instanceof CollectionReference) {
    return new DocumentReference(parent.id, segments[0] ?? autoId())
  }
  if (parent !== serverDb) throw new Error('doc(): unsupported parent')
  const parts = segments.length === 1 ? String(segments[0]).split('/') : segments
  if (parts.length !== 2) throw new Error(`doc(): expected collection and id, got ${parts.join('/')}`)
  return new DocumentReference(parts[0], parts[1])
}

export const where = (field, op, value) => ({ kind: 'where', field, op, value })
export const orderBy = (field, direction = 'asc') => ({ kind: 'orderBy', field, direction })
export const limit = (n) => ({ kind: 'limit', n })

export function query(base, ...constraints) {
  if (base instanceof Query) return new Query(base.collectionName, [...base.constraints, ...constraints])
  if (base instanceof CollectionReference) return new Query(base.id, constraints)
  throw new Error('query(): expected a collection reference')
}

export const increment = (n) => ({ $increment: n })
export const serverTimestamp = () => ({ $serverTimestamp: true })

/** Normalise a collection ref or query into { collection, where, orderBy, direction, limit }. */
function querySpec(target) {
  const spec = { collection: target instanceof Query ? target.collectionName : target.id, where: [], orderBy: null, direction: 'asc', limit: null }
  for (const c of target instanceof Query ? target.constraints : []) {
    if (c.kind === 'where') {
      // The server scopes every request to the user's school; a client-side
      // tenantId filter is redundant (and legacy docs may lack the field).
      if (c.field === 'tenantId' && c.op === '==') continue
      spec.where.push([c.field, c.op, c.value])
    } else if (c.kind === 'orderBy') {
      spec.orderBy = c.field
      spec.direction = c.direction
    } else if (c.kind === 'limit') {
      spec.limit = c.n
    }
  }
  return spec
}

const isUnconstrained = (spec) => !spec.where.length && !spec.orderBy && !spec.limit

// ─── Snapshots ─────────────────────────────────────────────────────────

const METADATA = Object.freeze({ fromCache: false, hasPendingWrites: false })

class DocumentSnapshot {
  constructor(ref, data) {
    this.ref = ref
    this.id = ref.id
    this._data = data
    this.metadata = METADATA
  }
  exists() { return this._data != null }
  data() { return this._data == null ? undefined : { ...this._data } }
  get(field) {
    return String(field).split('.').reduce((v, k) => (v == null ? undefined : v[k]), this._data ?? undefined)
  }
}

class QuerySnapshot {
  constructor(collectionName, rows) {
    this.docs = rows.map(r => new DocumentSnapshot(new DocumentReference(collectionName, r.id), r.data))
    this.size = this.docs.length
    this.empty = this.docs.length === 0
    this.metadata = METADATA
  }
  forEach(fn) { this.docs.forEach(fn) }
}

// ─── Reads ─────────────────────────────────────────────────────────────

const PAGE = 5000 // server-side max page

async function fetchDoc(ref) {
  try {
    const row = await api(`/api/collections/${encodeURIComponent(ref.parent.id)}/${encodeURIComponent(ref.id)}`)
    return row.data
  } catch (err) {
    if (err.status === 404) return null
    throw err
  }
}

async function fetchRows(spec) {
  const params = new URLSearchParams()
  if (spec.where.length) params.set('where', JSON.stringify(spec.where))
  if (spec.orderBy) { params.set('orderBy', spec.orderBy); params.set('direction', spec.direction) }
  const rows = []
  // Firestore returns everything that matches; page through the server's cap.
  for (let offset = 0; ; offset += PAGE) {
    const want = spec.limit ? Math.min(spec.limit - rows.length, PAGE) : PAGE
    params.set('limit', String(want))
    params.set('offset', String(offset))
    const page = await api(`/api/collections/${encodeURIComponent(spec.collection)}?${params}`)
    rows.push(...page)
    if (page.length < want || (spec.limit && rows.length >= spec.limit)) return rows
  }
}

export async function getDoc(ref) {
  return new DocumentSnapshot(ref, await fetchDoc(ref))
}

export async function getDocs(target) {
  const spec = querySpec(target)
  return new QuerySnapshot(spec.collection, await fetchRows(spec))
}

// ─── Writes ────────────────────────────────────────────────────────────

const docUrl = (ref) => `/api/collections/${encodeURIComponent(ref.parent.id)}/${encodeURIComponent(ref.id)}`

// JSON drops undefined like Firestore's ignoreUndefinedProperties; Dates
// become ISO strings.
const clean = (data) => JSON.parse(JSON.stringify(data ?? {}))

export async function addDoc(colRef, data) {
  const row = await api(`/api/collections/${encodeURIComponent(colRef.id)}`, { method: 'POST', body: clean(data) })
  live.localChange(colRef.id, row.id)
  return new DocumentReference(colRef.id, row.id)
}

export async function setDoc(ref, data, options = {}) {
  await api(docUrl(ref) + (options.merge ? '?merge=1' : ''), { method: 'PUT', body: clean(data) })
  live.localChange(ref.parent.id, ref.id)
}

export async function updateDoc(ref, data) {
  await api(docUrl(ref), { method: 'PATCH', body: clean(data) })
  live.localChange(ref.parent.id, ref.id)
}

export async function deleteDoc(ref) {
  await api(docUrl(ref), { method: 'DELETE' })
  live.localChange(ref.parent.id, ref.id)
}

export function writeBatch() {
  const ops = []
  const batch = {
    set(ref, data, options = {}) { ops.push({ op: options.merge ? 'merge' : 'set', collection: ref.parent.id, id: ref.id, data: clean(data) }); return batch },
    update(ref, data) { ops.push({ op: 'update', collection: ref.parent.id, id: ref.id, data: clean(data) }); return batch },
    delete(ref) { ops.push({ op: 'delete', collection: ref.parent.id, id: ref.id }); return batch },
    async commit() {
      if (!ops.length) return
      await api('/api/batch', { method: 'POST', body: { ops } })
      for (const op of ops) live.localChange(op.collection, op.id)
    },
  }
  return batch
}

// ─── Live queries (onSnapshot) ─────────────────────────────────────────
//
// One SSE stream per tab carries change events {collection, id, op} for
// every collection someone listens to. Listeners on whole collections are
// patched incrementally (re-fetch only the changed ids); filtered queries
// and docs are re-fetched.
//
// Ordering matters: a listener's first fetch happens once the stream covers
// its collection, so a change can't slip in between "fetched" and
// "listening". When the set of collections changes, the new stream opens
// before the old one closes. After a dropped connection everything is
// re-fetched, since events may have been missed.

const CHANGE_DEBOUNCE_MS = 60
const QUERY_DEBOUNCE_MS = 250
const STREAM_WAIT_MS = 2000 // don't hold the first paint hostage to a slow stream

function createLiveHub() {
  const subs = new Set()
  const streams = new Set()    // open EventSources (old ones close when a new one is ready)
  let liveCollections = new Set() // covered by the stream that is currently ready
  let streamKey = ''
  let reconnectDelay = 1000
  let syncTimer = null
  let resyncAll = false

  const canStream = () => !!getToken() && typeof EventSource !== 'undefined'

  function scheduleStream(delay = 80) { // collect listeners registered together
    clearTimeout(syncTimer)
    syncTimer = setTimeout(syncStream, delay)
  }

  function retry() {
    streamKey = ''
    resyncAll = true
    scheduleStream(reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
  }

  async function syncStream() {
    const names = [...new Set([...subs].map(s => s.collection))].sort()
    const key = names.join(',')
    if (key === streamKey) return
    streamKey = key
    if (!names.length || !canStream()) {
      streams.forEach(es => es.close())
      streams.clear()
      liveCollections = new Set()
      return
    }
    let ticket
    try {
      ({ ticket } = await api('/api/realtime/ticket', { method: 'POST' }))
    } catch {
      return retry()
    }
    if (streamKey !== key) return // listeners changed meanwhile; a newer sync is under way
    const es = new EventSource(`${API_URL}/api/realtime?ticket=${encodeURIComponent(ticket)}&collections=${encodeURIComponent(key)}`)
    streams.add(es)
    es.addEventListener('ready', (e) => {
      let covered = names
      try { covered = JSON.parse(e.data).collections || names } catch { /* keep requested */ }
      for (const other of streams) if (other !== es) other.close()
      streams.clear()
      streams.add(es)
      const before = liveCollections
      liveCollections = new Set(covered)
      reconnectDelay = 1000
      const all = resyncAll
      resyncAll = false
      for (const sub of subs) {
        if (sub.kind === 'table') {
          // the consumer re-loads whatever it shows; events may have been missed
          if (all || !before.has(sub.collection)) sub.onEvent({ collection: sub.collection, resync: true })
          continue
        }
        // 403-only collections never appear in `covered`; fetch those anyway once.
        if (all || sub.awaitingStream || sub.refetchOnReady || !before.has(sub.collection)) {
          sub.awaitingStream = false
          sub.refetchOnReady = false
          refresh(sub)
        }
      }
    })
    es.addEventListener('change', (e) => {
      try { onChange(JSON.parse(e.data)) } catch { /* malformed event */ }
    })
    es.onerror = () => {
      es.close()
      streams.delete(es)
      if (streams.size) return // an older stream is still serving; the newer sync decides
      liveCollections = new Set()
      retry()
    }
  }

  function onChange(evt) {
    const { collection: name, id } = evt
    for (const sub of subs) {
      if (sub.collection !== name) continue
      if (sub.kind === 'table') { sub.onEvent(evt); continue }
      if (sub.awaitingStream) continue
      if (sub.kind === 'doc') {
        if (sub.ref.id === id) debounce(sub, CHANGE_DEBOUNCE_MS, () => refresh(sub))
      } else if (sub.incremental && sub.loaded) {
        sub.pendingIds.add(id)
        debounce(sub, CHANGE_DEBOUNCE_MS, () => patch(sub))
      } else {
        debounce(sub, QUERY_DEBOUNCE_MS, () => refresh(sub))
      }
    }
  }

  function debounce(sub, ms, fn) {
    clearTimeout(sub.timer)
    sub.timer = setTimeout(fn, ms)
  }

  function emit(sub) {
    if (!sub.active) return
    if (sub.kind === 'doc') {
      sub.onNext(new DocumentSnapshot(sub.ref, sub.data))
    } else if (sub.incremental) {
      const rows = [...sub.rows.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      sub.onNext(new QuerySnapshot(sub.collection, rows))
    } else {
      sub.onNext(new QuerySnapshot(sub.collection, sub.ordered))
    }
  }

  function fail(sub, err) {
    if (!sub.active) return
    if (err?.status === 403) {
      // Not allowed for this role (e.g. a student and sales plans): behave
      // as "nothing to see" instead of an error that callers retry forever.
      sub.data = null
      sub.rows = new Map()
      sub.ordered = []
      sub.loaded = true
      emit(sub)
      return
    }
    // Like Firestore: an errored listener is dead; callers re-subscribe.
    sub.active = false
    clearTimeout(sub.timer)
    clearTimeout(sub.waitTimer)
    subs.delete(sub)
    scheduleStream()
    sub.onError?.(err)
  }

  async function refresh(sub) {
    if (!sub.active) return
    try {
      if (sub.kind === 'doc') {
        sub.data = await fetchDoc(sub.ref)
      } else {
        const rows = await fetchRows(sub.spec)
        sub.rows = new Map(rows.map(r => [r.id, r]))
        sub.ordered = rows
        sub.pendingIds.clear()
      }
      sub.loaded = true
      emit(sub)
    } catch (err) {
      fail(sub, err)
    }
  }

  async function patch(sub) {
    if (!sub.active || !sub.pendingIds.size) return
    const ids = [...sub.pendingIds]
    sub.pendingIds.clear()
    try {
      const rows = await fetchRows({ ...sub.spec, where: [['id', 'in', ids]] })
      const found = new Set(rows.map(r => r.id))
      for (const id of ids) if (!found.has(id)) sub.rows.delete(id) // deleted, or no longer visible
      for (const r of rows) sub.rows.set(r.id, r)
      emit(sub)
    } catch (err) {
      fail(sub, err)
    }
  }

  return {
    listen(target, onNext, onError) {
      let sub
      if (target instanceof DocumentReference) {
        sub = { kind: 'doc', ref: target, collection: target.parent.id, data: null }
      } else {
        const spec = querySpec(target)
        sub = { kind: 'query', spec, collection: spec.collection, incremental: isUnconstrained(spec), rows: new Map(), ordered: [], pendingIds: new Set() }
      }
      Object.assign(sub, { onNext, onError, active: true, loaded: false, timer: null })
      subs.add(sub)
      scheduleStream()

      if (!canStream() || liveCollections.has(sub.collection)) {
        refresh(sub)
      } else {
        sub.awaitingStream = true
        sub.waitTimer = setTimeout(() => {
          if (!sub.awaitingStream) return
          // Stream is slow: show data now, re-fetch once it's live.
          sub.awaitingStream = false
          sub.refetchOnReady = true
          refresh(sub)
        }, STREAM_WAIT_MS)
      }

      return () => {
        sub.active = false
        clearTimeout(sub.timer)
        clearTimeout(sub.waitTimer)
        subs.delete(sub)
        scheduleStream()
      }
    },
    /**
     * Raw change events for a server table (e.g. 'crm_leads') — for screens
     * backed by dedicated endpoints rather than collection queries. onEvent
     * gets {collection, id, op}, or {resync: true} after a reconnect.
     * Returns an unsubscribe function.
     */
    listenTable(name, onEvent) {
      const sub = { kind: 'table', collection: name, onEvent, active: true }
      subs.add(sub)
      scheduleStream()
      return () => {
        sub.active = false
        subs.delete(sub)
        scheduleStream()
      }
    },
    /** A write from this tab: update listeners now instead of waiting for the SSE echo. */
    localChange(collectionName, id) {
      onChange({ collection: collectionName, id: String(id) })
    },
    /** After login/logout the stream must be re-authorised. */
    reset() {
      streams.forEach(es => es.close())
      streams.clear()
      liveCollections = new Set()
      streamKey = ''
      scheduleStream()
    },
  }
}

export const live = createLiveHub()

/**
 * onSnapshot(target, next) · (target, next, error) · (target, options, next, error)
 * · (target, { next, error })
 */
export function onSnapshot(target, ...args) {
  if (args[0] && typeof args[0] === 'object' && typeof args[0].next !== 'function' && typeof args[1] === 'function') {
    args = args.slice(1) // SnapshotListenOptions — nothing to configure here
  }
  let onNext = args[0]
  let onError = args[1]
  if (onNext && typeof onNext === 'object') {
    onError = onNext.error?.bind(onNext)
    onNext = onNext.next.bind(onNext)
  }
  return live.listen(target, onNext, onError)
}
