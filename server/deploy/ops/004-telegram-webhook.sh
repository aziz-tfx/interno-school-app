# The bot's updates (students linking their chat) now go to this server.
# Then the integrations check once more.
docker compose exec -T api node scripts/telegram-webhook.js default || exit 1
sleep 20
docker compose logs --no-color --no-log-prefix --since 168h api 2>/dev/null \
  | grep -E 'AI agent|daily automations|Server listening' | tail -n 3000 \
  | docker compose exec -T api node scripts/diagnose.js default > state/diag.json.tmp \
  && mv state/diag.json.tmp state/diag.json
