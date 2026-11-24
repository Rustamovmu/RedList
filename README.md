# Wildward API (RedList backend)

The backend for **Wildward**, a wildlife discovery and conservation site: *understand a species, discover where it lives, and find a credible way to help.*

Stack: NestJS 11 · Drizzle ORM · PostgreSQL 16 + PostGIS 3.4 · Node 22.
The web app lives in the sibling folder `../RedList-frontend`.

**Status:** R1 milestones M0–M5 are complete (M5: accessibility, CSP, production stack, backups, docs). Nothing is deployed publicly; that needs the owner's separate go-ahead. The real-catalogue import files hold 83 species (`catalogue/pilot.json` 3, `batch-1.json` 40, `batch-2.json` 40). Many of their facts are second-hand (Wikidata, Wikipedia, web search) and must be replaced with primary sources before a public launch (D-047). See `docs/COMPLETED_TASKS.md`. Spec: `docs/PLAN.md`. Agent rules: `AGENTS.md` (loaded by Claude Code through `CLAUDE.md`). Milestone prompts: `docs/CLAUDE_TASKS.md`.

## Run locally (macOS)

You need Node 22+ and **either** Docker Desktop **or** Postgres.app (which bundles PostGIS). Clone both repos side by side:
```bash
git clone <backend repo url> RedList-backent
git clone <frontend repo url> RedList-frontend
cd RedList-backent
```

```bash
cp .env.example .env        # then set REVALIDATE_SECRET (openssl rand -hex 32), and the same value in the frontend's .env.local
npm install

# Database: option A, Docker (port 5433; .env.example is already set up for this)
npm run db:up
npm run db:migrate          # creates the schema and enables PostGIS

# Database: option B, Postgres.app (port 5432). Change the port in DATABASE_URL in .env to 5432, then:
npm run db:setup:local      # creates the role and database from .env, migrates, checks PostGIS (safe to re-run)

npm run db:check            # optional: prints the user and database you are connected to
npm run db:seed:regions     # countries and oceans from Natural Earth
npm run db:seed:vocab       # our own habitat and threat lists; the catalogue import files need them
npm run db:seed:fixtures    # optional: synthetic dev species (Fictus …), never real data
npm run admin:create        # first admin; set ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD (≥12 chars) in .env first
npm run dev                 # http://localhost:4000/api/v1/health/ready
                            # Swagger UI: http://localhost:4000/api/docs
```

Real content (optional): `npm run import -- catalogue/batch-1.json --apply` creates drafts with checked sources and photos. Approve the images in `/admin/media`, then review and publish the drafts (docs/ADMIN_GUIDE.md).

Then start the web app: see `../RedList-frontend/README.md`.

## Tests

Integration tests run against a **separate** real PostGIS database and wipe it on every run.

```bash
# with Docker:   docker compose exec db psql -U wild -c "CREATE DATABASE wild_test"
# with Postgres.app: psql -c "CREATE DATABASE wild_test OWNER wild"
cp .env.test.example .env.test   # adjust port 5433/5432; MEDIA_DIR must contain "test" (wiped by the tests)
npm test
```
The frontend's `npm run test:e2e` needs PostGIS (Docker on port 5433 by default, or any other through `E2E_DATABASE_URL`) and Google Chrome; it creates and wipes its own `wild_e2e` database. Everything about tests is in `docs/TESTING.md`. CI: `.github/workflows/ci.yml` (D-033). Launch-readiness checklists for people to run are in `docs/launch/`.

## Production

Docker Compose with PostGIS on a private network, the API, the web app and Nginx, plus backup and restore scripts. Read `docs/DEPLOYMENT.md` first.
```bash
cp deploy/.env.prod.example deploy/.env.prod     # fill in; never commit it
./deploy/compose.sh up -d --build --wait
scripts/backup.sh                                 # PostgreSQL + media → BACKUP_DIR (copy it off the host)
scripts/restore.sh <backup-dir> --yes             # destructive; see the runbook
```

## Everyday commands

| | |
|---|---|
| `npm run typecheck` / `npm run lint` / `npm test` / `npm run build` | checks |
| `npm run db:generate` | after editing `src/db/schema.ts`: generate a SQL migration, then review it |
| `npm run db:migrate` | apply migrations |
| `npm run db:setup:local` | Postgres.app only: create the role and database from `.env`, then migrate |
| `npm run db:check` | test the `DATABASE_URL` connection |
| `npm run db:seed:regions` / `npm run db:seed:vocab` | reference data: Natural Earth places, our own habitat and threat lists (both idempotent) |
| `npm run openapi:export` | write `openapi.json`, then run `npm run contracts:generate` in the frontend |
| `npm run import -- <file.json> --dry-run` / `--apply` / `--apply --reconcile` | import species content into drafts (never publishes); Markdown report in `import-reports/` |
| `npm run links:check` | record the HTTP status of every support link; failures are listed, nothing is disabled |
| `npm run validate:catalogue` | quality report over everything published (citations, image licences, no drafts, compare units) |
| `./deploy/compose.sh …` | docker compose for the production stack (project name, file and env file added) |
| `scripts/backup.sh` / `scripts/restore.sh <dir> --yes` | back up or restore PostgreSQL and media of the production stack |

## Layout

```
src/db/schema.ts        all R1 tables
drizzle/                SQL migrations (0002_integrity.sql = hand-written rules)
src/health/             health endpoints
src/identity/           staff sessions, CSRF/Origin guard, roles, login throttle
src/editorial/          revisions, editorial zod schema, checklist, publish transaction
src/catalogue/          public reads (PublishedSpeciesRepository is the only path)
src/geography/          map, regions, basemap; GeoRepository is the only home of spatial SQL
src/support-directory/  organizations and support links (public directory + admin), link checker
src/media/              uploads, image pipeline (sharp → WebP variants, metadata stripped), review, serving
src/import/             import file schema and engine (drafts only, idempotent, --reconcile); hand-checked IUCN status sheet (D-032)
src/quality/            validate:catalogue
catalogue/              real-catalogue import files (sources checked, see notes in each file)
src/fixtures/           SYNTHETIC dev fixtures
src/cli/                migrate, seed-regions, seed-vocab, seed-fixtures, admin-create, export-openapi, e2e-prepare, import, links-check, validate-catalogue, status-check
scripts/                setup-local-db.sh (Postgres.app), check-db.cjs (connection test), backup.sh, restore.sh, publish-drafts.mjs (dev: submit and publish drafts through the staff API)
deploy/                 production compose, compose.sh wrapper, .env.prod.example, nginx/ (http.conf, https.conf)
Dockerfile              production API image (compiled JS, runs as node)
test/integration/       PostGIS integration tests (auth, publication, catalogue, geography, support, integrity, health, content-ops, import, quality, status-check)
test/unit/              editorial schema, checklist, licences, throttle, compare, bbox, safe-fetch, image sniffing, security headers
data/natural-earth/     public-domain boundaries
docs/                   PLAN, ARCHITECTURE, DATABASE, DATA_SOURCES, METHODOLOGY, ADMIN_GUIDE, DEPLOYMENT, TESTING,
                        DECISIONS, COMPLETED_TASKS, BACKLOG, CLAUDE_TASKS
AGENTS.md, CLAUDE.md    rules for the coding agent (CLAUDE.md imports AGENTS.md)
```

Natural Earth data: public domain, https://www.naturalearthdata.com/
