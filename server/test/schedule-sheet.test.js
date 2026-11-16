import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'
import { parseCsv, parseSheetUrl } from '../src/routes/scheduleSheet.js'

const ctx = setup()
const SHEET = 'https://docs.google.com/spreadsheets/d/125apwOFXTGRq7hMLvARPsJwMWIi-sd3JEI-Zgcg94jM/edit#gid=546058976'
const CSV = '"",1(8),2(8),Онлайн\r\n10:00 - 12:00,"Спикер: Влад (Ревит)\nДата Старта: 7 сентября\nНаправление: ""Интерьер""",,\r\n'

const realFetch = globalThis.fetch
const calls = []
let answer = () => new Response(CSV, { headers: { 'content-type': 'text/csv; charset=utf-8' } })
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith('https://docs.google.com/')) return realFetch(url, init)
  calls.push(String(url))
  return answer()
}
after(() => { globalThis.fetch = realFetch })

test('parseSheetUrl takes the spreadsheet and the tab', () => {
  assert.deepEqual(parseSheetUrl(SHEET), { id: '125apwOFXTGRq7hMLvARPsJwMWIi-sd3JEI-Zgcg94jM', gid: '546058976' })
  assert.deepEqual(parseSheetUrl('https://docs.google.com/spreadsheets/d/125apwOFXTGRq7hMLvARPsJwMWIi-sd3JEI-Zgcg94jM/edit?usp=sharing').gid, null)
  assert.equal(parseSheetUrl('https://evil.example/spreadsheets/d/125apwOFXTGRq7hMLvARPsJwMWIi-sd3JEI-Zgcg94jM#gid=1'), null)
})

test('parseCsv keeps multi-line cells and escaped quotes', () => {
  const rows = parseCsv(CSV)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], ['', '1(8)', '2(8)', 'Онлайн'])
  assert.equal(rows[1][1], 'Спикер: Влад (Ревит)\nДата Старта: 7 сентября\nНаправление: "Интерьер"')
  assert.equal(rows[1].length, 2) // trailing empty cells dropped
})

test('not linked yet → configured: false', async () => {
  const res = await ctx.as('owner').get('/api/schedule/sheet')
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json(), { configured: false, url: '' })
})

test('only admins link a sheet, and only a tab of a Google Sheet', async () => {
  assert.equal((await ctx.as('sales').post('/api/admin/schedule/sheet', { url: SHEET })).statusCode, 403)
  assert.equal((await ctx.as('owner').post('/api/admin/schedule/sheet', { url: 'https://example.com/x' })).statusCode, 400)
  const noTab = await ctx.as('owner').post('/api/admin/schedule/sheet', { url: SHEET.replace(/#gid=\d+/, '') })
  assert.equal(noTab.statusCode, 400)
  assert.match(noTab.json().error, /gid/)

  const ok = await ctx.as('owner').post('/api/admin/schedule/sheet', { url: SHEET })
  assert.equal(ok.statusCode, 200)
  assert.equal(calls.at(-1), 'https://docs.google.com/spreadsheets/d/125apwOFXTGRq7hMLvARPsJwMWIi-sd3JEI-Zgcg94jM/export?format=csv&gid=546058976')
})

test('managers read the rows; the read is cached; teachers, students and other schools do not get it', async () => {
  const before = calls.length
  const res = await ctx.as('owner').get('/api/schedule/sheet')
  assert.equal(res.statusCode, 200)
  const body = res.json()
  assert.equal(body.configured, true)
  assert.equal(body.url, SHEET)
  assert.deepEqual(body.rows[0], ['', '1(8)', '2(8)', 'Онлайн'])
  assert.ok(body.fetchedAt)
  await ctx.as('owner').get('/api/schedule/sheet')
  assert.equal(calls.length, before + 1, 'second read within a minute comes from the cache')

  assert.equal((await ctx.as('teacher').get('/api/schedule/sheet')).statusCode, 403)
  assert.equal((await ctx.as('student').get('/api/schedule/sheet')).statusCode, 403)
  assert.equal((await ctx.as('otherOwner').get('/api/schedule/sheet')).json().configured, false)
})

test('a sheet that is not shared by link gives a clear message', async () => {
  answer = () => new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } })
  try {
    const res = await ctx.as('owner').post('/api/admin/schedule/sheet', { url: SHEET.replace('546058976', '7') })
    assert.equal(res.statusCode, 422)
    assert.match(res.json().error, /доступ/)
  } finally {
    answer = () => new Response(CSV, { headers: { 'content-type': 'text/csv' } })
  }
})

test('unlinking clears it', async () => {
  assert.equal((await ctx.as('owner').post('/api/admin/schedule/sheet', { url: '' })).statusCode, 200)
  assert.equal((await ctx.as('owner').get('/api/schedule/sheet')).json().configured, false)
})
