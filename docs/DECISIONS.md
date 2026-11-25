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
- Superseded in part by D-060 (2026-11-24): a self-hosted Protomaps basemap is drawn when its file is present; this Natural Earth land stays as the fallback, and the Natural Earth shapes still carry "Country-level presence".

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

## D-043 A rounded wordmark with lime W's (2026-11-22, owner request)
**Context:** the logo's name was set in Plus Jakarta Sans ExtraBold, all white. The owner sent an image of the name in a rounded, monoline face with a single-storey "a", the capital "W" and the lowercase "w" in lime and the other letters in white, and asked for "the logo text to this". The image does not name its font.
**Decision:**
- The agent rendered the name in seven free rounded faces (Quicksand, Fredoka at normal and condensed width, Comfortaa, Dosis, Baloo 2, Varela Round, M PLUS Rounded 1c) and compared them with the image. Quicksand Bold is closest: round single-storey "a" and "d", even strokes, rounded ends, open spacing. Its "W" is wider than the one in the image. No face tried matched that narrow "W" while keeping round bowls.
- Quicksand comes from `@fontsource-variable/quicksand` 5.3.0 (SIL Open Font License 1.1), bundled and served from our own origin like Plus Jakarta Sans, so the CSP keeps `font-src 'self'`. It is used only for the wordmark (`--font-logo`, `font-logo`). All other text stays in Plus Jakarta Sans (D-038).
- One `Wordmark` component (`components/shell/Mark.tsx`) is used in the header (1.5rem) and the footer (1.875rem). Both W's use the site's lime (`--color-lime`). The other letters take the surrounding colour (white). The letters stay in one text run, so the home link's accessible name is still "Wildward". The leaf mark beside it is unchanged.
**Consequences:** one more font file on every page (the Latin subset of Quicksand, about 25 KB). If the owner knows the exact font of the image and it has an allowed licence, swap the package and the `--font-logo` token. Nothing else needs to change.

## D-044 The map page's results list scrolls in its own box on large screens (2026-11-22, owner request)
**Context:** on `/map` at `lg` and wider, the map column was sticky and the results list ran down the page, one large card per species (45 cards, about 22,600 px in the dev catalogue). To reach the footer, or to get back to the filters, the owner had to scroll past every card.
**Decision:** from `lg` up, the list (`ul[data-testid="map-results"]`) scrolls inside a box exactly as tall as the map column. The box is positioned absolutely inside its grid cell, so the map column alone sets the row height. The map column is no longer sticky, because the page is now short. The heading and count stay above the box. Overscroll is left at the default, so when the list reaches either end the wheel carries on to the page. The cards are links, so keyboard users can reach the box, and focusing a card scrolls it into view. Below `lg` the layout is unchanged: one flow, with the list under the map.
**Consequences:** the `/map` page at 1512 × 862 is 1,951 px tall instead of the length of the whole list. The map itself still zooms on the mouse wheel (MapLibre default), so a scroll that starts over the map zooms it instead of moving the page. That is unchanged. Switching to "Ctrl/⌘ + scroll to zoom" (MapLibre `cooperativeGestures`) would be a separate decision. *(Taken in D-060, 2026-11-24: a plain scroll now moves the page.)*

## D-045 The leaf mark as the browser tab icon (2026-11-22, owner request)
**Context:** the site had no favicon (`/favicon.ico` returned 404), so browsers showed a generic globe in the tab. The owner pointed at the map page and asked to "put the logo here".
**Decision:** the Wildward leaf mark (the original line art in `components/shell/Mark.tsx`) becomes the tab icon, through the Next.js app-router file conventions in `src/app`:
- `icon.svg`: the mark in lime (`#d9fe8f`) on a black tile with rounded corners. On a light tab bar plain lime lines would almost vanish. The strokes are heavier than in the header mark so they hold at 16 px.
- `favicon.ico` (16, 32 and 48 px PNGs in one ICO) for browsers and tools that only ask for `/favicon.ico`.
- `apple-icon.png` (180 × 180, square corners, because iOS rounds them itself) for home-screen shortcuts.
The PNG and ICO files were rendered once from the SVG with the Playwright that is already a dev dependency, with no new tool. All three are same-origin, so the CSP is unchanged. Only the mark is used, not the wordmark, because the name would be unreadable at 16 px.
**Consequences:** if the mark changes, update `icon.svg` and render the PNG and ICO again.

## D-046 Species without a photo are archived in the dev catalogue (2026-11-22, owner request)
**Context:** on `/species` the owner saw "No photo yet" tiles and asked to "remove all of the species that doesn't have image". In the dev database 8 of the 49 published species had no photo on their published revision: the two real profiles Elkhorn coral (*Acropora palmata*) and Lord Howe Island stick insect (*Dryococelus australis*), for which no allow-listed Commons file names a creator, and the six synthetic `fictus-*` fixtures.
**Decision:**
- The 8 species are **archived** (`species.archived_at` set) and not deleted. Every public query starts from `PUBLISHED` in `catalogue-sql.ts` (or `findProfileBySlug`), which skips archived species, so they disappear from the list, the filter counts, the map, Compare, the home page and the sitemap, and their profiles return 404. Their revisions, sources and audit history are kept.
- There is no archive endpoint yet, so the change was made with one SQL transaction on the dev database. It wrote one `species.archive` row per species to `audit_events` (actor empty, summary names the owner request).
- The rule stays as it is in the code: the neutral no-photo state of PLAN §11 still exists, and no filter hides species without a photo. Showing only species with photos is a content choice, not a code rule.
**Consequences:**
- To bring a species back: `UPDATE species SET archived_at = NULL WHERE slug = '…'`, then revalidate `catalogue`, `filters`, `map` and `species:<slug>`.
- Only the dev database changed. The e2e database (`wild_e2e`) and the fixture seed are unchanged, so the e2e tests that use `fictus-*` profiles still work.
- The two real profiles are still in `catalogue/batch-1.json`. A fresh database that imports and publishes that file will show them again with "No photo yet", unless they are archived there too or a licensed photo is found.

## D-047 Catalogue batch 2: 40 species with photos, places, habitats, diet and threats (2026-11-22, owner request)
**Context:** the owner asked for "40 more species with proper image, proper information … maps, locations, habitats, everything", and then for every image to be downloaded rather than linked.
**Decision:**
- **The same pipeline as batch 1**, in `catalogue/batch-2.json`, imported as drafts:
  - GBIF Backbone for the accepted name, classification and synonyms. Synonyms that are only a letter or two away from the accepted name are left out, because GBIF lists misspellings.
  - Wikidata P141 for the IUCN category, cited second-hand with the edition its statement references. Trend stays Unknown.
- **One English Wikipedia revision per species** is the source for range countries and seas, habitats, diet, threats and any population figure. Facts are restated in our own words and no text is copied. Batch 1 used web search with no fixed source list for these sections. A single revision per species is easier to check again, and its licence is known (CC BY-SA 4.0). Before writing a country, the agent checked that the article names it in context. Places the article only mentions in passing (fossils, zoos, research projects) were left out. Where the list is partial, the geography citation's note says so.
- **Photos:** one per species from Wikimedia Commons, downloaded into `catalogue/media/` and imported from that file, not linked.
  - The licence was read from the Commons API when the file was downloaded, and the file's embedded copyright fields were compared with it.
  - Only CC0, public domain (stored as PDM), CC BY and CC BY-SA files with a named creator were used.
  - Where the Wikidata image failed these checks or was small, another Commons file was chosen.
- **Species dropped while preparing, with the reason:**
  - The giraffe: Wikidata's VU covers the giraffe as one species, but its item and article are now the narrower "northern giraffe".
  - The olm: the article now splits *Proteus* into nine species.
  - The European eel: the article names no range countries.
  - Spares took their places.
- **Maps:** country- and sea-level presence only (region rows), as in batch 1. No range polygons. Seasonality (breeding / non-breeding) and status (extinct, possibly extinct, reintroduced) are set where the article states them.
- **Publishing:** `scripts/publish-drafts.mjs` gains `--approve-media`. It approves the pending images attached to the drafts it publishes, through the normal admin API, so one command reviews and publishes the batch. Approval stays an admin decision, made by whoever runs the command with the admin password.
**Consequences:**
- Every batch-2 profile has a photo, countries or seas, habitats, threats, diet and either a cited population figure or an explicit "Unknown" with a note. Climate, measurements and conservation actions are still empty.
- All facts are second-hand (Wikidata, Wikipedia). Replace them with primary sources before any public launch, as for batch 1.

## D-048 The owner's savanna picture behind the Explore species header, credit and licence pending (2026-11-23, owner request)
**Context:** the Explore species page (`/species`) had a plain navy header with thin lime arcs. The owner sent a 6146 × 3202 picture of savanna animals in front of a snow-capped mountain and asked to "put the image behind this hero". It is a composite: animals photographed separately were placed together. The file carries no creator, copyright or licence metadata. Its look suggests a commercial stock image, but that is not verified. As with D-041, the licence cannot be checked.
**Decision:**
- `PageHeader` gains an optional `image` prop. With it, the photo fills the band in place of the lime arcs. A navy scrim (`panel`) keeps the text readable. On phones it is an even 75 % wash. From `md` up it fades from 95 % on the text side to clear on the right. A dark gradient at the bottom carries the caption. The entrance is the home hero's `.hero-in` (off with reduced motion). Without `image`, every other page's header is unchanged.
- Only `/species` passes an image. The file is converted once to WebP (2400 × 1250, quality 78, 343 KB, metadata stripped) and served from our own domain as `public/hero/savanna.webp`, `unoptimized` like the home hero. It is not catalogue media and the original PNG is not stored.
- The crop is anchored low (`object-[50%_80%]`), so the animals fill the short band rather than the sky.
- The caption says "Header image: credit and licence pending". It names no creator or licence, because none is known (AGENTS.md rule 4).
**Conflict with the plan:** as for D-041, the image licence allow-list (CC0, PDM, CC BY, CC BY-SA) is not met until the source is known. It is recorded as a pending row in `DATA_SOURCES.md` and as a launch blocker in `docs/launch/OWNER_REVIEW.md` (open question 10). If it turns out to be a paid stock image, the owner's "costs no money" rule also rules it out unless a licence was already bought.
**Consequences:** removing the photo means dropping `image={HEADER_IMAGE}` from `src/app/species/page.tsx`; the arcs come back on their own.

