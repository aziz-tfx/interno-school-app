# Autodeploy follows main from now on (it followed claude/vigilant-cerf-m3ppn4).
# Switches only if main already holds everything deployed now, so the server
# never goes back to older code. The switch keeps the running commit under
# the name main; the next 2-minute check sees main is ahead and deploys it
# the usual way (update.sh, logged, result in /api/health).
set -euo pipefail
cd "${INTERNO_DIR:-/opt/interno}"
git fetch -q origin main
if ! git merge-base --is-ancestor HEAD origin/main; then
  echo "main ещё не содержит $(git rev-parse --short HEAD) — остаёмся на $(git rev-parse --abbrev-ref HEAD)"
  exit 1
fi
git checkout -q -B main HEAD
echo "автообновление теперь следит за main ($(git rev-parse --short HEAD) → $(git rev-parse --short origin/main) при следующей проверке)"
