#!/usr/bin/env bash
# Write keys that arrived encrypted (in the repo, from a one-off task) into
# .env and restart the API:
#
#   bash deploy/apply-secrets.sh deploy/ops/<file>.enc
#
# File format, one per line:  NAME=<base64 RSA-OAEP(SHA-256) ciphertext>
# encrypted to this server's public key (/api/health → opsKey). Only the
# private key at /opt/interno/.ops-key.pem can read them.
set -euo pipefail
cd /opt/interno/server
FILE="$1"
KEY=/opt/interno/.ops-key.pem

set_env() {  # any characters allowed in the value: no sed
  grep -v "^$1=" .env > .env.tmp || true
  printf '%s=%s\n' "$1" "$2" >> .env.tmp
  mv .env.tmp .env && chmod 600 .env
}

while IFS='=' read -r name cipher; do
  [ -n "$name" ] && [ "${name:0:1}" != "#" ] || continue
  value=$(printf '%s' "$cipher" | base64 -d | openssl pkeyutl -decrypt -inkey "$KEY" \
    -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -pkeyopt rsa_mgf1_md:sha256)
  set_env "$name" "$value"
  echo "set $name"
done < "$FILE"

docker compose up -d --force-recreate api
for i in $(seq 1 30); do
  docker compose exec -T api wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 && { echo "API up"; exit 0; }
  sleep 2
done
echo "API did not come back"; exit 1
