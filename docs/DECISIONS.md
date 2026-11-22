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

## D-022 Media storage, processing and serving (2026-11-21, M4)
**Context:** PLAN §3 asks for a `StorageAdapter` (local disk in development, S3-compatible in production), re-encoding with metadata stripped, responsive WebP variants and `next/image` with a custom loader. PLAN §9 sets upload rules.
**Decision:**
- **Storage:** `StorageAdapter` with `LocalDiskStorage` under `MEDIA_DIR` (default `./storage/media`, git-ignored). The S3-compatible adapter is part of the M5 deployment work, because no bucket exists yet and nothing in R1 needs one before deployment. Keys are `<sha256 of the original>/<width>.webp`; `assertKey` rejects anything else, so no request can reach a path outside the folder.
- **Processing** (`sharp` 0.35, Apache-2.0):
  - limit `MEDIA_MAX_BYTES` (15 MB) and 40 megapixels
  - magic-byte check for JPEG, PNG or WebP, and the decoder must agree with it (no SVG, HTML or polyglots)
  - auto-rotate
  - WebP at 320, 640, 960, 1280 and 1920 px below the image's own width, plus the own width (capped at 1920)
  - **The original is not kept.** Re-encoding writes no EXIF, XMP or GPS. `modifications` records what we changed (CC BY-SA asks for it).
- **Review:** upload → `pending` → `approved` / `rejected`. Admins only, audited.
  - Editing credit or licence sends an image back to `pending`; published revisions keep their snapshots (D-012).
  - Migration `0005_media_rules.sql`: an approved image must have a creator, a credit and an allow-listed licence (the same regex as `licences.ts`).
- **Public serving:** `GET /api/v1/media/<key>/<width>.webp` gives the nearest generated width at least as wide.
  - An image is served if it is approved, or if a currently published revision uses it (it was approved when that revision was published).
  - **Rejected images are never served, and they drop out of profiles and cards at once** (a read-time filter, like disabled support links in D-018). Rejection is the takedown path.
  - `Cache-Control: public, max-age=86400`, not `immutable`, so a takedown also expires from browser caches within a day.
- **Staff preview:** `GET /staff/media/:id/preview/<width>.webp` (session required, `no-store`) shows any state, for review.
- **Frontend:** `next/image` with `loaderFile` `src/lib/image-loader.ts`, which only ever builds same-origin `/api/v1/media/…` URLs. There is no Next.js image optimizer and no remote image host.
**Consequences:**
- Back up `MEDIA_DIR` with the database (M5). Losing it loses the images: there are no originals to regenerate from.
- A failed import can leave content-addressed files with no row. They are harmless and reused if the same image comes back.
- A dry run writes no files.

## D-023 Import CLI format and reconcile rules (2026-11-21, M4)
**Context:** PLAN §8 specifies the import CLI: JSON/CSV, zod, match on stable provider IDs, drafts only, one transaction per file, a Markdown report, idempotent, and `--reconcile` for manual edits.
**Decision:**
- **JSON only in R1** (format `wildward-import` v1, `src/import/import-schema.ts`). Species content is nested (assessments, estimates, citations), so CSV would need several linked files. CSV is in the BACKLOG.
- **References** are by file-local `key` (sources, media) or stable code (region slug, habitat and threat code), never by database id.
- **Not imported:**
  - range maps (no licensed source yet)
  - support links (they go through the admin review, D-018)
  - species identity edits: name, rank and sensitivity changes are reported, not applied
- **Matching:**
  - species by any `(provider, externalId)`, then by slug; a conflict between the two aborts the file
  - sources by every field; a changed source becomes a new row (sources are never edited in place)
  - images by the sha256 of the downloaded bytes
- **Targets:** writes into the newest open draft, or creates a draft from the published revision. A species whose latest revision is `submitted` is skipped with a note. Nothing is ever submitted or published.
- **Idempotency:** content is compared per section in normalized form:
  - sections: display group, names, environments, status + population together (estimates point at assessments), regions, habitats, threats, citations, media, and each top-level editorial key
  - editorial JSON is normalized through the same zod schema the save uses, so trimming never looks like a change
  - an unchanged section writes nothing, so a re-run produces zero changes and no new draft, also after publication
- **Manual edits:** `import_records` keeps the hash of what the importer last wrote per species and section.
  - If the current value differs from that hash, a person edited it, and the section is skipped unless `--reconcile` is given.
  - A non-empty section the importer never wrote counts as a manual edit.
  - Every skip and every overwrite is listed in the report.
- **Downloads:** through `safeFetch` (D-026), before the transaction opens, one at a time, at least 1.5 s apart, honouring `Retry-After` on 429/503 for up to 3 minutes.
- Reports go to `import-reports/` (git-ignored). Each apply with changes writes one `import.apply` audit event, and the individual drafts, sources and images are audited as usual.

