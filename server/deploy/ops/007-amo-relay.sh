# amoCRM blocks this server's IP (nginx 403 since 2026-11-06). Send the AI
# agent's amoCRM calls through the Vercel relay (api/amo-relay.js) instead:
# write AMO_RELAY_URL / AMO_RELAY_KEY (encrypted to this server's key) into
# .env, restart the API, then check from inside and show it in /api/health.
set -euo pipefail
# the relay ships with the same commit on Vercel: wait until it answers
# (GET → 405 from the function; before that the path still reaches this server)
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' https://app.internoedu.uz/api/amo-relay || true)
  [ "$code" = 405 ] && break
  sleep 10
done
echo "relay answers: $code"
bash deploy/apply-secrets.sh deploy/ops/007-amo-relay.enc
bash deploy/ops/006-diagnose-agent.sh
