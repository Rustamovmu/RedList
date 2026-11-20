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
npm run db:migrate          # apply SQL migrations in drizzle/
npm run db:seed:regions     # Natural Earth countries + oceans (idempotent)
npm run dev                 # API on :4000, Swagger UI at /api/docs
npm run db:generate         # after editing src/db/schema.ts: generate a migration
npm run openapi:export      # write openapi.json for the frontend
npm run typecheck && npm run lint && npm test && npm run build
```
Frontend (`RedList-frontend/`):
```
npm install
npm run contracts:generate  # types from ../RedList-backent/openapi.json
npm run dev                 # web on :3000, proxies /api/v1 to the API
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
