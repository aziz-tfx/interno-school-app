#!/usr/bin/env bash
# Keeps the server in step with GitHub, so nobody has to type at the terminal.
#
#   bash /opt/interno/server/deploy/autodeploy.sh install   # once: timer every 2 minutes
#   bash /opt/interno/server/deploy/autodeploy.sh run       # what the timer runs
#
# Each run:
#   1. new commits on the deployed branch → deploy/update.sh
#   2. every server/deploy/ops/*.sh not run yet → run once, in name order
#      (one-off server tasks shipped as code: a domain switch, new keys…)
#   3. result → server/state/deploy.json, shown by /api/health, so the
#      result can be checked from outside without logging in to the server
#
# Keys travel encrypted: install creates an RSA key pair; the public half is
# shown by /api/health, the private half never leaves /opt/interno/.ops-key.pem.
# Values encrypted to it can sit in the repo (see deploy/apply-secrets.sh).
set -euo pipefail

APP="${INTERNO_DIR:-/opt/interno}"
SRV=$APP/server
STATE=$SRV/state
OPS_DONE=$APP/.ops-done
KEY=$APP/.ops-key.pem
LOG="${INTERNO_DEPLOY_LOG:-/var/log/interno-autodeploy.log}"

log() { printf '%s %s\n' "$(date -Is)" "$*" >> "$LOG"; }

install_timer() {
  [ "$(id -u)" = 0 ] || { echo "Запустите от root"; exit 1; }
  mkdir -p "$STATE"
  touch "$OPS_DONE"
  if [ ! -f "$KEY" ]; then
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out "$KEY" 2>/dev/null
    chmod 600 "$KEY"
  fi
  openssl pkey -in "$KEY" -pubout -out "$STATE/ops-key.pub.pem"
  # The timer runs a copy: `git pull` may rewrite this file while it runs.
  cat > /etc/systemd/system/interno-autodeploy.service <<EOF
[Unit]
Description=INTERNO: deploy new commits and one-off server tasks from GitHub
After=docker.service network-online.target

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'cp $SRV/deploy/autodeploy.sh /run/interno-autodeploy.sh && exec /bin/bash /run/interno-autodeploy.sh run'
EOF
  cat > /etc/systemd/system/interno-autodeploy.timer <<'EOF'
[Unit]
Description=INTERNO: check GitHub every 2 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now interno-autodeploy.timer >/dev/null
  echo "✅ Автообновление включено: сервер проверяет GitHub каждые 2 минуты."
  echo "   Журнал: $LOG"
  systemctl start interno-autodeploy.service || true
}

write_state() {  # write_state <update result>
  local ops_json
  ops_json=$(tail -n 20 "$APP/.ops-log" 2>/dev/null | awk -F'\t' '{printf "%s{\"name\":\"%s\",\"exit\":%s,\"at\":\"%s\"}", (NR>1?",":""), $1, $2, $3}')
  cat > "$STATE/deploy.json.tmp" <<EOF
{"commit":"$(git -C "$APP" rev-parse --short HEAD)","branch":"$(git -C "$APP" rev-parse --abbrev-ref HEAD)","checkedAt":"$(date -Is)","update":"$1","ops":[${ops_json}]}
EOF
  mv "$STATE/deploy.json.tmp" "$STATE/deploy.json"
}

run() {
  exec 9>/run/interno-autodeploy.lock
  flock -n 9 || exit 0
  mkdir -p "$STATE"
  touch "$OPS_DONE"
  cd "$APP"
  local branch update=unchanged
  branch=$(git rev-parse --abbrev-ref HEAD)
  if ! git fetch -q origin "$branch" 2>>"$LOG"; then
    log "fetch failed"
    write_state "fetch-failed"
    exit 0
  fi
  if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$branch")" ]; then
    log "update $(git rev-parse --short HEAD) → $(git rev-parse --short "origin/$branch")"
    # Check out first, so update.sh runs as the new version from start to
    # end (its own `git checkout` would otherwise rewrite it mid-run).
    git checkout -q -B "$branch" "origin/$branch"
    if bash "$SRV/deploy/update.sh" >> "$LOG" 2>&1; then update=ok; else update=failed; log "update failed"; fi
  fi

  # One-off tasks: each runs once. A failed one is not retried — a fix
  # ships as a new task — so a broken task can't loop every 2 minutes.
  shopt -s nullglob
  for op in "$SRV"/deploy/ops/*.sh; do
    name=$(basename "$op")
    grep -qxF "$name" "$OPS_DONE" && continue
    echo "$name" >> "$OPS_DONE"
    log "op $name: start"
    set +e
    (cd "$SRV" && bash "$op") >> "$LOG" 2>&1
    code=$?
    set -e
    log "op $name: exit $code"
    printf '%s\t%s\t%s\n' "$name" "$code" "$(date -Is)" >> "$APP/.ops-log"
  done
  write_state "$update"
}

case "${1:-}" in
  install) install_timer ;;
  run) run ;;
  *) echo "usage: autodeploy.sh install|run"; exit 1 ;;
esac
