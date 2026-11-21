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
