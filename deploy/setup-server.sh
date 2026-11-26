#!/usr/bin/env bash
# One-time setup of a fresh Contabo VPS (Ubuntu 22.04 / 24.04) for Porshi Motors.
#
#   ssh root@YOUR_SERVER_IP
#   git clone https://github.com/arad71/Porshi-motors.git /opt/porshi-motors
#   cd /opt/porshi-motors && bash deploy/setup-server.sh --email you@example.com [--demo] [--port 8095]
#
# --demo          loads the sample Kushtia data and shows portal codes on screen (for showing the owner).
#                 Leave it out for real use; then create the first admin with the command printed at the end.
# --port N        local port for the website container (default 8095). Must be free on this server.
# --behind-proxy  this server already runs a web server on ports 80/443 (Caddy, Nginx…).
#                 Porshi Motors then does not start its own HTTPS. The script detects the existing
#                 web server and prints the exact site block to add to it (see DEPLOY.md).
set -euo pipefail

DOMAIN="motors.porshi.tech"
EMAIL=""
DEMO="false"
PORT="8095"
PROXY="caddy"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

while [ $# -gt 0 ]; do
  case "$1" in
    --email) EMAIL="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --demo) DEMO="true"; shift ;;
    --skip-dns-check) SKIP_DNS=1; shift ;;
    --port) PORT="$2"; shift 2 ;;
    --behind-proxy) PROXY="existing"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || { echo "--port must be a number from 1024 to 65535"; exit 1; }
[ "$PROXY" = "existing" ] || [ -n "$EMAIL" ] || { echo "Give an email for HTTPS certificate notices: --email you@example.com"; exit 1; }
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
apt-get install -y ca-certificates curl git ufw unattended-upgrades iproute2

port_owner() { ss -ltnpH "sport = :$1" 2>/dev/null | sed -n 's/.*users:(("\([^"]*\)".*/\1/p' | head -1; }
port_busy() { ss -ltnH "sport = :$1" 2>/dev/null | grep -q .; }
# What already serves ports 80/443: docker-caddy:<container>, system-caddy, nginx, apache or unknown
detect_proxy() {
  local c owner
  for p in 443 80; do
    c="$(docker ps --filter "publish=$p" --format '{{.Names}} {{.Image}}' 2>/dev/null | grep -i caddy | grep -v porshi | head -1 | cut -d' ' -f1)"
    [ -n "$c" ] && { echo "docker-caddy:$c"; return; }
  done
  owner="$(port_owner 443)"; [ -n "$owner" ] || owner="$(port_owner 80)"
  case "$owner" in
    caddy) echo system-caddy ;;
    nginx) echo nginx ;;
    apache2|httpd) echo apache ;;
    *) echo unknown ;;
  esac
}
# true when the port is held by one of our own Porshi Motors containers (re-running the script)
ours() { docker ps --filter "publish=$1" --format '{{.Names}}' 2>/dev/null | grep -q porshi; }

echo "==> Checking ports"
if port_busy "$PORT" && ! ours "$PORT"; then
  echo "   Port $PORT is already used by: $(port_owner "$PORT" || true)."
  echo "   Pick a free one, e.g.:  bash deploy/setup-server.sh --email $EMAIL --port 8096 $([ "$DEMO" = true ] && echo --demo)"
  echo "   Ports in use now: $(ss -ltnH | awk '{print $4}' | sed 's/.*://' | sort -un | tr '\n' ' ')"
  exit 1
fi
if [ "$PROXY" = "caddy" ]; then
  for p in 80 443; do
    if port_busy "$p" && ! ours "$p"; then
      echo "   Port $p is already used by: $(detect_proxy | sed 's/^docker-caddy:/Caddy in Docker container /; s/^system-caddy/Caddy/')."
      echo "   This server already serves websites, so Porshi Motors should sit behind that web server."
      echo "   Re-run with --behind-proxy:"
      echo "     bash deploy/setup-server.sh --behind-proxy --port $PORT $([ "$DEMO" = true ] && echo --demo)"
      exit 1
    fi
  done
fi
echo "   Website port $PORT is free."
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

echo "==> Firewall: allow SSH, HTTP and HTTPS (existing rules are kept)"
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
WEB_PORT=$PORT
USE_CADDY=$([ "$PROXY" = caddy ] && echo true || echo false)
DEMO_MODE=$DEMO
SEED_ON_START=$DEMO
SMS_PROVIDER=console
SMS_API_URL=
SMS_API_KEY=
SMS_SENDER=PORSHI
ENV
  chmod 600 .env