## D-049 The main navigation stays on top of every page (2026-11-23, owner request)
**Context:** the owner asked to "make the navigation clear in every page. Main navigation on the top." Before this change the nav row scrolled away with the page, so on long pages (a species profile is several screens) there was no way to reach another section without scrolling back up. Several versions were tried with the owner the same day:
- a solid black bar with four equal text links (Explore · Map · Compare · About) and the compare count folded into Compare;
- then, after the owner sent a reference screenshot of a travel site ("like this"), a bar that is transparent over the hero and solid once the page scrolls, with bold centred links;
- the owner asked for the links back on the right ("put these wherever they were before");
- then for the links themselves to look as before ("keep them the same"): Map, Compare and About as text, and Explore as the lime button.
**Decision:**
- The links, the Explore button and the compare counter are exactly as committed before this change (`NavLinks.tsx`, `CompareCounter.tsx` unchanged), as is the header layout, including two rows on phones.
- The header is now sticky (`HeaderBar`, a small client component). At the top of a page it is transparent, so the page's opening photo or navy band runs behind it. Once the page scrolls more than 8 px it turns solid black with a rule under it (a 200 ms colour transition, none with reduced motion).
- The home hero (as before) and now `PageHeader` too slide up under the bar by `--nav-h` and add it to their top padding. Every inner page uses `PageHeader`, so they all open the same way. Species profiles and staff pages start on the black canvas, where the transparent bar looks solid. When `PageHeader` has a photo (D-048), a dark band at its top keeps the links readable.
- `--nav-h` is unchanged (6.75rem on phones, 5.5rem from `md`). `html` has `scroll-padding-top: var(--nav-h)`, so anchor jumps land below the bar. The sticky elements below it are offset by `--nav-h`: the profile's "On this page" bar on phones and its side list from `md`, the info pages' contents list, and the home page's places photo.
**Consequences:**
- On phones the solid bar is two rows (108 px). On a phone profile, the bar and the "On this page" bar together take about 150 px of a 740 px screen. A one-row phone bar was tried and dropped, because the owner wanted the links kept as they were.
- PLAN §4 lists the navigation as Explore · Map · Compare · About; the bar still shows Explore last, as a button, as it has since D-038.
- The links' contrast over a photo depends on the scrims; axe cannot measure text over images.

## D-050 The owner's illustrated world map behind the Map page header, credit and licence pending (2026-11-23, owner request)
**Context:** the Map page (`/map`) had the plain navy header with lime arcs. The owner sent a 2000 × 1400 illustration of a world map with drawings of animals on each continent and in the oceans, on a pale grey and beige ground, and asked to put it "behind this hero page". The file carries no creator, copyright or licence metadata. As with D-041 and D-048, the licence cannot be checked.
**Decision:**
- The Map page passes the picture to `PageHeader` the same way as D-048. It is converted once to WebP (2000 × 1400, quality 80, 92 KB, metadata stripped) and served as `public/hero/world-animals.webp`, `unoptimized`. It is not catalogue media and the original PNG is not stored.
- The crop is centred a little above the middle (`object-[50%_45%]`), so Europe, Africa and Asia fill the band.
- The picture is much brighter than the site's photos, so `HeaderImage` gains an optional `light` flag. It adds an even 45 % navy shade over the whole picture, under the usual scrims. Without it, the pale right side glared against the dark page and the nav links and caption sat on near-white. Only the Map page sets it; the savanna header (D-048) is unchanged.
- The caption says "Header image: credit and licence pending". It names no creator or licence, because none is known (AGENTS.md rule 4).
**Conflict with the plan:** as for D-041 and D-048, the image licence allow-list is not met until the source is known. It is recorded as a pending row in `DATA_SOURCES.md` and as a launch blocker in `docs/launch/OWNER_REVIEW.md` (open question 11).
**Consequences:** removing the picture means dropping `image={HEADER_IMAGE}` from `src/app/map/page.tsx`; the arcs come back on their own.

## D-051 The owner's painting of a robot and animals behind the Compare page header, credit and licence pending (2026-11-23, owner request)
**Context:** the Compare page (`/compare`) had the plain navy header with lime arcs. The owner sent a 1260 × 720 painting of a robot facing a crow, a small striped animal, a zebra and a polar bear in an autumn forest, and asked to put it in the "compare page hero". The file carries no creator, copyright or licence metadata. Its style suggests it may be AI-generated, but that is not verified. If it is, the generator's terms decide how it may be used. As with D-041, D-048 and D-050, the licence cannot be checked.
**Decision:**
- The Compare page passes the picture to `PageHeader` the same way as D-048. It is converted once to WebP at its own size (1260 × 720, quality 82, 121 KB, metadata stripped) and served as `public/hero/compare-friends.webp`, `unoptimized`. The original PNG is not stored.
- The picture is small for a full-width band, so it is upscaled on wide screens. The painted style hides most of the softness.
- The crop is anchored high (`object-[50%_20%]`), so the robot's, the zebra's and the bear's heads stay in the band.
- The extra `light` shade (D-050) was tried and dropped: it greyed out the painting's orange and teal, and the usual scrims already keep the nav, title and caption readable.
- The caption says "Header image: credit and licence pending".
**Conflict with the plan:** the image licence allow-list is not met until the source is known. It is recorded as a pending row in `DATA_SOURCES.md` and as a launch blocker in `docs/launch/OWNER_REVIEW.md` (open question 12).
**Consequences:** removing the picture means dropping `image={HEADER_IMAGE}` from `src/app/compare/page.tsx`; the arcs come back on their own.

## D-052 The owner's photo of turtle hatchlings behind the About page header, credit and licence pending (2026-11-23, owner request)
**Context:** the About page (`/about`) had the plain navy header with lime arcs. The owner first sent a 740 × 493 flat illustration of animals around a pool and asked to put it on the About page "as hero page". After seeing it, the owner sent a 1280 × 720 photo instead: two cupped hands holding a handful of sea turtle hatchlings above deep blue water ("put this instead of the previous image"). Neither file carries creator, copyright or licence metadata. As with D-041, D-048, D-050 and D-051, the licence cannot be checked.
**Decision:**
- `InfoPage` gains an optional `image` prop that it passes to `PageHeader`. Only the About page sets it; Methodology, Privacy and Terms are unchanged.
- The photo is converted once to WebP at its own size (1280 × 720, quality 82, 68 KB, metadata stripped) and served as `public/hero/about-turtles.webp`, `unoptimized`. The original PNG is not stored. The illustration's file (`about-wild.webp`) is deleted and nothing refers to it.
- The crop is a little below the middle (`object-[50%_55%]`), so the hatchlings and hands fill the band. On desktop they sit in the middle, partly behind the lead text, under the navy scrim.
- The alt text says "sea turtle hatchlings" and names no species, because the species has not been identified from a source.
- The caption says "Header image: credit and licence pending".
**Conflict with the plan:** the image licence allow-list is not met until the source is known. It is recorded as a pending row in `DATA_SOURCES.md` and as a launch blocker in `docs/launch/OWNER_REVIEW.md` (open question 13).
**Consequences:**
- At 1280 px wide the photo is slightly upscaled on screens wider than that.
- Removing it means dropping `image={HEADER_IMAGE}` from `src/app/about/page.tsx`; the arcs come back on their own.

## D-053 Picture headers are tall, at full colour, with no wash over the picture (2026-11-23, owner request)
**Context:** the owner asked to "make each of the pages of like hero section bigger in length and do not blur the pictures behind the hero". No CSS blur was applied to these pictures. What made them look hazy was the navy scrim from D-048 (95 % → 75 % on the text side, an even 75 % on phones) and, on the Map page, the extra 45 % `light` shade from D-050. The headers were also short (about 425 px on a 1440 × 900 screen), so most of each picture was cropped away.
**Decision:**
- A `PageHeader` with an image is a tall hero: at least `max(34rem, 80svh)`, with the kicker, title, lead and any form anchored at the bottom, like the home hero. Headers without an image (Methodology, Privacy, Terms, Sources, Support, regions) keep their navy band and size.
- The navy scrim and the `light` option are removed. Only the text area darkens, with black gradients:
  - from the bottom on every screen (on phones up to 55 % of the height, and lightly to the top, because the text covers most of the band there);
  - from the left from `md` up, clearing by 65 % of the width;
  - a soft band at the top for the main navigation.
- The kicker, title and lead carry a soft text shadow. The form fields under them do not.
- The pictures and their crops are unchanged (D-048, D-050, D-051, D-052).
**Consequences:**
- On the Explore species page the results start below the first screen on a laptop. The search box is in the hero, so it is still the first thing in view.
- The Map page's pale picture relies on the gradients and shadow alone. Its lead text is readable at 1440 px and on a 360 px phone, but it has less contrast than over the darker pictures. axe cannot measure text over images.
- Small pictures are larger now, so their softness from upscaling shows more (the Compare painting is 1260 px and the About photo 1280 px wide).

