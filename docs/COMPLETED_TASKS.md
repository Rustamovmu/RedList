# Completed tasks

## 2026-11-21: M3 Geography and support
**Scope:** `GeoRepository`, map API and basemap, region pages, range maps as revision content (antimeridian split, vertex caps), generalization for sensitive species, the support directory (public page and admin), and the profile map and help section. Decisions: D-016 to D-021.

**Owner constraint this session:** nothing may cost money or risk breaking the law.
- Boundaries come from Natural Earth only (public domain). Marine Regions is not imported; it has a pending row in DATA_SOURCES (D-020).
- MapLibre GL JS 6.19.0 (BSD-3-Clause). No tile provider, key or font server.
- Every new fixture is SYNTHETIC. Support links point to `example.org`, which is reserved for documentation.

**Backend:**
- `src/geography/`:
  - `GeoRepository` is now the only home of spatial SQL; the seed CLI's upsert moved there (D-019)
  - `GET /map?bbox&group&category&species`:
    - bbox is validated, and `west > east` crosses the antimeridian
    - a species is placed by its published range, or else by country-level presence
    - at most 200 species and 20,000 vertices, with `truncated` when a cap is hit
  - `GET /map/basemap`: Natural Earth, cached for one day
  - `GET /regions/:slug`: region, facets, and species with how they occur there; filters for group, status, origin and season
- **Ranges are revision content** (`RevisionContentDto.ranges`):
  - input is validated with zod and then `ST_IsValid` (422 `INVALID_GEOMETRY`, never echoing coordinates)
  - split at ±180 with `ST_WrapX`
  - at most 50,000 vertices per range and 20 ranges per revision
  - `hide_regions` species are refused (422 `SENSITIVE_RANGE`)
  - `generalize_country` species store the union of the whole countries covered, and the precise input is never stored (D-017)
- Migration `0003_geometry_bounds.sql`: stored geometry must lie inside ±180/±90.
- Profile DTO: `geography.ranges` (metadata only) and `geography.locationGeneralized`.
- `src/support-directory/`:
  - public `GET /support`
  - admin-only organization and link create, edit, approve and disable
  - any edit goes back to pending; disable is immediate, audited and creates no revision
  - revalidation of `support` and the affected `species:<slug>` tags (D-018)
- JSON body limit raised to 2 MB for range polygons (D-016).
- Fixtures:
  - an antimeridian range for *Fictus marinus* (closes the M1 gap)
  - new *Fictus generalis* (`generalize_country`, insect, Ethiopia) with a deliberately precise test polygon
  - an "Example Conservation Trust (fixture)" with one approved and one disabled link on *Fictus captivus*
  - catalogue test counts and orders updated for 6 species
- `openapi.json` re-exported; frontend contracts regenerated.

**Frontend:**
- `/map`:
  - the server renders the list first, then MapLibre loads in the browser
  - the list and the "N species in this catalogue match this view" status follow the viewport, and the bbox is kept in the URL (`replaceState`)
  - group and status filters
  - legend labelled "Country-level presence" (solid fill) and "Published range map" (hatched, dashed outline), and each result says which applies
  - if the basemap or WebGL fails, a notice appears and the list still works
  - "Near me": the browser's position is matched to a country inside the browser only, then opens `/regions/<country>`
- `/regions/[slug]`: filters, occurrence labels ("Present · Native · Breeding season"), "View on the map", empty state, 404.
- `/support`: reviewed organizations and links (destination domain, `rel="noopener noreferrer"`), the species each link appears on, the review criteria (**a draft for the owner to confirm**), and the "not a certification / not a donation" disclaimer. It renders per request.
- Profile:
  - small map with the matching legend
  - "Range maps" list with citations
  - generalized-location notice
  - region names link to region pages
  - help section links to `/support`
- `/admin/support`: organization and link editor with Approve and Disable; editors get read-only. A staff nav was added.
- Home page "Explore by country, sea or ocean" now links to region pages.
- MapLibre's worker is copied to `public/vendor/` by `predev` and `prebuild` (fix for "Worker failed to load" in production builds, D-016).
- The Playwright web command clears `.next-e2e/cache/fetch-cache` first (D-021).