## D-024 Rollback (2026-11-21, M4)
**Context:** PLAN §6: rollback moves the pointer back to an earlier *published* revision.
**Decision:** `POST /staff/species/:id/rollback {targetRevisionId, expectedPublishedRevisionId, reason}`, admin only.
- One transaction with the species row locked `FOR UPDATE`, like publish.
- 409 `ROLLBACK_CONFLICT` if the live revision changed since the admin loaded the page. 422 `NOT_PUBLISHED` for drafts, other species' revisions and anything never published. 422 `ALREADY_LIVE`.
- The audit event `species.rollback` records from and to (version and id) and the reason. Revalidation of `species:<slug>` and `catalogue` follows the commit.
- No schema change was needed: old published revisions keep `state = 'published'`, and the pointer trigger only requires that. Rolling forward again is just another rollback.
- Drafts based on the replaced revision fail to publish with `PUBLISH_CONFLICT` (D-012), so no one silently overwrites a restored version.

## D-025 Editing a source (2026-11-21, M4)
**Decision:** `PUT /staff/sources/:id`.
- If any submitted or published revision cites the source, the old row is left unchanged and a **new** row is created. The response says `createdNewRow: true` with the new id, and new drafts pick it.
- A source cited only by drafts (or not at all) is corrected in place.
- Region boundaries count as citing (`regions.source_id`).
- Both paths are audited.
**Consequence:** published citations always point at what was actually cited (PLAN §6, tested in `content-ops.spec.ts`).

## D-026 SSRF-safe fetcher (2026-11-21, M4)
**Context:** PLAN §9: staff-entered URLs are fetched only through an SSRF-safe fetcher. M4 adds two fetchers of outside URLs: import image downloads and the link checker.
**Decision:** `src/common/safe-fetch.ts`:
- https only, port 443, no credentials in the URL
- the host is resolved and **every** address must be public: blocked are loopback, RFC 1918, CGNAT, link-local (incl. 169.254.169.254), multicast, reserved, documentation, ULA, NAT64 and IPv4-mapped or -compatible IPv6
- the connection is pinned to the checked address, against DNS rebinding
- redirects are followed by hand, at most 3, re-checked at every hop
- size and time limits; error codes never echo the URL or the remote message
- User-Agent `WildwardBot/0.1 (catalogue link and media checker)`, plus `FETCH_CONTACT` if the operator sets one
**Consequence:** Wikimedia rate-limits unidentified bots (HTTP 429, `Retry-After: 120`, seen 2026-11-21). For larger imports the owner should set `FETCH_CONTACT` to a project URL or role address. The agent does not add contact details itself.