## D-054 Hero typography: larger display sizes and lime for each page's promise (2026-11-23, owner request)
**Context:** the owner asked to "work on the design of text of each page", give it "some color style", and make "some parts of the font size bigger". The headings were modest (the home headline at most 3.5rem, page titles at most 3.75rem), and every lead was one grey paragraph.
**Decision:**
- **One colour rule:** lime marks what a page promises, in a `<strong>`, and nothing else. It is not used for decoration, and the nine status colours are not used for it, because they carry meaning.
  - Home: the headline is set as the three things the site does, one per line from `md` up, with the verbs in lime: *Understand* a species, / *see* where it lives, / and find a credible way to *help*. Spans keep the spaces, so the accessible name is unchanged.
  - About: the same three verbs in lime in its lead.
  - Explore species: the species count. Map: its first sentence, and "Country-level presence" (the label shown on the map). Compare: "no overall score". Methodology: "tied to a source you can check". Privacy: "without an account" and "we do not track you". Terms: "educational portfolio project". Support: "independent organizations" and "referral, not a donation". Sources: "with the date we read it". Region pages: "how they occur here".
  - Species profiles: the scientific name is lime italic (it was grey), a step larger.
- **Sizes:**
  - `h-hero` is now clamp(2.5rem, 5.4vw, 5rem) (was 3.5rem at most).
  - `h-page` is clamp(2.75rem, 6vw, 5.25rem) (was 3.75rem), and clamp(3rem, 7.5vw, 6.5rem) over a photo.
  - `h-section` is clamp(2rem, 3.4vw, 3rem) (was 2.5rem).
  - Tracking is tighter (−0.035em, −0.03em for sections). The profile's common name is a step larger.
  - Leads over a photo are white and 1.375rem from `sm`.
- **Weight:** display text stays at 700. Weight 800 was tried. Plus Jakarta Sans then opens visible gaps before commas and full stops at display sizes.
- `InfoPage`'s `lead` accepts markup.
**Consequences:**
- Every page now has one or two lime phrases in its opening. New pages should follow the same rule: one or two phrases, the page's promise, never a random word.
- Headings take more room; long titles wrap sooner on phones (checked at 360 px with no overflow).


## D-055 No credit or "pending" text on pictures; photo credits on their own page; no Next.js dev badge (2026-11-23, owner request)
**Context:** the owner asked to remove the text that is "not related to this project": the lines naming who took a picture, and the "Header image: credit and licence pending" captions. The owner also asked to remove the Next.js logo, the round "N" in the lower left corner. That badge is the Next.js dev-tools button. It appears only under `next dev`, never in a production build. Many catalogue photos are CC BY-SA 3.0 or 4.0, and those licences require crediting the creator, so their credits could not just be deleted. The agent asked how to handle them, and the owner chose to move them to a credits page.
**Decision:**
- **Header pictures** (home, Explore, Map, Compare, About): no caption. `HeaderImage.caption` and the home hero's caption are removed.
- **Catalogue photos:** no credit line under the profile photo, the species cards, the home group tiles or the home photo sections. The home captions keep the species name and its link. `Photo` shows only an optional editorial caption.
- **Where the credits are now:**
  - Each profile keeps its "Photographs" list under Sources (credit, licence, source link).
  - New public page `/credits`, built from the new `GET /api/v1/credits`. It reads through the PUBLISHED set only, uses the revision's credit and licence snapshots, and leaves out rejected images (a takedown, D-022). Grouped by species, with the licence linked to its deed.
  - The footer links to it on every page, as "Photo credits" in the "About our data" column. The bottom line no longer says "Photos: credited on every image".
  - `/credits` is in the sitemap. The Terms page and the staff media form now say where credits appear.
- `next.config.ts`: `devIndicators: false`. Build and runtime errors still open the error overlay in development.
**Conflict with the plan:** PLAN §4 asks for a "hero photograph with credit" on the home page and a "photo with credit" on profiles. Credits are now on the same profile page (Sources) and on `/credits`, not under each image. CC BY 4.0 and BY-SA 4.0 (§3(a)(2)) allow attribution "in any reasonable manner", including a link to a resource that holds the credit. The 2.0 and 3.0 licences also allow "any reasonable manner". A credits page linked from every page is common practice. It is the owner's call, and it is not legal advice.
**Consequences:**
- The five header pictures are still unlicensed launch blockers (OWNER_REVIEW 9–13; `DATA_SOURCES.md`). Removing the caption changes only what the page says, not their status. If one gets a CC BY licence, its credit must be added somewhere, for example on `/credits`.
- A photo shown on Explore, the home page or the map has its credit one click away (footer → Photo credits), not next to it.
- Putting credits back under the images means restoring the old `Photo` figcaption and the credit lines in `SpeciesCard`, `GroupTile` and `src/app/page.tsx`.

## D-056 The Wildward logo always leads to the home hero, in the header and the footer (2026-11-23, owner request)
**Context:** the owner clicked the Wildward logo in the footer of the home page and nothing happened. The owner asked that, wherever anyone presses it, the logo goes to the home page's main hero. Two causes were found and measured in Chrome:
- The footer logo was decorative (`<p aria-hidden>`), not a link.
- The header logo was a `next/link` to `/`. On the home page that is the same URL, so Next.js did not move. From the bottom of the home page, the page stayed at scrollY 5869.
**Decision:**
- New client component `src/components/shell/HomeLink.tsx`, used for both logos.
  - From any other page it is a normal link to `/`, which opens at the top.
  - On the home page it scrolls back up to the hero: smoothly, or instantly when the visitor prefers reduced motion. It then moves keyboard focus to the header logo, so Tab continues from the top and not from the footer.
  - The URL stays `/`, with no `#top`. Ctrl-, Cmd-, Shift- or middle-click still opens a new tab or window.
- The footer logo is now a real link named "Wildward", like the header's, and is no longer hidden from assistive technology.
**Consequences:** a new e2e test in `pages.spec.ts` covers both logos on the home page and the footer logo from `/species`, at desktop and 360 px.

## D-057 Staff form editor for text, tags and photos; the provider identifier stops blocking publication (2026-11-23, owner request)
**Context:** the owner asked for the admin pages to show the pictures of the animals that are published, to let an admin edit the information and tag species, and said that some things should not be mandatory: "entering ID and provider, some kind of links, of the pictures". Until now the staff pages showed no photograph at all, the whole revision was edited as raw JSON (D-011), and the publication checklist refused to submit or publish a species that had no provider identifier.
**Decision:**
- **Photos are visible in the staff area.** `StaffSpeciesDto` carries `publishedPhotos`: the photos of the published revision, each with that revision's own alt text, caption, credit and licence snapshot, plus the asset's review state now, and its pixel size. The species list shows a thumbnail (or a "none" box), and `/admin/species/[id]` lists each live photo with its alt text, credit, licence and a link to the Media page. The bytes come from the existing staff preview route, which needs the session cookie and serves any review state, so a photo that was sent back to review is still visible to staff.
- **A form replaces the JSON box for editorial content** (`src/components/admin/editor/`): photos (pick from the approved images, alt text, caption, order), common names and synonyms, group, environments, overview, classification, the "Not assessed" and "Unknown" switches, diet with its tags, climate ranges, measurements, biology and conservation actions. The form prunes blank text before saving, because the editorial schema rejects empty strings. The first photo in the list is the primary one, which is what the public SQL already prefers; roles and positions are renumbered on save, so a wrong combination cannot be entered. Alt text is required, and saving stops before the request when one is missing.
- **Still JSON, under "Advanced":** assessments, population estimates, regions, ranges, habitats, threats, citations and support links. Each of those rows carries a `sourceId`, so a form for them needs the source picker per row described in PLAN §7. That part of the editor stays open (D-011).
- **The provider identifier is advice, not a blocker.** `ChecklistItem` gained `blocking`, `checklistPasses` ignores non-blocking items, and the submit/publish 422 lists only blocking failures. The identifier item still appears in the editor, marked "recommended, does not block", with the reason (an import matches a species on it).
- **The picture links stay optional**, which the API already allowed: the source page URL and the licence deed URL are now labelled "(optional)" on the media form, and a missing source page is no longer coloured as an error.
**Not changed, on purpose:** the creator, credit line and licence of an image are still required, because CC BY and CC BY-SA require attribution and `validate:catalogue` checks that every published image has a credit. The import file schema still requires at least one identifier per species (`import-schema.ts`), because an import's whole matching strategy rests on it; that path is for bulk content, not for a person typing a profile.
**Conflict with the plan:** PLAN §7 lists "Accepted scientific name and at least one provider identifier" as a blocking checklist item. It is now advice. The owner asked for this, and the quality rules in PLAN §11 do not count identifiers. To restore the old behaviour, set `blocking: true` on the `identifier` item in `src/editorial/checklist.ts`.
**Consequences:**
- A species can be published with no GBIF or IUCN id, so a later import cannot match it by identifier and will match it by slug instead.
- The editor page is much longer than before. Both e2e axe passes over `/admin/revisions/[id]` still report no serious or critical violations.
- `e2e/staff-editor.spec.ts` covers the thumbnails, the form round-trip, the tag input, the photo picker, the alt-text guard and the non-blocking identifier.

## D-058 A smaller hero headline on the home page (2026-11-23, owner request)
*Written up on 2026-11-24 from the COMPLETED_TASKS entry of 2026-11-23, which named this decision but had no section here.*
**Context:** the owner asked for a smaller home-page headline. At `clamp(2.5rem, 5.4vw, 5rem)` it covered the animals' faces in the hero collage (D-041).
**Decision:** `h-hero` in `src/app/globals.css` is `clamp(2rem, 4.1vw, 3.875rem)`, with `line-height: 1.06` and `letter-spacing: -0.03em` so the three short lines stay readable at the smaller size. Only the home hero uses `h-hero`; `h-page` and `h-section` are unchanged.
**Consequences:** measured in headless Chromium, the headline is 59 px at 1440 px and 32 px at 360 px, with no horizontal overflow at either width. Other page headers are not affected.

