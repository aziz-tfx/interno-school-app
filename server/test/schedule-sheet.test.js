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

const read = (who, url) => ctx.as(who).post('/api/admin/schedule/sheet-rows', { url })

test('parseSheetUrl takes the spreadsheet and the tab', () => {
  assert.deepEqual(parseSheetUrl(SHEET), { id: '125apwOFXTGRq7hMLvARPsJwMWIi-sd3JEI-Zgcg94jM', gid: '546058976' })
  assert.equal(parseSheetUrl('https://docs.google.com/spreadsheets/d/125apwOFXTGRq7hMLvARPsJwMWIi-sd3JEI-Zgcg94jM/edit?usp=sharing').gid, null)
  assert.equal(parseSheetUrl('https://evil.example/spreadsheets/d/125apwOFXTGRq7hMLvARPsJwMWIi-sd3JEI-Zgcg94jM#gid=1'), null)
})

test('parseCsv keeps multi-line cells and escaped quotes', () => {
  const rows = parseCsv(CSV)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], ['', '1(8)', '2(8)', 'Онлайн'])
  assert.equal(rows[1][1], 'Спикер: Влад (Ревит)\nДата Старта: 7 сентября\nНаправление: "Интерьер"')
  assert.equal(rows[1].length, 2) // trailing empty cells dropped
})

test('only admins read a tab, and only a tab of a Google Sheet', async () => {
  for (const who of ['sales', 'teacher', 'student']) assert.equal((await read(who, SHEET)).statusCode, 403, who)
  assert.equal((await read('owner', 'https://example.com/x')).statusCode, 400)
  const noTab = await read('owner', SHEET.replace(/#gid=\d+/, ''))
  assert.equal(noTab.statusCode, 400)
  assert.match(noTab.json().error, /gid/)

  const ok = await read('owner', SHEET)
  assert.equal(ok.statusCode, 200)
  assert.deepEqual(ok.json().rows[0], ['', '1(8)', '2(8)', 'Онлайн'])
  assert.equal(calls.at(-1), 'https://docs.google.com/spreadsheets/d/125apwOFXTGRq7hMLvARPsJwMWIi-sd3JEI-Zgcg94jM/export?format=csv&gid=546058976')
})

test('a sheet that is not shared by link gives a clear message', async () => {
  answer = () => new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } })
  try {
    const res = await read('owner', SHEET)
    assert.equal(res.statusCode, 422)
    assert.match(res.json().error, /доступ/)
  } finally {
    answer = () => new Response(CSV, { headers: { 'content-type': 'text/csv' } })
  }
})
