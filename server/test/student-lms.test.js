import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'
import { runStudyNotices, unlockedModuleCount } from '../src/studyNotices.js'
import { loadTelegramConfig } from '../src/telegram.js'

const sent = []
const telegram = {
  send: async (botToken, chatId, text, extra) => { sent.push({ botToken, chatId: String(chatId), text, extra }); return true },
  setWebhook: async () => ({ ok: true }),
  setMenuButton: async () => ({ ok: true }),
}
const ctx = setup({ telegram })

// Tuesday 2026-03-10: 15:00 UTC = 20:00 Tashkent (every rule's hour has come)
const EVENING = new Date('2026-03-10T15:00:00Z')
const MORNING = new Date('2026-03-10T05:00:00Z') // 10:00 Tashkent
const NIGHT = new Date('2026-03-10T18:30:00Z')   // 23:30 Tashkent
const hoursBefore = (d, h) => new Date(d.getTime() - h * 3600_000).toISOString()

const insert = (table, id, data, tenant = 'school-a') =>
  ctx.pool.query(`INSERT INTO ${table} (id, tenant_id, data) VALUES ($1, $2, $3)`, [id, tenant, { ...data, tenantId: tenant }])
const run = (now, opts = {}) => runStudyNotices(ctx.pool, {
  now, tenantIds: ['school-a'], send: telegram.send, loadTelegram: (t) => loadTelegramConfig(ctx.pool, t), ...opts,
})
const textsTo = (chatId) => sent.filter(m => m.chatId === String(chatId)).map(m => m.text)

test('seed', async () => {
  await insert('tenant_integrations', 'school-a', { telegram: { botToken: 'tok-a', miniAppUrl: 'https://app.test/?tenantId=school-a' } })
  await insert('groups', 'g1', { name: 'DI-1', course: 'Дизайн', startDate: '2026-02-23' }) // a Monday
  await insert('courses', 'c1', { name: 'Дизайн' })
  for (const [id, title, order] of [['m1', 'Основы', 1], ['m2', 'Цвет', 2], ['m3', 'Свет', 3], ['m4', 'Мебель', 4]]) {
    await insert('lms_modules', id, { courseId: 'c1', title, order })
  }
  // st-1 is the student of the test login (helpers.js); linked Telegram, studying offline
  await insert('students', 'st-1', { name: 'Алексей', group: 'DI-1', groupId: 'g1', status: 'active', lmsAccess: true, telegramChatId: 111, learningFormat: 'Оффлайн', totalCoursePrice: 1000 })
  // online, paid a third → modules open weekly
  await insert('students', 'st-2', { name: 'Онлайн', group: 'DI-1', groupId: 'g1', status: 'active', lmsAccess: true, telegramChatId: 222, learningFormat: 'Онлайн', totalCoursePrice: 900 })
  await insert('payments', 'p-2', { type: 'income', studentId: 'st-2', amount: 300 })
  // no Telegram / frozen / another school: never written to
  await insert('students', 'st-3', { name: 'Без бота', groupId: 'g1', status: 'active', lmsAccess: true })
  await insert('students', 'st-4', { name: 'Заморожен', groupId: 'g1', status: 'frozen', lmsAccess: true, telegramChatId: 444 })
  await insert('students', 'st-x', { name: 'Чужой', groupId: 'g1', status: 'active', lmsAccess: true, telegramChatId: 999 }, 'school-b')

  await insert('lms_assignments', 'a1', { title: 'Мудборд', groupId: 'g1', deadline: '2026-03-05', maxScore: 10 })
  await insert('lms_assignments', 'a2', { title: 'Планировка', description: 'Два варианта', groupId: 'g1', deadline: '2026-03-11' }) // tomorrow
  await insert('lms_assignments', 'a3', { title: 'Позже', groupId: 'g1', deadline: '2026-03-20' })
  // checked an hour ago / checked a week ago / not checked
  await insert('lms_submissions', 's1', { assignmentId: 'a1', studentId: 'st-1', status: 'reviewed', grade: 9, feedback: 'Хорошо <b>', gradedAt: hoursBefore(EVENING, 1) })
  await insert('lms_submissions', 's-old', { assignmentId: 'a3', studentId: 'st-1', status: 'reviewed', grade: 5, gradedAt: hoursBefore(EVENING, 24 * 7) })
  await insert('lms_submissions', 's-frozen', { assignmentId: 'a1', studentId: 'st-4', status: 'reviewed', grade: 7, gradedAt: hoursBefore(EVENING, 1) })
  // st-2 has handed in tomorrow's assignment, st-1 has not
  await insert('lms_submissions', 's2', { assignmentId: 'a2', studentId: 'st-2', status: 'submitted' })
  // the teacher wrote twice, one more message is already read; the student's own message is not news
  await insert('messages', 'ms1', { studentId: 'st-1', senderRole: 'teacher', senderName: 'Елена', text: 'Первое', readBy: [], createdAt: hoursBefore(EVENING, 3) })
  await insert('messages', 'ms2', { studentId: 'st-1', senderRole: 'teacher', senderName: 'Елена', text: 'Посмотрите комментарии', readBy: [], createdAt: hoursBefore(EVENING, 2) })
  await insert('messages', 'ms-read', { studentId: 'st-2', senderRole: 'teacher', text: 'Прочитано', readBy: ['st-2'], createdAt: hoursBefore(EVENING, 2) })
  await insert('messages', 'ms-own', { studentId: 'st-2', senderRole: 'student', text: 'Вопрос', readBy: [], createdAt: hoursBefore(EVENING, 2) })
  // 4 days in a row, last time yesterday (UTC days, as the app counts) / already studied today
  await insert('student_game_data', 'st-1', { currentStreak: 4, lastActivityDate: '2026-03-09' })
  await insert('student_game_data', 'st-2', { currentStreak: 6, lastActivityDate: '2026-03-10' })
})

