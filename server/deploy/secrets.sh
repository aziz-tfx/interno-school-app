#!/usr/bin/env bash
# Keys the integrations need on this server — the same values as in Vercel
# (vercel.com → interno-school-app → Settings → Environment Variables).
#
#   bash /opt/interno/server/deploy/secrets.sh
#
# For each key: paste the value and press Enter (input is hidden), or just
# press Enter to keep what is there. Values filled in on the «Интеграции»
# page take priority over these — they are the fallback for the main school.
set -euo pipefail
cd /opt/interno/server

KEYS=(
  "TG_BOT_TOKEN|Telegram-бот: уведомления о продажах, напоминания"
  "TG_CHAT_TASHKENT|Telegram: чат филиала Ташкент"
  "TG_CHAT_SAMARKAND|Telegram: чат филиала Самарканд"
  "TG_CHAT_FERGANA|Telegram: чат филиала Фергана"
  "AMO_SUBDOMAIN|amoCRM: поддомен"
  "AMO_ACCESS_TOKEN|amoCRM: токен"
  "ONPBX_DOMAIN|OnlinePBX: домен (pbx….onpbx.ru)"
  "ONPBX_API_KEY|OnlinePBX: ключ API"
  "GOOGLE_AI_KEY|ИИ-помощник учеников в LMS (Google AI)"
)

set_env() {  # value may contain any characters: no sed
  grep -v "^$1=" .env > .env.tmp || true
  printf '%s=%s\n' "$1" "$2" >> .env.tmp
  mv .env.tmp .env
  chmod 600 .env
}

CHANGED=0
for entry in "${KEYS[@]}"; do
  key=${entry%%|*}; label=${entry#*|}
  if grep -q "^$key=." .env; then state="есть"; else state="пусто"; fi
  read -rsp "$key — $label [$state]: " value </dev/tty; echo
  value=$(printf '%s' "$value" | tr -d '\r\n')
  if [ -n "$value" ]; then set_env "$key" "$value"; CHANGED=1; echo "  ✓ записано"; fi
done

if [ "$CHANGED" = 1 ]; then
  docker compose up -d --force-recreate api
  for i in $(seq 1 30); do
    docker compose exec -T api wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 && { echo "✅ API работает с новыми ключами"; exit 0; }
    sleep 2
  done
  docker compose logs --tail=30 api; echo "✖ API не запустился — логи выше"; exit 1
else
  echo "Ничего не изменено."
fi
