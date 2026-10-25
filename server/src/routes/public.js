// Endpoints for pages that work WITHOUT login. In the Firestore app these
// pages read and wrote collections directly (the course landing even sent
// back an existing student's password to anyone who typed their phone).
// Here each one gets exactly the data it needs, and nothing else.
//
//   GET  /api/public/catalog?tenantId=            branches + courses (register form)
//   POST /api/public/register-employee            self-registration, status «pending»
//   POST /api/public/register-school              new school + owner → logged in
//   GET  /api/public/courses/:id                  course landing content
//   POST /api/public/courses/:id/signup           landing signup → student account
//   GET  /api/public/contracts/:paymentId         contract to sign (link from the manager)
//   POST /api/public/contracts/:paymentId/sign    store the signature once
//   POST /api/public/telegram-login               Telegram mini app → student session

import { randomInt, createHmac, timingSafeEqual } from 'node:crypto'
import { tx } from '../db.js'
import { hashPassword, publicUser, tokenClaims } from '../auth.js'
import { newDocId } from '../lib/ids.js'
import { badRequest, notFound, HttpError } from '../lib/errors.js'
import { createLead } from '../crm/service.js'

const DEFAULT_TENANT = 'default'
const COMPANY_WIDE_ROLES = ['accountant', 'financier', 'hr', 'smm']
// Self-registration can't hand out owner/admin (or student) accounts.
const SELF_REGISTER_ROLES = ['branch_director', 'branch_admin', 'rop', 'sales', 'accountant', 'financier', 'hr', 'smm', 'teacher']
const BRANCH_PUBLIC_FIELDS = ['name', 'status', 'color', 'city', 'address']

const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj?.[k] !== undefined).map(k => [k, obj[k]]))
const str = (max, min = 0) => ({ type: 'string', minLength: min, maxLength: max })
const strict = (minute) => ({ rateLimit: { max: minute, timeWindow: '1 minute' } })

const TELEGRAM_AUTH_MAX_AGE_S = 24 * 3600

/**
 * Verify Telegram WebApp initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 * HMAC-SHA256 over the sorted key=value lines, keyed by HMAC("WebAppData", botToken).
 * Returns the Telegram user or null.
 */
export function verifyTelegramInitData(initData, botToken, now = Date.now()) {
  if (!initData || !botToken) return null
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null
  params.delete('hash')
  const checkString = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(checkString).digest()
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null
  const authDate = Number(params.get('auth_date'))
  if (!authDate || now / 1000 - authDate > TELEGRAM_AUTH_MAX_AGE_S) return null
  try {
    const user = JSON.parse(params.get('user') || 'null')
    return user?.id ? user : null
  } catch {
    return null
  }
}

async function tenantExists(db, id) {
  const { rows } = await db.query('SELECT 1 FROM tenants WHERE id = $1', [id])
  return rows.length > 0
}

async function loginTaken(db, login, tenantId = null) {
  const { rows } = await db.query(
    `SELECT 1 FROM employees WHERE login = lower($1) ${tenantId ? 'AND tenant_id = $2' : ''}
       AND coalesce((data->>'deleted')::boolean, false) = false LIMIT 1`,
    tenantId ? [login.trim(), tenantId] : [login.trim()]
  )
  return rows.length > 0
}

/** Employee ids in the app are Date.now() numbers kept as strings; make them unique. */
async function newEmployeeId(db) {
  for (let id = Date.now(); ; id++) {
    const { rows } = await db.query('SELECT 1 FROM employees WHERE id = $1', [String(id)])
    if (!rows.length) return id
  }
}

async function insertEmployee(db, tenantId, data, password) {
  const id = await newEmployeeId(db)
  const doc = { ...data, id, tenantId }
  const { rows: [row] } = await db.query(
    'INSERT INTO employees (id, tenant_id, data, password_hash) VALUES ($1, $2, $3, $4) RETURNING *',
    [String(id), tenantId, doc, await hashPassword(password)]
  )
  return row
}

