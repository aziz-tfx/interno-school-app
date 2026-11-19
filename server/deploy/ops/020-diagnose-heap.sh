# 019 showed the restarts are «JavaScript heap out of memory» ~15 s after each
# start (heap limit 768 MB). Which request / background job eats the heap:
# the log lines (all levels, request URLs included) just before each crash.
set -o pipefail

mask() { sed -E 's/[0-9]{5,}/…/g; s/(Bearer |bot|key=|token=|password=|ticket=|:\/\/[^:@/]+:)[^ "&@,]+/\1…/gi' | cut -c1-300; }

{
  echo "=== before crash"
  docker compose logs --no-color --no-log-prefix --since 6m api 2>&1 \
    | grep -vE 'strict mode|^\s*$|Last few GCs|Mark-Compact|Scavenge|Native stack|JS stacktrace' \
    | grep -B 45 'FATAL ERROR' | tail -n 140 | mask
  echo "=== urls since start of loop (count)"
  docker compose logs --no-color --no-log-prefix --since 6m api 2>&1 \
    | grep -o '"url":"[^"?]*' | sort | uniq -c | sort -rn | head -n 30
  echo "=== mirror"
  docker compose exec -T db psql -U interno -d interno -At -c \
    "SELECT kind, count(*), pg_size_pretty(sum(pg_column_size(data))::bigint) FROM amo_mirror GROUP BY kind" 2>&1
  docker compose exec -T db psql -U interno -d interno -At -c \
    "SELECT stream, ready, to_timestamp(covered_from)::date, to_timestamp(cursor), error FROM amo_mirror_state ORDER BY stream" 2>&1 | mask
} > state/heap.txt 2>&1

docker compose run --rm --no-deps -T api node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    const out = { at: new Date().toISOString(), kind: "heap" }
    let cur = "head"
    for (const line of s.split("\n")) {
      const m = line.match(/^=== (.+)$/)
      if (m) { cur = m[1]; out[cur] = []; continue }
      if (line.trim()) (out[cur] ||= []).push(line)
    }
    process.stdout.write(JSON.stringify(out))
  })' < state/heap.txt > state/diag.json.tmp
code=$?
[ -s state/diag.json.tmp ] && mv state/diag.json.tmp state/diag.json
exit $code