test('modules of an online group open on Mondays, Tashkent time', () => {
  const at = (iso) => unlockedModuleCount('2026-02-23', new Date(iso)) // started on a Monday
  assert.equal(at('2026-02-23T10:00:00Z'), 1)
  assert.equal(at('2026-03-01T18:59:00Z'), 1) // Sunday 23:59 in Tashkent
  assert.equal(at('2026-03-01T19:02:00Z'), 2) // Monday 00:02 in Tashkent
  assert.equal(at('2026-03-10T15:00:00Z'), 3)
  assert.equal(unlockedModuleCount('', new Date()), 999)
  // started on a Wednesday → the next Monday opens module 2
  assert.equal(unlockedModuleCount('2026-02-25', new Date('2026-03-02T05:00:00Z')), 2)
})

test('nothing is sent at night, and a dry run only counts', async () => {
  assert.equal((await run(NIGHT)).quiet, true)
  const r = await run(EVENING, { dryRun: true })
  assert.deepEqual([r.grade, r.message, r.deadline, r.streak, r.errors], [1, 1, 1, 1, []])
  assert.equal(sent.length, 0)
  assert.equal((await ctx.pool.query('SELECT count(*)::int AS n FROM student_notices')).rows[0].n, 0)
})

test('in the morning: the grade, the message, the deadline — not the streak yet', async () => {
  const r = await run(MORNING)
  // (in the morning the grade "an hour before the evening" is still in the future of the lookback — it has gradedAt later than now, which is fine: it is news)
  assert.deepEqual([r.grade, r.message, r.deadline, r.streak], [1, 1, 1, 0])
  const mine = textsTo(111)
  assert.equal(mine.length, 3)
  const grade = mine.find(t => t.includes('Работа проверена'))
  assert.match(grade, /Мудборд/)
  assert.match(grade, /9\/10/)
  assert.match(grade, /Хорошо &lt;b&gt;/) // the teacher's text can't break the markup
  const msg = mine.find(t => t.includes('Сообщение от преподавателя'))
  assert.match(msg, /Посмотрите комментарии/) // the newest of the two
  assert.match(msg, /ещё 1/)
  assert.match(mine.find(t => t.includes('Завтра срок сдачи')), /Планировка/)
  // every notice carries the «open the cabinet» button
  assert.equal(sent[0].extra.reply_markup.inline_keyboard[0][0].web_app.url, 'https://app.test/?tenantId=school-a')
  // st-2 handed the work in and read the message; frozen, unlinked and foreign students get nothing
  assert.deepEqual([textsTo(222).length, textsTo(444).length, textsTo(999).length], [0, 0, 0])
})

test('in the evening only what is new: the streak — everything else was already sent', async () => {
  sent.length = 0
  const r = await run(EVENING)
  assert.deepEqual([r.grade, r.message, r.deadline, r.streak], [0, 0, 0, 1])
  assert.match(textsTo(111)[0], /4 дн\. подряд/)
  assert.equal(textsTo(222).length, 0) // studied today — the streak is safe
  sent.length = 0
  await run(EVENING)
  assert.equal(sent.length, 0)
})

test('a new message is announced; a failed send is retried on the next sweep', async () => {
  await insert('messages', 'ms3', { studentId: 'st-1', senderRole: 'teacher', text: 'Ещё одно', readBy: [], createdAt: hoursBefore(EVENING, 0.1) })
  sent.length = 0
  const failing = async () => false
  assert.equal((await run(EVENING, { send: failing })).message, 0)
  const r = await run(EVENING)
  assert.equal(r.message, 1)
  assert.match(textsTo(111)[0], /Ещё одно/)
  assert.doesNotMatch(textsTo(111)[0], /ещё \d/)
})

test('a new module is announced once to online students who have not paid half', async () => {
  sent.length = 0
  // Monday 2026-03-09 09:30 Tashkent: module 3 opened at 00:01
  const monday = new Date('2026-03-09T04:30:00Z')
  let r = await run(monday)
  assert.equal(r.module, 1)
  assert.match(textsTo(222).find(t => t.includes('новый модуль')), /Свет/)
  assert.equal(textsTo(111).filter(t => t.includes('новый модуль')).length, 0) // offline: no weekly schedule
  r = await run(new Date('2026-03-09T06:00:00Z'))
  assert.equal(r.module, 0)
  // paid half → the whole course is open, no weekly notices
  await insert('payments', 'p-2b', { type: 'income', studentId: 'st-2', amount: 200 })
  await ctx.pool.query(`DELETE FROM student_notices WHERE key LIKE 'module:%'`)
  assert.equal((await run(monday)).module, 0)
})

