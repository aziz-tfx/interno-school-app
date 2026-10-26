#!/usr/bin/env bash
# Copy data into the server: all ERP collections from Firestore, then amoCRM.
#
#   bash /opt/interno/server/deploy/import.sh /root/firebase-key.json --dry-run   # count only
#   bash /opt/interno/server/deploy/import.sh /root/firebase-key.json             # import
#
# firebase-key.json — the Firebase service-account key (Firebase console →
# Project settings → Service accounts → Generate new private key; the same
# JSON as FIREBASE_SERVICE_ACCOUNT_KEY on Vercel). Firestore is only read.
# Both imports can be re-run any time: changes are updated, nothing duplicates.
set -euo pipefail

KEY_FILE="${1:-}"
shift || true
[ -n "$KEY_FILE" ] && [ -f "$KEY_FILE" ] || { echo "Укажите путь к ключу Firebase: bash import.sh /root/firebase-key.json [--dry-run]"; exit 1; }
DRY_RUN=no
for a in "$@"; do [ "$a" = "--dry-run" ] && DRY_RUN=yes; done

cd /opt/interno/server
KEY=$(cat "$KEY_FILE")

echo "▶ Firestore → PostgreSQL"
docker compose run --rm -T -e FIREBASE_SERVICE_ACCOUNT_KEY="$KEY" api npm run --silent import:firestore -- "$@"

if [ "$DRY_RUN" = yes ]; then
  echo "Пробный прогон: ничего не записано. Запустите без --dry-run, чтобы перенести."
  exit 0
fi

echo "▶ amoCRM → CRM"
docker compose run --rm -T -e FIREBASE_SERVICE_ACCOUNT_KEY="$KEY" api npm run --silent import:amo -- --tenant=default \
  || echo "⚠ Импорт amoCRM не прошёл (подробности выше). Данные Firestore уже перенесены; amo можно повторить этой же командой."

echo "✅ Готово. Ключ Firebase больше не нужен на сервере:  shred -u $KEY_FILE"