**Commands run, with results** (macOS arm64, Docker PostGIS 16.4 / 3.4, Node 24.19, Chrome stable):
| Command | Result |
|---|---|
| backend `npx drizzle-kit generate --custom` → `0003_geometry_bounds.sql`, then `npm run db:migrate` (dev DB) | migration created and applied |
| backend `npm run typecheck` / `lint` / `build` | pass / pass / pass |
| backend `npm test` | **148/148 pass**, 10 suites. New: geography (32), support (8), bbox unit (17), and 1 integrity test (unsplit range rejected). Earlier suites pass with updated fixture counts. |
| backend `npm run openapi:export`; frontend `npm run contracts:generate` | written |
| frontend `npm install maplibre-gl@6.19.0 --save-exact` | 0 vulnerabilities reported |
| frontend `npm run typecheck` / `lint` / `build` | pass / pass / pass |
| frontend `npm run test:e2e` | **22/22 pass** (11 tests × desktop 1280 and mobile 360) |

**Gate evidence:**
- bbox validation: malformed boxes get 400 `BAD_BBOX` (3 values, NaN, exponent, lat 91, lon ±181, south ≥ north, west = east).
- Antimeridian:
  - `170,-25,-170,-10` returns *F. marinus* with both halves inside ±180
  - each side alone also finds it, and `0,-25,10,-10` does not
  - the stored range has 2 parts with xmin -180 and xmax 180
  - Fiji's region bbox comes back as `west > east`
- Sensitive geometry:
  - the stored *F. generalis* shape `ST_Equals` Ethiopia
  - its precise coordinates appear in none of 12 public responses (list, search, profile, filters, compare, map ×4, basemap, region, support)
  - copying it into a new draft does not grow the shape
  - `hide_regions` ranges are refused, and *F. occultus* never appears on `/map` or `/regions/peru`
- Playwright with `**/api/v1/map/basemap**` aborted: the notice is shown, the list shows 5 species, the Fish filter narrows it to 1, the layer labels are present, and there is no overflow at 360px.
- Screenshots of `/map` (1280 and 360), the antimeridian view and the *F. marinus* profile were checked by eye. The map renders country shading, the hatched generalized range and the split Fiji range.

**Known gaps:**
- The `/support` review criteria are a draft by the coding agent: **owner to confirm before launch** (D-018).
- The basemap is 1:110m: small islands and countries are missing (Near me tells the user), and the response is about 570 kB uncompressed (compression via Nginx in M5).
- Ranges split at ±180 show a thin seam on the map. The profile map frames its range a little off-centre.
- CSP for MapLibre (`worker-src 'self' blob:`) and shipping `public/` with the standalone build are M5 (D-016). The Next.js data cache must be cleared on deploy after API contract changes (D-021).
- No real range polygons: IUCN spatial data is pending, so only synthetic fixtures have ranges. Marine Regions is pending (D-020).
- There is no endpoint to change a species' sensitivity. If one is added, it must regenerate or drop its ranges (D-017).
- Nav and footer links to `/about`, `/methodology`, `/sources`, `/privacy` and `/terms` still 404 (unassigned). The form-based draft editor is still JSON (D-011).
- Query plans measured on 6 rows only (DATABASE.md).

**Next:** M4, Content operations and real catalogue (docs/CLAUDE_TASKS.md).

## 2026-11-21: M2 Discover and compare
**Scope:** public list API with search, filters, sort and paging; filter counts; compare; related species; Explore, home and compare pages; first Playwright suite. Decisions: D-014, D-015.

**Backend:**
- `GET /api/v1/species`:
  - `q`: prefix search over common names, synonyms and scientific name
  - filters `group`, `environment`, `category`, `region`, `habitat`, `trend` (OR within a filter, AND across)
  - `sort` by name, status or reviewed; there is no population sort
  - `page`, and `pageSize` up to 48 (400 above)
- `GET /api/v1/filters`: option counts, the catalogue total and the threatened count.
- `GET /api/v1/compare?species=a,b,c`:
  - 1 to 3 species (400 otherwise); 404 lists the missing slugs
  - returns the same profile DTOs as the profile endpoint, plus a population comparability statement (`same_basis`, `not_directly_comparable` or `unknown`)
- Profiles now include `related` (up to 4 species by shared group, threats or non-sensitive regions).
- Every query starts from one `PUBLISHED` SQL fragment (species joined to its published revision only). Location-sensitive species never match a region filter, are not counted in region facets, and are never related by region.
- Fixtures: a synthetic synonym (*Fictus antiquus*). *Fictus occultus* now counts all individuals, so compare has a "different units" case.
- `npm run e2e:prepare`: wipes and reloads `wild_e2e`, refusing other names. `npm run e2e:api` serves it for Playwright.
- Found while building: drizzle's `sql` template expands a bare JS array into `($1, $2)`. Array filters use `sql.param()` (comment in `catalogue-sql.ts`).

