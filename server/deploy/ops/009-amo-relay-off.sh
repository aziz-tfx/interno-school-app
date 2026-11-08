# The Vercel relay (007) didn't help: amoCRM blocks the integration's token,
# not this server's IP (008: without a token amo answers this server's calls
# with a normal 401). Switch it off: drop AMO_RELAY_* from .env, restart API.
set -euo pipefail
cd /opt/interno/server
grep -v '^AMO_RELAY_' .env > .env.tmp || true
mv .env.tmp .env && chmod 600 .env
docker compose up -d --force-recreate api
for i in $(seq 1 30); do
  docker compose exec -T api wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 && { echo "API up, relay off"; exit 0; }
  sleep 2
done
echo "API did not come back"; exit 1
