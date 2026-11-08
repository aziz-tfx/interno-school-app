# After the local amoCRM copy and the agent's self-check ship: give the first
# backfill ten minutes, then show its progress (and the self-check) in
# /api/health → diag.amoMirror / diag.agentHealth.
sleep 600
bash deploy/ops/006-diagnose-agent.sh
