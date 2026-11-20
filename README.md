# Wildward API (RedList backend)

The backend for **Wildward**, a wildlife discovery and conservation site: *understand a species, discover where it lives, and find a credible way to help.*

Stack: NestJS 11 · Drizzle ORM · PostgreSQL 16 + PostGIS 3.4 · Node 22.
The web app lives in the sibling folder `../RedList-frontend`.

**Status:** M0 foundation is complete. See `docs/COMPLETED_TASKS.md`. Spec: `docs/PLAN.md`. Agent rules: `AGENTS.md`.

## Run locally (macOS)

You need Node 22+ and **either** Docker Desktop **or** Postgres.app (which bundles PostGIS).

```bash
cp .env.example .env
npm install

# Database: option A, Docker (port 5433)
npm run db:up
# Database: option B, Postgres.app (port 5432). Create the user and database, then set DATABASE_URL in .env:
#   psql -c "CREATE USER wild WITH PASSWORD 'wild' SUPERUSER;" -c "CREATE DATABASE wild OWNER wild;"

npm run db:migrate          # creates the schema and enables PostGIS
npm run db:seed:regions     # countries and oceans from Natural Earth
npm run dev                 # http://localhost:4000/api/v1/health/ready
                            # Swagger UI: http://localhost:4000/api/docs
```

## Tests

Integration tests run against a **separate** real PostGIS database and wipe it on every run.

```bash
# with Docker:   docker compose exec db psql -U wild -c "CREATE DATABASE wild_test"
# with Postgres.app: psql -c "CREATE DATABASE wild_test OWNER wild"
cp .env.test.example .env.test   # adjust port 5433/5432
npm test
```

## Everyday commands

| | |
|---|---|
| `npm run typecheck` / `npm run lint` / `npm test` / `npm run build` | checks |
| `npm run db:generate` | after editing `src/db/schema.ts`: generate a SQL migration, then review it |
| `npm run db:migrate` | apply migrations |
| `npm run openapi:export` | write `openapi.json`, then run `npm run contracts:generate` in the frontend |

## Layout

```
src/db/schema.ts        all R1 tables
drizzle/                SQL migrations (0002_integrity.sql = hand-written rules)
src/health/             health endpoints
src/cli/                migrate, seed-regions, export-openapi
test/integration/       PostGIS integration tests
data/natural-earth/     public-domain boundaries
docs/                   PLAN, DECISIONS, DATABASE, DATA_SOURCES, BACKLOG, COMPLETED_TASKS, CODEX_TASKS
```

Natural Earth data: public domain, https://www.naturalearthdata.com/
