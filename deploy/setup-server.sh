#!/usr/bin/env bash
# One-time setup of a fresh Contabo VPS (Ubuntu 22.04 / 24.04) for Porshi Motors.
#
#   ssh root@YOUR_SERVER_IP
#   git clone https://github.com/arad71/Porshi-motors.git /opt/porshi-motors
#   cd /opt/porshi-motors && bash deploy/setup-server.sh --email you@example.com [--demo]
#
# --demo  loads the sample Kushtia data and shows portal codes on screen (for showing the owner).
#         Leave it out for real use; then create the first admin with the command printed at the end.
set -euo pipefail

DOMAIN="motors.porshi.tech"
EMAIL=""
DEMO="false"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

while [ $# -gt 0 ]; do
  case "$1" in
    --email) EMAIL="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --demo) DEMO="true"; shift ;;
    --skip-dns-check) SKIP_DNS=1; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done
[ -n "$EMAIL" ] || { echo "Give an email for HTTPS certificate notices: --email you@example.com"; exit 1; }
[ "$(id -u)" -eq 0 ] || { echo "Run as root (or with sudo)."; exit 1; }

echo "==> Checking that $DOMAIN points to this server"
if [ -z "${SKIP_DNS:-}" ]; then
SERVER_IP="$(curl -4 -fsS https://api.ipify.org || true)"
DNS_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
if [ -z "$DNS_IP" ] || [ "$DNS_IP" != "$SERVER_IP" ]; then
  echo "   $DOMAIN resolves to '${DNS_IP:-nothing}', this server is '$SERVER_IP'."
  echo "   Add a DNS A record: motors → $SERVER_IP (at the porshi.tech DNS provider), wait a few minutes, then re-run."
  echo "   HTTPS cannot be issued until this is right. (Use --skip-dns-check if you are sure it is.)"
  exit 1
fi
fi

echo "==> Updating the system and setting the time zone"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw unattended-upgrades
timedatectl set-timezone Asia/Dhaka || true
dpkg-reconfigure -f noninteractive unattended-upgrades || true

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

echo "==> Firewall: allow SSH, HTTP and HTTPS only"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Adding 2 GB swap if the server has none (helps the build on small plans)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

cd "$APP_DIR"
if [ ! -f .env ]; then
  echo "==> Creating .env with new random secrets"
  rand() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "$1"; }
  cat > .env <<ENV
DOMAIN=$DOMAIN
ACME_EMAIL=$EMAIL
PUBLIC_URL=https://$DOMAIN
SECRET_KEY=$(rand 64)
DB_PASSWORD=$(rand 32)
WEB_BIND=127.0.0.1
WEB_PORT=8080
DEMO_MODE=$DEMO
SEED_ON_START=$DEMO
SMS_PROVIDER=console
SMS_API_URL=
SMS_API_KEY=
SMS_SENDER=PORSHI
ENV
  chmod 600 .env
else
  echo "==> Keeping the existing .env"
fi

echo "==> Building and starting (first build takes a few minutes)"
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

echo "==> Daily database backup at 02:30"
chmod +x deploy/*.sh
cat > /etc/cron.d/porshi-backup <<CRON
30 2 * * * root $APP_DIR/deploy/backup.sh >> /var/log/porshi-backup.log 2>&1
CRON

echo "==> Waiting for the site"
for i in $(seq 1 60); do
  if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then OK=1; break; fi
  sleep 5
done
if [ "${OK:-}" = 1 ]; then
  echo
  echo "Porshi Motors is live at https://$DOMAIN"
else
  echo "Started, but https://$DOMAIN is not answering yet. Check: docker compose -f docker-compose.yml -f docker-compose.prod.yml logs caddy api"
fi
if [ "$DEMO" = "true" ]; then
  echo "Demo data loaded. Staff sign-in: 01711003001 / porshi123 (see README for all roles)."
else
  echo "Create the first admin:"
  echo "  docker compose exec api python -m app.create_admin \"Owner name\" 017XXXXXXXX \"a-strong-password\""
fi
