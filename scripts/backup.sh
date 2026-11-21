#!/usr/bin/env bash
# Back up the production stack: PostgreSQL (pg_dump custom format) AND the media volume (PLAN §13).
#
#   scripts/backup.sh                       uses deploy/.env.prod
#   ENV_FILE=deploy/.env.rehearsal scripts/backup.sh
#
# Writes BACKUP_DIR/<project>-<UTC timestamp>/ with db.dump, media.tar.gz and MANIFEST.txt (sha256 sums and
# row counts), checks that both archives can be read back, and keeps the newest BACKUP_KEEP backups.
# If BACKUP_COPY_TO is set (an rsync target such as user@backup-host:/srv/wildward-backups/), the new backup
# is copied there too. Backups must also live OFF the app host: docs/DEPLOYMENT.md "Backups".
# Never prints secrets. Restore with scripts/restore.sh.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
export ENV_FILE="${ENV_FILE:-$root/deploy/.env.prod}"
case "$ENV_FILE" in /*) ;; *) ENV_FILE="$(pwd)/$ENV_FILE" ;; esac
compose() { "$root/deploy/compose.sh" "$@"; }
setting() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }

project="$(setting COMPOSE_PROJECT_NAME)"; project="${project:-wildward}"
backup_root="$(setting BACKUP_DIR)"; backup_root="${backup_root:-../backups}"
case "$backup_root" in /*) ;; *) backup_root="$root/deploy/$backup_root" ;; esac
keep="$(setting BACKUP_KEEP)"; keep="${keep:-14}"
copy_to="${BACKUP_COPY_TO:-$(setting BACKUP_COPY_TO)}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dest="$backup_root/$project-$stamp"
mkdir -p "$dest"
chmod 700 "$backup_root" "$dest"
trap 'echo "backup FAILED; removing incomplete $dest" >&2; rm -rf "$dest"' ERR

echo "[backup] database → $dest/db.dump"
compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' > "$dest/db.dump"

echo "[backup] media volume → $dest/media.tar.gz"
# A throwaway container from the API image mounts the media volume read-only; the API keeps running.
compose run --rm --no-deps -T -v "${project}_media:/backup-src:ro" --entrypoint tar api -C /backup-src -czf - . > "$dest/media.tar.gz"

echo "[backup] verifying archives"
compose exec -T db pg_restore --list < "$dest/db.dump" > /dev/null
tar -tzf "$dest/media.tar.gz" > /dev/null

counts="$(compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F= -c "
  SELECT '\''species_published'\'', count(*) FROM species WHERE published_revision_id IS NOT NULL
  UNION ALL SELECT '\''revisions'\'', count(*) FROM species_revisions
  UNION ALL SELECT '\''media_assets'\'', count(*) FROM media_assets
  UNION ALL SELECT '\''regions'\'', count(*) FROM regions
  UNION ALL SELECT '\''staff_users'\'', count(*) FROM staff_users
  UNION ALL SELECT '\''audit_events'\'', count(*) FROM audit_events"')"
media_files="$(tar -tzf "$dest/media.tar.gz" | grep -c '\.webp$' || true)"

{
  echo "project=$project"
  echo "created_utc=$stamp"
  echo "git_commit=$(git -C "$root" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "postgres=$(compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SHOW server_version"')"
  echo "$counts"
  echo "media_webp_files=$media_files"
  echo "--- sha256"
  (cd "$dest" && shasum -a 256 db.dump media.tar.gz)
} > "$dest/MANIFEST.txt"
chmod 600 "$dest"/*
trap - ERR

echo "[backup] done: $dest"
sed -n '1,20p' "$dest/MANIFEST.txt" | grep -v '^---' | sed 's/^/  /'

# Retention: keep the newest $keep backups of this project.
# (awk instead of `head -n -N`, which BSD/macOS head does not support.)
ls -1d "$backup_root/$project"-*/ 2>/dev/null | sort | awk -v k="$keep" '{ a[NR] = $0 } END { for (i = 1; i <= NR - k; i++) print a[i] }' | while read -r old; do
  echo "[backup] retention: removing $old"
  rm -rf "$old"
done

if [[ -n "$copy_to" ]]; then
  echo "[backup] copying off-host → $copy_to"
  rsync -a "$dest" "$copy_to"
fi
