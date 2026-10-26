#!/usr/bin/env bash
# Evening of the switch from Firebase — run AFTER the final import.sh:
#
#   bash /opt/interno/server/deploy/cutover.sh          # switch on
#   bash /opt/interno/server/deploy/cutover.sh --undo   # back (daily automations off)
#
# Allows the production site (app.internoedu.uz) to call the API and turns on
# the daily automations here — the old Vercel cron stops with the same merge.
set -euo pipefail
cd /opt/interno/server

FRONTEND="${FRONTEND:-https://app.internoedu.uz}"
set_env() {  # set_env KEY VALUE — replace or append in .env
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}

if [ "${1:-}" = "--undo" ]; then
  set_env AUTOMATIONS off
  echo "▶ автоматизации выключены"
else
  CORS=$(sed -n 's/^CORS_ORIGINS=//p' .env | tail -1)
  case ",$CORS," in
    *",$FRONTEND,"*) ;;
    *) set_env CORS_ORIGINS "${CORS:+$CORS,}$FRONTEND" ;;
  esac
  set_env AUTOMATIONS on
  echo "▶ $FRONTEND допущен к API, ежедневные автоматизации (14:00) включены"
fi

docker compose up -d --force-recreate api
for i in $(seq 1 30); do
  if docker compose exec -T api wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    docker compose logs --since=2m api | grep -o 'daily automations: on[^"]*' | tail -1 || true
    echo "✅ API работает"
    exit 0
  fi
  sleep 2
done
docker compose logs --tail=50 api
echo "✖ API не запустился — логи выше"; exit 1
