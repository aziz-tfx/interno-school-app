import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseOrigin, loadConfig } from '../src/config.js'

test('CORS origins: exact strings stay strings, * matches inside one host only', () => {
  assert.equal(parseOrigin('https://interno-school-app.vercel.app'), 'https://interno-school-app.vercel.app')
  const re = parseOrigin('https://interno-school-*-aziz-tfxs-projects.vercel.app')
  assert.ok(re.test('https://interno-school-6q6299q07-aziz-tfxs-projects.vercel.app'))
  assert.ok(re.test('https://interno-school-app-git-claude-vigilant-cerf-m3ppn4-aziz-tfxs-projects.vercel.app'))
  assert.ok(!re.test('https://interno-school-x-aziz-tfxs-projects.vercel.app.evil.com'))
  assert.ok(!re.test('https://evil.com/?interno-school-x-aziz-tfxs-projects.vercel.app'))
  assert.ok(!re.test('https://interno-school-a.b-aziz-tfxs-projects.vercel.app'))
  const cfg = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'x', CORS_ORIGINS: 'https://a.uz, https://b-*.vercel.app' })
  assert.equal(cfg.corsOrigins[0], 'https://a.uz')
  assert.ok(cfg.corsOrigins[1] instanceof RegExp)
})
