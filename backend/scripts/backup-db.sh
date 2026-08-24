#!/usr/bin/env bash
#
# On-demand logical backup of a Postgres database.
#
#   ./backend/scripts/backup-db.sh                  # uses DATABASE_URL from backend/.env
#   DATABASE_URL='postgres://…' ./backend/scripts/backup-db.sh
#   ./backend/scripts/backup-db.sh /path/to/backups # write somewhere other than ./backups
#
# The nightly backup runs in GitHub Actions (.github/workflows/db-backup.yml).
# This script is for the times you want a dump right now — before a migration,
# before a risky data fix, or to pull production data down for a restore test.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
out_dir="${1:-$repo_root/backups}"
keep_days="${BACKUP_KEEP_DAYS:-30}"

if [ -z "${DATABASE_URL:-}" ]; then
  env_file="$repo_root/backend/.env"
  [ -f "$env_file" ] || { echo "No DATABASE_URL set and no $env_file to read it from." >&2; exit 1; }
  # Read the value without sourcing the file — .env holds other secrets, and a
  # stray backtick or $( in any of them would execute on source.
  DATABASE_URL="$(grep -m1 -E '^[[:space:]]*DATABASE_URL=' "$env_file" | sed -E 's/^[^=]+=//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/')"
  [ -n "$DATABASE_URL" ] || { echo "DATABASE_URL is empty in $env_file." >&2; exit 1; }
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  cat >&2 <<'MSG'
pg_dump is not on your PATH. On macOS:

  brew install postgresql@18
  echo 'export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"' >> ~/.zshrc

The client major version must be >= the server's, so install the major that
matches production, which is PostgreSQL 18 (postgresql@15 will refuse it).
MSG
  exit 1
fi

# Fail early and clearly on the version mismatch rather than mid-dump.
server_num="$(psql "$DATABASE_URL" -tAXc 'SHOW server_version_num')"
server_major=$(( server_num / 10000 ))
client_major="$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
if [ "$client_major" -lt "$server_major" ]; then
  echo "pg_dump is $client_major but the server is $server_major. Install postgresql@$server_major and put its bin on PATH." >&2
  exit 1
fi

mkdir -p "$out_dir"
stamp="$(date -u +%Y%m%d-%H%M%S)"
file="$out_dir/eddream-$stamp.dump"

echo "Dumping PostgreSQL $server_major → $file"
pg_dump "$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="$file"

# A dump that pg_restore cannot list cannot be restored either.
tables="$(pg_restore --list "$file" | grep -c '^[0-9].*TABLE DATA' || true)"
if [ "$tables" -eq 0 ]; then
  echo "The dump contains no table data — not keeping it." >&2
  rm -f "$file"
  exit 1
fi

echo "Wrote $(du -h "$file" | cut -f1), $tables tables with data."

# Prune old local dumps. -mtime +N is "more than N days old".
deleted="$(find "$out_dir" -name 'eddream-*.dump' -type f -mtime "+$keep_days" -print -delete | wc -l | tr -d ' ')"
[ "$deleted" -gt 0 ] && echo "Pruned $deleted dump(s) older than $keep_days days."
exit 0
