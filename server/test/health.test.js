import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setup } from './helpers.js'

const dir = mkdtempSync(join(tmpdir(), 'interno-state-'))
const ctx = setup({ env: { STATE_DIR: dir } })
after(() => rmSync(dir, { recursive: true, force: true }))

test('health shows what autodeploy last did and the public key for encrypted keys', async () => {
  const bare = (await ctx.app.inject({ method: 'GET', url: '/api/health' })).json()
  assert.deepEqual(bare, { ok: true })

  writeFileSync(join(dir, 'deploy.json'), JSON.stringify({ commit: 'abc1234', update: 'ok', ops: [{ name: '001-api-domain.sh', exit: 0 }] }))
  writeFileSync(join(dir, 'ops-key.pub.pem'), '-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----\n')
  const res = (await ctx.app.inject({ method: 'GET', url: '/api/health' })).json()
  assert.equal(res.deploy.commit, 'abc1234')
  assert.equal(res.deploy.ops[0].exit, 0)
  assert.match(res.opsKey, /BEGIN PUBLIC KEY/)
})
