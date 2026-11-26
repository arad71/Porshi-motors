#!/usr/bin/env bash
# Pull the latest code from GitHub and rebuild. Takes a backup first.
#   cd /opt/porshi-motors && bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.yml"
grep -q "^USE_CADDY=false" .env 2>/dev/null || COMPOSE="$COMPOSE -f docker-compose.prod.yml"
bash deploy/backup.sh
git pull --ff-only
$COMPOSE up -d --build --remove-orphans
docker image prune -f >/dev/null
PORT="$(grep ^WEB_PORT= .env | cut -d= -f2)"
echo "Updated. Health: $(curl -fsS "http://127.0.0.1:${PORT:-8095}/api/health" || echo 'not answering yet')"