test('a student switches kinds off in the cabinet; the school switches everything off', async () => {
  const me = ctx.as('student')
  let res = await me.get('/api/student/notify')
  assert.deepEqual(res.json(), { linked: true, kinds: { grade: true, message: true, deadline: true, module: true, streak: true } })
  res = await me.put('/api/student/notify', { streak: false, grade: false })
  assert.deepEqual(res.json().kinds, { grade: false, message: true, deadline: true, module: true, streak: false })
  assert.equal((await me.put('/api/student/notify', { streak: 'no' })).statusCode, 400)
  assert.equal((await ctx.as('owner').get('/api/student/notify')).statusCode, 403)
  // nothing else of the student record changed
  const { rows: [st] } = await ctx.pool.query(`SELECT data FROM students WHERE id = 'st-1'`)
  assert.equal(st.data.name, 'Алексей')
  assert.equal(st.data.telegramChatId, 111)

  await ctx.pool.query(`DELETE FROM student_notices WHERE student_id = 'st-1'`)
  sent.length = 0
  let r = await run(EVENING)
  assert.deepEqual([r.grade, r.streak], [0, 0])
  assert.ok(r.message >= 1 && r.deadline === 1)

  await insert('automation_settings', 'school-a', { studyNotifications: false })
  await ctx.pool.query(`DELETE FROM student_notices`)
  sent.length = 0
  r = await run(EVENING)
  assert.equal(sent.length, 0)
})

test('lesson feedback: a student writes and sees only their own', async () => {
  const me = ctx.as('student')
  const put = (id, data) => me.put(`/api/collections/lmsLessonFeedback/${id}?merge=1`, data)
  assert.equal((await put('st-1_l1', { studentId: 'st-1', lessonId: 'l1', rating: 'hard', comment: 'Быстро' })).statusCode, 200)
  // not somebody else's
  assert.equal((await put('st-2_l1', { studentId: 'st-2', lessonId: 'l1', rating: 'clear' })).statusCode, 403)
  await insert('lms_lesson_feedback', 'st-2_l1', { studentId: 'st-2', lessonId: 'l1', rating: 'clear' })
  assert.deepEqual((await me.get('/api/collections/lmsLessonFeedback')).json().map(r => r.id), ['st-1_l1'])
  // the teacher sees everyone's
  assert.deepEqual((await ctx.as('teacher').get('/api/collections/lmsLessonFeedback')).json().map(r => r.id).sort(), ['st-1_l1', 'st-2_l1'])
})

test('portfolio: public only when published, only checked works of that student', async () => {
  const me = ctx.as('student')
  const token = 'tok_0123456789abcdef'
  const doc = {
    studentId: 'st-1', token, published: false, title: 'Мои работы', about: 'Дизайнер интерьеров',
    showGrades: true, showFeedback: false,
    items: [
      { submissionId: 's1', caption: 'Скандинавский стиль' },
      { submissionId: 's-old', hidden: true },
      { submissionId: 's2' },        // another student's work
      { submissionId: 'nope' },
    ],
  }
  assert.equal((await me.put('/api/collections/portfolios/st-1', doc)).statusCode, 200)
  // a student can't write somebody else's portfolio
  assert.equal((await me.put('/api/collections/portfolios/st-2', { ...doc, studentId: 'st-2', token: 'tok_another_0123456789' })).statusCode, 403)

  const open = (t) => ctx.as(null).get(`/api/public/portfolio/${t}`)
  assert.equal((await open(token)).statusCode, 404) // not published yet
  await me.put('/api/collections/portfolios/st-1?merge=1', { published: true })
  const res = await open(token)
  assert.equal(res.statusCode, 200)
  const p = res.json()
  assert.deepEqual({ name: p.student.name, title: p.title, about: p.about }, { name: 'Алексей', title: 'Мои работы', about: 'Дизайнер интерьеров' })
  assert.deepEqual(p.items.map(i => [i.id, i.title, i.caption, i.grade, i.maxScore]), [['s1', 'Мудборд', 'Скандинавский стиль', 9, 10]])
  assert.equal(p.items[0].feedback, undefined) // the teacher's words are off
  // nothing private travels with it
  assert.doesNotMatch(res.body, /telegramChatId|totalCoursePrice|phone/)

  await me.put('/api/collections/portfolios/st-1?merge=1', { showGrades: false, showFeedback: true })
  const p2 = (await open(token)).json()
  assert.equal(p2.items[0].grade, undefined)
  assert.equal(p2.items[0].feedback, 'Хорошо <b>')

  assert.equal((await open('short')).statusCode, 404)
  assert.equal((await open('tok_wrong_0123456789abc')).statusCode, 404)
  await me.put('/api/collections/portfolios/st-1?merge=1', { published: false })
  assert.equal((await open(token)).statusCode, 404)
})
