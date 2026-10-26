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
[ -n "$KEY_FILE" ] || { echo "Укажите путь к ключу Firebase: bash import.sh /root/firebase-key.json [--dry-run]"; exit 1; }
# `scp a.json b.json host:/root/firebase-key.json` makes a *directory* of
# that name — take the key from inside it.
if [ -d "$KEY_FILE" ]; then
  INNER=$(ls "$KEY_FILE"/*.json 2>/dev/null | head -1 || true)
  [ -n "$INNER" ] || { echo "✖ $KEY_FILE — папка, и в ней нет .json"; exit 1; }
  echo "ℹ $KEY_FILE — это папка; беру ключ $INNER"
  KEY_FILE="$INNER"
fi
if [ ! -f "$KEY_FILE" ]; then
  echo "✖ Файл $KEY_FILE не найден на сервере. Загрузите ключ Firebase, например с Mac:"
  echo "    scp ~/Downloads/<имя-ключа>.json root@<IP-сервера>:$KEY_FILE"
  echo "  (Firebase Console → Project settings → Service accounts → Generate new private key)"
  exit 1
fi
grep -q '"private_key"' "$KEY_FILE" || { echo "✖ $KEY_FILE не похож на ключ сервисного аккаунта Firebase (нет поля private_key)"; exit 1; }
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

# --changed: after the first full import only what changed since the last run
# (minutes); the very first run takes everything (hours on a big account —
# then better in the background, see README)
echo "▶ amoCRM → CRM (изменения с прошлого импорта)"
docker compose run --rm -T -e FIREBASE_SERVICE_ACCOUNT_KEY="$KEY" api npm run --silent import:amo -- --tenant=default --changed \
  || echo "⚠ Импорт amoCRM не прошёл (подробности выше). Данные Firestore уже перенесены; amo можно повторить этой же командой."

echo "✅ Готово. Ключ Firebase больше не нужен на сервере:  shred -u $KEY_FILE"
