#!/usr/bin/env bash
# INTERNO server — first install on a fresh Ubuntu/Debian VPS. Run as root:
#
#   bash /opt/interno/server/deploy/install.sh
#
# Safe to run again: every step checks what is already done, and an existing
# .env (database password, JWT secret) is never overwritten.
#
# Settings (environment variables, all optional):
#   API_DOMAIN    domain whose A record points at this server (HTTPS cert is issued for it)
#   BRANCH        git branch to deploy
#   CORS_ORIGINS  frontend origins allowed to call the API (* = wildcard inside the host)
set -euo pipefail

API_DOMAIN="${API_DOMAIN:-vps11372.eskiz.uz}"
BRANCH="${BRANCH:-claude/vigilant-cerf-m3ppn4}"
CORS_ORIGINS="${CORS_ORIGINS:-https://interno-school-app.vercel.app,https://interno-school-*-aziz-tfxs-projects.vercel.app}"
REPO="git@github.com:aziz-tfx/interno-school-app.git"
APP_DIR=/opt/interno
DEPLOY_KEY=/root/.ssh/interno_deploy

step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✖ %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" = 0 ] || die "Запустите от root"
. /etc/os-release
case "$ID" in ubuntu|debian) ;; *) die "Нужна Ubuntu или Debian, а здесь: $PRETTY_NAME" ;; esac

step "Обновление системы и базовые пакеты"
export DEBIAN_FRONTEND=noninteractive
# Ubuntu's needrestart would stop and ask which services to restart; only list
# them instead — a reboot at the end (if needed) restarts everything cleanly.
export NEEDRESTART_MODE=l
apt-get update -q
apt-get -yq -o Dpkg::Options::=--force-confold upgrade
apt-get -yq install ca-certificates curl git ufw fail2ban unattended-upgrades openssl
timedatectl set-timezone Asia/Tashkent || true
# security updates install themselves
echo 'APT::Periodic::Update-Package-Lists "1"; APT::Periodic::Unattended-Upgrade "1";' > /etc/apt/apt.conf.d/20auto-upgrades

step "Файл подкачки 2 ГБ (страховка от нехватки памяти)"
if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  [ -f /swapfile ] || fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/99-interno-swap.conf
sysctl -q -p /etc/sysctl.d/99-interno-swap.conf

step "Файрвол: открыты только SSH, HTTP и HTTPS"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status | sed -n '1,12p'

step "Защита SSH от подбора пароля (fail2ban)"
systemctl enable --now fail2ban >/dev/null

step "Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null
docker compose version

step "Доступ к репозиторию на GitHub (deploy key, только чтение)"
mkdir -p /root/.ssh && chmod 700 /root/.ssh
[ -f "$DEPLOY_KEY" ] || ssh-keygen -q -t ed25519 -N '' -C "interno-server@$(hostname)" -f "$DEPLOY_KEY"
if ! grep -q 'interno_deploy' /root/.ssh/config 2>/dev/null; then
  # accept-new: GitHub's host key is remembered on first contact
  printf 'Host github.com\n  IdentityFile %s\n  IdentitiesOnly yes\n  StrictHostKeyChecking accept-new\n' "$DEPLOY_KEY" >> /root/.ssh/config
  chmod 600 /root/.ssh/config
fi
until GIT_OUT=$(git ls-remote "$REPO" 2>&1); do
  echo
  echo "GitHub пока не пускает: $(echo "$GIT_OUT" | tail -1)"
  echo "Добавьте этот ключ в GitHub: https://github.com/aziz-tfx/interno-school-app/settings/keys/new"
  echo "(Title: interno-server, галочку «Allow write access» НЕ ставить)"
  echo
  cat "$DEPLOY_KEY.pub"
  echo
  read -rp "Нажмите Enter, когда ключ добавлен… " _ </dev/tty
done

step "Код ($BRANCH)"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q origin "$BRANCH"
  git -C "$APP_DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"
else
  git clone -q -b "$BRANCH" "$REPO" "$APP_DIR"
fi
git -C "$APP_DIR" log --oneline -1
cd "$APP_DIR/server"

step "Настройки (.env)"
if [ -f .env ]; then
  echo ".env уже есть — оставляю как есть (пароль базы и секрет входа не меняются)"
else
  # hex: no characters that would need escaping inside DATABASE_URL
  cat > .env <<EOF
API_DOMAIN=$API_DOMAIN
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 48)
CORS_ORIGINS=$CORS_ORIGINS
EOF
  chmod 600 .env
  echo "создан .env с новыми случайными паролями"
fi
mkdir -p backups

step "Проверка домена $API_DOMAIN"
MY_IP=$(curl -fsS -4 --max-time 10 https://api.ipify.org || hostname -I | awk '{print $1}')
DNS_IP=$(getent ahostsv4 "$API_DOMAIN" | awk 'NR==1 {print $1}')
if [ "$DNS_IP" = "$MY_IP" ]; then
  echo "$API_DOMAIN → $MY_IP ✓"
else
  warn "$API_DOMAIN указывает на «${DNS_IP:-ничего}», а IP сервера $MY_IP."
  warn "HTTPS-сертификат не выпустится, пока A-запись не укажет на $MY_IP. Сервер всё равно запущу —"
  warn "сертификат появится сам через несколько минут после исправления DNS."
fi

step "Сборка и запуск (первый раз — несколько минут)"
docker compose up -d --build
docker image prune -f >/dev/null

step "Проверка API"
for i in $(seq 1 60); do
  if docker compose exec -T api wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "API отвечает внутри сервера ✓"
    break
  fi
  [ "$i" = 60 ] && { docker compose logs --tail=50 api; die "API не запустился — логи выше"; }
  sleep 3
done
HTTPS_OK=no
for i in $(seq 1 30); do
  if curl -fsS --max-time 10 "https://$API_DOMAIN/api/health" >/dev/null 2>&1; then HTTPS_OK=yes; break; fi
  sleep 4
done
if [ "$HTTPS_OK" = yes ]; then
  echo "https://$API_DOMAIN/api/health ✓"
else
  warn "HTTPS пока не отвечает (обычно — DNS ещё не указывает на сервер). Логи: cd $APP_DIR/server && docker compose logs caddy"
fi

cat <<EOF

────────────────────────────────────────────────────────────────────
✅ Сервер INTERNO установлен:  https://$API_DOMAIN

Дальше:
  1. Смените пароль root (он был отправлен в переписке):   passwd
  2. Перенесите данные из Firestore и amoCRM:
       bash $APP_DIR/server/deploy/import.sh /root/firebase-key.json --dry-run   # посчитать
       bash $APP_DIR/server/deploy/import.sh /root/firebase-key.json             # перенести
     (firebase-key.json — ключ сервисного аккаунта Firebase, тот же, что в Vercel)
  3. Обновление в будущем:   bash $APP_DIR/server/deploy/update.sh
────────────────────────────────────────────────────────────────────
EOF

if [ -f /var/run/reboot-required ]; then
  warn "Установлено новое ядро. Перезагрузите сервер, когда удобно:  reboot"
  warn "База, API, HTTPS и бэкапы запустятся сами после перезагрузки."
fi
