# The API keeps restarting (2026-11-19): from outside, /api/health answers
# 200 for ~20 s, then Caddy gives 502 for ~2 s, again and again — the rate
# limit counter resets each time, so it is the process exiting, not Caddy.
# Look from the server: restarts / OOM / exit code, the crash lines from the
# API log, Postgres errors, disk and memory → /api/health → diag.
#
# If the disk is nearly full, free Docker's build cache and dangling images
# (safe: nothing running uses them). Backups and data are not touched.
set -o pipefail

sleep 90 # let the freshly deployed API run long enough to show a loop

mask() { sed -E 's/[0-9]{5,}/…/g; s/(Bearer |bot|key=|token=|password=|:\/\/[^:@/]+:)[^ "&@]+/\1…/gi' | cut -c1-400; }

usage=$(df -P / | awk 'NR==2{gsub("%","",$5); print $5}')

{
  echo "=== containers"
  docker inspect --format '{{.Name}} status={{.State.Status}} restarts={{.RestartCount}} oom={{.State.OOMKilled}} exit={{.State.ExitCode}} started={{.State.StartedAt}} finished={{.State.FinishedAt}} health={{if .State.Health}}{{.State.Health.Status}}{{end}}' $(docker compose ps -aq) 2>&1
  echo "=== api log (not info)"
  docker compose logs --no-color --no-log-prefix --timestamps --since 10m api 2>&1 \
    | grep -v '"level":30' | tail -n 120 | mask
  echo "=== api log (starts)"
  docker compose logs --no-color --no-log-prefix --timestamps --since 10m api 2>&1 \
    | grep -cE 'Server listening'
  echo "=== db log"
  docker compose logs --no-color --no-log-prefix --timestamps --since 24h db 2>&1 \
    | grep -E 'PANIC|FATAL|ERROR|No space|terminat|recovery|shut down|ready to accept' | tail -n 60 | mask
  echo "=== kernel oom"
  dmesg -T 2>/dev/null | grep -iE 'out of memory|killed process|oom' | tail -n 10
  echo "=== disk"
  df -h / /var/lib/docker 2>&1
  du -sh backups files 2>&1
  docker system df 2>&1
  echo "=== memory"
  free -m 2>&1
  if [ "${usage:-0}" -ge 90 ]; then
    echo "=== cleanup (disk ${usage}%)"
    docker builder prune -f 2>&1 | tail -n 1
    docker image prune -f 2>&1 | tail -n 1
    df -h / 2>&1
  fi
} > state/restarts.txt 2>&1

# text sections → JSON for /api/health (node from the API image; works even
# while the API itself keeps exiting)
docker compose run --rm --no-deps -T api node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    const out = { at: new Date().toISOString(), kind: "restarts" }
    let cur = "head"
    for (const line of s.split("\n")) {
      const m = line.match(/^=== (.+)$/)
      if (m) { cur = m[1]; out[cur] = []; continue }
      if (line.trim()) (out[cur] ||= []).push(line)
    }
    process.stdout.write(JSON.stringify(out))
  })' < state/restarts.txt > state/diag.json.tmp
code=$?
[ -s state/diag.json.tmp ] && mv state/diag.json.tmp state/diag.json
exit $code
