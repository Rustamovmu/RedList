# Testing

What is tested, where, and how to run it. PLAN §13 lists the tests that must exist, and the table below maps each one to its file. Results of each run are logged in `COMPLETED_TASKS.md` and never written down from memory.

## Layers
| Layer | Where | Runs against | Command |
|---|---|---|---|
| Unit | `test/unit/` (backend) | nothing external | `npm test` (with the integration tests) |
| Integration | `test/integration/` (backend) | a real PostGIS database, `wild_test`, wiped on every run | `npm test` |
| End-to-end | `e2e/` (frontend) | its own stack: API :4110 on `wild_e2e`, web :3110 built into `.next-e2e`, installed Google Chrome, desktop 1280 and mobile 360 | `npm run test:e2e` (frontend) |
| Accessibility | `e2e/release.spec.ts`, `e2e/a11y-extra.spec.ts` (axe-core) | the e2e stack | part of `npm run test:e2e` |
| CI | `.github/workflows/ci.yml` in each repo | GitHub standard runners with a PostGIS service container | on push to `main`/`develop` and on pull requests (D-033) |
| Quality report | `src/quality/` | any database with published content | `npm run validate:catalogue` |
| Operations | `scripts/backup.sh`, `scripts/restore.sh` | the production compose stack | rehearsal, see DEPLOYMENT "Restore" |

All fixtures are **synthetic** (`Fictus …`, `example.org`, `*.example.invalid`). The e2e and test databases refuse other names, and `e2e:prepare` refuses any database not called `wild_e2e`.

## Setup
Backend (Docker PostGIS on 5433 or Postgres.app on 5432):
```bash
docker compose exec db psql -U wild -c "CREATE DATABASE wild_test"      # once (Docker)
docker compose exec db psql -U wild -c "CREATE DATABASE wild_e2e"       # once, for the frontend e2e suite
cp .env.test.example .env.test                                          # MEDIA_DIR must contain "test"
npm test
```
Frontend:
```bash
npm run test:e2e        # starts its own API and web servers; your dev servers are not touched
```
The e2e suite expects Docker PostGIS on `localhost:5433` (override with `E2E_DATABASE_URL`), and Google Chrome installed (`channel: 'chrome'`, so no browser download).

## Required tests (PLAN §13)
| Risk | Covered in |
|---|---|
| Null vs zero vs unknown population | `test/integration/database-integrity.spec.ts` (CHECK constraints), `publication.spec.ts`, `test/unit/compare.spec.ts`; e2e `critical.spec.ts` ("Unknown does not mean zero") |
| Unit and basis separation in compare | `test/unit/compare.spec.ts`, `test/integration/catalogue.spec.ts`; e2e `critical.spec.ts` ("Not directly comparable") |
| Revision consistency across catalogue, map, compare and profile | `test/integration/catalogue.spec.ts`, `content-ops.spec.ts` (rollback shows on profile and catalogue) |
| Draft leakage | `test/integration/publication.spec.ts`, `catalogue.spec.ts`, `geography.spec.ts`, `quality.spec.ts` (sources and sitemap) |
| Authorization on every staff route | `test/integration/auth.spec.ts`: every staff route from the OpenAPI document answers 401 without a session. Editors get 403 on admin-only actions: publish and request changes (`auth.spec.ts`), media approval and rollback (`content-ops.spec.ts`) |
| CSRF | `auth.spec.ts` (missing or mismatched token, foreign Origin), plus mutation checks in `content-ops.spec.ts` and `geography.spec.ts` |
| Concurrent publish conflict | `publication.spec.ts` (exactly one 200 and one 409 `PUBLISH_CONFLICT`), `content-ops.spec.ts` (rollback races) |
| bbox validation and antimeridian | `test/unit/bbox.spec.ts`, `test/integration/geography.spec.ts`, `database-integrity.spec.ts` |
| Geometry limits | `bbox.spec.ts` (vertex cap), `geography.spec.ts` (422 `INVALID_GEOMETRY`, caps, `truncated`) |
| Sensitive geometry | `geography.spec.ts`: precise input absent from 12 public responses; `hide_regions` refused |
| Import idempotency and `--reconcile` | `test/integration/import.spec.ts` |
| Credit and licence snapshot retention | `content-ops.spec.ts`, `publication.spec.ts` |
| SSRF and upload rejection | `test/unit/safe-fetch.spec.ts` (private, loopback and metadata addresses; a host is refused if any of its DNS answers is private; redirects re-checked), `content-ops.spec.ts` (SVG, renamed HTML, fake JPEG, oversize, NC/ND licences) |
| Editorial JSONB schema migration | `test/unit/editorial.spec.ts`: version 1 validates and unknown versions are refused. **Partial:** no version 2 exists yet, so there is no 1 → 2 migration to test. Add one with the first schema change (`src/editorial/editorial-schema.ts`). |

Also covered:
- staff sessions, login throttle and lockout (`auth.spec.ts`, `test/unit/editorial.spec.ts`)
- rollback auditing (`content-ops.spec.ts`)
- profiles rendering with outbound network blocked (`content-ops.spec.ts`, e2e `content.spec.ts`)
- API security headers and `TRUST_PROXY` (`test/unit/security-headers.spec.ts`)
- hand-checked IUCN status sheet and import: drafts only, validation, idempotency, skip when submitted (`test/integration/status-check.spec.ts`, D-032)

## End-to-end suite (`RedList-frontend/e2e/`)
Every test runs at desktop 1280 × 800 and mobile 360 × 740.
| File | What it proves |
|---|---|
| `critical.spec.ts` | M2 gate: search → filter → profile → add three to compare → Back restores the filters; Unknown and mixed units render; no horizontal overflow |
| `geography.spec.ts` | M3 gate: with basemap tiles blocked, the list and filters still work; layer labels; region pages; antimeridian view |
| `content.spec.ts` | M4: profiles, home and Explore with every outbound request aborted; photos and credits |
| `pages.spec.ts` | information pages, canonical URLs, sitemap, robots, JSON-LD |
| `a11y-extra.spec.ts` | R1-L (desktop project only; sets its own viewports): no horizontal overflow at 320 px and 640 px on 15 pages; axe structure rules (one main, one h1, heading order, landmarks, bypass); keyboard sign-in to `/admin` with the e2e-only admin, then axe on the five staff pages |
| `release.spec.ts` | M5: **axe** (WCAG 2.0/2.1/2.2 A and AA rules) reports no serious or critical violations on 18 core pages; nonce CSP on every page with no violations and a working map; a **keyboard-only** walkthrough (skip link, nav, search, filter drawer with Escape, checkbox, profile, Add to compare, compare link) with visible focus |

## Manual checks still worth doing
axe catches only part of WCAG. Before a public launch, a person runs `docs/launch/A11Y_MANUAL_CHECK.md`: VoiceOver, 200% and 400% zoom, reading order (including the map page), legend colours, and the staff pages. User testing with 3–5 people follows `docs/launch/USER_TASKS.md`. Neither has been run yet; results are recorded only from what a person observed.

## Performance
Measured, never estimated (PLAN §11). See DATABASE.md "M5 measurements" for p50/p95/p99 per endpoint and the conditions they were measured under.

## Not covered
- **CI on GitHub:** the workflows exist (D-033) but have not run yet; the first run is on the owner's push.
- **Admin workflows end to end:** the staff pages are checked for accessibility and keyboard sign-in, but editing, publishing and media review are not driven through the browser. They are covered by the API integration tests.
- **User research:** none run; PLAN §11 tasks need 3–5 real testers.