## D-059 Four UI bug fixes and the population key fact (2026-11-24, owner request)
**Context:** a UI review of the dev site, with screenshots at 1440 × 900 and 360 × 740, found four bugs, and the owner asked for them to be fixed together with the profile's population fact:
- **Explore's "Apply filters" bar** was `sticky bottom-0` on every screen. On a laptop the tall header (D-053) leaves only the top of the filter sidebar in the first screen, so the bar sat over it: "Animal group", an empty box and a lime button.
- **The compare counter touched the logo at 360 px.** The header grid had no column gap; the logo ended at x = 178 and "COMPARING 2 OF 3" (164 px wide) started at x = 178.
- **The Map page was 37,662 px tall on a phone,** because all 79 species were listed under the map as full photo cards.
- **Filters that cannot narrow anything.** Explore offered "Trend unknown (81)" as the only trend. Region pages had the same problem, for example Namibia's "Origin here: Native (5)" and "Season here: Year-round (5)".
- **The profile's Population fact said "1 dated estimate"**, while the page had "19,800 mature individuals, 2024".
**Decision:**
- **Apply bar.** In the phone drawer it stays pinned to the bottom.
  - In the md+ sidebar it sits after the last filter until a filter changes. `FilterDrawer` then sets `data-dirty` and the bar is pinned to the bottom of the window. The rule is unlayered CSS in `globals.css` (`.filter-apply`), so it wins over Tailwind's `sticky` utility.
  - Every filter input has a 6rem bottom scroll margin. On a change, the input just used is scrolled into view (smoothly, or instantly with reduced motion), so the pinned bar never hides it. The margin also keeps a keyboard-focused filter clear of the bar (WCAG 2.4.11).
  - Applying filters on every tick was not done. It is a separate improvement the owner has not asked for.
- **Header.** The phone header grid has a 12 px column gap. The "Comparing" word of the counter is visually hidden below 380 px (was 360 px) and stays in the link's accessible name.
  - Measured: logo 158 px + gap 12 px + full counter 164 px + 40 px of page padding is 374 px. Below that, the counter reads "2 of 3" (72 px).
- **Map list.** The owner chose compact rows on every screen size.
  - Each species is one row (`SpeciesRow`): a 3:2 thumbnail shown whole through `WholePhoto` (D-039; the 320 px variant), the status badge, the names and "Shown on the map as: …".
  - The whole row is the link, like a card. On large screens the scroll box beside the map (D-044) now shows about 8 species at a time instead of 1.5.
  - Below `lg` the list starts with 12 rows and a "Show all N species" button. The button reveals the rest and moves focus to the first row that was hidden. Hidden rows are `display: none` until then, and nothing is hidden on large screens.
  - The list stays the full accessible equivalent of the map: every species is one button press away.
- **Filters that cannot narrow anything.** A filter is left out when all three hold:
  - it has a single option;
  - that option matches every species the page covers;
  - it is not selected.
  - A selected option always stays, so it can be unticked.
  - `onlyOneChoice` in `lib/explore-params.ts` holds the rule. Explore compares with the catalogue total from `GET /filters`. Region pages compare with the region's own total: the sum of the group facet counts, which count the whole region whatever is filtered, with one group per species.
  - When nothing is left to filter, the region page shows no filter panel.
  - Explore's lead lists only the filters on offer ("filter by group, environment, status, place and habitat").
- **Population key fact.** It shows one of the listed estimates, with its value and basis on one line and "Wild/Captive · place · year" under it ("date not stated" when the source gives none). With more estimates, a link reads "and N more estimate(s)" and goes to "How many remain?". No estimate still reads "Unknown".
  - Which estimate (`headlineEstimate` in `lib/labels.ts`): one with a figure, then a qualitative one, then an unknown one; wild before captive; global before regional; then the editor's order.
  - PLAN §5 still holds: the figure is never shown without its basis, context, place and year, and estimates are never added up or blended.
**Consequences:**
- On desktop the Apply button is no longer in view before the visitor changes a filter; pressing Enter in the search box still submits the whole form.
- `.filter-apply`, `.filter-panel` and `data-dirty` are a small coupling between `FilterDrawer`, `species/page.tsx` and `globals.css`.
- `SpeciesCard` is unchanged and still used on Explore, the home page, related species and region pages.
- New e2e tests:
  - `content.spec.ts`: the population fact for a range, wild-before-captive, qualitative and none.
  - `critical.spec.ts`: the Apply bar, desktop only.
  - `pages.spec.ts`: the counter gap.
  - `geography.spec.ts`: one-choice filters on region pages.

## D-060 An interactive map on a self-hosted Protomaps basemap (2026-11-24, owner request)
**Context:** the owner asked to "make the map interactive", following the UI review:
- shade places by the number of species;
- select a place to see its species;
- link the list to the map.
While that was in progress the owner asked to use the OpenStreetMap map (openstreetmap.org), then said the Protomaps example (maps.protomaps.com/examples/basic.html) "looks better".
- **Checked 2026-11-24.** OSM's own tile servers come with a usage policy: best effort, may be blocked without notice, attribution and Referer rules. The example loads its tiles from `latest.protomaps.com` and its fonts and icons from `protomaps.github.io`; Protomaps discourages hotlinking its builds.
- **Conflicts with loading either live:**
  - AGENTS.md: "A published page must never depend on a live third-party API".
  - The privacy page: "Your browser makes no requests to other companies".
  - The CSP: `connect-src 'self'`.
- **The plan already allows this:** PLAN §3 names "a self-hosted Protomaps vector basemap" as the planned upgrade.
- **The owner chose the dark theme** out of dark, light (as in the example) and black (minimal).
**Decision:**
- **Self-hosted basemap.** `npm run basemap:fetch` (frontend) writes everything into `public/basemap/` (git-ignored), where Next.js serves it from our own origin with byte ranges:
  - `world.pmtiles`: zoom 0–6 of the pinned build `20261123`, 45 MB, cut with the `pmtiles` CLI;
  - the Noto Sans glyphs and the dark icons from `protomaps/basemaps-assets` at a pinned commit;
  - a `NOTICE.txt` with the sources and licences.
  The licences are listed in `DATA_SOURCES.md`: ODbL data, BSD-3 software, OFL fonts, MIT-derived icons. The CSP, the privacy page and the offline e2e checks stay true unchanged.
- **Theme.** Protomaps' `dark` theme from `@protomaps/basemaps` 5.7.2. Its land and water take the site's colours (`MAP_COLORS.land`, `MAP_COLORS.water`), so the map sits in the page.
  - Our layers sit between the base map and its labels, so names stay readable over the shading.
  - The attribution "Protomaps © OpenStreetMap" plus "Boundaries: Natural Earth" is always expanded (`compact: false`).
- **Fallback.** `WorldMap` first sends a `HEAD` for the file. When it is missing, or the server cannot serve byte ranges, the map draws the Natural Earth land of D-004 as before.
  - "Country-level presence" always uses our Natural Earth shapes from `GET /map/basemap`, the shapes `Near me` and region pages use.
  - Errors after the first frame (a missing tile or label) no longer replace the map with the failure notice. Before the first frame they still do.
- **Interaction (Map page only):**
  - **Shading.** Places are shaded in four fixed steps by how many species of this catalogue, matching the filters, are recorded there: 1, 2–3, 4–7 and 8+, at 25 %, 42 %, 60 % and 80 % lime. The steps are fixed so the legend does not change with the filters, and the legend draws the same swatches. Seas and oceans are large boxes, so they are shaded at 40 % of that, with a fainter outline, and the legend says so. The profile map keeps one shade.
  - **Hover label.** On devices that hover with a fine pointer, a label follows the pointer ("Tanzania · 8 species") and the place gets a thin white outline. On touch screens there is no label.
  - **Selection.** Clicking or tapping a shaded place selects it: a thicker white outline, and a panel in the map's top left corner with its type, name, species count, a link to its region page and a close button. The list narrows to that place's species: "8 of 26 species in this view are recorded in Tanzania", with a "Show all" button. A published range works the same way, with a link to the profile. Clicking elsewhere, the close button, "Show all", or panning the place out of view clears the selection.
  - **List to map.** Pointing at or keyboard-focusing a species in the list outlines its places (and range) on the map.
  - **Accessibility.** The list stays the full equivalent of the map. The count line is a live status, so a selection is announced. The panel's close button is a real button with an accessible name.
- **Implementation:**
  - Hover, selection and links are MapLibre feature states: `promoteId` is `slug` for places and `species` for ranges.
  - The count shading is a `match` expression rebuilt with each data load.
  - The whole style passes `validateStyleMin` from `@maplibre/maplibre-gl-style-spec` with no errors.
**Basemap fetched (same day):**
- A direct download of the go-pmtiles binary was blocked by the agent's permission rules. After the owner asked for `brew install pmtiles`, the agent ran it: Homebrew core formula 1.31.2, BSD-3-Clause.
- `npm run basemap:fetch` then wrote `world.pmtiles`: 45.1 MB, zoom 0–6, 3,399 tile entries, OSM replication 2026-11-23. It took 41 s.
- On screen:
  - the browser reads the file in byte ranges, with no request to another origin and no console error;
  - the map shows "Protomaps © OpenStreetMap";
  - selection and hover work over it.
