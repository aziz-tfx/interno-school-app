// Firestore-compatible document updates.
//
// updateDoc() semantics: top-level keys replace, "a.b" keys set nested
// fields, and a few sentinel values stand in for the Firestore helpers the
// frontend uses:
//
//   { $delete: true }          deleteField()
//   { $increment: n }          increment(n)
//   { $serverTimestamp: true } serverTimestamp()  → ISO string
//   { $arrayUnion: [...] }     arrayUnion(...)
//   { $arrayRemove: [...] }    arrayRemove(...)

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const SENTINELS = ['$delete', '$increment', '$serverTimestamp', '$arrayUnion', '$arrayRemove']

function isSentinel(v) {
  return isPlainObject(v) && Object.keys(v).length === 1 && SENTINELS.includes(Object.keys(v)[0])
}

/** Resolve a sentinel against the current value; returns undefined for $delete. */
function resolveValue(current, v) {
  if (!isSentinel(v)) return resolveDeep(v)
  const [op, arg] = Object.entries(v)[0]
  switch (op) {
    case '$delete': return undefined
    case '$increment': return (typeof current === 'number' ? current : 0) + Number(arg || 0)
    case '$serverTimestamp': return new Date().toISOString()
    case '$arrayUnion': {
      const base = Array.isArray(current) ? [...current] : []
      for (const item of arg || []) if (!base.some(x => sameValue(x, item))) base.push(item)
      return base
    }
    case '$arrayRemove': {
      const base = Array.isArray(current) ? current : []
      return base.filter(x => !(arg || []).some(item => sameValue(x, item)))
    }
  }
}

// setDoc() with a nested serverTimestamp() etc. — resolve inside objects too.
function resolveDeep(v) {
  if (isSentinel(v)) return resolveValue(undefined, v)
  if (Array.isArray(v)) return v.map(resolveDeep)
  if (isPlainObject(v)) {
    const out = {}
    for (const [k, val] of Object.entries(v)) {
      const r = resolveDeep(val)
      if (r !== undefined) out[k] = r
    }
    return out
  }
  return v
}

/** Document for setDoc(data) (no merge): sentinels resolved, $delete dropped. */
export function prepareDoc(data) {
  return resolveDeep(data || {})
}

/** setDoc(data, { merge: true }): deep-merge objects, replace everything else. */
export function mergeDoc(current, data) {
  const out = { ...(current || {}) }
  for (const [k, v] of Object.entries(data || {})) {
    if (isPlainObject(v) && !isSentinel(v) && isPlainObject(out[k])) {
      out[k] = mergeDoc(out[k], v)
    } else {
      const r = resolveValue(out[k], v)
      if (r === undefined) delete out[k]
      else out[k] = r
    }
  }
  return out
}

/** updateDoc(updates): dotted paths address nested fields. */
export function applyUpdate(current, updates) {
  const out = structuredClone(current || {})
  for (const [path, v] of Object.entries(updates || {})) {
    const keys = path.split('.')
    let node = out
    for (const k of keys.slice(0, -1)) {
      if (!isPlainObject(node[k])) node[k] = {}
      node = node[k]
    }
    const last = keys.at(-1)
    const r = resolveValue(node[last], v)
    if (r === undefined) delete node[last]
    else node[last] = r
  }
  return out
}
