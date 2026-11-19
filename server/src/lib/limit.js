// At most `max` calls of fn at a time; the rest wait their turn (FIFO).
//
// Used where many browsers ask for big results at once: after an API restart
// every open tab reloads every collection in the same second, and building
// all of those answers together used to exhaust the heap — which restarted
// the API and set off the same stampede again.
export function limitConcurrency(max) {
  let active = 0
  const queue = []
  const next = () => {
    if (active >= max || !queue.length) return
    active++
    const { fn, resolve, reject } = queue.shift()
    Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; next() })
  }
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next() })
}