export default async function publicRoutes(app, { pool, config }) {
  const session = (row) => ({
    token: app.jwt.sign(tokenClaims(row), { expiresIn: config.jwtTtl }),
    user: publicUser(row),
  })

  // ─── Catalog for the registration form ────────────────────────────────
  app.get('/api/public/catalog', async (req) => {
    const tenantId = String(req.query.tenantId || DEFAULT_TENANT)
    const [branches, courses] = await Promise.all([
      pool.query('SELECT id, data FROM branches WHERE tenant_id = $1 ORDER BY id', [tenantId]),
      pool.query(`SELECT id, data->>'name' AS name FROM courses WHERE tenant_id = $1 ORDER BY id`, [tenantId]),
    ])
    return {
      // revenue/expense counters live on branch docs — only the public fields go out
      branches: branches.rows.map(r => ({ id: r.id, data: pick(r.data, BRANCH_PUBLIC_FIELDS) })),
      courses: courses.rows.map(r => ({ id: r.id, data: { name: r.name } })),
    }
  })

  // ─── Employee self-registration (approved later by an admin) ──────────
  app.post('/api/public/register-employee', {
    config: strict(5),
    schema: {
      body: {
        type: 'object',
        required: ['name', 'login', 'password', 'role'],
        properties: {
          tenantId: str(100), name: str(200, 1), login: str(100, 3), password: str(200, 6),
          role: { enum: SELF_REGISTER_ROLES }, branch: str(100), phone: str(40),
          subject: str(200), salary: { type: ['number', 'string'] },
        },
      },
    },
  }, async (req, reply) => {
    const b = req.body
    const tenantId = b.tenantId || DEFAULT_TENANT
    if (!(await tenantExists(pool, tenantId))) throw notFound('Школа не найдена')
    const row = await tx(pool, async (c) => {
      if (await loginTaken(c, b.login, tenantId)) throw new HttpError(409, 'Этот логин уже занят. Выберите другой.')
      const branch = COMPANY_WIDE_ROLES.includes(b.role) ? 'all' : (b.branch || '')
      const emp = await insertEmployee(c, tenantId, {
        name: b.name.trim(), login: b.login.trim(), role: b.role, branch, phone: b.phone || '',
        avatar: b.name.trim().charAt(0).toUpperCase(),
        status: 'pending', registeredAt: new Date().toISOString(),
        ...(['sales', 'rop', 'branch_director'].includes(b.role) && { managerId: `mgr_${Date.now()}` }),
      }, b.password)
      if (b.role === 'teacher') {
        await c.query('INSERT INTO teachers (id, tenant_id, data) VALUES ($1, $2, $3)', [newDocId(), tenantId, {
          name: b.name.trim(), branch, subject: b.subject || '', salary: Number(b.salary) || 0,
          groups: 0, students: 0, rating: 0, employeeId: emp.data.id, tenantId,
        }])
      }
      return emp
    })
    return reply.code(201).send({ ok: true, id: row.id })
  })

  // ─── New school ───────────────────────────────────────────────────────
  app.post('/api/public/register-school', {
    config: strict(3),
    schema: {
      body: {
        type: 'object',
        required: ['schoolName', 'ownerName', 'login', 'password'],
        properties: {
          schoolName: str(200, 1), ownerName: str(200, 1), login: str(100, 3), password: str(200, 6),
          phone: str(40), email: str(200),
        },
      },
    },
  }, async (req, reply) => {
    const b = req.body
    const row = await tx(pool, async (c) => {
      // Owners log in without picking a school, so their login must be unique everywhere.
      if (await loginTaken(c, b.login)) throw new HttpError(409, 'Этот логин уже занят. Выберите другой.')
      const tenantId = `tenant_${Date.now()}_${randomInt(1000, 9999)}`
      const now = new Date().toISOString()
      await c.query('INSERT INTO tenants (id, tenant_id, data) VALUES ($1, $1, $2)', [tenantId, {
        id: tenantId, name: b.schoolName.trim(), plan: 'free', status: 'active',
        ownerName: b.ownerName.trim(), ownerPhone: b.phone || '', ownerEmail: b.email || '',
        limits: { students: 50, employees: 10, branches: 2 }, createdAt: now, tenantId,
      }])
      const owner = await insertEmployee(c, tenantId, {
        login: b.login.trim(), name: b.ownerName.trim(), role: 'owner', branch: 'all', status: 'active',
        avatar: b.ownerName.trim().charAt(0).toUpperCase(), phone: b.phone || '',
      }, b.password)
      await c.query('INSERT INTO branches (id, tenant_id, data) VALUES ($1, $2, $3)', [newDocId(), tenantId, {
        name: b.schoolName.trim(), status: 'active', students: 0, teachers: 0, courses: 0, groups: 0,
        capacity: 100, monthlyRevenue: 0, monthlyExpenses: 0, rating: 0, color: '#3b82f6', tenantId,
      }])
      return owner
    })
    return reply.code(201).send(session(row))
  })

  // ─── Course landing ───────────────────────────────────────────────────
  app.get('/api/public/courses/:id', async (req) => {
    const { rows: [course] } = await pool.query('SELECT id, tenant_id, data FROM courses WHERE id = $1', [req.params.id])
    if (!course) throw notFound('Курс не найден')
    const t = course.tenant_id
    const [modules, lessons, groups] = await Promise.all([
      pool.query(`SELECT id, data FROM lms_modules WHERE tenant_id = $1 AND data->>'courseId' = $2`, [t, course.id]),
      pool.query(`SELECT id, data FROM lms_lessons WHERE tenant_id = $1 AND data->>'courseId' = $2`, [t, course.id]),
      pool.query(`SELECT id, data FROM groups WHERE tenant_id = $1 AND data->>'course' = $2`, [t, course.data.name || '']),
    ])
    const order = (a, b) => (a.data.order || 0) - (b.data.order || 0)
    const sortedModules = modules.rows.sort(order)
    const freeModuleId = sortedModules[0]?.id
    return {
      course: { id: course.id, data: course.data },
      modules: sortedModules,
      // Only the free first module ships its videos; the rest show titles and a lock.
      lessons: lessons.rows.sort(order).map(l => (l.data.moduleId === freeModuleId ? l : {
        id: l.id,
        data: { ...pick(l.data, ['title', 'description', 'moduleId', 'courseId', 'order', 'duration']), hasVideo: !!l.data.videoUrl },
      })),
      groups: groups.rows.map(g => ({ id: g.id, data: pick(g.data, ['name', 'status', 'branch']) })),
    }
  })

  app.post('/api/public/courses/:id/signup', {
    config: strict(5),
    schema: {
      body: { type: 'object', required: ['name', 'phone'], properties: { name: str(200, 1), phone: str(40, 5) } },
    },
  }, async (req, reply) => {
    const { rows: [course] } = await pool.query('SELECT id, tenant_id, data FROM courses WHERE id = $1', [req.params.id])
    if (!course) throw notFound('Курс не найден')
    const tenantId = course.tenant_id
    const name = req.body.name.trim()
    const phone = req.body.phone.trim()
    const login = phone.replace(/\D/g, '')
    if (login.length < 9) throw badRequest('Неверный номер телефона')

    const result = await tx(pool, async (c) => {
      const { rows: [existing] } = await c.query(
        `SELECT 1 FROM employees WHERE tenant_id = $1 AND role = 'student'
           AND login_tail = regexp_replace($2, '^998', '') LIMIT 1`, [tenantId, login]
      )
      // Never reveal an existing account's password: the old landing did,
      // to anyone who typed the phone number.
      if (existing) return { existing: true }

      const { rows: groups } = await c.query(
        `SELECT id, data FROM groups WHERE tenant_id = $1 AND data->>'course' = $2 ORDER BY id`, [tenantId, course.data.name || '']
      )
      const group = groups.find(g => g.data.status === 'active') || groups[0] || null
      const password = String(randomInt(100000, 1000000))
      const studentId = newDocId()
      const branch = group?.data.branch || 'online'
      await c.query('INSERT INTO students (id, tenant_id, data) VALUES ($1, $2, $3)', [studentId, tenantId, {
        name, phone, course: course.data.name, group: group?.data.name || '', groupId: group?.id || '',
        branch, learningFormat: 'Онлайн', status: 'active', balance: 0, totalCoursePrice: 0,
        lmsAccess: true, freeAccess: true, source: 'landing', startDate: new Date().toISOString().slice(0, 10),
        // staff look these up to tell the student their credentials, as before
        lmsLogin: login, lmsPassword: password, tenantId,
      }])
      const emp = await insertEmployee(c, tenantId, {
        login, name, role: 'student', branch, phone, studentId, status: 'active',
        avatar: name.charAt(0).toUpperCase(),
      }, password)
      // Straight into the CRM inbox instead of amo push-sale + the `leads` collection.
      await createLead(c, tenantId, {
        source: 'landing', contact: { name, phone, studentId }, courseId: course.id,
        title: `${name} — ${course.data.name || 'курс'}`,
        note: `Записался на бесплатный первый модуль курса «${course.data.name || ''}» с лендинга`,
      })
      return { emp, password }
    })

    if (result.existing) {
      return reply.code(409).send({ existing: true, error: 'Этот номер уже зарегистрирован — войдите со своим логином и паролем' })
    }
    return reply.code(201).send({ ...session(result.emp), credentials: { login, password: result.password } })
  })

  // ─── Contract signing (the link a manager sends after a sale) ─────────
  // The payment id (20 random chars) is the capability; the page shows the
  // contract fields and accepts a single signature.
  const CONTRACT_FIELDS = [
    'amount', 'contractLang', 'contractNumber', 'course', 'courseStartDate', 'date', 'durationMonths',
    'isCompanyPayer', 'passport', 'payerCompanyAddress', 'payerCompanyBank', 'payerCompanyDirector',
    'payerCompanyInn', 'payerCompanyName', 'payerCompanyPhone', 'phone', 'schedule', 'student', 'tariff',
    'totalCoursePrice', 'contractSigned', 'signatureData', 'signedAt', 'branch', 'group', 'monthlyPrice',
  ]

  app.get('/api/public/contracts/:paymentId', async (req) => {
    const { rows: [p] } = await pool.query('SELECT id, data FROM payments WHERE id = $1', [req.params.paymentId])
    if (!p || p.data.type === 'expense') throw notFound('Договор не найден')
    return { id: p.id, data: pick(p.data, CONTRACT_FIELDS) }
  })

  app.post('/api/public/contracts/:paymentId/sign', {
    config: strict(10),
    bodyLimit: 1024 * 1024,
    schema: {
      body: {
        type: 'object',
        required: ['signatureData'],
        properties: { signatureData: { type: 'string', pattern: '^data:image/png;base64,', maxLength: 700000 } },
      },
    },
  }, async (req) => {
    const signedAt = new Date().toISOString()
    const { rowCount } = await pool.query(
      `UPDATE payments SET data = data || jsonb_build_object('signatureData', $2::text, 'contractSigned', true, 'signedAt', $3::text)
        WHERE id = $1 AND coalesce((data->>'contractSigned')::boolean, false) = false
          AND coalesce(data->>'type', '') <> 'expense'`,
      [req.params.paymentId, req.body.signatureData, signedAt]
    )
    if (!rowCount) {
      const { rows } = await pool.query('SELECT 1 FROM payments WHERE id = $1', [req.params.paymentId])
      throw rows.length ? new HttpError(409, 'Договор уже подписан') : notFound('Договор не найден')
    }
    return { ok: true, signedAt }
  })

  // ─── Telegram mini app ────────────────────────────────────────────────
  // The old mini app "logged in" by phone number alone — anyone could open
  // any student's data. Now Telegram's signed initData proves who the user
  // is, and the student must have linked this Telegram through the bot
  // (/start st_<studentId> stores telegramChatId; a private chat id is the
  // user id).
  app.post('/api/public/telegram-login', {
    config: strict(20),
    schema: {
      body: { type: 'object', required: ['initData'], properties: { initData: str(4096, 1), tenantId: str(100) } },
    },
  }, async (req, reply) => {
    const tenantId = req.body.tenantId || DEFAULT_TENANT
    const { rows: [cfg] } = await pool.query('SELECT data FROM tenant_integrations WHERE id = $1', [tenantId])
    const botToken = cfg?.data?.telegram?.botToken || process.env.TG_BOT_TOKEN
    const tgUser = verifyTelegramInitData(req.body.initData, botToken)
    if (!tgUser) return reply.code(401).send({ error: 'Не удалось проверить данные Telegram' })

    const { rows: [emp] } = await pool.query(
      `SELECT e.* FROM students s
         JOIN employees e ON e.tenant_id = s.tenant_id AND e.role = 'student' AND e.data->>'studentId' = s.id
        WHERE s.tenant_id = $1 AND s.data->>'telegramChatId' = $2
          AND coalesce(e.status, '') NOT IN ('fired', 'pending', 'rejected')
        LIMIT 1`,
      [tenantId, String(tgUser.id)]
    )
    if (!emp) {
      return reply.code(404).send({
        error: 'Этот Telegram не привязан к ученику. Войдите по логину и паролю или подключите Telegram в личном кабинете.',
      })
    }
    return session(emp)
  })
}
