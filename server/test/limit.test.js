import { test } from 'node:test'
import assert from 'node:assert/strict'
import { limitConcurrency } from '../src/lib/limit.js'

test('limitConcurrency runs at most max at a time, in order, and passes errors through', async () => {
  const slot = limitConcurrency(2)
  let active = 0, peak = 0
  const order = []
  const job = (i) => slot(async () => {
    active++; peak = Math.max(peak, active)
    await new Promise(r => setTimeout(r, 5))
    order.push(i); active--
    if (i === 3) throw new Error('boom')
    return i
  })
  const results = await Promise.allSettled([0, 1, 2, 3, 4, 5].map(job))
  assert.equal(peak, 2)
  assert.deepEqual(results.map(r => r.status), ['fulfilled', 'fulfilled', 'fulfilled', 'rejected', 'fulfilled', 'fulfilled'])
  assert.equal(results[3].reason.message, 'boom')
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5])
})
