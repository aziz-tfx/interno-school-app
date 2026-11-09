# New branch admin (2026-11-09): Машхура, «Админ филиала», Ташкент, login
# mashxura. The password arrives encrypted to this server's key
# (017-mashxura-branch-admin.enc, RSA-OAEP-SHA256) and goes to the script on
# stdin. If the login is already taken nothing changes (exit 2).
set -euo pipefail
cd /opt/interno/server
KEY=/opt/interno/.ops-key.pem
grep '^PASSWORD=' deploy/ops/017-mashxura-branch-admin.enc | cut -d= -f2- | base64 -d \
  | openssl pkeyutl -decrypt -inkey "$KEY" \
      -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -pkeyopt rsa_mgf1_md:sha256 \
  | docker compose exec -T api node scripts/create-employee.js \
      --login=mashxura --name='Машхура' --role=branch_admin --branch=tashkent
