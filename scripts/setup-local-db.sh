#!/usr/bin/env bash
# One-time local setup for Postgres.app: creates the role and database named in .env,
# then applies migrations (which enable PostGIS). Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"

URL=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)
DB_USER=$(node -e 'const u=new URL(process.argv[1]);console.log(decodeURIComponent(u.username))' "$URL")
DB_PASS=$(node -e 'const u=new URL(process.argv[1]);console.log(decodeURIComponent(u.password))' "$URL")
DB_NAME=$(node -e 'const u=new URL(process.argv[1]);console.log(u.pathname.slice(1))' "$URL")

# SUPERUSER is local-only, as in the README: CREATE EXTENSION postgis needs it.
psql -d postgres -v ON_ERROR_STOP=1 -v u="$DB_USER" -v p="$DB_PASS" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN SUPERUSER PASSWORD %L', :'u', :'p')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'u') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN SUPERUSER PASSWORD %L', :'u', :'p') \gexec
SQL
psql -d postgres -v ON_ERROR_STOP=1 -v u="$DB_USER" -v d="$DB_NAME" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'d', :'u')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'d') \gexec
SQL

npm run db:migrate
node scripts/check-db.cjs
psql "$URL" -Atc "SELECT 'PostGIS ' || postgis_version()"
echo "Database ready."
