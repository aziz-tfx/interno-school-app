# The AI agent still doesn't answer after the amoCRM fix (2026-11-08):
# a fresh look from inside the container (is amo still blocking the IP, what
# do the latest conversations fail with), shown in /api/health → diag.
set -o pipefail
docker compose logs --no-color --no-log-prefix --timestamps --since 24h api 2>/dev/null \
  | grep -E 'AI agent|IP blocked|blocked \(403|daily automations|Server listening' | tail -n 3000 \
  | docker compose exec -T api node scripts/diagnose.js default > state/diag.json.tmp
code=$?
mv state/diag.json.tmp state/diag.json
exit $code
