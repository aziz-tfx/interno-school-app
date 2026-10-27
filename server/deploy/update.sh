#!/usr/bin/env bash
# Deploy the latest code of the current branch:  bash /opt/interno/server/deploy/update.sh
# Database migrations run automatically when the API starts.
set -euo pipefail

APP_DIR=/opt/interno
cd "$APP_DIR"
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"

echo "▶ Код: $BRANCH"
git fetch -q origin "$BRANCH"
git checkout -q -B "$BRANCH" "origin/$BRANCH"
git log --oneline -1

echo "▶ Сборка и перезапуск"
cd server
# files attached to CRM deals: the API container runs as uid 1000 (node)
mkdir -p files && chown 1000:1000 files
docker compose up -d --build
docker image prune -f >/dev/null

for i in $(seq 1 40); do
  if docker compose exec -T api wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "✅ API работает"
    exit 0
  fi
  sleep 3
done
docker compose logs --tail=50 api
echo "✖ API не поднялся — логи выше"
exit 1
