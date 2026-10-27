import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'

const ctx = setup()

/** Open an SSE stream and collect events until `until(events)` or timeout. */
async function openStream(base, ticket, collections) {
  const res = await fetch(`${base}/api/realtime?ticket=${ticket}&collections=${collections}`)
  const reader = res.body.getReader()
  const events = []
  let buf = ''
  const pump = (async () => {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return
      buf += new TextDecoder().decode(value)
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i)
        buf = buf.slice(i + 2)
        const type = chunk.match(/^event: (.*)$/m)?.[1]
        const data = chunk.match(/^data: (.*)$/m)?.[1]
        if (type) events.push({ type, data: JSON.parse(data) })
      }
    }
  })().catch(() => {})
  const waitFor = async (pred, ms = 3000) => {
    const start = Date.now()
    while (Date.now() - start < ms) {
      if (pred(events)) return true
      await new Promise(r => setTimeout(r, 20))
    }
    return false
  }
  return { res, events, waitFor, close: () => reader.cancel(), pump }
}

test('changes are pushed to subscribers of the same school only', async () => {
  const address = await ctx.app.listen({ port: 0, host: '127.0.0.1' })
  const ticket = async (who) => (await ctx.as(who).post('/api/realtime/ticket')).json().ticket

  const a = await openStream(address, await ticket('owner'), 'students,crm_leads,employees')
  const b = await openStream(address, await ticket('otherOwner'), 'students')
  assert.equal(a.res.status, 200)
  assert.ok(await a.waitFor(ev => ev.some(e => e.type === 'ready')))
  assert.deepEqual(a.events[0].data.collections.sort(), ['crm_leads', 'employees', 'students'])

  await ctx.as('owner').put('/api/collections/students/rt-1', { name: 'Live' })
  assert.ok(await a.waitFor(ev => ev.some(e => e.type === 'change' && e.data.id === 'rt-1' && e.data.collection === 'students')))

  await ctx.as('owner').post('/api/crm/leads', { contact: { name: 'RT', phone: '901010101' } })
  assert.ok(await a.waitFor(ev => ev.some(e => e.type === 'change' && e.data.collection === 'crm_leads')))

  await new Promise(r => setTimeout(r, 200))
  assert.equal(b.events.filter(e => e.type === 'change').length, 0)
  a.close(); b.close()
})

test('tickets are single-use and students cannot subscribe to staff data', async () => {
  const address = ctx.app.server.address()
  const base = `http://127.0.0.1:${address.port}`
  const t = (await ctx.as('student').post('/api/realtime/ticket')).json().ticket
  const s = await openStream(base, t, 'students,employees,crm_leads,lmsLessons')
  assert.ok(await s.waitFor(ev => ev.some(e => e.type === 'ready')))
  assert.deepEqual(s.events[0].data.collections.sort(), ['lmsLessons', 'students'])
  s.close()

  const reused = await fetch(`${base}/api/realtime?ticket=${t}&collections=students`)
  assert.equal(reused.status, 401)
})

test('firing an employee closes their open stream', async () => {
  const address = ctx.app.server.address()
  const base = `http://127.0.0.1:${address.port}`
  const t = (await ctx.as('teacher').post('/api/realtime/ticket')).json().ticket
  const s = await openStream(base, t, 'students')
  assert.ok(await s.waitFor(ev => ev.some(e => e.type === 'ready')))
  await ctx.as('owner').patch('/api/collections/employees/e-teach', { status: 'fired' })
  const ended = await Promise.race([s.pump.then(() => true), new Promise(r => setTimeout(() => r(false), 3000))])
  assert.equal(ended, true)
})
