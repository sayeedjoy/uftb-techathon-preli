#!/usr/bin/env bash
#
# Daily PostgreSQL backup.
#
#   pnpm db:backup
#
# Produces a timestamped custom-format dump under backups/ (gitignored).
# Restore with the command printed at the end, which also states the data-loss
# window. Retention policy itself lives in scripts/retention.ts.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$BACKEND_DIR")"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"

# DATABASE_URL from the environment wins; otherwise read backend/.env.
if [ -z "${DATABASE_URL:-}" ] && [ -f "$BACKEND_DIR/.env" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$BACKEND_DIR/.env" | head -n1 | cut -d= -f2-)"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set and backend/.env has no DATABASE_URL." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is not on PATH. Install the PostgreSQL client tools, or run:" >&2
  echo "  docker compose exec -T postgres pg_dump -U scsrg scsrg > backup.sql" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARTEFACT="$BACKUP_DIR/scsrg-$TIMESTAMP.dump"

echo "Dumping to $ARTEFACT …"
pg_dump --format=custom --no-owner --no-acl --file="$ARTEFACT" "$DATABASE_URL"

SIZE="$(du -h "$ARTEFACT" | cut -f1)"
echo ""
echo "✓ Backup complete: $ARTEFACT ($SIZE)"
echo ""
echo "Restore into a scratch database with:"
echo "  createdb scsrg_restore"
echo "  pg_restore --no-owner --dbname=postgresql://scsrg:scsrg@localhost:5433/scsrg_restore \"$ARTEFACT\""
echo ""
echo "Data-loss window: everything written since $TIMESTAMP."
echo "Verify the scratch database before promoting it over the live one."
