#!/usr/bin/env bash
# Restore the production stack from a backup made by scripts/backup.sh. DESTRUCTIVE: it replaces the
# database and the media volume of the stack named in the env file. Runbook: docs/DEPLOYMENT.md "Restore".
#
#   scripts/restore.sh <backup-dir> --yes
#   ENV_FILE=deploy/.env.rehearsal scripts/restore.sh backups/wildward-rehearsal-20261121T120000Z --yes
#
# Steps: check the sha256 sums → stop nginx, web and api → drop and recreate the database from template0 →
# pg_restore → ANALYZE → replace the media volume → start the stack (the migrate service applies any newer migrations) →
# print row counts to compare with MANIFEST.txt.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
export ENV_FILE="${ENV_FILE:-$root/deploy/.env.prod}"
case "$ENV_FILE" in /*) ;; *) ENV_FILE="$(pwd)/$ENV_FILE" ;; esac
compose() { "$root/deploy/compose.sh" "$@"; }
setting() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }

src="${1:-}"
if [[ -z "$src" || ! -d "$src" ]]; then
  echo "usage: scripts/restore.sh <backup-dir> --yes" >&2
  exit 2
fi
src="$(cd "$src" && pwd)"
project="$(setting COMPOSE_PROJECT_NAME)"; project="${project:-wildward}"
if [[ "${2:-}" != "--yes" ]]; then
  echo "This REPLACES the database and media of compose project \"$project\" with $src." >&2
  echo "Re-run with --yes to continue." >&2
  exit 2
fi

echo "[restore] checking sha256 sums"
(cd "$src" && grep -E '^[0-9a-f]{64}  ' MANIFEST.txt | shasum -a 256 -c -)

echo "[restore] stopping nginx, web and api"
compose stop nginx web api >/dev/null 2>&1 || true
compose up -d db
for _ in $(seq 1 60); do
  compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d postgres' >/dev/null 2>&1 && break
  sleep 1
done

echo "[restore] recreating the database"
compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" -T template0 "$POSTGRES_DB"'
echo "[restore] pg_restore"
compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --exit-on-error' < "$src/db.dump"

# pg_restore does not carry planner statistics; without them the planner guesses 1 row per table.
echo "[restore] ANALYZE"
compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qc ANALYZE'

echo "[restore] replacing the media volume"
compose run --rm --no-deps -T -v "${project}_media:/restore-dst" --entrypoint sh api \
  -c 'find /restore-dst -mindepth 1 -delete && tar -xzf - -C /restore-dst' < "$src/media.tar.gz"

echo "[restore] starting the stack"
# Recreate (not just restart) api, web and nginx: the web container's Next.js data cache lives in its own
# filesystem and would otherwise keep serving pre-restore pages.
compose up -d --wait --force-recreate api web nginx

echo "[restore] row counts now (compare with $src/MANIFEST.txt):"
compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F= -c "
  SELECT '\''species_published'\'', count(*) FROM species WHERE published_revision_id IS NOT NULL
  UNION ALL SELECT '\''revisions'\'', count(*) FROM species_revisions
  UNION ALL SELECT '\''media_assets'\'', count(*) FROM media_assets
  UNION ALL SELECT '\''regions'\'', count(*) FROM regions
  UNION ALL SELECT '\''staff_users'\'', count(*) FROM staff_users
  UNION ALL SELECT '\''audit_events'\'', count(*) FROM audit_events"' | sed 's/^/  /'
echo "  media_webp_files=$(compose exec -T api sh -c 'find /data/media -name "*.webp" | wc -l' | tr -d ' ')"
echo "[restore] done."
