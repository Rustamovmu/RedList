# Wildward API (RedList backend)

The backend for **Wildward**, a wildlife discovery and conservation site: *understand a species, discover where it lives, and find a credible way to help.*

Stack: NestJS 11 · Drizzle ORM · PostgreSQL 16 + PostGIS 3.4 · Node 22.
The web app lives in the sibling folder `../RedList-frontend`.

**Status:** M0 foundation, M1 (species slice: staff login, draft → submit → publish, public profile) and M2 (Explore, filters, compare, home) are complete. See `docs/COMPLETED_TASKS.md`. Spec: `docs/PLAN.md`. Agent rules: `AGENTS.md` (loaded by Claude Code through `CLAUDE.md`). Milestone prompts: `docs/CLAUDE_TASKS.md`.

## Run locally (macOS)

You need Node 22+ and **either** Docker Desktop **or** Postgres.app (which bundles PostGIS).

```bash
cp .env.example .env
npm install

# Database: option A, Docker (port 5433; .env.example is already set up for this)
npm run db:up
npm run db:migrate          # creates the schema and enables PostGIS

# Database: option B, Postgres.app (port 5432). Change the port in DATABASE_URL in .env to 5432, then:
npm run db:setup:local      # creates the role and database from .env, migrates, checks PostGIS (safe to re-run)

npm run db:check            # optional: prints the user and database you are connected to
npm run db:seed:regions     # countries and oceans from Natural Earth
npm run db:seed:fixtures    # optional: synthetic dev species (Fictus …), never real data
npm run admin:create        # first admin; set ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD (≥12 chars) in .env first
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
| `npm run db:setup:local` | Postgres.app only: create the role and database from `.env`, then migrate |
| `npm run db:check` | test the `DATABASE_URL` connection |
| `npm run openapi:export` | write `openapi.json`, then run `npm run contracts:generate` in the frontend |

## Layout

```
src/db/schema.ts        all R1 tables
drizzle/                SQL migrations (0002_integrity.sql = hand-written rules)
src/health/             health endpoints
src/identity/           staff sessions, CSRF/Origin guard, roles, login throttle
src/editorial/          revisions, editorial zod schema, checklist, publish transaction
src/catalogue/          public reads (PublishedSpeciesRepository is the only path)
src/fixtures/           SYNTHETIC dev fixtures
src/cli/                migrate, seed-regions, seed-fixtures, admin-create, export-openapi
scripts/                setup-local-db.sh (Postgres.app), check-db.cjs (connection test)
test/integration/       PostGIS integration tests (auth, publication, integrity, health)
test/unit/              editorial schema, checklist, licences, throttle
data/natural-earth/     public-domain boundaries
docs/                   PLAN, ARCHITECTURE, DECISIONS, DATABASE, DATA_SOURCES, BACKLOG, COMPLETED_TASKS, CLAUDE_TASKS
AGENTS.md, CLAUDE.md    rules for the coding agent (CLAUDE.md imports AGENTS.md)
```

Natural Earth data: public domain, https://www.naturalearthdata.com/
