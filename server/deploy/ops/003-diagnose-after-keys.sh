# Same check again after the keys were added with secrets.sh (2026-10-29).
set -o pipefail
docker compose logs --no-color --no-log-prefix --since 168h api 2>/dev/null \
  | grep -E 'AI agent|daily automations|Server listening' | tail -n 3000 \
  | docker compose exec -T api node scripts/diagnose.js default > state/diag.json.tmp
code=$?
mv state/diag.json.tmp state/diag.json
exit $code