**Frontend:**
- `/species`:
  - GET form, so the URL holds everything and Back, Forward and shared links work
  - filter sidebar on desktop and a drawer on mobile (Escape closes; focus moves in and back)
  - chips that each remove one filter, plus "Reset all"
  - empty and error states, and pagination
- `/`: typographic hero with search, then "in this catalogue" counts, browse by group, environment and place, threatened species, and how we source facts. No hero photo, because none is licensed yet. The page renders per request, so a build never bakes in an API outage.
- `/compare`:
  - a table on desktop and stacked cards on mobile
  - rows: status (with date and scope), population (with unit, context, scope and year), group, habitats, diet, where it lives, threats
  - the comparability statement is always shown, with explicit Unknown and "Not directly comparable"
  - no score, no winner, no chart
- Profile: "Add to compare" (max 3, explains when full) and a Related species section.
- Shared `SpeciesCard`, showing group, names, status badge with year or "Not assessed", and one context line.
- Accessibility fix: the hero Search button used dark text on moss (about 3.9:1, below AA). It is now forest on paper.

**Commands run, with results** (macOS arm64, Docker PostGIS 16.4 / 3.4, Node 24.19, Chrome stable):
| Command | Result |
|---|---|
| backend `npm run typecheck` / `lint` / `build` | pass / pass / pass |
| backend `npm test` | **90/90 pass**, 7 suites. New: catalogue (16), compare unit (5). Earlier suites unchanged. |
| backend `e2e:prepare` against `wild` | refused (as designed) |
| backend `e2e:prepare` against `wild_e2e` | 5 synthetic species loaded |
| frontend `npm run typecheck` / `lint` / `build` | pass / pass / pass |
| frontend `npm run test:e2e` | **10/10 pass** (5 tests × desktop 1280 and mobile 360) |

**Gate evidence:**
- Playwright, at desktop and 360px: search → filter (Land) → profile → add → Back restores URL, results and the checked box → ×3 → compare → Back → Back restores the filtered list.
- Compare renders "Not directly comparable" for mixed units (mature individuals vs all individuals) and when a population is unknown; qualitative figures stay as words; "Not assessed" and withheld locations are shown.
- No horizontal overflow (`scrollWidth ≤ clientWidth`) on `/`, `/species`, two profiles and `/compare`, at 360px and 1280px.
- Screenshots of Explore, the mobile drawer, compare and home were checked by eye.

**Known gaps:**
- Filter counts are catalogue-wide, not narrowed by the other active filters.
- No photos on cards or hero (M4).
- `/map`, `/about` and the region pages are still 404 (M3, or unassigned).
- The JSON admin editor is unchanged (D-011).
- Query plans were measured on 5 rows only (DATABASE.md); re-check at catalogue scale in M4.
- No CI yet (backlog).

**Next:** M3, Geography and support (docs/CLAUDE_TASKS.md).

## 2026-11-21: M1 Working species slice
**Scope:** staff sign-in, the draft → submit → publish workflow with checklist and optimistic concurrency, the public profile with all eight sections, attribution snapshots and revalidation. Decisions: D-010 to D-013.

**Backend:**
- `identity`:
  - argon2id passwords
  - hashed opaque session tokens, with a 12-hour idle and 7-day absolute limit, revocable
  - `StaffGuard`: session, then Origin and double-submit CSRF on mutations, then role
  - login throttle per IP plus per-email lockout with backoff
  - `POST /staff/auth/login`, `POST /staff/auth/logout`, `GET /staff/auth/me`
- `editorial`:
  - versioned zod schema for editorial JSONB (v1, migration hook, served in OpenAPI)
  - staff routes for species, identifiers, drafts, revisions (save, submit, publish, request changes), sources and reference lists
  - publication checklist (PLAN §7), enforced at submit and at publish
  - one-transaction publish with the species row locked; 409 `PUBLISH_CONFLICT` when the base changed; 409 `STALE_DRAFT` on save
  - media credit and licence snapshots; audit events; revalidation of `species:<slug>` and `catalogue` after commit