- The dark theme's labels (greys #5c5c5c to #7a7a7a) were muddy over the lime shading. Country names are now `#dcdcdc`, cities `#c8ced6` with a darker halo, and states and oceans `#9aa4b2`. The selection panel and the pointer label are now opaque, so map labels do not show through them.
- Our 1:110m Natural Earth shapes sit roughly on the detailed coastlines. The difference shows only on close inspection at zoom 4–6.
**Consequences:**
- The web image is about 58 MB larger once the basemap is fetched (45 MB map file, 13 MB of fonts).
- `DEPLOYMENT.md` runs `npm run basemap:fetch` before building. A deployment that skips it still works, with the plain map.
- To move to a newer build, change `BUILD` in `scripts/fetch-basemap.mjs` and run it again.
- To go back to D-004 alone, delete `public/basemap/`.
- The selection is not kept in the URL; region pages are the shareable view of a place.
- **Bigger list photos (same day, owner request: "too small to look at").** The map list's row photos (`SpeciesRow`, D-059), 3:2 and still shown whole:
  | Screen | Before | After |
  |---|---|---|
  | Phones | 104 px | 136 px |
  | Tablets | 120 px | 208 px |
  | lg | 120 px | 160 px |
  | xl | 120 px | 200 px |
  - From xl the list column is 30rem instead of 24rem. Below lg the list is one column instead of two.
  - On 2× screens the photos load the 640 px variant.
  - At 1512 px the map is 806 px wide and the list box shows about 4 species at a time.
- **A wider, taller map, with smaller list text (same day, owner request: "make the map bigger … text of animals smaller … lots of space left on both sides").**
  - The Map page body uses the new `.wrap-wide`: 32 px side margins instead of `.wrap`'s 56 px padding inside 90rem, capped at 120rem.
  - The list column is 28rem from xl (was 30rem).
  - From lg the map fills the window under the sticky nav (`max(32rem, 100svh − nav − 2.5rem)`, was `70vh`). Phones keep 55vh, so one-finger scrolling is not trapped by the map.
  - List text: names 17 → 15 px, scientific names 14 → 13 px, notes 13 → 12 px, heading 24 → 20 px. The photos keep their size.
  - At 1512 × 945 the map is 966 × 815 (was 806 × 662).
  - The page header and the site nav keep `.wrap`, so the logo is further in than the map's left edge.
- **Antarctica cut, and a 3:2 map (same day, owner request: "cut the antarctica … it is hard to scroll down").** The full-height map left no page to scroll on, and Web Mercator draws Antarctica huge.
  - `WORLD_VIEW` (`geo.ts`) is every longitude from 84° N to 60° S, fitted without padding.
  - `viewFor` uses it when there is no bbox, and when the bbox spans every longitude (a zoomed-out view saved in the URL).
  - From lg the map box is 3:2, the shape of that view. It is at least 28rem tall and at most the window under the nav, and `w-full` stops the minimum height from widening it.
  - At 1512 × 945 the map is 966 × 643, with 202 px of page below it in the first screen.
  - The cut is only for the picture. A view that spans every longitude asks the API for the whole world, so the list keeps the emperor penguin (Antarctica): 79 species.
  - `minZoom` is −2 so a narrow map can zoom out further. On a portrait phone MapLibre still will not show past the poles, so the phone's first view covers about ±141° and lists the species in it (76).
- **Scrolling moves the page; Ctrl + scroll zooms the map (same day, owner request).** `cooperativeGestures: true` on every map (the Map page and profiles). This replaces the scroll-to-zoom behaviour noted in D-044.
  - MapLibre 6 zooms on Ctrl + wheel everywhere and on ⌘ + wheel on a Mac, so a trackpad pinch (sent as Ctrl + wheel) still zooms. On a touch screen one finger scrolls the page and two fingers move the map. A tap still selects a place.
  - Hints: "Use Ctrl + scroll to zoom the map", "Use Ctrl or ⌘ + scroll, or pinch, to zoom the map" on a Mac, and "Use two fingers to move the map" on touch. They are styled in the site's type (`globals.css`). The hover label clears when the hint shows.
  - The map's wrapper is `isolate`, because the hint's z-index of 99999 otherwise painted over the sticky nav.
  - The hint under the legend says how to zoom.

## D-061 Device cookies against lockout abuse; the admin-only routes are a reviewed list (2026-11-24, owner request)
**Context:** the owner asked to talk about security, authentication and authorization, then to fix the findings from easiest to hardest. Two came out of the review:
- **Lockout abuse.** The per-email lockout (D-010) also refused the correct password. Anyone who knew or guessed the admin's email could send about ten wrong passwords and then one every 15 minutes. That kept the account locked indefinitely, far below every rate limit (20 per IP per 15 min in the API, 10 per minute in Nginx).
- **Authorization tests.** PLAN §13 asks for tests of authorization on every staff route. The 401 test already read every route from OpenAPI, but the editor-gets-403 tests covered only 6 of the 13 admin-only routes.
**Decision:**
- **Device cookies,** after OWASP's "Slow down online guessing attacks with device cookies":
  - A successful sign-in sets `__Host-ww_device` (`ww_device` on plain-HTTP development): HttpOnly, Secure, `SameSite=Strict`, 180 days. It holds a random 32-byte token, and the new table `staff_devices` stores only its SHA-256, the user, created, last used and expiry. No IP address or user agent is stored.
  - **Rotation and limits:** the token changes on every sign-in. A user keeps at most 10 devices, and expired ones are dropped.
  - **Sign-in:** a browser with a valid device token for that user is not affected by the email lockout. It gets its own failure count with the same backoff (5 free, 30 s doubling, 15 min cap). Its failures do not count against the email, and its success does not unlock the email for strangers. The per-IP limit applies to everyone.
  - **Logout keeps the cookie:** it only says this browser once signed in, and it is not a session. Disabling an account or setting a password forgets every device of that account (D-062).
  - **New table, not a reuse of `staff_tokens`:** those tokens are one-time links (D-062), with different lifetimes and meaning. Migration `drizzle/0006_staff_devices.sql`, generated, adds only that table.
- **The admin-only routes are a reviewed list.** `auth.spec.ts` reads every `@Roles('admin')` route from the running app's controllers (`ROLES_KEY` is exported from `staff.guard.ts` for this). It checks that set against a written list and calls each route as an editor (403 `FORBIDDEN`) and as an admin (anything else). A route that gains or loses the restriction fails the test until the list is changed on purpose. Removing `@Roles('admin')` from media reject made it fail as expected.
**Consequences:**
- The privacy page lists the device cookie and what is stored about it.
- The throttle is still in memory (D-010). A restart clears both the email and the device counts; the devices themselves are in the database.
- An attacker who steals a device cookie gets only the right to guess passwords at that device's own backoff rate, not a session.

## D-062 Staff accounts: invites, password links, disabling, roles (2026-11-24, owner request)
**Context:** PLAN §7: "Admins invite staff by generating a one-time link that is shown once in the UI. R1 sends no email." This was open and unassigned (ARCHITECTURE). Without it, adding an editor, resetting a forgotten password or removing someone's access needed hand-written SQL, and `admin:create` makes only admins and refuses an existing email. The `staff_tokens` table (`invite`/`reset`) had existed since M0 without use.
**Decision:**
- **API** (`src/identity/staff-users.*`), admin only, including reading the list:
  - `GET /staff/users`: name, email, role, status (`active`, `invited` for no password yet, or `disabled`), created, last active, open sessions. Only timestamps and a count are read from the sessions table.
  - `POST /staff/users {email, name, role}`: an account without a password, plus its invite link.
  - `POST /staff/users/:id/link`: a new invite link (no password yet, 7 days) or reset link (24 hours). Earlier unused links of that account stop working. Refused for a disabled account.
  - `PUT /staff/users/:id {role?, disabled?}`: a role change applies to open sessions at once, because the guard reads the role on each request. Disabling ends every session, device and open link in the same transaction.
  - `POST /staff/users/:id/sign-out`: ends every session of the account and keeps its password.
- **No admin can lock themselves out.** An admin cannot change their own role or disable themselves (422 `SELF`). The acting admin therefore always stays an active admin, so the site never ends up without one.
- **Links:**
  - A one-time 32-byte random token. Only its SHA-256 is stored in `staff_tokens`.
  - The admin sees the link once, in the response to the call that made it, sent with `Cache-Control: no-store`.
  - The token is in the URL fragment (`/admin/set-password#token=…`). Browsers never send fragments, so it reaches no server or Nginx log and no Referer. The page removes it from the address bar and history as soon as it has read it.
- **Using a link** (no session): `POST /staff/auth/link/check {token}` says what the link is for and whose it is. `POST /staff/auth/link/redeem {token, password}` sets the password and signs the person in.
  - Both check Origin and share the login's per-IP budget (PLAN §9: rate limits on login and token endpoints).
  - Expired, used, replaced and unknown links all get the same 400 `LINK_INVALID`.
  - Redeeming also ends every other session, device and link of the account, because a reset may follow a stolen password.
- **Changing your own password:** `POST /staff/auth/password {currentPassword, newPassword}`, with a session and CSRF.
  - Wrong current passwords count towards the same lockout as sign-in.
  - Every other session and device ends, and this browser gets a fresh device cookie.
- **Recovery without a signed-in admin:** `npm run staff:link -- <email>` (`node dist/cli/staff-link.js` in the container) prints a link for an existing account. It runs on the server only, and the audit log records it with no actor and "(server CLI)". This covers a solo admin who forgets the password.
- **Web:**
  - `/admin/staff` (admin only, in the staff bar): the list, an invite form, and per-account actions. The link panel says the link is shown once, works once, and that anyone with it can set the password.
  - `/admin/account`: your details, and changing your password.
  - `/admin/set-password`: the one staff page that works without a session.
