# The agent's sweep now starts with the server (no waiting for a webhook).
# Give it two rounds after this deploy, then show the result in /api/health.
sleep 360
bash deploy/ops/006-diagnose-agent.sh
