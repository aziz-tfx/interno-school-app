#!/bin/sh
# Nightly PostgreSQL backup (runs inside the `backup` container).
#
# Writes /backups/interno-YYYY-MM-DD_HHMM.dump (pg_dump custom format) at
# 03:00 Tashkent time and deletes dumps older than BACKUP_KEEP_DAYS.
#
# ./backups is on the same disk as the database, so it only protects against
# mistakes (a bad import, a deleted record) — not against losing the server.
# Copy the dumps off the server too (see README, «Бэкапы»).
#
# Restore:  pg_restore --clean --if-exists -d interno /backups/<file>.dump
set -eu

KEEP="${BACKUP_KEEP_DAYS:-14}"

backup() {
  file="/backups/interno-$(date +%Y-%m-%d_%H%M).dump"
  pg_dump --format=custom --file="$file.tmp" && mv "$file.tmp" "$file"
  echo "backup written: $file ($(du -h "$file" | cut -f1))"
  find /backups -name 'interno-*.dump' -mtime +"$KEEP" -delete
}

backup # one right away, so a fresh install has a backup from day one
while true; do
  # sleep until the next 22:00 UTC = 03:00 Asia/Tashkent
  now=$(date -u +%s)
  next=$(date -u -d "$(date -u +%Y-%m-%d) 22:00:00" +%s 2>/dev/null || echo $((now + 86400)))
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  backup || echo "backup FAILED" >&2
done
