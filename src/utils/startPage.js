import { USE_SERVER } from '../backend/api'

// «Мой день» is the start page («/») of every staff member it has something
// for: CRM tasks, payments to wait for, or lessons. A role with none of
// those (HR, for one) would land on an empty screen, so it keeps the
// dashboard as its start page and has no «Мой день» in the menu.
export function hasMyDay(user, hasPermission) {
  if (!user || user.role === 'student') return false
  return user.role === 'teacher' ||
    (USE_SERVER && hasPermission('crm')) ||
    hasPermission('finance') ||
    hasPermission('schedule')
}
