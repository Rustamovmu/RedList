# Decisions

ADR-style log. Each entry records the context, the decision and its consequences. Reversible decisions are made and recorded here; irreversible or legal/licensing ones need the owner's approval.

## D-001 Drizzle ORM instead of Prisma (2026-11-21)
**Context:** Prisma 6 downloads native engine binaries from `binaries.prisma.sh` at install and migrate time. That host was blocked in the build environment, and it fails the same way on restricted networks. Prisma also has no PostGIS type support, so every geometry column would be `Unsupported`. Prisma's `latest` npm tag pointed at a 8.0 release candidate at the time.
**Decision:** Drizzle ORM 0.45 with `pg`, plus drizzle-kit 0.31 for migrations.
**Consequences:**
- Pure TypeScript with no binary downloads.
- Migrations are plain SQL files we can read and review.
- drizzle-kit diffs against its own snapshot, not the live database, so hand-written CHECK constraints, composite FKs and triggers in custom migrations are never dropped by later migrations.
- Geometry is a small `customType`.

## D-002 Two repositories instead of a Yarn monorepo (2026-11-21)
**Context:** The owner created two folders, `RedList-backent` and `RedList-frontend`.
**Decision:** Keep two npm projects. The backend holds the project docs. Contracts flow one way: `openapi.json` is exported from the backend and the frontend generates `src/contracts/api.d.ts` from it.
**Consequences:**
- No shared `packages/config`. Each repo has its own tsconfig and ESLint.
- The frontend's `contracts:generate` script assumes the two folders are siblings.
- The folder name `RedList-backent` (typo) is kept because renaming is the owner's call. Rename it to `RedList-backend` and update the `contracts:generate` path when convenient.

## D-003 Versions (2026-11-21)
| Package | Version | Note |
|---|---|---|
| Node | 22 LTS (works on 24) | `.nvmrc` in both repos |
| NestJS | 11.2 | 12.x exists. 11 was chosen for known, stable APIs. Upgrade in its own task. |
| Next.js | 16.4 | React 19.3, Tailwind 4.3 |
| Drizzle ORM / kit | 0.45 / 0.31 | |
| PostgreSQL / PostGIS | 16 / 3.4 | Docker image `imresamu/postgis:16-3.4`, a multi-arch build that runs natively on Apple Silicon (the official `postgis/postgis` image is amd64-only). Re-checked 2026-11-21 with `docker manifest inspect`: `postgis/postgis:16-3.4` lists amd64 only; `imresamu/postgis:16-3.4` lists amd64 and arm64. `docker-compose.yml` had drifted back to the official image and was corrected. |
| zod | 4 | |
| Jest | 29 | Nest needs `emitDecoratorMetadata`, which Vitest's esbuild transform does not emit without extra plugins. |

## D-004 Map without a tile provider in R1 (2026-11-21)
**Context:** Hosted tile providers need keys and terms review. Self-hosting Protomaps adds a large file to operate.
**Decision:** MapLibre renders Natural Earth country and ocean polygons served by our API as the base layer.
**Consequences:**
- Public domain, no key, works offline.
- Less visual detail (no rivers or cities). A vector basemap can be added later behind the same map component.

## D-005 Integrity in the database, not only in code (2026-11-21)
**Decision:** `drizzle/0002_integrity.sql` enforces the following.
- Population form, value and date coherence.
- Scope matches region.
- The published pointer references a *published* revision of the *same* species (composite FK plus trigger).
- An estimate's assessment belongs to the same revision.
- Submitted and published revisions and their child rows are immutable.
- Append-only audit log.
- Valid geometry with a vertex cap.
- Slug format and https-only support URLs.

All of these are covered by `test/integration/database-integrity.spec.ts`.

## D-006 Health routes under the API prefix (2026-11-21)
**Decision:** `/api/v1/health/live` and `/api/v1/health/ready`. That keeps one proxy rule (`/api/v1/*`) for Nginx and the Next.js rewrite.

