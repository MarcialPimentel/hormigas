#!/usr/bin/env bash
# Nightly dump of every database on the hub, kept for 7 days.
# Installed as a cron job for the deploy user (see the walkthrough).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups
docker compose exec -T db pg_dumpall -U postgres | gzip > "backups/all-$(date +%F).sql.gz"
find backups -name 'all-*.sql.gz' -mtime +7 -delete
