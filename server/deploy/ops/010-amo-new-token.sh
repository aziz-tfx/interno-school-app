# amoCRM blocked the old integration's token (nginx 403 with it, 401 without:
# see 008). A new long-lived token (issued 2026-11-08, valid till 2027-01-01)
# arrives encrypted in 010-amo-new-token.enc: AES key encrypted to this
# server's key (RSA-OAEP-SHA256), the token itself AES-256-CBC with that key
# (the token is longer than RSA can encrypt). It replaces AMO_ACCESS_TOKEN in
# .env; the AI agent's failed conversations get retried right away; then the
# diagnosis shows in /api/health whether amoCRM accepts it.
set -euo pipefail
cd /opt/interno/server
KEY=/opt/interno/.ops-key.pem
val() { grep "^$1=" deploy/ops/010-amo-new-token.enc | cut -d= -f2-; }
aes=$(val AES_KEY | base64 -d | openssl pkeyutl -decrypt -inkey "$KEY" \
  -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -pkeyopt rsa_mgf1_md:sha256)
token=$(val AMO_ACCESS_TOKEN | base64 -d | openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -pass "pass:$aes")
case "$token" in eyJ*.*.*) ;; *) echo "✖ decrypted value doesn't look like a token"; exit 1 ;; esac

grep -v '^AMO_ACCESS_TOKEN=' .env > .env.tmp || true
printf 'AMO_ACCESS_TOKEN=%s\n' "$token" >> .env.tmp
mv .env.tmp .env && chmod 600 .env
echo "AMO_ACCESS_TOKEN replaced (${#token} chars)"

# conversations waiting for a retry: due now instead of in up to an hour
docker compose exec -T db psql -U interno -d interno -qc \
  "UPDATE ai_agent_conversations SET data = data - 'nextRetryAt' WHERE coalesce(data->>'lastError', '') <> ''" \
  || echo "retry reset skipped (the regular back-off still applies)"

docker compose up -d --force-recreate api
for i in $(seq 1 30); do
  docker compose exec -T api wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 && break
  sleep 2
done
bash deploy/ops/006-diagnose-agent.sh
