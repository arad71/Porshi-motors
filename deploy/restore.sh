#!/usr/bin/env bash
# Restore a database backup:  bash deploy/restore.sh /opt/porshi-backups/db-2026-11-25-0230.sql.gz
# This REPLACES the current data. Take a fresh backup first if unsure.
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?Give the backup file}"
read -r -p "Replace the live database with $FILE? Type yes: " ans
[ "$ans" = "yes" ] || { echo "Cancelled."; exit 1; }
gunzip -c "$FILE" | docker compose exec -T db psql -U porshi -d porshi -q
docker compose restart api
echo "Restored."
