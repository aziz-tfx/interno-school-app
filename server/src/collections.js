// Registry of ERP document collections: Firestore name → table, and who may
// touch them. The frontend keeps using the Firestore names, so switching its
// data layer from Firestore to this API doesn't rename anything.
//
// Access levels (checked by canRead / canWrite):
//   'staff'  — any active employee of the school (everyone except students)
//   'admin'  — owner / admin only
//   'all'    — staff AND students; for students, rows are additionally
//              limited to their own record via `studentKey` (see ownRowSql)
//
// Students used to read every collection straight from Firestore (phones and
// balances of all students included). Here they only get what the student
// cabinet and LMS need.

export const ADMIN_ROLES = new Set(['owner', 'admin'])
// Roles that manage employee accounts
export const PEOPLE_ROLES = new Set(['owner', 'admin', 'hr'])

/**
 * studentKey — how a row is tied to a student, for row-level scoping:
 *   'id'          the row id IS the student id          (students, studentGameData)
 *   'student_id'  generated column student_id            (payments, lms_progress, …)
 *   'data'        data->>'studentId' (no column needed for low-volume tables)
 * studentWrite — students may create/update their own rows here.
 */
const C = {
  tenants:            { table: 'tenants',            read: 'all',   write: 'admin' },
  tenantIntegrations: { table: 'tenant_integrations', read: 'admin', write: 'admin' },
  settings:           { table: 'settings',           read: 'all',   write: 'admin' },
  // write: 'staff' so people can edit their own profile; documents.js limits
  // everyone outside PEOPLE_ROLES to their own record and safe fields.
  employees:          { table: 'employees',          read: 'staff', write: 'staff' },
  branches:           { table: 'branches',           read: 'all',   write: 'staff' },
  rooms:              { table: 'rooms',              read: 'all',   write: 'staff' },
  courses:            { table: 'courses',            read: 'all',   write: 'staff' },
  groups:             { table: 'groups',             read: 'all',   write: 'staff' },
  teachers:           { table: 'teachers',           read: 'all',   write: 'staff' },
  students:           { table: 'students',           read: 'all',   write: 'staff', studentKey: 'id' },
  payments:           { table: 'payments',           read: 'all',   write: 'staff', studentKey: 'student_id' },
  paymeTransactions:  { table: 'payme_transactions', read: 'staff', write: 'admin' },
  schedule:           { table: 'schedule',           read: 'all',   write: 'staff' },
  attendance:         { table: 'attendance',         read: 'staff', write: 'staff' },
  salesPlans:         { table: 'sales_plans',        read: 'staff', write: 'staff' },
  amoPlans:           { table: 'amo_plans',          read: 'staff', write: 'staff' },
  reportPlans:        { table: 'report_plans',       read: 'staff', write: 'staff' },
  reportDaily:        { table: 'report_daily',       read: 'staff', write: 'staff' },
  contractTemplates:  { table: 'contract_templates', read: 'staff', write: 'staff' },
  automationSettings: { table: 'automation_settings', read: 'staff', write: 'admin' },
  auditLog:           { table: 'audit_log',          read: 'admin', write: 'staff' },
  messages:           { table: 'messages',           read: 'all',   write: 'all', studentKey: 'student_id', studentWrite: true },
  leads:              { table: 'leads',              read: 'staff', write: 'staff' },
  lmsLessons:         { table: 'lms_lessons',        read: 'all',   write: 'staff' },
  lmsAssignments:     { table: 'lms_assignments',    read: 'all',   write: 'staff' },
  lmsAnnouncements:   { table: 'lms_announcements',  read: 'all',   write: 'staff' },
  lmsModules:         { table: 'lms_modules',        read: 'all',   write: 'staff' },
  lmsSubmissions:     { table: 'lms_submissions',    read: 'all',   write: 'all', studentKey: 'student_id', studentWrite: true },
  lmsProgress:        { table: 'lms_progress',       read: 'all',   write: 'all', studentKey: 'student_id', studentWrite: true },
  lmsVideoProgress:   { table: 'lms_video_progress', read: 'all',   write: 'all', studentKey: 'data', studentWrite: true },
  // Leaderboard: every student sees everyone's XP/streaks, but writes only own.
  studentGameData:    { table: 'student_game_data',  read: 'all',   write: 'all', studentKey: 'id', studentReadAll: true, studentWrite: true },
  aiAgentConversations: { table: 'ai_agent_conversations', read: 'staff', write: 'admin' },
  aiAgentAlerts:      { table: 'ai_agent_alerts',    read: 'admin', write: 'admin' },
}

export const COLLECTIONS = Object.freeze(C)

export const TABLE_TO_COLLECTION = Object.fromEntries(
  Object.entries(C).map(([name, c]) => [c.table, name])
)

export function getCollection(name) {
  return Object.hasOwn(C, name) ? { name, ...C[name] } : null
}

export const isStudent = (user) => user.role === 'student'
export const isAdmin = (user) => ADMIN_ROLES.has(user.role)

function allowed(level, user) {
  if (level === 'admin') return isAdmin(user)
  if (level === 'staff') return !isStudent(user)
  return true // 'all'
}

export const canRead = (col, user) => allowed(col.read, user)

export function canWrite(col, user) {
  if (isStudent(user)) return col.write === 'all' && !!col.studentWrite
  return allowed(col.write, user)
}

/**
 * Extra WHERE clause limiting a student to their own rows, or null when no
 * scoping applies. `param` is the placeholder holding user.studentId.
 */
export function ownRowSql(col, user, param, { forWrite = false } = {}) {
  if (!isStudent(user)) return null
  if (!forWrite && col.studentReadAll) return null
  if (!col.studentKey) return null
  if (col.studentKey === 'id') return `id = ${param}`
  if (col.studentKey === 'student_id') return `student_id = ${param}`
  return `data->>'studentId' = ${param}`
}

/** For a student writing a row: does the document belong to them? */
export function ownsDoc(col, user, id, data) {
  if (!isStudent(user)) return true
  if (!user.studentId) return false
  if (col.studentKey === 'id') return String(id) === String(user.studentId)
  return String(data?.studentId ?? '') === String(user.studentId)
}