## D-027 IUCN pages are not read by the agent; the pilot cites Wikidata (2026-11-21, M4)
**Context:**
- The owner approved reading public IUCN assessment pages one at a time, to summarize status and population with a citation.
- When tried, `www.iucnredlist.org` returned **403**. Its `robots.txt` explicitly disallows `ClaudeBot`, `anthropic-ai` and `Claude-Web`, and sets `Content-Signal: ai-train=no`.
- Working around that would break the owner's rule that nothing risks breaking the law.
**Decision (owner's choice when asked):**
- The coding agent reads nothing from IUCN.
- For the real-catalogue pilot, the IUCN category is taken from **Wikidata** (structured data CC0, read through its API). It is cited as a second-hand source whose statement references *The IUCN Red List of Threatened Species 2022.2*. That is stated in the source's note.
- Population is **Unknown** wherever no estimate was checked. Trend is `unknown`, because Wikidata does not state it.
- **Image licences** were checked twice: the Commons licence metadata, and the file's own embedded copyright fields. A file whose EXIF said "Alle Rechte vorbehalten" (all rights reserved), against its CC BY-SA declaration on Commons, was not used.
**Consequences:**
- Pilot profiles carry an honest but second-hand status. Before launch, a person should check each status against the IUCN assessment by hand and replace the citation.
- IUCN terms remain `pending` in DATA_SOURCES.

## D-028 Information pages and SEO (2026-11-21, owner request after M4)
**Decision:**
- **Pages:** `/about`, `/methodology`, `/sources`, `/privacy` and `/terms`.
  - The about and terms pages describe Wildward as a **personal portfolio project** and name no person or organization. The owner gave no operator details, and none are invented.
  - A contact link appears only if `NEXT_PUBLIC_CONTACT_URL` is set.
  - The privacy page states only what the code does: no visitor cookies or analytics, compare picks in localStorage, "Near me" resolved in the browser, staff session cookies.
- **New public endpoints:**
  - `GET /api/v1/sources`: sources cited by any child row of a published revision, plus region-boundary sources, with the published species citing each
  - `GET /api/v1/sitemap`: published slugs with publication dates, and region slugs that have published, non-hidden species
  - Both read through the `PUBLISHED` fragment.
- **SEO:**
  - `sitemap.ts` and `robots.ts`; robots disallows `/admin`, `/api/` and `/compare` (compare pages are combinations, not content).
  - Open Graph and Twitter tags on every page; profiles use their licensed primary photo at 1280 px from our own API.
  - JSON-LD: `Taxon` (with `parentTaxon` genus, alternate names, image) and `BreadcrumbList` on profiles; `WebSite` with a `SearchAction` on the home page. `jsonLd()` escapes `<`.
**Consequences:** before a public launch, the owner should review the privacy and terms wording and decide whether to name an operator. `NEXT_PUBLIC_SITE_URL` must be the real origin in production, or canonical, sitemap and Open Graph URLs point at localhost.

## D-029 Security headers and Content Security Policy (2026-11-21, M5)
**Context:** PLAN §12 M5 asks for security headers and a CSP. Next.js injects inline scripts, so a strict policy needs a per-request nonce, and nonces need pages rendered per request.
**Decision:**
- **Pages:**
  - `src/proxy.ts` (Next 16's replacement for middleware) sets the CSP with a fresh nonce on every page request
  - `script-src 'self' 'nonce-…' 'strict-dynamic'`, with no `'unsafe-inline'`; `'unsafe-eval'` only in `next dev`
  - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`
  - `connect-src 'self'`, because the browser only talks to our own `/api/v1`
  - `img-src 'self' blob: data:` and `worker-src 'self' blob:`, for MapLibre's sprites and worker
- **Rendering:** the root layout calls `connection()`, so every page renders per request and gets the nonce. API data is still cached by tag, so this costs a render, not an API call. JSON-LD `<script type="application/ld+json">` blocks are data, not scripts, so they need no nonce.
- **Styles allow `'unsafe-inline'`:** the map legend swatches and `next/image` use style attributes. Injected styles cannot run code. Removing this would mean nonce-tagging every style or moving those styles into classes; it is a backlog item, not an R1 blocker.
- **Other page headers** (`next.config.ts`): `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (geolocation self only, for "Near me"), `Cross-Origin-Opener-Policy: same-origin`, and no `X-Powered-By`.
- **API** (Helmet, `apiHelmetOptions`):
  - in production, `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`, because the API serves JSON and WebP only
  - outside production, Helmet's default CSP, so Swagger UI works
  - `X-Frame-Options: DENY`
- **HSTS is set by Nginx only,** where TLS ends. Helmet's default (one year with `includeSubDomains`) is turned off, so the max-age can start short and grow.
**Consequences:**
- `e2e/release.spec.ts` fails if any page lacks the nonce policy, if a server-rendered script lacks the nonce, or if any CSP violation fires, including on the map.
- A future third-party script needs an explicit policy change.
- Statically generated pages would break under this policy. Keep `connection()` in the root layout, or move to a hash-based policy.

## D-030 Production stack (2026-11-21, M5)
**Context:** PLAN §13 asks for a production compose with a private database network, Nginx, health checks, and backups of PostgreSQL and media stored apart from the app host.
**Decision:**
- **Layout:** `deploy/docker-compose.prod.yml`, run through `deploy/compose.sh`, which always passes `-p <project>`, the file and `deploy/.env.prod`.
- **Networks:**
  - `db_net` and `app_net` are `internal: true`
  - the database is only on `db_net`, has no published port and no route out
  - the API is also on `edge`, for `links:check` and import downloads
  - only Nginx publishes a port, `127.0.0.1:8080` by default
- **Migrations:** a one-shot `migrate` service runs before the API (`service_completed_successfully`), so a failed migration stops a deploy before new code serves traffic.
- **Images:**
  - **API:** `node:22-bookworm-slim`, compiled JS only (`dist/cli/*.js` replace ts-node), production dependencies only, runs as `node`
  - **Web:** Next.js standalone output, with `NEXT_PUBLIC_SITE_URL` as a build argument (it is inlined)
  - **Both:** `cap_drop: ALL` and `no-new-privileges`
  - **Copies:** `COPY --chmod=755` for drizzle, data, catalogue and src, so the image never depends on the permissions of the working copy it was built from. A 0700 `drizzle/meta` made the first build's migrate step fail.
- **`TRUST_PROXY`:** new environment setting, default `loopback`; the stack uses `loopback,uniquelocal`. Only those keywords are accepted: never `true`, `*` or arbitrary ranges. Nginx overwrites `X-Forwarded-For` with the client address, so the login throttle cannot be fooled.
- **Nginx (1.30.7, the stable branch on 2026-11-21):**
  - routing: `/api/v1` → API, the rest → web
  - `/api/revalidate` and `/api/docs` give 404 from outside
  - rate limits: login 10/min; the API 30 r/s with a burst of 120; images unlimited. The first limit (20 r/s, burst 60) throttled a scripted publish in the rehearsal, and would also have hit a classroom loading cards behind one address.
  - gzip; 16 MB uploads; `http.conf` (TLS in front) or `https.conf` (TLS here, HSTS)
- **Backups:**
  - `pg_dump -Fc` inside the db container, so the client always matches the server, plus a tar of the media volume read by a throwaway container with a read-only mount
  - a manifest with sha256 sums and row counts; retention by count
  - optional `rsync` off the host (no paid storage)
- **Restore:**
  - drops and recreates the database from `template0`
  - runs `pg_restore --exit-on-error`, then `ANALYZE`. Without `ANALYZE` the rehearsal's planner guessed 1 row per table.
  - empties and refills the media volume
  - force-recreates api, web and nginx, so the Next.js data cache cannot serve pre-restore pages
**Consequences:**
- A new import file needs an image rebuild, or `docker compose cp`.
- Media is local to the host (no S3 adapter, BACKLOG), so off-host copies of backups matter.
- Runbook and limits: `docs/DEPLOYMENT.md`.

## D-031 Tests never read the developer's .env (2026-11-21, M5)
**Context:** The fresh-clone check failed 51 integration tests. Ten modules (the server and every CLI) call `dotenv.config()` when imported, and test files import some CLIs. With `.env.test` silent on a setting, the developer's `.env` filled it in: a non-default `WEB_ORIGIN` made every staff login 403. A dev `WEB_REVALIDATE_URL` could also have sent revalidation calls from tests to a running dev web server. The owner's own `.env` happened to match the test defaults, which hid the problem.
**Decision:** `src/common/load-env.ts` `loadDotEnv()` replaces every direct `config()` call and does nothing when `NODE_ENV=test`. `test/setup-env.ts` still loads `.env.test` with `override`. A unit test checks that a `.env` in the working directory is ignored under tests.
**Consequences:** Every test setting must be in `.env.test` or have a default in `src/config.ts`.

## D-032 Hand-checked IUCN status through a CSV sheet (2026-11-21, R1 launch readiness)
**Context:** Every published status cites Wikidata (D-027). The agent may not read IUCN pages, so a person has to check each one. Their findings must reach the catalogue through the normal review workflow, and no value may be filled in by a tool.
**Decision:**
- **Sheet:** `npm run status:sheet` writes `docs/launch/status-check.csv`, one row per published, non-archived species, and refreshes the table in `docs/launch/STATUS_CHECK.md`.
  - The synthetic fixtures are left out (identifier provider `fixture`).
  - Generated columns: the cited category, its source, the Red List edition named in that source's note, the IUCN taxon ID (the `iucn` identifier, taken from Wikidata P627 in M4), and a search link.
  - Owner columns: `checked_category`, `date_assessed`, `trend`, `criteria`, `assessment_url`, `date_checked`, `owner_note`.
  - Rebuilding keeps every owner value, matched by slug. Filled rows of species that are no longer published are kept at the end.
- **Import:** `npm run status:import -- <csv> --dry-run | --apply`.
  - A row with no owner values is skipped. A partly filled row, an invalid date, a date in the future, or an assessment URL whose taxon differs from the row's (or the species') IUCN ID stops the whole run.
  - The CSV parser is a small built-in RFC 4180 reader, so there is no new dependency.
- **Dates:** a full `date_assessed` (YYYY-MM-DD) is required, because `assessments.assessed_on` is a date. A year alone is refused rather than padded to 1 January.
- **Effect per checked row:**
  - The species' open draft, or a new draft copied from the published revision, gets one global assessment with the owner's category, trend, date and criteria. `provider_assessment_id` is the assessment ID from the URL.
  - Every previous **global** assessment is removed; regional assessments are kept, with estimates re-indexed. An estimate linked to a removed assessment is unlinked and reported.
  - The new assessment cites a new source: publisher IUCN, the owner's URL, `accessed_on` = date checked, and the note beginning **"IUCN Red List, checked by hand"**. `license` stays empty, because IUCN terms are still pending.
  - Status-section citations of the removed sources move to the new source. Other sections that still cite the old source are listed in the report and not changed.
  - A changed category is reported, so the overview text can be checked.
- **Rules kept from the importer:**
  - drafts only (never submitted or published)
  - a species whose latest revision is `submitted` is skipped
  - one transaction per file; dry-run rolls back
  - one audit event `status_check.apply` per run with changes
  - re-running the same sheet changes nothing
  - Markdown report in `import-reports/`
- **Catalogue imports:** a later catalogue import treats the changed sections as edited by hand and skips them unless `--reconcile` is given, so a re-run of `batch-1.json` cannot quietly restore the Wikidata status.
**Consequences:**
- The owner fills the CSV by hand and reviews each draft in `/admin`.
- `test/integration/status-check.spec.ts` covers the sheet, validation, dry run, apply, idempotency, update and skip.
- The search link format was not tested, because the agent cannot open iucnredlist.org.

## D-033 CI on GitHub Actions, standard runners only (2026-11-21, R1 launch readiness)
**Context:** PLAN §13 asks for CI: install, typecheck, lint, contracts drift check, unit tests, integration tests against PostGIS, build, Playwright. The owner's rule is free and legal only.
**Free-minutes check (2026-11-21):**
- **Source:** GitHub Docs, "GitHub Actions billing", https://docs.github.com/en/billing/concepts/product-billing/github-actions (the page shows no last-updated date).
- **Free for public repositories:** "The use of standard GitHub-hosted runners is free: In public repositories". Such usage "remains free independently and does not reduce the included compute usage".
- **Billed:** "Larger runners are billed for public repositories."
- **No payment method:** "usage is blocked once you consume the included compute usage". It is blocked, not charged.
- **Private repositories on GitHub Free:** $12 of included compute a month, 500 MB of artifact storage, and 10 GB of cache per repository.
- **Repository visibility, checked through the public GitHub API the same day:** `Rustamovmu/RedList` and `Rustamovmu/RedList-frontend` are both **public**.
**Decision:**
- One workflow per repo, `.github/workflows/ci.yml`, on `ubuntu-latest` (a standard runner) only.
  - Runs on pushes to `main` and `develop`, on pull requests, and by hand.
  - `permissions: contents: read`, no secrets, and a cancel-in-progress concurrency group.
- **Backend:**
  - job `checks`: `npm ci`, typecheck, lint, `openapi:export` + `git diff --exit-code openapi.json`, `npm test` against a PostGIS service container (`imresamu/postgis:16-3.4`, the docker-compose image) on 5433, then build
  - job `e2e`: clones the frontend next to the backend (the same branch if it exists, otherwise its default branch), checks the frontend's generated types against this `openapi.json`, and runs `npm run test:e2e`
- **Frontend:** one job. It clones the API the same way, then runs install, typecheck, lint, `contracts:generate` + `git diff --exit-code src/contracts/api.d.ts`, build and `test:e2e`.
- **Shared steps:**
  - Chrome: the suite uses `channel: 'chrome'`, so the step uses the runner's Google Chrome, or installs it with `npx playwright install --with-deps chrome` if missing.
  - Traces are uploaded only on failure and kept 7 days, which keeps artifact storage small.
**Consequences:**
- No cost while the repositories stay public and use standard runners. If either repository becomes private, re-check against the $12 monthly allowance, or turn the workflows off.
- **Not yet run on GitHub:** the owner commits and pushes (AGENTS.md), so the first run happens on the owner's push. The same commands passed locally (COMPLETED_TASKS, R1-L).
- The e2e stack now creates an e2e-only admin (`E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`, set in the frontend's `playwright.config.ts` and `e2e/staff.ts`), only in a database whose name contains `e2e`. With it, `e2e/a11y-extra.spec.ts` checks the staff pages.

## D-034 "Signal" visual redesign replaces the nature-editorial style (2026-11-22, owner request)
**Context:** the owner asked for a more premium look, based on `docs/STITCH_PROMPT.md` and a reference screenshot (a dark template with acid-lime display type). PLAN §4 described "a calm nature-editorial style: warm off-white background, deep forest-green navigation".
**Decision:**
- **Palette:** black `#000000` canvas, navy `#0E1E32` panels (raised `#15283F`, rules `#2A3B52`), one signal colour, acid lime `#D9FE8F`. Body text `#DCDCDC`, secondary `#9AA4B2`, errors `#FF8A80`. Text on lime is always black. The nine status colours are unchanged; badges keep the code and label as text.
- **Type:** Anton (uppercase display, never faux-bold), Space Mono (navigation, labels, buttons), Inter (reading text). Square corners, no shadows, no gradients except dark scrims over photographs.
- **Fonts are self-hosted from npm** (`@fontsource/anton`, `@fontsource/space-mono`, `@fontsource-variable/inter`, all 5.3.0, fonts under the SIL Open Font License 1.1, no cost). The CSP keeps `font-src 'self'`; no Google Fonts request. The woff2 files carry the OFL notice in their metadata.
- **Only the look changed.** Page structure, wording rules, data, routes and the accessibility target are as before. Section numbers (01–08) are used where the content is a sequence (the profile's eight questions) and on the long-reading pages, as the prompt pack specifies.
- From the reference only the palette, type pairing and layout feel are used, never its pictures, logo or words. The hero photo is the catalogue's own licensed photo with its credit.
**Consequences:**
- PLAN §4 "Style" now points here.
- The keyboard e2e helper `tabTo()` reads `textContent` instead of `innerText`, because `innerText` applies CSS `text-transform` (nav and buttons are uppercase in CSS, not in the DOM).
- Contrast (WCAG formula, computed): on black, body 15.3:1, secondary 8.3:1, lime 18.5:1, errors 9.2:1; on navy, secondary 6.7:1, errors 7.4:1, lime 14.8:1; black on lime 18.5:1. Focus is a 3px lime ring, black on lime surfaces.
- To go back, revert the frontend commit. A copy of the previous style was kept outside the repo on 2026-11-22 (STITCH_PROMPT.md, "Notes for the owner").

## D-035 Profile photo shown whole, beside the name (2026-11-22, owner request)
**Context:** the profile put a 7.5rem name above a full-width 21:9 photo cropped with `object-cover`. On a 1512×861 window the photo started below the fold and the name scrolled away before the photo was in view. Catalogue photos range from 1280×590 (landscape) to 872×1400 (portrait), and some are small (the Bornean orangutan's original is 400×518), so a fixed 21:9 crop zoomed portrait photos into an unrecognisable, blurry strip.
**Decision:**
- The profile photo is never cropped. `Photo` takes `fit` (the photo's own width and height from the API) and draws the photo at its own aspect ratio, as wide as its column allows and no taller than `--photo-max-h`.
- From `lg` (1024px) the hero has two columns: name, scientific name, compare and the key facts on the left (5fr), the photo on the right (7fr). `--photo-max-h` is the first screen minus the lime bar, nav, top padding and credit line, so the name and the whole photo are visible together without scrolling. The display name is smaller there (at most 6rem).
- Below `lg` the hero stacks (name, photo, facts) and the photo is at most 45% of the screen height.
**Consequences:**
- Any other place can opt in with `fit`; without it `Photo` behaves as before (fixed `aspect`, cropped). Cards and the home hero are unchanged.
- Small source photos are still enlarged somewhat (the orangutan is shown about 1.2× its original width at 1512×861). A larger licensed photo is the real fix, not a layout change.

## D-036 Footer "rising lines" decoration is our own code, not React Bits Pro (2026-11-22, owner request)
**Context:** the owner asked for React Bits Pro's "Rising Lines" component ("lines of light rising from a glowing horizon") in the footer, installed with `npx shadcn@latest add @reactbits-starter/rising-lines-tw` and a `REACTBITS_LICENSE_KEY`. Checked on 2026-11-22 against pro.reactbits.dev (installation page and License Agreement v2.2):
- React Bits Pro is paid: "Subject to full payment and compliance with this Agreement, Licensor grants Licensee a personal, non-exclusive, non-transferable license". The registry needs a licence key, and the `@reactbits-starter` registry needs at least the Starter plan.
- §2.4 forbids making "the Product or any substantial part of it available to any third party", which expressly includes publishing it "as part of open source repositories". Both repos are public (D-033).
- The frontend has no `components.json` (it does not use shadcn), and no licence key is configured. The owner's rule is no cost and no licensing risk.
**Decision:**
- `RisingLines` (`src/components/shell/RisingLines.tsx`) is written from scratch, without the Pro source. It uses a 2D canvas and adds no dependency. Thin lime lines rise from a hairline horizon at the bottom edge, with a soft elliptical glow centred on it. Lines are brighter in the middle and fade as they climb.
- In the footer it sits behind the cropped WILDWARD wordmark. The wordmark block gets `clamp(4rem, 9vw, 8rem)` of top padding so the lines show above the letters, and they fade out before reaching any text.
- The colour comes from the `--color-lime` token. The animation runs only while the canvas is on screen (IntersectionObserver). With `prefers-reduced-motion` it draws one still frame. The canvas is `aria-hidden` and ignores the pointer. The device pixel ratio is capped at 2.
- This is a deliberate exception to D-034's "no gradients except dark scrims over photographs", for this one decoration only.
**Consequences:**
- No new package, no shadcn setup and no CSP change (a canvas needs none). The footer is taller by the new padding.
- Using the Pro component itself would need a paid plan and either a private repo or the licensor's written permission. That is the owner's licensing decision, not an agent's.
- To remove it, delete the `<RisingLines>` line and the padding in `SiteFooter.tsx`, and delete the component file.

## D-037 A photo on each home-page group tile (2026-11-22, owner request)
**Context:** the owner asked for a representative photo on each "Browse by animal group" tile. The tiles were plain navy squares with a name and a count. The catalogue's own licensed photos are the only allowed source: never stock or invented images.
**Decision:**
- `GET /filters` gives each group an `example`: one published species of the group with its card photo (`slug`, names, and `image` with the credit and licence snapshot), or `null` when no species of the group has a photo. The species card and the tile choose the photo with the same SQL fragment (`CARD_IMAGE`), so they never disagree, and a rejected photo (takedown) disappears from both at once.
- Which species is picked, in this order:
  1. photos at least 800 px wide (a tile is about 450 CSS px wide on desktop)
  2. the species recorded in the most countries and seas, i.e. the group's most widespread member. A location-sensitive species counts as none, so it is never ranked by data it hides.
  3. then by name
  "Most threatened first" was rejected: it would repeat the hero photo and the threatened-species row on the same page. With today's catalogue the picks are African bush elephant, Atlantic puffin, green turtle, lemur leaf frog, great white shark, monarch butterfly, giant clam and coconut crab. Coral has no photo yet, so its tile stays plain.
- The tile (`GroupTile`) shows the photo full-bleed behind the name and count, with dark scrims (allowed by D-034). The photo is decorative there (`alt=""`), because the link names the group. A caption names the species shown, so the photo is not read as the whole group, and gives the credit, because attribution travels with the image.
- The grid is now 2 columns on phones and 3 from `sm` (was 6 on desktop). Six columns made the tiles about 220 px wide, too small for a photo plus a credit.
**Consequences:**
- The pick changes on its own when the catalogue changes. Publishing or a media decision revalidates `catalogue`, which refreshes the tiles.
- An editor cannot choose a tile photo. If that is wanted, it needs a small editorial field later (BACKLOG candidate, not R1).

## D-038 Layout and type modelled on a reference site, in our own palette (2026-11-22, owner request)
**Context:** the owner sent seven screenshots of a conservation-data site's home page (BirdLife DataZone, datazone.birdlife.org) and asked to "keep the colors of our website but make the website look like this one … work on every detail". The Signal look (D-034) used condensed uppercase Anton headlines, monospace UI text, a lime announcement bar and a giant cropped wordmark. The reference uses one geometric sans in sentence case, a full-bleed photo hero with a curved lower edge, a row of figures with line icons, photo-led sections, article cards, photo tiles, a coloured call-to-action panel and a plain multi-column footer.
**Decision:**
- **Palette unchanged** (D-034): black canvas, navy `#0E1E32` panels and bands, acid lime `#D9FE8F`, fog, muted, alert, and the nine status colours. The reference's colours are mapped onto ours: its white body becomes black sections alternating with navy bands; its light beige buttons become lime (primary) or raised navy (`btn-soft`, for calls to action inside sections); its olive donation panel becomes our lime "Find a credible way to help" panel. White is used for the search box only.
- **Type: one family**, Plus Jakarta Sans (variable, weights 200–800, with a true italic for scientific names), from `@fontsource-variable/plus-jakarta-sans` 5.3.0 under the SIL Open Font License 1.1, self-hosted, so the CSP keeps `font-src 'self'`. Headings are bold, sentence case and slightly tight. Buttons stay small, bold and uppercase, with a CSS chevron (`.go`, `.more`). Body text is weight 450, because light text on black reads thin at 400. Anton, Space Mono and Inter are uninstalled. The staff JSON editor and image ids keep the system monospace stack (no web font).
- **Layout taken from the reference, not its content:**
  - header: logo on the left; Map, Compare and About as text links, then Explore as the solid lime button. These are PLAN's four links; only the order changes (Explore moves to the end, as the reference's main button). The compare counter is an outlined button beside it.
  - home: a photo hero under the header with the promise as the h1, a white search box and an "Explore all species" button, ending in a wide curve. Then the catalogue in numbers with four original line icons, a photo + text section on how we source facts, three threatened species as article cards, the animal-group photo tiles, a full-width photo banner for Compare, a "Where they live" section (environments and places beside a photo) and the lime help panel, whose photo has a curved edge.
  - inner pages open with a navy title band (`PageHeader`) with thin lime arcs in its corner. The profile keeps its own hero (D-035), now with a breadcrumb.
  - species cards are article-style: photo, the status badge as the card's tag, the name, the scientific name, a muted context line and the credit. No border or panel.
  - footer: brand and what the site is, then three link columns (Explore, About our data, Wildward).
- **Not copied:** BirdLife's logo, wording, photographs, icons and the white wing "swoosh" that belongs to their brand identity. Our curve is a plain quadratic curve traced by two thin lime arcs (`shell/Curves.tsx`). The four icons (`home/StatIcons.tsx`) are drawn for this site. Every photo is a catalogue photo with its credit.
- **Removed:** the lime announcement bar (the methodology is linked from the home page and the footer) and the giant cropped WILDWARD wordmark. The rising lines (D-036) stay, as a thin band above the footer's bottom row.
- **Home photos:** the hero is still the most threatened species with an approved photo. The other photo sections take the next threatened species with a photo that is not already on the page (`photoPicker` in `app/page.tsx`), preferring a mammal for the help panel, a marine species for "Where they live" and a bird for "How we source facts". So no photo appears twice, and a section with no photo left is shown without one. Each photo carries the species name and its credit.
- **Home figures:** two new counts, "Countries, seas and oceans" (regions from `GET /filters` with at least one species; location-sensitive species are not counted there) and "Animal groups". The band says "These count what this catalogue covers. They are not totals for the world." The numbers are static: no counting animation (PLAN §4 "no live counters").
**Consequences:**
- PLAN §4 "Style" now points here. D-034 still holds for the palette, the contrast figures and the focus ring. Its type, announcement bar and wordmark are replaced. D-036's decoration moved within the footer. D-037's tiles now show the name, count and "See species" at the lower left, with the caption under the tile.
- Contrast, computed with the WCAG formula: placeholder `#5B6470` on white 6.0:1; black on white 21:1; white on raised navy (`btn-soft`) 14.9:1; fog on navy 12.2:1; muted on navy 6.7:1; lime on navy 14.8:1; black on lime 18.5:1. Text over photos sits on dark scrims. Inside the white search box the button's focus ring is black and inset, because lime would vanish on white.
- One load animation: the hero headline, search and button rise in. `prefers-reduced-motion` turns it off.
- No API change. To go back, revert the frontend commit. `docs/STITCH_PROMPT.md` describes the D-034 look and is kept as history.

## D-039 Catalogue photos are never cropped (2026-11-22, owner request)
**Context:** after D-038 the cards, tiles and home sections cropped every photo to a fixed frame (`object-cover`). The owner pointed at the bald eagle card (head cut off) and the Atlantic puffin card (head cut off): "some animals are not fully seen … make them visible". Catalogue photos range from landscape to portrait, and there is no focal-point data to crop around.
**Decision:**
- Every catalogue photo in a fixed frame is shown whole (`object-contain`) through one component, `WholePhoto`. Where the photo's shape differs from the frame's, the gap is filled with a blurred, darkened copy of the same photo, so grids still look full and there are no empty bars. Both layers use the same URL and `sizes`, so the browser downloads the photo once. The copy is decorative (empty alt, `aria-hidden`).
- Where used: species cards, group tiles (photo pinned to the top, so the spare room falls under the text; the scrim now covers only the lower part behind the text), the home hero, the Compare banner (photo on the right, on top on phones, with the text over the blurred fill), the help panel, the home section photos, and `Photo` without `fit`. The profile photo already showed whole (D-035).
- The "Where they live" photo frame is 4:3 instead of 4:5, because most catalogue photos are landscape.
**Consequences:**
- Portrait photos appear narrower in landscape frames, with blurred sides. A focal point per image would allow tighter crops later. That needs an editorial field (BACKLOG candidate, not R1).
- One extra blurred layer per photo. Its cost is paint, not network.

## D-040 Photos on a dark stage: tried and reverted (2026-11-22, owner request)
**Context:** the owner liked the rusty patched bumble bee profile, whose specimen photo has a black background, and asked for the other animals to look the same. Of two options (cut the animals out of their photos, or fade each photo's edges into the dark page), the owner chose the fade.
**Decision:** a CSS mask faded every photo's edges into the page. Card images briefly carried their pixel width and height in the API so the fade could follow each photo's shape. After seeing it, the owner said "undo it, it is not looking good", so it was fully reverted the same day. The API, `openapi.json` and the generated frontend types are back to their committed state, and D-039 (whole photo with a blurred fill) is in force again.
**Consequences:** none remain in code. Cutting the animals out of their photos was not tried. It would need its own decision on the tool, the model licence and an attribution note ("background removed") for CC BY-SA photos.

## D-041 The owner's own collage as the home hero image, credit and licence pending (2026-11-22, owner request)
**Context:** the home hero showed seven threatened species from the catalogue in vertical strips, each credited. The owner sent a 2200 × 900 collage of eight animal close-ups in vertical strips (a lion, a bee, an orangutan, a spotted big cat, a gorilla, a cheetah, a fish and an owl) and asked to use "the exact image". The file carries no creator, copyright or licence metadata, and a web search on 2026-11-22 found no original source. The agent explained that the licence could not be verified. The owner answered "just put the image".
**Decision:**
- The hero shows the owner's collage, edge to edge with no blur, converted once to WebP (quality 80, 2200 × 900, 468 KB) and served from our own domain as `public/hero/wild-faces.webp`. It is not catalogue media: it has no image record, it does not go through the media loader (`unoptimized`), and it is not used anywhere else. The original PNG is not stored in either repo.
- Nothing names a creator or a licence, because none is known (AGENTS.md rule 4). The caption says "Header image: credit and licence pending".
- On phones the crop is centred on the spotted cat (`object-[42%_50%]`), so no seam between two strips runs down the middle of the screen. From `sm` up it is centred. The hero keeps its height, so on a 1440 × 900 screen the outermost strips (lion and owl) are partly cut off at the sides. Wider screens show all eight.
- The scrims, the curve and the entrance (a fade from a slight zoom, `.hero-in`, off with reduced motion) stay. The catalogue strips, their credits and `stripCredits` are removed. The home page now fetches 16 threatened species instead of 32, enough for the cards and the four section photos.
**Conflict with the plan:** PLAN §4 asks for "a hero photograph with credit", and AGENTS.md limits photos to CC0, PDM, CC BY and CC BY-SA. This hero meets neither until its source is known. It is recorded as a launch blocker in `docs/launch/OWNER_REVIEW.md` (open question 9) and as a pending row in `DATA_SOURCES.md`. Before a public launch the owner either confirms an allowed licence and the credit goes into the caption, or the image is replaced. Going back to the catalogue strips means restoring the D-038 hero from git.
**Consequences:** D-038's line "Every photo is a catalogue photo with its credit" no longer holds for the hero; it still holds for every other photo. The e2e check for the home page now looks for the hero image and its "pending" caption, and for the fixture photo and credit on a threatened-species card.

## D-042 The help panel's photo fills its curve, with no blurred fill (2026-11-22, owner request)
**Context:** under D-039 the home page's lime "Find a credible way to help" panel showed its mammal photo whole (`WholePhoto`), so a portrait photo (the Bornean orangutan, 400 × 518) sat in the middle of a wide frame with blurred sides. The owner pointed at it: "do not blur the edges of the images and make it fit".
**Decision:**
- In this panel only, the photo is a plain `next/image` with `object-cover` that fills the curved shape. There is no blurred copy. The crop is anchored above the middle (`object-[50%_30%]`), where heads usually are.
- On desktop the photo column is 28rem wide instead of 1fr of 2.2fr, so the frame is close to a portrait photo's shape and only a little is cut off. On phones the photo area has a fixed height (`h-80`, `sm:h-96`) under the text, with the curve on top as before.
**Consequences:**
- The photo is cropped a little. The panel picks the first available threatened mammal, so another photo could lose more, mostly at its sides if it is landscape. A focal point per image (the BACKLOG candidate from D-039) would allow a better crop.
- Every other frame still follows D-039 (whole photo with a blurred fill).
