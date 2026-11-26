#!/usr/bin/env bash
# Backs up the database and uploaded photos to /opt/porshi-backups, keeping 14 days.
# Copy that folder off the server too (Contabo Object Storage, Google Drive via rclone, etc.).
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.yml"
grep -q "^USE_CADDY=false" .env 2>/dev/null || COMPOSE="$COMPOSE -f docker-compose.prod.yml"
DEST="${BACKUP_DIR:-/opt/porshi-backups}"
STAMP="$(date +%F-%H%M)"
mkdir -p "$DEST"
$COMPOSE exec -T db pg_dump -U porshi -d porshi --clean --if-exists | gzip > "$DEST/db-$STAMP.sql.gz"
$COMPOSE exec -T api tar -C /data -czf - uploads > "$DEST/uploads-$STAMP.tar.gz"
find "$DEST" -type f -mtime +14 -delete
echo "$(date) backup ok: $DEST/db-$STAMP.sql.gz"
