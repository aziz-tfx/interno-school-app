#!/usr/bin/env bash
# Move the API to a new domain, keeping the old one working meanwhile:
#
#   bash /opt/interno/server/deploy/domain.sh api.internoedu.uz
#
# The new domain's A record must already point at this server. The old
# domain stays served (API_ALIASES), so the site keeps working until the
# frontend is switched to the new address.
set -euo pipefail
cd /opt/interno/server

NEW="${1:-}"
[ -n "$NEW" ] || { echo "Укажите домен: bash domain.sh api.internoedu.uz"; exit 1; }
OLD=$(sed -n 's/^API_DOMAIN=//p' .env | tail -1)
[ "$NEW" != "$OLD" ] || { echo "Домен API уже $NEW"; exit 0; }

MY_IP=$(curl -fsS -4 --max-time 10 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
DNS_IP=$(getent ahostsv4 "$NEW" 2>/dev/null | awk 'NR==1 {print $1}' || true)
if [ "$DNS_IP" != "$MY_IP" ]; then
  echo "✖ $NEW указывает на «${DNS_IP:-ничего}», а сервер — $MY_IP. Подождите несколько минут после настройки DNS и запустите снова."
  exit 1
fi

set_env() {
  grep -v "^$1=" .env > .env.tmp || true
  printf '%s=%s\n' "$1" "$2" >> .env.tmp
  mv .env.tmp .env && chmod 600 .env
}
ALIASES=$(sed -n 's/^API_ALIASES=//p' .env | tail -1)
case " $ALIASES " in *" $OLD "*) ;; *) ALIASES="${ALIASES:+$ALIASES }$OLD" ;; esac
set_env API_ALIASES "$ALIASES"
set_env API_DOMAIN "$NEW"

docker compose up -d --force-recreate caddy api
echo "▶ Жду сертификат для $NEW…"
for i in $(seq 1 40); do
  if curl -fsS --max-time 10 "https://$NEW/api/health" >/dev/null 2>&1; then
    echo "✅ https://$NEW работает (старый адрес $OLD тоже продолжает работать)"
    exit 0
  fi
  sleep 3
done
docker compose logs --tail=30 caddy
echo "✖ HTTPS для $NEW пока не отвечает — логи выше"; exit 1
