# Branch admins lose «Продажи» (2026-11-09): the Sales pages, the dashboard
# Sales tab, payments in search and taking payments in a student's card — all
# one permission, finance. The code default changes with this commit; this
# task does the same where the default is overridden in the database:
#   1. role permissions saved on «Права доступа» (settings/permissions_<tenant>,
#      and the legacy settings/permissions) — they replace the code default;
#   2. branch admins with individual permissions that include finance.
# Open sessions pick it up right away (table triggers → realtime).
set -euo pipefail
cd /opt/interno/server
docker compose exec -T db psql -U interno -d interno -v ON_ERROR_STOP=1 <<'SQL'
\echo role permissions saved in settings:
UPDATE settings
   SET data = jsonb_set(data, '{branch_admin,finance}', 'false')
 WHERE (id LIKE 'permissions\_%' OR id = 'permissions')
   AND jsonb_typeof(data->'branch_admin') = 'object'
   AND data->'branch_admin'->'finance' IS DISTINCT FROM 'false'::jsonb
RETURNING tenant_id, id;

\echo branch admins with individual permissions:
UPDATE employees
   SET data = jsonb_set(data, '{customPermissions,finance}', 'false')
 WHERE role = 'branch_admin'
   AND jsonb_typeof(data->'customPermissions') = 'object'
   AND data->'customPermissions'->'finance' IS DISTINCT FROM 'false'::jsonb
RETURNING tenant_id, id, data->>'name' AS name;
SQL
