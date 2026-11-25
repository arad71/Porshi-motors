#!/usr/bin/env bash
# Pull the latest code from GitHub and rebuild. Takes a backup first.
#   cd /opt/porshi-motors && bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
bash deploy/backup.sh
git pull --ff-only
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker image prune -f >/dev/null
echo "Updated. Health: $(curl -fsS "https://$(grep ^DOMAIN= .env | cut -d= -f2)/api/health" || echo 'not answering yet')"