- `catalogue`: `GET /api/v1/species/:slug`, through `PublishedSpeciesRepository` only. Location-sensitive species (`hide_regions`) return no regions.
- Error filter maps database integrity errors to 422/409 with the shared error shape.
- CLIs:
  - `npm run admin:create`: from env; refuses duplicates and weak or placeholder passwords
  - `npm run db:seed:fixtures`: five SYNTHETIC species covering every PLAN §7 fixture case except the antimeridian range polygon (needs the M3 GeoRepository; Fiji presence is used instead), published through the real workflow; refuses `NODE_ENV=production`
- New dependency: `argon2` 0.45. Its install script is blocked by npm's allow-scripts, but its prebuilt binary loads (verified).
- `openapi.json` re-exported; frontend `src/contracts/api.d.ts` regenerated. No hand-written API types.

**Frontend:**
- `/species/[slug]`: server-rendered with cache tag `species:<slug>`, in-page nav (sticky on mobile), and the eight sections in PLAN order. Shows explicit "Unknown", "Not assessed" and "Not yet documented" states, numbered citations linking to "How do we know?", and the reviewer role with self-review disclosure. Shows the neutral no-photo state for now.
- `/admin`: sign-in, species list, new species, identifiers, revisions, a validated-JSON draft editor with source and reference-id panels, checklist, and Submit / Publish / Request changes by role (D-011). Not indexed by search engines.
- `src/lib/api.ts` now takes path params; `src/lib/staff-api.ts` is the typed browser client and sends `x-csrf-token`.

**Commands run, with results** (macOS arm64, Docker PostGIS 16.4 / 3.4, Node 24.19):
| Command | Result |
|---|---|
| backend `npm run typecheck` / `lint` / `build` | pass / pass / pass |
| backend `npm test` | **69/69 pass**, 5 suites: auth (14), publication (17), unit (22), database integrity (13), health (3) |
| frontend `npm run typecheck` / `lint` / `build` | pass / pass / pass |
| `npm run db:seed:fixtures` ×2 (dev DB) | 5 created, then 0 created and 5 skipped |
| `npm run admin:create` | created; second run refused (exists); placeholder password refused |

**Gate tests** (all in `test/integration/`):
- draft edit leaves the public profile unchanged until publish (`publication.spec.ts`)
- the new revision is visible after publish
- every staff route answers 401 without a session (enumerated from the OpenAPI document)
- mutations without CSRF, with a mismatched token, or from a foreign Origin get 403
- an editor gets 403 on publish
- two concurrent publishes give exactly one 200 and one 409 `PUBLISH_CONFLICT`
- population CHECK constraints reject incoherent estimates both in SQL and through the API (422 `INTEGRITY_RULE`)

**Manual walkthrough** (curl through the Next.js proxy, isolated copy on :3100/:4100 against the dev DB):
| Step | Result |
|---|---|
| `GET /species/fictus-captivus` | 200, all 8 section headings present; wild and captive estimates separate |
| unknown slug | 404 |
| `fictus-occultus` | "Locations are withheld…" |
| `fictus-exemplaris` | "Unknown does not mean zero" |
| sign-in | wrong password 401; correct 200 with cookie |
| mutation without CSRF / from a foreign Origin | 403 / 403 |
| new species | 404 before publish; submit while incomplete 422; save, submit, publish 200; page shows "ONE" |
| draft v2 saved | page still "ONE"; stale save 409 |
| v2 published | page shows "TWO" (tag revalidation worked) |
| re-publishing v1 | 409 |
| logout | 200; `/me` then 401 |
| layout, via Chrome DevTools device emulation | at 360px and 1280px, `scrollWidth` equals viewport width on three profiles and `/admin` (no horizontal overflow). A plain `--window-size=360` screenshot is misleading on macOS because Chrome enforces a wider minimum window. |

**Dev database state left behind:** five `fictus-*` fixtures plus `fictus-walkthrough` (all synthetic), and two staff users without usable logins: `fixtures@example.invalid` (no password) and `walkthrough-admin@example.invalid` (disabled; password discarded). Wipe with `docker compose down -v` if you want a clean database.

**Known gaps:**
- Admin draft editing is JSON, not the form editor with live preview and diff (D-011).
- Photos are not shown: media serving and upload are M4. Credits and licences already flow through.
- Staff invites and staff management moved to M4 (ARCHITECTURE).
- Login throttle is in memory (D-010).
- No IUCN habitat or threat lists in production yet (licence pending); fixtures use synthetic `fx-*` codes.
- No range polygons yet, so no antimeridian range fixture: M3.
- No Playwright tests yet: they start in M2 per PLAN §12.

**Next:** M2, Discover and compare (docs/CLAUDE_TASKS.md).

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
