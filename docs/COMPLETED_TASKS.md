# Completed tasks

## 2026-11-21: Docs and config consistency pass (no milestone; M1 not started)
**Scope:** Fixed the mismatches between the docs and the repo, and moved the agent workflow from Codex to Claude Code (DECISIONS D-008, D-009). No application code changed.

**Changed:**
- `docs/CODEX_TASKS.md` → `docs/CLAUDE_TASKS.md`, with the instructions rewritten for Claude Code. The M1 prompt no longer mentions `packages/contracts`, which does not exist (D-002). It now names `openapi:export` → `contracts:generate`.
- New `CLAUDE.md` in both repos. Each imports `AGENTS.md`.
- New `docs/ARCHITECTURE.md`: runtime diagram, page map, API map and module map, each with a milestone status. It was missing from M0.
- Every `CODEX_TASKS` reference updated (PLAN, README, this file).
- `docker-compose.yml`: image `postgis/postgis:16-3.4` (amd64-only) → `imresamu/postgis:16-3.4` (arm64 + amd64), as D-003 already said.
- `.env.example`: `DATABASE_URL` pointed at a user and database (`wildatlas`) that compose never creates. It is now `wild:wild@localhost:5433/wild`.
- `test.env.example` → `.env.test.example`, matching the README and `test/setup-env.ts`.
- `test-db.cjs` → `scripts/check-db.cjs`. New npm scripts `db:check` and `db:setup:local`, documented in the README and AGENTS.md.
- `package.json` description said Prisma; it now says Drizzle ORM.

**Commands run, with results:**
| Command | Result |
|---|---|
| `docker manifest inspect postgis/postgis:16-3.4` / `imresamu/postgis:16-3.4` | amd64 only / amd64 + arm64 |
| `grep -rni codex` (both repos, excluding node_modules) | no remaining references outside the decision log |
| `node -e JSON.parse(package.json)` | valid |
| backend `npm run typecheck` | pass |
| backend `npm run lint` | pass |

**Switched local development to Docker** (owner's choice; Postgres.app runs PostgreSQL 18, but the plan pins 16). `.env` `DATABASE_URL` now points at Docker on port 5433; the old Postgres.app URL is kept there as a comment. Results on the owner's Mac (Apple Silicon):
| Command | Result |
|---|---|
| `npm run db:up` | container healthy; `PostgreSQL 16.4 … aarch64`, `PostGIS 3.4` (native arm64, so the image fix works). This closes the M0 "docker compose not verified" gap. |
| `npm run db:migrate` | migrations applied |
| `npm run db:seed:regions` | 177 countries, 29 marine areas |
| `npm run db:check` | connected to PostgreSQL 16.4 |
| `CREATE DATABASE wild_test` + `.env.test` from `.env.test.example` | done |
| `npm test` | **16/16 pass** (2 suites) |

**Known gaps:**
- `RedList-frontend` has an untracked `yarn.lock` next to `package-lock.json`, which conflicts with npm (D-002). Left in place for the owner to delete.
- The folder-name typo `RedList-backent` is unchanged (owner's call, D-002).

## 2026-11-21: M0 Foundation
**Scope:** both projects scaffolded, database schema and integrity rules, region data, health check, web shell, docs. No catalogue features yet.

**Backend (`RedList-backent`):**
- NestJS 11 app under the `/api/v1` prefix:
  - validated env config (zod)
  - one error shape for all errors
  - request IDs
  - helmet security headers
  - `ValidationPipe` with whitelisting
  - bigint values serialized as strings
- Drizzle schema for all R1 tables (PLAN §6) plus three migrations, including hand-written integrity rules (DECISIONS D-005).
- `GET /api/v1/health/live` and `GET /api/v1/health/ready` (checks PostGIS).
- Swagger UI at `/api/docs` (non-production only). `npm run openapi:export` writes `openapi.json`.
- `npm run db:seed:regions` loads 177 countries and 29 marine areas from Natural Earth (idempotent).
- `docker-compose.yml` with multi-arch PostGIS, bound to 127.0.0.1:5433.

**Frontend (`RedList-frontend`):**
- Next.js 16 App Router with Tailwind 4 design tokens and system fonts (no font downloads).
- Layout with skip link, header nav and footer disclaimer. Not-found and error pages.
- `StatusBadge`: all 9 IUCN categories with text labels and AA-contrast colours.
- Typed server API client (`src/lib/api.ts`) generated from the OpenAPI contract, with cache tags.
- `/api/v1/*` rewrite to the API.
- `POST /api/revalidate`: secret-checked in constant time, tag allow-list.
- Security headers. Standalone output.
- The home page is a *foundation* system-check page. M2 replaces it.

**Commands run, with results** (Linux, PostgreSQL 16.x + PostGIS 3.4, Node 22):
| Command | Result |
|---|---|
| backend `npm run typecheck` | pass |
| backend `npm run lint` | pass |
| backend `npm test` | **16/16 pass** (2 suites: database integrity, health/HTTP) |
| backend `npm run build` + `node dist/main.js` | `/api/v1/health/ready` → `{"status":"ok","postgis":"3.4 …"}` |
| backend `npm run db:seed:regions` ×2 | 177 + 29 regions, no duplicates on the second run |
| frontend `npm run typecheck` | pass |
| frontend `npm run lint` | pass |
| frontend `npm run build` | pass |
| `next start` → `GET /` | "API and database connected (PostGIS 3.4)" |
| `GET :3000/api/v1/health/ready` (through the rewrite) | ok |
| `POST /api/revalidate` | wrong secret → 401; invalid tag → 400; valid → 200 |
| Headless Chrome screenshots at 1280px and 360px | layout correct, no horizontal overflow |

**Not verified:** `docker compose up` itself, because the database ran as a native PostgreSQL install in the build environment. Run `npm run db:up` and then the gate commands on your Mac.

**Known gaps:**
- Nav links (Explore, Map, Compare, About) and footer links go to the 404 page until M2/M3.
- No staff authentication yet (M1).
- No content yet: the database has regions only.

**Next:** M1, the working species slice (see docs/CLAUDE_TASKS.md).