## D-007 Status colours (2026-11-21)
White text on each IUCN badge colour measures 4.9:1 to 21:1, so all pass WCAG AA. Moss (#6b8f4e) on paper is only 3.4:1, so it is used for focus rings and decoration only, never for text.

## D-008 Claude Code is the coding agent (2026-11-21)
**Context:** The docs were written for Codex: `docs/CODEX_TASKS.md` and "paste into your Codex workspace". The owner now uses Claude Code. Claude Code automatically loads `CLAUDE.md`, not `AGENTS.md`.
**Decision:**
- Rename the prompts file to `docs/CLAUDE_TASKS.md` and rewrite its instructions for Claude Code: a fresh session per milestone, `--add-dir ../RedList-frontend`, optional plan mode, and resuming from a CHECKPOINT.
- Add a `CLAUDE.md` to each repo that imports `AGENTS.md` with `@AGENTS.md`. AGENTS.md stays the single source of rules, so other agents still work.
**Consequences:** Rules load automatically in every Claude Code session. Edit rules in `AGENTS.md` only. `CLAUDE.md` holds just the Claude-specific notes.

## D-009 Two supported local databases (2026-11-21)
**Context:** The M0 log assumed Docker. The owner's Mac runs Postgres.app, and a setup script and a connection check (`test-db.cjs` in the repo root) were added outside the docs.
**Decision:** Support both. Docker: `npm run db:up` on port 5433, the `.env.example` default, which now matches `docker-compose.yml` (`wild`/`wild`/`wild`). Postgres.app: port 5432 with `npm run db:setup:local`. The connection check moved to `scripts/check-db.cjs` (`npm run db:check`). The test env example was renamed from `test.env.example` to `.env.test.example`, because `test/setup-env.ts` loads `.env.test` and that is the name the README already used.
**Consequences:** One documented path for each setup. `setup-local-db.sh` grants SUPERUSER to the local role, because `CREATE EXTENSION postgis` needs it. That is for local use only and never production.

## D-010 Staff auth details (2026-11-21, M1)
**Context:** PLAN §9 sets the session, CSRF and rate-limit rules but leaves some mechanics open.
**Decision:**
- **Passwords:** argon2id via the `argon2` package. Node 24 has `crypto.argon2` built in, but `.nvmrc` pins Node 22. Minimum 12 characters. Obvious placeholders (`change-me…`, `password…`, one repeated character) are rejected. No offline breached-password list is bundled; PLAN only asks for one "if available".
- **Sessions:** a 32-byte random token, stored only as SHA-256. 12-hour idle limit, 7-day absolute limit, revoked on logout. A per-session CSRF token is stored with the session.
- **Cookies:** `__Host-ww_session` / `__Host-ww_csrf` when `COOKIE_SECURE=true`. On plain-HTTP local development they are `ww_session` / `ww_csrf`, because the `__Host-` prefix requires `Secure`. Both cookies use Path=/ and SameSite=Lax. The session cookie is HttpOnly; the CSRF cookie is readable so the admin UI can echo it.
- **CSRF:** every staff mutation needs an `x-csrf-token` that matches both the CSRF cookie (double submit) and the session's token, plus `Origin == WEB_ORIGIN`. Login checks Origin too, against login CSRF.
- **Rate limiting:** in memory. At most 20 login attempts per IP per 15 minutes. Per email, after 5 consecutive failures, a lockout of 30 s that doubles with each further failure, capped at 15 min. R1 runs one API process and the plan rules out Redis. A restart clears the counters.
- **Proxy:** Express `trust proxy = loopback`, so `req.ip` is the real client behind the Next.js rewrite or Nginx on the same host.
**Consequences:** If the API ever runs as several processes, the throttle must move to PostgreSQL. Staff invites (one-time links) are not built yet; see ARCHITECTURE.

## D-011 M1 admin editor edits revision content as validated JSON (2026-11-21, M1)
**Context:** PLAN §7 describes a form editor with a source picker, live preview and a diff. M1's gate is the workflow and its guarantees, not the editing UI.
**Decision:** `/admin/revisions/[id]` edits the whole revision content as JSON. The API validates it (class-validator DTOs, plus the zod editorial schema, plus database constraints). Side panels list source ids (with a create-source form) and reference ids (regions, habitats, threats, media, support links). The checklist is shown, and Submit, Publish and Request changes are available by role.
**Consequences:** Usable by staff now, but not friendly. The form editor with preview and diff is still R1 work and is listed as open in ARCHITECTURE.md. It needs no API changes: the form will produce the same `SaveDraftDto`.

## D-012 Workflow rules the plan left open (2026-11-21, M1)
- **Several drafts per species are allowed.** The optimistic check at publish (`published_revision_id` must still equal the draft's `base_revision_id`, with the species row locked `FOR UPDATE`) decides which one wins. The loser gets 409 `PUBLISH_CONFLICT`.
- **Draft saves use a lock too:** a save must carry the `updatedAt` it read, otherwise 409 `STALE_DRAFT`.
- **Saving replaces all of the revision's child rows** in one transaction. The new draft copy and normal saves share this code path.
- **Media credit and licence are snapshotted at save time** from `media_assets`. A new draft takes fresh snapshots, so corrections flow forward and never backward.
- **The publication checklist runs at submit and again at publish.** "Not assessed" and "Unknown population" are explicit editorial flags. Having both a flag and rows (for example, assessments plus "Not assessed") fails the checklist.
- **`changes_requested` is terminal** for that revision. The editor continues in a new draft (PLAN §7).
- **Database integrity errors map to client errors:** 23514 and 23503 → 422 (`INTEGRITY_RULE`, `INVALID_REFERENCE`), 23505 → 409. The message names the rule, never row data.
- **Reference lists for habitats and threats are still empty** in production: the IUCN classification licence is pending (DATA_SOURCES). Dev fixtures add clearly labelled synthetic `fx-*` rows.

## D-013 Schema left unchanged in M1 (2026-11-21, M1)
**Context:** The M0 schema already had every column M1 needed (`staff_sessions.csrf_token`, `species_revisions.self_reviewed`, snapshots, and so on).
**Decision:** No new migration. PLAN §6 lists `staff_sessions.ip_hash`; it is not used, because no feature reads it and storing it would add personal data without a purpose.
**Consequences:** Add it in a migration if session review by IP is ever needed.

## D-014 Catalogue rules the plan left open (2026-11-21, M2)
- **Headline assessment:** a species' badge and its category and trend filters use one assessment: the global one if it exists (else regional), newest first. A regional VU never makes a globally LC species "VU" in filters.
- **Severity sort:** EX, EW, CR, EN, VU, NT, LC, then DD, NE, then unassessed. DD and NE come after LC because they are unranked, not because they are low risk. They are always labelled, never grouped with LC.
- **Filters:** values within one filter are OR, different filters are AND (`group=bird,fish&environment=marine`). Search is a per-word prefix match over common names, synonyms and the scientific name, using PostgreSQL full-text search (`simple` config, the existing GIN index). Only letters and digits reach `to_tsquery`.
- **Location-sensitive species** (`hide_regions`) never match a region filter, are not counted in region facets, and are never related to other species by shared region. Otherwise, filtering by place would reveal where they live.
- **Related species:** a score of shared group (1), plus shared threats, plus shared regions (when neither species is sensitive). Score must be > 0; top 4.
- **Compare comparability** is decided by the API (`comparePopulations`) and shown as text. Only wild, global, numeric estimates count. "Same basis" requires one shared unit other than `other`. Values are never added, divided, ranked or charted.
- **Compare selection:** the URL (`/compare?species=a,b,c`) is the source of truth. While browsing, picks are kept in `localStorage` (slugs only, max 3). Duplicates in the URL are ignored.
- **Cache tags:** list, filters, home and compare use `catalogue`. Profiles use `species:<slug>` plus `catalogue`, because related species change when others are published.
- **Card context line** = environments plus the number of countries and seas, or "locations withheld".

## D-015 End-to-end test stack (2026-11-21, M2)
**Context:** The Playwright suite needs deterministic data and must not disturb a developer's running dev servers or dev database.
**Decision:**
- `npm run test:e2e` (frontend) starts its own stack. The API runs on :4110 via `ts-node` (not `dist/`, which a dev watcher may own) against `wild_e2e`, which `npm run e2e:prepare` wipes and refills with regions plus the synthetic fixtures; it refuses any database name without "e2e". The web app is built into `.next-e2e` (`NEXT_DIST_DIR`) and served on :3110.
- Tests use the installed Google Chrome (`channel: 'chrome'`), so no browser download is needed.
- Projects: `desktop` (1280×800) and `mobile-360` (360×740).
**Consequences:** The suite needs Docker PostGIS on :5433 and Chrome installed. CI (backlog) will need `npx playwright install chromium` and a `channel` override. `next start` prints a harmless warning about `output: standalone`.

## D-016 Map API, basemap and body size (2026-11-21, M3)
**Context:** PLAN §9 lists `GET /map?bbox&group&category` with "bbox validated, antimeridian-aware, result & vertex caps" but leaves the shape open. D-004 says the basemap is Natural Earth served by our API.
**Decision:**
- **bbox** is `west,south,east,north` in plain decimal degrees: lon in [-180, 180], lat in [-90, 90], south < north, west ≠ east. Anything else gets 400 `BAD_BBOX`. **west > east means the box crosses the antimeridian.** It is split into `[west,180]` and `[-180,east]`, so no query wraps the wrong way. With no bbox, the whole world is used.
- **Layers:** a species with a published range is placed by its range (`layer: "range"`). Otherwise it is placed by the regions it is recorded in (`layer: "country"`, returned as region slugs to shade). A range is never derived from regions.
- **Caps:** at most 200 species and 20,000 range vertices per response. Ranges are clipped to the viewport and simplified (tolerance = viewport width / 2000), and output uses 4 decimals. A cap sets `truncated: true`, and the UI says "zoom in".
- **`GET /map/basemap`** is an extra public endpoint: every region with 3-decimal geometry and `Cache-Control: public, max-age=86400`. It is about 570 kB uncompressed. Compression is for Nginx in M5.
- **`GET /map?species=<slug>`** drives the small profile map.
- **JSON body limit is 2 MB** (`useBodyParser`), because range polygons travel in draft saves (Express's default is 100 kB). Each range is capped at 50,000 vertices and each revision at 20 ranges.
- **MapLibre worker:** MapLibre GL 6 finds its worker with `new URL(…, import.meta.url)`, which the Next.js production bundler does not emit ("Worker failed to load"). `scripts/copy-maplibre-worker.mjs` (run by `predev` and `prebuild`) copies the worker to `public/vendor/maplibre-gl-worker-<version>.mjs`, and `setWorkerUrl` points at it.
**Consequences:**
- The production standalone build must ship `public/` (M5 deployment).
- CSP (M5) must allow `worker-src 'self' blob:`, because MapLibre wraps the worker URL in a blob.

## D-017 Location-sensitive geometry (2026-11-21, M3)
**Context:** PLAN §5.6: public geometry for sensitive species is generalized *before storage*, and only approved public geometry is stored in R1.
**Decision:** `GeoRepository.insertRanges` is the only writer of `species_ranges`.
- **`hide_regions`:** range polygons are refused (422 `SENSITIVE_RANGE`). The species never appears on the map or on region pages, and is not matched by place (D-014).
- **`generalize_country`:** the stored shape is the union of the whole countries the input covers. If it covers no country, the seas and oceans are used instead. A region counts when its overlap is more than 0.1% of the input's area, so shared borders do not pull in neighbours and re-saving a copied draft gives the same shape. `generalization_note` is set to a fixed text. The precise input exists only inside that SQL statement: it is never stored, logged or echoed in errors.
- **All ranges:** the input must pass `ST_IsValid` (else 422 `INVALID_GEOMETRY`, without the PostGIS message, which can contain coordinates). It is then split at ±180 (`ST_WrapX`). Migration 0003 makes "inside ±180/±90" a CHECK.
- "Approved" means published through the revision workflow: ranges are revision content, and drafts never reach `/map` (tested).
**Consequences:**
- Changing a species' sensitivity later does not rewrite old ranges. There is no endpoint for it yet; if one is added, it must regenerate or drop ranges.
- Fixture `fictus-generalis` carries a deliberately precise test polygon whose coordinates are checked against every public endpoint.

## D-018 Support directory rules (2026-11-21, M3)
**Decision:**
- Admins manage organizations and links (PLAN §7). Editors can read the directory and attach links to drafts.
- New records start `pending`. **Any edit sends the record back to `pending`**, so changed text or URLs are reviewed before they show again.
- `disable` takes effect at once, is audited, and creates no revision (PLAN §6). Re-enabling means approving again.
- Public output shows only approved links of approved organizations: the profile, `GET /support`, and the species listed per link (published only).
- Every change revalidates `support` and `species:<slug>` for the published species that show the link.
- URLs must be https and are never fetched in M3 (the link checker is M4).
- The review criteria on `/support` are a **draft written by the coding agent**. The owner must confirm them before launch, because they are published policy.

## D-019 Spatial SQL moved out of the seed CLI (2026-11-21, M3)
**Context:** `src/cli/seed-regions.ts` held raw spatial SQL, against the AGENTS rule that spatial SQL lives only in `GeoRepository` and migrations.
**Decision:** the upsert moved to `upsertRegion()` in `src/geography/geo.repository.ts`. The seed calls it, and its behaviour is unchanged (still idempotent).

## D-020 Marine Regions not imported (2026-11-21, M3)
**Context:** the M3 prompt imports Marine Regions only "if its licence is approved in DATA_SOURCES". There was no row. For this session the owner required that nothing cost money or risk breaking the law.
**Decision:** use Natural Earth only (public domain, already bundled: 29 ocean and sea areas). Marine Regions has a `pending` row in DATA_SOURCES and nothing is downloaded. Importing it later needs the owner to review its terms.

## D-021 The e2e web build clears its data cache (2026-11-21, M3)
**Context:** Next.js keeps its fetch cache in `.next-e2e/cache/fetch-cache` across rebuilds. After the profile DTO gained fields, the e2e web server served profile JSON cached by the M2 run, and pages crashed. Revalidation could not help: the fixtures are published before the web server starts.
**Decision:** the Playwright web command deletes `.next-e2e/cache/fetch-cache` before `npm run build`.
**Consequences:** the same risk exists in production when the API contract changes. The M5 deployment runbook must clear the Next.js data cache, or revalidate `catalogue`, on deploy.
