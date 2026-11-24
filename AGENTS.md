# AGENTS.md — rules for coding agents working in this repository

This project is split into two repositories: `RedList-backent` (API, database and all docs) and `RedList-frontend` (web). The specification lives in `RedList-backent/docs/PLAN.md`. Read it before you change anything. If this file and the plan disagree, the plan wins on *what* to build and this file wins on *how to work*.

## Working rules
1. **Work on one milestone per task.** Do only the milestone named in the task prompt. Stop when its gate is demonstrated, and do not start the next one.
2. **Inspect before writing.** Read the manifests, existing code and `docs/COMPLETED_TASKS.md` first. Keep unrelated work intact. If existing code conflicts with the plan, describe the conflict in `docs/DECISIONS.md` instead of deleting it.
3. **Make decisions yourself, but write them down.** Ordinary reversible choices go in `docs/DECISIONS.md` (context → decision → consequence), and you keep working. Stop and ask only when a decision is irreversible or involves legal or licensing questions.
4. **Never invent:** scientific facts, population numbers, sources, image licences, credentials, test results, benchmark numbers, user-research findings, or claims that an external permission was granted.
5. **Build only R1.** Anything that belongs to R2–R4 goes into `docs/BACKLOG.md`, never into code.
6. **Keep it simple.** No microservices, no speculative abstractions, and no new infrastructure (Redis, queues, search engines) unless the plan requires it.

## Commands (keep this list accurate as the repo evolves)
Backend (`RedList-backent/`):
```
npm install
npm run db:up               # local PostGIS via docker compose (port 5433)
npm run db:setup:local      # alternative: Postgres.app (port 5432), creates role + DB from .env and migrates
npm run db:check            # print the user/database DATABASE_URL connects to
npm run db:migrate          # apply SQL migrations in drizzle/
npm run db:seed:regions     # Natural Earth countries + oceans (idempotent)
npm run db:seed:fixtures    # SYNTHETIC dev species, published through the real workflow (never in production)
npm run admin:create        # first admin from ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD
npm run e2e:prepare         # wipe + reload the wild_e2e database and storage/media-e2e (used by the frontend's test:e2e)
npm run import -- <file.json> --dry-run | --apply [--reconcile]   # content into DRAFTS only; report in import-reports/
npm run links:check         # record HTTP status of every support link (never disables one)
npm run validate:catalogue  # PLAN §11 quality report over published content; exit 1 on any failure
npm run status:sheet        # (re)build docs/launch/status-check.csv for the hand-checked IUCN status; keeps filled-in values
npm run status:import -- <sheet.csv> --dry-run | --apply   # checked rows into DRAFTS only (D-032); report in import-reports/
npm run dev                 # API on :4000, Swagger UI at /api/docs
npm run db:generate         # after editing src/db/schema.ts: generate a migration
npm run openapi:export      # write openapi.json for the frontend
npm run typecheck && npm run lint && npm test && npm run build   # tests need .env.test (copy .env.test.example)
./deploy/compose.sh up -d --build --wait   # production stack (needs deploy/.env.prod; docs/DEPLOYMENT.md)
scripts/backup.sh                         # PostgreSQL + media of the production stack → BACKUP_DIR
scripts/restore.sh <backup-dir> --yes     # DESTRUCTIVE restore of the production stack
```
CI: `.github/workflows/ci.yml` in each repo runs the same commands on GitHub's standard runners (free for public repos, D-033).
Frontend (`RedList-frontend/`):
```
npm install
npm run contracts:generate  # types from ../RedList-backent/openapi.json
npm run basemap:fetch       # self-hosted Protomaps basemap (~80 MB) into public/basemap/; needs the pmtiles CLI (D-060). Optional: without it the map uses Natural Earth
npm run dev                 # web on :3000, proxies /api/v1 to the API
npm run test:e2e            # Playwright: own stack on :4110/:3110 + wild_e2e, installed Chrome, desktop + 360px; includes axe (public + staff pages), CSP, keyboard and reflow checks
npm run typecheck && npm run lint && npm run build
```

## Definition of done for any change
- typecheck, lint and the relevant tests pass, and you actually ran them.
- No API types were written by hand. If the API changed, run `openapi:export` in the backend and `contracts:generate` in the frontend.
- Public queries read only through `published_revision_id`.
- No secrets, raw sensitive coordinates or personal data appear in logs, fixtures or commits.
- `docs/COMPLETED_TASKS.md` has an entry with the date, milestone, what changed, the commands you ran with pass/fail, and any known gaps.

## Checkpoint when stopping early
If you run out of time or context, append a **CHECKPOINT** entry to `docs/COMPLETED_TASKS.md` with: the current state, what is half-done, failing commands with their output summary, and the exact next steps. Then stop.

## Data and content
- Production seeds contain only real profiles whose sources have been checked and whose media is licensed. Test fixtures use clearly synthetic taxa.
- Image licence allow-list: CC0, PDM, CC BY, CC BY-SA. Anything else needs a recorded decision.
- Never scrape a site whose terms forbid it. A published page must never depend on a live third-party API.

## Code conventions
- TypeScript strict. No `any` without a comment explaining why.
- Spatial SQL lives only in `GeoRepository` and SQL migrations, always parameterized.
- Schema changes: edit `src/db/schema.ts`, run `npm run db:generate`, and review the SQL. Integrity rules the ORM cannot express go in a custom migration (`npx drizzle-kit generate --custom`). Never use `drizzle-kit push` against shared or production databases.
- Validate every external input (HTTP, import files, editorial JSONB) at the boundary.
- Commit messages describe the change and the milestone, e.g. `M1: publish transaction + draft leakage test`.
- **The owner commits, not the agent.** At the end of every milestone or task, suggest one short commit message for each repo that changed (backend and/or frontend), and do not run `git commit` yourself.