- **Audit:** every action has a fixed summary with ids and no email (`staff.invite`, `staff.link`, `staff.role`, `staff.disable`, `staff.enable`, `staff.sign_out`, `staff.password_set`, `staff.password_change`). A test checks that no staff summary contains `@`.
**Consequences:**
- Admins pass links on themselves. If email is added later, the same tokens and pages work, and only the delivery changes.
- Nothing yet lets anyone change a name or email: an admin disables the account and invites the person again. That is enough for R1's handful of staff.
- Not built: two-factor sign-in (TOTP). PLAN only rules out SMS. It needs the owner's decision (BACKLOG, technical follow-ups).

## D-063 A photo wall of threatened species on the home page (2026-11-25, owner request)
**Context:** the owner had two React component kits made in a Claude desktop session (saved in `~/Documents/component-kits`): a picture-rail gallery (framed prints on a rail: hover lights one, drag slides it, click lifts it and turns it over) and a testimonial globe. The owner asked to use one "for animals on the main home page" with its own screen component. The globe was ruled out: PLAN §4 says to avoid 3D globes, and it is built for customer reviews. The gallery's kit asked for shadcn/ui, a demo route and demo photos from a third-party CDN. This site has no shadcn, its CSP allows images from our own origin only, a published page must not depend on a third party, and photos must be licensed and never cropped (D-039). The kit's code carries no licence or copyright notice and loads nothing from outside.
**Decision:**
- **The component** is copied as-is to `RedList-frontend/src/components/ui/picture-rail-gallery.tsx`, with two changes: the carousel dots sit in 24 × 24 px buttons (WCAG 2.2 target size, 2.5.8; axe flagged the 6 px dots at 360 px), and one `eslint-disable-next-line` for its plain `<img>`. No demo route and no demo photos.
- **Theme:** `globals.css` gains a `@theme static` block of shadcn-style names mapped onto our palette (background = canvas, card = raised navy, foreground and card-foreground = white, muted-foreground = the muted grey, border = rule, ring and chart-2 = lime). Our own `muted` stays the muted text grey. Inside the wall it is repainted raised navy, because the component uses `muted` as the backing behind a loading photo. `dark:` now always applies (`@custom-variant dark`), because the site is dark only; nothing else used `dark:`.
- **The screen:** `components/home/SpeciesWall.tsx`, a full-screen section ("Meet the animals") right after the catalogue in numbers. It holds up to 7 threatened species. Each frame shows the common name, the scientific name and the IUCN category as text, and its back label shows the group, environments, assessment scope and year, and the number of places (or "Locations withheld"). A link under the rail leads to the profile of the last species lit; the rail unlights when the pointer leaves it, so the link must not change on the way to it. A second link goes to all threatened species. No autoplay. The component honours `prefers-reduced-motion`.
- **Photos:** catalogue photos only, from our own API (`/api/v1/media/<key>/960.webp`). The API's card image now carries the original `width` and `height` (`CardImageDto`), so each frame takes the photo's own shape and nothing is cropped. The rail accepts shapes from 0.4 to 2.5 (width ÷ height); a photo outside that range is left off the wall (`fitsWall` in `app/page.tsx`). Credits stay on `/credits` and the profile (D-055).
- **Which species:** the home page's threatened list grows from 16 to 48 (the API maximum). The wall picks after every other photo section, so their picks do not change and no photo appears twice. Frame by frame it wants the next category in turn (CR, EN, VU, of those the list has) and a new animal group, and photos not on a group tile come first. With today's dev catalogue the wall is Chinese alligator, African bush elephant, Chinese giant salamander, giant oceanic manta ray, helmeted hornbill, Queen Alexandra's birdwing and peacock tarantula.
- **Loading:** the rail is drawn in the browser (it measures its width and places frames with script). The server renders the heading, the link and a placeholder of about the rail's height. The rail is hung when the section comes within 600 px of the screen, then loads all 7 photos at once, so the phone carousel never swipes onto a photo that is still loading.
**Consequences:**
- A small, additive API change: `width` and `height` on every card image (species lists, map, regions, the group tile examples).
- PLAN §4's home page list does not include a gallery; this is an owner-requested addition, like D-037. It uses a 3D tilt on hover and a swing on drag, but no autoplay, globe, counter or video.
- The e2e fixtures have one photo, and the home cards take it, so the e2e suite does not render the wall. It was checked by hand against the dev catalogue (axe, keyboard, 360 px, reduced motion, same-origin only). More synthetic fixture photos would let e2e cover it (BACKLOG, technical follow-ups).
- To remove the wall: delete `<SpeciesWall>` and `wallPicks` from `app/page.tsx`. The component and the theme block can stay unused.
- **Replaced the same day by D-067:** the section is now a filmstrip of species (`SpeciesStrip`). `SpeciesWall` and the picture rail component are deleted; the API change and the theme block stay.

