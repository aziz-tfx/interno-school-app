import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup, USERS } from './helpers.js'

const ctx = setup()
const login = (payload) => ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload })

test('text login is case-insensitive and never returns the password', async () => {
  const res = await login({ login: 'OWNER', password: 'owner-pass', tenantId: 'school-a' })
  assert.equal(res.statusCode, 200)
  const { user, token } = res.json()
  assert.ok(token)
  assert.equal(user.name, 'Азиз')
  assert.equal(user.tenantId, 'school-a')
  assert.equal(user.password, undefined)
  assert.equal(user.password_hash, undefined)
})

test('phone login matches any formatting of the same number', async () => {
  for (const variant of ['+998 90 111-22-33', '901112233', '998901112233']) {
    const res = await login({ login: variant, password: 'sales-pass' })
    assert.equal(res.statusCode, 200, variant)
    assert.equal(res.json().user.name, 'Гулнора')
  }
})

test('same login in two schools: tenantId picks the school, password decides', async () => {
  const b = await login({ login: 'owner', password: 'b-pass' })
  assert.equal(b.json().user.tenantId, 'school-b')
  const a = await login({ login: 'owner', password: 'owner-pass' })
  assert.equal(a.json().user.tenantId, 'school-a')
})

test('wrong password and fired employee are rejected', async () => {
  assert.equal((await login({ login: 'owner', password: 'nope' })).statusCode, 401)
  const fired = await login({ login: 'fired', password: USERS.fired.password })
  assert.equal(fired.statusCode, 403)
  assert.match(fired.json().error, /Доступ к системе закрыт/)
})

test('requests without a valid token get 401', async () => {
  assert.equal((await ctx.as(null).get('/api/auth/me')).statusCode, 401)
  const res = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: 'Bearer garbage' } })
  assert.equal(res.statusCode, 401)
})

test('firing an employee ends their session immediately', async () => {
  const res = await login({ login: 'teacher1', password: 'teach-pass' })
  const headers = { authorization: `Bearer ${res.json().token}` }
  assert.equal((await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers })).statusCode, 200)
  await ctx.as('owner').patch('/api/collections/employees/e-teach', { status: 'fired' })
  assert.equal((await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers })).statusCode, 401)
  await ctx.as('owner').patch('/api/collections/employees/e-teach', { status: 'active' })
})

test('changing the password revokes old tokens and issues a new one', async () => {
  const first = (await login({ login: 'owner', password: 'b-pass' })).json().token
  const headers = { authorization: `Bearer ${first}` }
  const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/password', headers, payload: { current: 'b-pass', next: 'new-b-pass' } })
  assert.equal(res.statusCode, 200)
  assert.equal((await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers })).statusCode, 401)
  const fresh = { authorization: `Bearer ${res.json().token}` }
  assert.equal((await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: fresh })).statusCode, 200)
  assert.equal((await login({ login: 'owner', password: 'new-b-pass', tenantId: 'school-b' })).statusCode, 200)
})