else
  echo "==> Keeping the existing .env (updating port and proxy mode)"
  set_env() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }
  set_env WEB_PORT "$PORT"
  set_env USE_CADDY "$([ "$PROXY" = caddy ] && echo true || echo false)"
  if [ -n "$EMAIL" ]; then set_env ACME_EMAIL "$EMAIL"; fi
fi
COMPOSE="docker compose -f docker-compose.yml"
[ "$PROXY" = caddy ] && COMPOSE="$COMPOSE -f docker-compose.prod.yml"

echo "==> Building and starting (first build takes a few minutes)"
$COMPOSE up -d --build --remove-orphans

echo "==> Daily database backup at 02:30"
chmod +x deploy/*.sh
cat > /etc/cron.d/porshi-backup <<CRON
30 2 * * * root $APP_DIR/deploy/backup.sh >> /var/log/porshi-backup.log 2>&1
CRON

echo "==> Waiting for the app on port $PORT"
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then LOCAL=1; break; fi
  sleep 5
done
[ "${LOCAL:-}" = 1 ] || { echo "The app did not start. Check: $COMPOSE logs --tail=80"; exit 1; }
echo "   App is running on 127.0.0.1:$PORT"
if [ "$PROXY" = caddy ]; then
  for i in $(seq 1 24); do
    if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then OK=1; break; fi
    sleep 5
  done
  if [ "${OK:-}" = 1 ]; then echo; echo "Porshi Motors is live at https://$DOMAIN"
  else echo "HTTPS is not answering yet. Check: $COMPOSE logs --tail=80 caddy"; fi
else
  KIND="$(detect_proxy)"
  SNIP="deploy/site.$DOMAIN.caddy"
  echo
  echo "======================================================================"
  case "$KIND" in
    docker-caddy:*)
      CADDY="${KIND#docker-caddy:}"
      docker network connect porshi-motors "$CADDY" 2>/dev/null || true
      printf '%s {\n\tencode zstd gzip\n\treverse_proxy porshi-web:80\n}\n' "$DOMAIN" > "$SNIP"
      echo "Your Caddy runs in Docker (container: $CADDY). It is now connected to the"
      echo "porshi-motors network, so it can reach the site as porshi-web:80."
      echo
      echo "1. Add this block to that Caddy's Caddyfile (saved in $APP_DIR/$SNIP):"
      echo; sed 's/^/     /' "$SNIP"; echo
      echo "2. Reload it:"
      echo "     docker exec $CADDY caddy reload --config /etc/caddy/Caddyfile"
      echo "   (use the Caddyfile path inside that container if it is different)"
      echo
      echo "3. So the connection survives re-creating that Caddy container, add to its docker-compose.yml:"
      echo "     services:  <caddy service>:  networks: [default, porshi-motors]"
      echo "     networks:  porshi-motors:  external: true"
      ;;
    nginx)
      sed "s/__PORT__/$PORT/g; s/__DOMAIN__/$DOMAIN/g" deploy/nginx-site.conf > "deploy/nginx-site.$DOMAIN.conf"
      echo "Your server uses Nginx. Add the site:"
      echo "  cp deploy/nginx-site.$DOMAIN.conf /etc/nginx/sites-available/$DOMAIN"
      echo "  ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/"
      echo "  nginx -t && systemctl reload nginx"
      echo "  certbot --nginx -d $DOMAIN"
      ;;
    *)
      printf '%s {\n\tencode zstd gzip\n\treverse_proxy 127.0.0.1:%s\n}\n' "$DOMAIN" "$PORT" > "$SNIP"
      [ "$KIND" = system-caddy ] && echo "Your server uses Caddy (installed on the system)." || echo "Add $DOMAIN to the web server on ports 80/443, forwarding to http://127.0.0.1:$PORT."
      echo
      echo "1. Add this block to the Caddyfile, usually /etc/caddy/Caddyfile (saved in $APP_DIR/$SNIP):"
      echo; sed 's/^/     /' "$SNIP"; echo
      echo "2. Check and reload:"
      echo "     caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy"
      ;;
  esac
  echo
  echo "Caddy gets the HTTPS certificate for $DOMAIN by itself. Then open https://$DOMAIN"
  echo "======================================================================"
fi
if [ "$DEMO" = "true" ]; then
  echo "Demo data loaded. Staff sign-in: 01711003001 / porshi123 (see README for all roles)."
else
  echo "Create the first admin:"
  echo "  docker compose exec api python -m app.create_admin \"Owner name\" 017XXXXXXXX \"a-strong-password\""
fi