## D-064 A globe of threatened species on the home page: two rules set aside (2026-11-25, owner request)
**Context:** after the photo wall (D-063) the owner asked where the testimonial globe was. The agent had left it out because PLAN §4 says "Avoid 3D globes", and said that using it for animals would also crop photos to circles, against D-039. The owner answered "ok break the rules then". The kit (`~/Documents/component-kits/testimonial-globe`) is built for customer reviews: a quotation, a name, a city, a star rating and counters. It needs `cobe` 2, a WebGL globe library: MIT-licensed (checked 2026-11-25 in the package's LICENSE). It has no dependencies, and its land map is an image embedded in its code, so it loads nothing from another host and fits the CSP (`img-src data:`).
**Decision:**
- **Two exceptions, both the owner's call:** a 3D globe on the home page (PLAN §4 now points here), and round crops of catalogue photos in its pins and cards (D-039 still holds everywhere else).
- **Where:** a full-screen section, "Around the world", after the photo wall (`components/home/SpeciesGlobe.tsx`). The owner did not say whether it should replace the wall; it was added after it, which keeps the wall and is easy to undo.
- **Pins come from the database, never from invention.** New `GET /api/v1/map/pins?species=a,b,…` (at most 48 slugs; spatial SQL in `GeoRepository.pins`). For each published species it gives one point inside one country, sea or ocean where the species is recorded as living: present (extant, probably or possibly) and native or reintroduced. Firmer records come first (extant, native, resident), then the smallest such place, so the pin lands as close to the species as region-level data allows. The point is `ST_PointOnSurface` of the place, rounded to 0.001°. It marks the place, not the range, and the card says "Recorded in <place>". Species with hidden locations never get a pin, even by slug; `generalize_country` species may, because their countries are already public. Introduced, vagrant and extinct records never place a pin.
- **Which species:** after the wall, from the same list of up to 48 threatened species, those whose photo is not yet on the page and that have a pin. Each pin keeps 20° of arc from the others (a pin is about 12° wide at the middle of the globe), then 10° if candidates run short; a new animal group is preferred. At most 8, ordered west to east.
- **The card says what the catalogue says:** status with its scope and year, then "Recorded in <place> (and N more countries and seas)". The name links to the profile. The scientific name and group are under it. There are no star ratings, no quotation and no counters.
- **Changes to the vendored component** (`components/ui/testimonial-globe.tsx`), each marked in the code:
  - `quotes={false}`: plain text, no quote mark, no `<blockquote>`;
  - `counters={false}`: no review, average or country counters;
  - an optional `href` per item for the name, with 24 px tall links (target size);
  - names and places wrap instead of being cut off;
  - while the globe turns on its own, card swaps are not announced (`aria-live="off"`); a card the visitor asks for still is;
  - lint fixes, without changing behaviour.
  - Every ring is lime (`--color-chart-1` to `-5`): colour means nothing on the globe.
- **Motion:** the globe turns slowly, with no autoplay. "Pause motion" stops the rotation and every CSS animation inside the globe (WCAG 2.2.2). With reduced motion it never turns and the button is hidden. The component also pauses off screen and in background tabs.
- **Loading:** like the wall, the globe starts its WebGL canvas and loads its photos when the section comes within 600 px of the screen.
**Consequences:**
- One new public endpoint and one new frontend dependency (`cobe`, pinned exactly to 2.0.1, because the component's pin projection must match cobe's own rotation).
- A pin shows one place among those where the species lives, chosen by size. A widespread species is pinned on its smallest place, for example the tiger on Bhutan, and the card says how many more places there are. Places that are far apart, such as the parts of Malaysia, can put a pin a few hundred kilometres from the species.
- Without WebGL the component shows a wireframe globe with the same pins, cards and links.
- The e2e fixtures do not draw the globe (one fixture photo, used by the home cards), as for the wall (BACKLOG). The pins endpoint has integration tests. The globe was checked by hand against the dev catalogue on a production build.
- To remove the globe: delete `<SpeciesGlobe>`, `globePicks` and the pins request from `app/page.tsx`, and `cobe` from `package.json`. The endpoint can stay.

## D-065 Staff area guard: no staff session, back to the home page (2026-11-25, owner request)
**Context:** `/admin` showed the staff sign-in form to anyone who opened it, and the other staff pages showed it as well. The owner asked for an admin guard: someone without a staff session who opens the staff area should be sent to the home page. Sign-in therefore needed a page of its own. The owner chose `/admin/sign-in`. They also chose that editors keep the staff area, with only the admin-only pages closed to them. The API already authorizes every staff request (`StaffGuard`, and `@Roles('admin')` on admin routes). This guard only decides where a browser lands.
**Decision:**
- **Open without a session:** `/admin/sign-in` (new) and `/admin/set-password` (D-062). Every other `/admin` page needs a session.
- **On the server:** `src/proxy.ts` redirects (307) to `/` any staff page request that carries no session cookie (`__Host-ww_session` or `ww_session`), before anything renders. The proxy checks only that the cookie exists. It does not call the API, so page requests stay as fast as before.
- **In the browser:** the staff layout's `SessionGate` asks the API who is signed in (`GET /staff/auth/me`). If the answer is 401 (an expired, revoked or forged session), or the page is admin-only (`/admin/staff`) and the user is an editor, it sends the browser to `/` and renders none of the page. Signing out also lands on `/`.
- **Sign-in:** a successful sign-in goes to `/admin`. Someone already signed in who opens `/admin/sign-in` goes straight to `/admin`.
- The path rules are in one place, `src/lib/staff-paths.ts`, used by both the proxy and the layout.
**Consequences:**
- Staff now sign in at `/admin/sign-in`. Bookmarks to `/admin` work once signed in; signed out they lead home. ADMIN_GUIDE, DEPLOYMENT and both READMEs give the new address.
- `/admin` no longer says that a staff area exists, but this is not a security boundary: the API is. The `robots.txt` rule for `/admin` stays.
- An editor who opens `/admin/staff` is sent home rather than shown a message.
- e2e: `staff-guard.spec.ts` (new) and an editor check in `staff-accounts.spec.ts`. The sign-in tests and the axe and CSP page lists use `/admin/sign-in`.
- **Changed the same day by D-066:** staff sign in on the form for everyone at `/sign-in`, and `/admin/sign-in` is gone. The guard itself is unchanged.

## D-066 Optional visitor accounts and one sign-in form for everyone (2026-11-25, owner request)
**Context:** After D-065 the owner's staff session had expired (12 hours idle), so `/admin` sent them home, and nothing on the site led to `/admin/sign-in`. The owner then asked for a sign-in or sign-up page for everyone: an admin who signs in goes to the admin page, and a regular person who signs in stays on the site as a user. PLAN puts public accounts in R2 ("with verification, reset and deletion"). R1 sends no email. The privacy page promised "No accounts, no sign-up". The agent laid this out and asked; the owner chose to build visitor accounts now. Addresses cannot be verified, a forgotten password cannot be reset by email, and signed-in visitors get nothing extra yet (saved collections are R2 too).
**Decision:**
- **Separate from staff.** Visitor accounts have their own tables (`public_users`, `public_sessions`), cookies (`ww_account`, `ww_account_csrf`; `__Host-` prefixed with `COOKIE_SECURE`) and guard (`AccountGuard`, the same session, Origin and CSRF checks as `StaffGuard`). StaffGuard never looks up a visitor session, and AccountGuard never looks up a staff one. Tests check both directions.
- **One email, one kind.** An address is a staff account or a visitor account, never both. A trigger on both tables (`0008`) enforces it under races. The staff invite and sign-up check first. Sign-up gives the same 409 for a staff address and a visitor address.
- **One sign-in form,** `POST /auth/sign-in`. A staff email takes the staff sign-in path unchanged (moved into `StaffSignInService`, which `POST /staff/auth/login` also uses), with the D-061 device cookies and lockout. Any other email signs in to a visitor account: same per-IP budget and per-email lockout, no device cookies. The answer's `kind` tells the web app where to go: staff to `/admin`, a visitor back to `?next=` (our own public pages only) or home. Signing in or up ends the browser's other session, so a browser holds one identity.
- **Sign-up:** name (1 to 80 characters), email and password, with the staff password policy (at least 12 characters, no placeholders). It signs in at once and shares the per-IP budget of sign-in.
- **Sessions:** 7 days idle, 30 days at most. Signing out deletes the session row. Changing the password deletes the other sessions. Deleting the account needs the password and deletes the account at once, with its sessions. No IP address or user agent is stored, and visitor actions are not audited. A staff session ended by a visitor sign-in in the same browser is audited as a sign-out.
- **Web:** **Sign in** at the top of every page: last in the nav from md up, beside the logo below md. Signed in, it shows the visitor's name (a person icon below lg) linking to `/account`, or Staff area. New pages: `/sign-in`, `/sign-up` and `/account` (noindex; `/account` is also disallowed in `robots.txt`). `/admin/sign-in` (D-065) is removed. The header learns who is signed in from the readable CSRF cookies, so a visitor who never signed in costs no API request.
- **Phone header:** to fit the account link beside the logo and the compare counter, "Comparing" shows from 440 px (was 380 px, D-059), and the logo is one size smaller below 340 px. Measured with no horizontal overflow from 320 to 1280 px, signed out and signed in, with species picked.
- **Privacy page** rewritten from the code: accounts are optional; what an account stores; its two cookies; no email; deletion, and that backups made before a deletion keep a copy, so a restore brings the account back.
- **`LOGIN_IP_LIMIT`** (default 20 attempts per address per 15 minutes) is now a setting, so the e2e stack, whose browsers all share one address, can raise it.
**Consequences:**
- Part of R2 is built early. Email verification, reset by email and saved collections stay in BACKLOG. PLAN's "Build R1 only" line points here.
- Wildward now stores personal data of members of the public. Nobody qualified has reviewed the privacy text for legal adequacy. The operator answers for that data, its backups and contact requests (set `CONTACT_URL`).
- A visitor who forgets the password cannot get back in, and the address stays taken. They can sign up with another address. Deleting an account for someone who cannot sign in takes a database statement; there is no tool for it yet.
- Sign-up says whether an address already has an account (staff or visitor). Without email, any sign-up form does.
- A school or office behind one address shares the 20 attempts per 15 minutes (BACKLOG).
- `POST /staff/auth/login` stays for the API tests; the web app no longer calls it.

## D-067 The home photo wall becomes a filmstrip of species (2026-11-25, owner request)
**Context:** the owner had a third kit made in the Claude desktop session, `filmstrip-scrub`: a large 16:9 preview over a strip of thumbnails with a spring-loaded playhead. Hover or drag along the strip and the preview cross-fades through the frames; a badge shows a timecode and a phase name; left alone for 3 seconds it scrubs itself at 0.9 frames per second, turning back at the ends. The owner pasted the kits' guide, with a screenshot of the "Meet the animals" photo wall (D-063), and asked to "implement this instead of the screen section on the homepage". The kit's prompt asked for shadcn's `cn` helper, a demo route and demo photos from a third-party CDN, and to leave the component unchanged. The kit is built for one subject over time (a time-lapse), not for photos of different animals: its preview crops to 16:9 (against D-039), its timecode would be a made-up number on these photos, and its continuous self-scrub would show two species blended most of the time. Its code carries no licence notice; its own comment calls it a "clean-room original". The kit was in a Claude desktop scratch folder that is deleted with that session, so it was copied to `~/Documents/component-kits/filmstrip-scrub` with the other two kits, together with the guide's newer copy (which only adds the filmstrip).
**Decision:**
- **The section** "Meet the animals" (`components/home/SpeciesStrip.tsx`) replaces `SpeciesWall` in the same place, after the catalogue in numbers. `SpeciesWall.tsx` and `components/ui/picture-rail-gallery.tsx` are deleted. Both are in git history, and the kit is in `~/Documents/component-kits`.
- **The component** is the kit's file in `components/ui/filmstrip-scrub.tsx`, with its hooks in `components/ui/filmstrip-scrub-utils/motiq.ts`. Every change is marked in the code (Wildward lint fix / addition, D-067):
  - lint fixes without changing behaviour: the `hydrated` flag comes from `useSyncExternalStore` instead of setting state in an effect, and the two refs written during render are refreshed in layout effects;
  - `timecode={false}` leaves the timecode out of the badge, so it shows the species name only;
  - `settle`: when the pointer leaves the strip or a drag ends, the playhead eases onto the nearest whole frame, so the preview never rests on a blend of two species;
  - one `eslint-disable-next-line` per plain `<img>`, which Wildward does not use.
  Both additions default to the kit's behaviour.
- **`cn`:** `src/lib/utils.ts` joins class names. There is no shadcn, clsx or tailwind-merge. Nothing passes the component a class that conflicts with its own.
- **Photos:** catalogue photos only, from our own API, through the kit's `node` field: each frame is a `WholePhoto` (D-039), whole with a blurred fill, in the preview and in the thumbnails. No demo route and no demo photos (third-party CDN, CSP). Images load lazily; the section renders on the server.
- **Which species:** 10 (the kit reads best with 8 to 24), picked as the wall picked: after every other photo section, categories in turn, a new animal group per frame, photos not on a group tile first. The rail's shape limit (`fitsWall`) is gone, because every shape is shown whole.
- **Motion:** the kit's continuous self-scrub is off (`idleSpeed={0}`). Instead the section steps to the next species every 4 seconds with the kit's spring and turns back at each end. It waits while the pointer is over the strip or the panel, while keyboard focus is in them, while the strip is off screen and while the tab is hidden. "Pause motion" stops it (WCAG 2.2.2). With reduced motion it never moves by itself, the playhead jumps, and the button is hidden. Pointing along the strip still cross-fades through the photos as the kit does.
- **Beside the strip** (below it on phones), a panel names the current species, with its scientific name, its status badge (category and year), its group, environments and number of places (or "Locations withheld"). It has an "Open profile" link, the pause button and "See all threatened species". Every species' details share one grid cell and only the current one is visible, so the panel's height never changes and nothing under it moves. The panel is not a live region: the strip's slider value already says "Frame 3 of 10, <name>".
- **Colours:** the kit's own colour names are set on the component: navy panel surfaces, and lime for the playhead, the current thumbnail's outline and the badge's dot. `--color-border` was already the rule colour site-wide. Its rounded corners and monospace badge are kept as the kit drew them.
- **Size:** from `lg` up the preview is as wide as the height left on the screen allows (between 28 and 60 rem), so the whole strip is in view once the section is scrolled to, down to 1280 × 720.
**Consequences:**
- D-063's screen and component are replaced. Its API change (card image `width` and `height`) and its `@theme static` block stay: the globe uses the block, and the card sizes are harmless.
- The section moves on by itself, as the globe does. D-063 had no autoplay.
- During a jump of several frames (End, or holding an arrow key), the kit reports each frame the playhead passes, so the slider's value briefly climbs through them. Single steps report once. This is the kit's own design and was left as it is.
- On a 360 px phone the 10 thumbnails are about 26 px wide, each showing its whole photo small with a blurred fill. The kit's cropped thumbnails would be fuller, but D-039 forbids cropping.
- The kit's code, like the picture rail's (D-063), carries no licence or copyright notice. It loads nothing from outside.
- e2e still does not draw the section (one fixture photo, BACKLOG). It was checked by hand against the dev catalogue (see COMPLETED_TASKS).
- To go back to the wall: restore `SpeciesWall.tsx`, `picture-rail-gallery.tsx` and `wallPicks`/`fitsWall` in `app/page.tsx` from git (commit `eb39a27`).

## D-068 "How we source facts" becomes pinned photo cards (2026-11-25, owner request)
**Context:** the owner had a fourth kit made in the Claude desktop session, `scroll-cards` (`CardsParallax`): full-screen sections, each with a centred 600 × 400 photo card showing a large title and a lowercase description, which stay pinned (`position: sticky`) while the next card slides up over them. The owner pasted the kits' guide, now listing this kit, with a screenshot of the home section "How we source facts" (a photo beside three numbered rules), and asked to "implement this to this page on the homepage". The strip (D-067) and the globe (D-064) already use the other kits, so this one goes on the section in the screenshot. The kit's prompt asked for a demo route, demo photos from a third-party CDN (`cdn.21st.dev`, added to `images.remotePatterns`), photos cropped with `object-cover`, and its two fonts from `next/font/google`: Manrope, and Source Serif 4 as a free stand-in for its paid Tiempos Headline. Its code carries no licence notice. The kit was in a Claude desktop scratch folder that is deleted with that session, so it was copied to `~/Documents/component-kits/scroll-cards` with the guide's newer copy (a diff showed it only adds this kit).
**Decision:**
- **The section** keeps its heading, introduction, three rules (word for word) and "Read the methodology" link. The heading and introduction are centred above the cards and the link sits below them. Each rule is one card, with a short title: "Sourced", "Measured", "Reviewed". These are labels for the existing rules, not new claims. It lives in `components/home/SourceCards.tsx`. The old two-column layout and the `RULES` list in `app/page.tsx` are gone.
- **Species cards** (2026-11-26, owner: "add more species"): four more cards follow the rules, each a threatened species from this catalogue. The title is its common name. The description holds only catalogue data: the IUCN category, "(regional)" for a regional assessment, ", assessed <year>" when the assessment has a date (a missing date is left out, never guessed), and the animal group, e.g. "critically endangered · fish". The caption links to the profile. Only species with a common name are picked, because the kit's title is plain text and a scientific name must be set in italic.
- **Size** (2026-11-26, owner: "make it bigger"): the kit's 700 × 300 / 600 × 400 px card becomes as large as the screen allows. On phones it is up to 26 rem tall. From `md` up it is 3:2, the shape of most catalogue photos, and as wide as the screen (less 2 rem a side) and the height left under the navigation allow, at most 68.75 rem (about 1040 × 690 px on a 1512 × 860 laptop). The type grows with it: titles up to 128 px, descriptions up to 36 px. A title over 18 characters (a long species name) is one step smaller, so it fits above the caption.
- **The component** is the kit's file in `components/ui/scroll-cards.tsx`, with the kit prompt's three fixes: `fill` instead of `layout="fill"`, `sizes`, and `max-w-full` so the card fits a phone. Its fourth fix (delete the unused `TOP_VALUES` and `i`) applies only if lint reports errors. Lint reports warnings, so they stay. Every Wildward change is marked in the code (D-068):
  - two optional fields: `media`, shown instead of the `src` image (`src` is now optional), and `caption`, a line at the card's foot;
  - a 55 % black scrim between photo and text. White text over it keeps at least 4.76:1 even over a pure white pixel (WCAG AA), whatever the photo;
  - the title is an `h3`, under the section's `h2`, centred when it wraps;
  - the card and type sizes above;
  - the cards pin below the sticky navigation (`top: var(--nav-h)`, one screen minus the navigation tall) instead of at the top of the screen, so the navigation never covers one;
  - a card with keyboard focus inside comes to the front (`has-[:focus-visible]:z-10`). Tabbing backwards does not scroll, so a pinned card's link was otherwise focused under the next card (WCAG 2.4.11, found by a scratch check);
  - the photo layer clips its content (for WholePhoto's blurred fill), and the kit's fallback image has an empty alt instead of "Background".
- **Photos:** catalogue photos only, from our own API, each a `WholePhoto` (D-039): whole, with a blurred fill. There is no demo route, no demo photos and no `remotePatterns` (CSP `img-src 'self'`, D-039, and a published page must not depend on a third party). The first card keeps the section's bird pick. The other two rule photos, then the four species, are taken after the globe and prefer an animal group the section does not show yet, so no other section's photos change. A card without a photo keeps the navy panel. Each photo is captioned with its species, linked to its profile, like every other photo on the page (credits on /credits, D-055).
- **Fonts:** `@fontsource-variable/source-serif-4` 5.3.1 and `@fontsource-variable/manrope` 5.3.0, both SIL Open Font License 1.1 (checked in each package's LICENSE), self-hosted from npm like Plus Jakarta Sans (D-038). The CSP keeps `font-src 'self'`, and the build does not fetch from Google. The component imports them. `globals.css` maps the kit's class names (`font-tiemposHeadline`, `font-manrope`) to them. Source Serif 4 stands in for Tiempos Headline.
- **Motion:** none by itself. The cards move only as the page is scrolled.
**Consequences:**
- The section is about seven screens tall (one per card, less the navigation). With the larger cards, the empty space around each card is small.
- Two typefaces besides Plus Jakarta Sans on the home page, against D-038's single family. They are the kit's look, and only this section uses them. The browser downloads them only where the cards are shown: Latin files of 51 KB (Source Serif 4) and 25 KB (Manrope).
- The descriptions are set in lower case, as the kit draws them. The text itself keeps its capitals, so screen readers and copy-paste are unaffected.
- Six more catalogue photos on the home page. They are picked last, so with fewer free photos it is the source section that goes without (fewer species cards, rule cards without photos), never the strip or the globe. `SOURCE_SPECIES` in `app/page.tsx` sets the number of species cards.
- In the dev catalogue the four species' assessments have no date, so their cards show the category without a year.
- `npm run lint` shows the kit's two unused-variable warnings, with no errors.
- e2e has one fixture photo, which goes to the home cards, so in e2e the three rule cards are navy panels without photos and there are no species cards (BACKLOG). The section's headings and links are still in the e2e axe runs on `/`.
- To go back: restore the section and `RULES` in `app/page.tsx` from git (frontend commit `9aa52b0`), delete `sourceSpeciesPicks`, `SourceCards.tsx`, `scroll-cards.tsx` and the two font tokens, and uninstall the two font packages.

## D-069 Catalogue batch 3: 100 species, and faster Commons downloads (2026-11-26, owner request)
**Context:** the owner asked to "add 100 more species, download the images faster and publish them yourself". Batch 2's downloads were slow because Wikimedia rate-limits anonymous clients (HTTP 429). The owner declined to send any contact details (repo URL or email) in the User-Agent, which would have raised the limit.
**Decision:**
- **Same pipeline as batch 2 (D-047)**, in `catalogue/batch-3.json`: GBIF Backbone for names and classification, Wikidata P141 for the IUCN category (cited second-hand with its edition), one English Wikipedia revision per species for places, habitats, diet, threats and population figures, restated in our own words.
- **Faster downloads without contact details:**
  - only Wikimedia's standard thumbnail widths (1280, else 960, else the original), which are cached;
  - licence metadata read 40 files per API call;
  - one download at a time, about 2.5 s apart, waiting exactly as long as `Retry-After` says.
  - A first attempt with 4 parallel downloads triggered long 429 back-offs (about 2 minutes per photo); sequential fetching averaged about 16 s per photo.
- **Candidates dropped while preparing, with the reason:**
  - leopard: the article gives no clear country list;
  - reindeer and king cobra: taxonomy split or species complex in the current article;
  - aldabra giant tortoise: no IUCN statement on Wikidata;
  - two tapirs, gaur, pygmy hippo and green and golden bell frog: GBIF accepts a different name;
  - chinchilla, Greek tortoise and Knysna seahorse: the article covers captivity or has no wild diet or threats;
  - mountain chicken: its islands are too small for our map;
  - northern hairy-nosed wombat, southern bluefin tuna, corroboree frog and Franklin's bumblebee: no suitable allow-listed photo;
  - helmeted water toad, goliath frog and angelshark: the photo does not clearly show the living animal;
  - plus a few with very short articles.
- **Published by the agent**, at the owner's request, with `scripts/publish-drafts.mjs --approve-media` as the owner admin. The licences were checked first (see COMPLETED_TASKS).
**Consequences:** the dev catalogue has 181 published species. As with batches 1 and 2, all facts are second-hand and must be replaced with primary sources before any public launch.
