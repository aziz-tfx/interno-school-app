# Why did the amo AI agent and Telegram reminders go quiet? Collect what the
# API sees (set / not set, HTTP statuses, counts — never the values) into
# state/diag.json, which /api/health shows.
set -o pipefail
docker compose logs --no-color --no-log-prefix --since 168h api 2>/dev/null \
  | grep -E 'AI agent|daily automations|Server listening' | tail -n 3000 \
  | docker compose exec -T api node scripts/diagnose.js default > state/diag.json.tmp
code=$?
mv state/diag.json.tmp state/diag.json
exit $code
