# Claude Code task prompts: run one at a time

M0–M3 are **done**: see COMPLETED_TASKS.md. Both repos contain `AGENTS.md` (the rules) and a `CLAUDE.md` that imports it, so Claude Code loads the rules automatically at the start of every session.

## How to run a milestone
1. Start a **fresh** Claude Code session in the backend folder with the frontend added. Each milestone should begin with a clean context:
   ```
   cd ~/Developer/RedList-backent
   claude --add-dir ../RedList-frontend
   ```
   (Inside an existing session, run `/clear` and then `/add-dir ../RedList-frontend` instead.)
2. Optional: press Shift+Tab to switch to plan mode, so Claude proposes a plan for the milestone before editing anything.
3. Paste **one** prompt below. Paste only that one.
4. When Claude stops, review the diff and check the gate yourself before you start the next milestone.
5. If a session runs out of context mid-milestone, Claude writes a **CHECKPOINT** entry in COMPLETED_TASKS.md (see AGENTS.md). Start a new session with: `Read docs/COMPLETED_TASKS.md and continue the CHECKPOINT for milestone Mx.`

---

## M0 — Feasibility and scaffold (done, kept for reference)
```
Read AGENTS.md and docs/PLAN.md fully. Do milestone M0 only.

1. Inspect the repository. Summarize what already exists and any conflicts with the plan in docs/DECISIONS.md.
2. Check the current stable versions of Node LTS, Next.js, NestJS, Drizzle, PostGIS and MapLibre from official sources, and confirm they are compatible with each other. Pin them and record your reasoning in DECISIONS.md.
3. Scaffold both repos as laid out in PLAN §3 (npm), shared config, and docker compose with a PostGIS service plus a test profile.
4. Write docs/DATABASE.md with the schema sketch and a Mermaid ER diagram, including any deviations from PLAN §6 with justification.
5. Write docs/DATA_SOURCES.md as the field-by-field source matrix from PLAN §8. Mark each row approved, pending or unavailable, and link the current terms pages. Do not claim any permission was granted.
6. Create docs/BACKLOG.md (R2–R4), docs/COMPLETED_TASKS.md and the page map in docs/ARCHITECTURE.md.

Gate: npm install, typecheck and lint pass in both repos. docker compose starts PostGIS and SELECT postgis_version() succeeds. Log the evidence in COMPLETED_TASKS.md, then stop.
```

## M1 — Working species slice
```
Read AGENTS.md, docs/PLAN.md and docs/COMPLETED_TASKS.md. Do milestone M1 only.

Implement:
- (The schema, constraints and triggers already exist in drizzle/. Add new migrations only for changes.)
- The editorial JSONB zod schema, version 1, plus synthetic dev fixtures (PLAN §7).
- The admin bootstrap CLI, staff login with sessions, CSRF and rate limiting (PLAN §9).
- Draft → submit → publish for one species with the publication checklist and optimistic concurrency.
- Public GET /api/v1/species/:slug, plus a profile page that renders all eight sections from persisted data, with "Unknown" states.
- Source and media attribution with snapshots, and revalidation on publish.
- Export the API contract (backend `npm run openapi:export`), then regenerate the frontend types (`npm run contracts:generate` in ../RedList-frontend, which writes src/contracts/api.d.ts). Never write API types by hand.

Use the synthetic fixtures from PLAN §7.

Tests (integration, real PostGIS):
- A draft edit does not change public output.
- After publish, the new revision is visible.
- Unauthorized and CSRF-less mutations are rejected.
- A concurrent publish conflict is rejected.
- Population CHECK constraints reject invalid rows.

Gate: show those tests passing, plus a manual curl/browser walkthrough logged in COMPLETED_TASKS.md. Stop.
```

## M2 — Discover and compare
```
Read AGENTS.md, docs/PLAN.md and docs/COMPLETED_TASKS.md. Do milestone M2 only.

Implement:
- GET /api/v1/species with search, filters, sort and pagination as specified, plus /filters and /compare (max 3).
- The /species explore page with URL-synced state, mobile filter drawer, chips, reset, and empty and error states.
- The home page (catalogue-coverage stats only).
- The compare page (no scores, no mixed-unit charts, "Not directly comparable" shown explicitly).
- Related species on the profile.

Playwright tests at desktop and 360px: search → filter → profile → add three species to compare → Back restores the filters. Compare must render Unknown and mixed bases correctly.

Gate: Playwright passes, and there is no horizontal overflow at 360px. Log it, then stop.
```

## M3 — Geography and support
```
Read AGENTS.md, docs/PLAN.md and docs/COMPLETED_TASKS.md. Do milestone M3 only.

Implement:
- Import of region boundaries from Natural Earth and Marine Regions (if its licence is approved in DATA_SOURCES), simplified for display.
- /regions/[slug].
- /api/v1/map with bbox validation, antimeridian handling and result and vertex caps.
- The /map page using the basemap chosen in DECISIONS, with a synced list, legend and labelled layer types. Country-level shading where no range exists. Tiles failing must leave the list working.
- Generalization for sensitive species.
- The organization and support-link admin, /support, and the profile "How can I help?" section.

Tests:
- bbox validation including the antimeridian.
- A sensitive species' precise geometry is absent from every public endpoint.
- Playwright map run with tile requests blocked.

Gate: tests pass. Log it, then stop.
```

## M4 — Content operations and real catalogue
```
Read AGENTS.md, docs/PLAN.md and docs/COMPLETED_TASKS.md. Do milestone M4 only.

Implement:
- Media upload: validate, re-encode, strip metadata, generate variants. Plus a review queue and the licence allow-list.
- The import CLI (dry-run, apply, change report, idempotency, --reconcile).
- Rollback.
- npm run links:check and npm run validate:catalogue.

Then prepare the initial catalogue as import files: real species only, every fact cited to a source you actually checked, images only with verified allow-listed licences. Fewer profiles is acceptable; fabricated ones are not. Mark anything you could not verify as Unknown and list it in COMPLETED_TASKS.md.

Tests:
- Re-importing the same file produces zero changes.
- Rollback is audited.
- Credits and licences survive a source or media edit.
- Profiles render with outbound network blocked.

Gate: validate:catalogue passes. Log it, then stop.
```

## M5 — Release verification
```
Read AGENTS.md, docs/PLAN.md and docs/COMPLETED_TASKS.md. Do milestone M5 only.

Do:
- An accessibility pass (axe plus a keyboard walkthrough of the core pages).
- SEO: metadata, sitemap, robots, canonical URLs, structured data.
- Security headers and CSP.
- Production docker compose with a private DB network, an Nginx config, and health checks.
- Backup and restore scripts for PostgreSQL and media.
- Complete every document listed in PLAN §13.

Verify from a fresh clone: README setup, production build, the full critical Playwright suite, and a backup → wipe → restore rehearsal.

Final report in COMPLETED_TASKS.md:
- Working features.
- Commands and tests actually run, with results.
- Remaining issues.
- Unavailable data or integrations.
- The recommended next milestone.

Do not deploy publicly. Stop.
```
