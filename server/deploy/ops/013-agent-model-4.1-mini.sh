# AI agent: gpt-4o-mini → gpt-4.1-mini (follows instructions and Uzbek
# noticeably better; ~2.7× the token price, still cents per conversation).
# Only if the school still has the old default — a model picked by hand stays.
set -euo pipefail
cd /opt/interno/server
docker compose exec -T db psql -U interno -d interno -c \
  "UPDATE tenant_integrations SET data = jsonb_set(data, '{aiAgent,model}', '\"gpt-4.1-mini\"')
    WHERE id = 'default' AND data->'aiAgent'->>'model' = 'gpt-4o-mini'"
