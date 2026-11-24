# Completed tasks

## 2026-11-24: Interactive map on a self-hosted Protomaps basemap (owner request, D-060)

**What changed (frontend):**
- `components/map/WorldMap.tsx`:
  - Draws the self-hosted Protomaps dark theme (`pmtiles://` from `/basemap/world.pmtiles`, with fonts and icons from `/basemap/`) when the file is there, and the Natural Earth land of D-004 when it is not.
  - With `interactive`: count shading, a hover label (mouse only), click/tap selection reported through `onPick`, and `linkedSpecies` outlines. All of it uses feature state.
  - Errors after the first frame no longer replace the map.
- `components/map/MapExplorer.tsx`:
  - Selection state and a panel in the map's corner: type, name, count, link to the region page, close.
  - The list narrows to the selection, with "Show all".
  - List rows outline their places on hover or focus.
  - A short hint under the legend.
- `components/map/MapLegend.tsx`: the count steps as swatches (`counts`), and a note that seas and oceans are shaded more lightly.
- `components/map/colors.ts`: `COUNT_STEPS`, `countStep`, `focus`, `marineFactor`.
- `lib/labels.ts`: `REGION_TYPE_LABEL`, now shared with region pages.
- New `scripts/fetch-basemap.mjs` (`npm run basemap:fetch`). `public/basemap` is git-ignored.
- New dependencies, exact versions: `@protomaps/basemaps` 5.7.2 and `pmtiles` 4.5.0 (BSD-3-Clause), plus `fflate` (MIT).
- e2e, `geography.spec.ts`: selecting Tanzania narrows the list, links to `/regions/tanzania`, and clearing brings the list back.

**What changed (docs):** D-060, D-004 (note), `DATA_SOURCES.md` (basemap rows, approved), `DEPLOYMENT.md` (fetch step), `ARCHITECTURE.md`, `AGENTS.md` (command).

**Commands run, with results:**
| Command | Result |
|---|---|
| OSM Tile Usage Policy, OSM copyright page, Protomaps docs, npm registry and GitHub licence checks | read 2026-11-24; summarised in D-060 and `DATA_SOURCES.md` |
| download and run the `pmtiles` CLI (go-pmtiles 1.31.2) | **not run**: blocked by the agent's permission rules. `world.pmtiles` does not exist yet |
| frontend `npm run basemap:fetch -- --skip-tiles` | fonts (13 MB) and dark icons fetched; `/basemap/fonts/Noto%20Sans%20Regular/0-255.pbf` and `/basemap/sprites/v4/dark.json` return 200 from the dev server |
| the Protomaps-mode style (77 layers) through `validateStyleMin` | 0 errors |
| Playwright on the dev site `:3000`, fallback basemap | world view shaded in 4 steps, oceans lighter. Hover over the USA: label "United States of America · 14 species" and an outline. Click: panel, "14 of 27 species in this view are recorded in United States of America", 14 rows. Clear: back to 27. Pointing at African penguin outlines Namibia, South Africa and the South Atlantic Ocean. Tanzania: "8 of 26". At 360 px with touch: tap selects, no hover label, 0 px overflow. No request to another origin |
| `HEAD`/`Range` on `public/` files from Next.js | `Accept-Ranges: bytes`, 206 for a range request |
| frontend `npm run typecheck`, `npm run lint`, `npm run build` | pass |
| frontend `npm run test:e2e` with `E2E_DATABASE_URL` → Postgres.app `wild_e2e` on 5432 | **60 passed, 4 skipped** (58 before, plus the new test at desktop and 360 px) |

**Follow-up, same day: bigger photos in the map list (owner request).**
- `SpeciesRow`: the photos are 136 px on phones (was 104), 208 px on tablets, 160 px at lg and 200 px from xl (was 120).
- `MapExplorer`: the list column is 30rem from xl, and one column below lg.
- Measured: 200 × 133 at 1512 px, using the 640 px variant on a 2× screen. No overflow at 360, 768, 1024, 1280 or 1512 px.
- typecheck, lint and build pass.
- e2e `geography`, `critical`, `release` and `a11y-extra`: **34 passed, 4 skipped**.

**Follow-up, same day: a bigger map, smaller list text, narrow side margins (owner request).**
- `globals.css`: new `.wrap-wide`. `map/page.tsx` uses it.
- `MapExplorer`: list 28rem from xl, gap 2rem, and the map fills the window under the nav from lg. The heading is `text-xl`.
- `SpeciesRow`: text 15, 13 and 12 px.
- Measured on the dev site:

  | Width | Map | Side margins |
  |---|---|---|
  | 1512 × 945 | 966 × 815 (was 806 × 662) | 32 px (was about 92) |
  | 1280 × 800 | 734 × 670 | 32 px |

  The map's lower edge is inside the window at both widths. No horizontal overflow and no text overflow at 360, 768, 1024, 1280 or 1512 px.
- typecheck, lint and build pass.
- e2e `geography`, `critical`, `release` and `a11y-extra`: **34 passed, 4 skipped**.

**Follow-up, same day: Antarctica cut, a 3:2 map (owner request).**
- `geo.ts`: `WORLD_VIEW` and `viewFor`.
- `WorldMap`: `fitView`, and `minZoom` −2.
- `MapExplorer`: the map box is 3:2 from lg, and a view that spans every longitude asks for the whole world.
- Measured on the dev site:

  | Width | Map | Species listed |
  |---|---|---|
  | 1512 × 945 | 966 × 643, 202 px of page below it | 79 |
  | 1280 × 800 | 734 × 489 | 79 |
  | 1024 × 768 | 542 × 446 | 79 |
  | 768 | 702 × 561 | 79 |
  | 360 (portrait phone) | 318 × 405 | 76 (the view covers ±141°) |

  No overflow at any of these widths.
- The first try let `min-height` widen the 3:2 box to 670 px in a 544 px column at 1024 px; `w-full` fixed it.
- typecheck, lint and build pass.
- Full e2e: **60 passed, 4 skipped**.

**Follow-up, same day: scrolling moves the page, Ctrl + scroll zooms the map (owner request).**
- `WorldMap`:
  - `cooperativeGestures: true`, with our own hint texts;
  - the hover label clears on `cooperativegestureprevented`;
  - the wrapper is `isolate`.
- `globals.css`: the hint is styled in the site's type.
- `MapExplorer`: the hint under the legend says how to zoom.
- Playwright on `:3000` at 1512 × 945:

  | Action | Page scroll | Map view |
  |---|---|---|
  | Plain wheel over the map | 780 → 1080 | unchanged; hint shown |
  | Ctrl + wheel | stays at 780 | zoomed in |

  - The hover label clears when the hint shows.
  - The first try showed the hint's scrim over the sticky nav. With `isolate`, the topmost element at the logo is the nav again.
  - At 360 px with touch, a tap still selects Tanzania.
- typecheck, lint and build pass.
- Full e2e: **60 passed, 4 skipped**.

**Follow-up, same day: the Protomaps basemap fetched and checked.**
- The owner's `brew install pmtiles` had not completed: `brew info` said "Not installed". The agent ran `brew install pmtiles` (1.31.2, Homebrew core, BSD-3-Clause), then `npm run basemap:fetch`.
  - Result: `world.pmtiles`, 45.1 MB, zoom 0–6, 3,399 tile entries, OSM data of 2026-11-23, in 41 s. Fonts and icons came to 13 MB.
- Playwright on `:3000` at 1512 × 945, on the world view, Tanzania, Europe and the African penguin profile:
  - 38 range requests to `/basemap/world.pmtiles`;
  - 0 requests to another origin and 0 console errors;
  - the attribution reads "Boundaries: Natural Earth (public domain) | Protomaps © OpenStreetMap";
  - selecting Tanzania works over the new basemap.
- `WorldMap`: the labels are brighter (the theme's greys were muddy over the lime shading).
- `MapExplorer`/`WorldMap`: the selection panel and the pointer label are opaque.
- Sizes in the docs, README, `.gitignore` and the fetch script corrected from estimates (60 and 80 MB) to the measured 45 MB plus 13 MB.
- typecheck, lint and build pass.
- Full e2e, now served the basemap: **60 passed, 4 skipped**, including the CSP and offline profile checks.

**Known gaps:**
- Our 1:110m Natural Earth shapes sit roughly on the detailed coastlines. Small mismatches are visible at zoom 4–6.
- The basemap is fixed at build `20261123`. Updating it means changing `BUILD` in `scripts/fetch-basemap.mjs` and fetching again.
- A machine without `public/basemap/` (for example CI) uses the Natural Earth fallback and logs one 404 per map load.

## 2026-11-24: Four UI bug fixes and the population key fact (owner request, D-059)

A UI review of the running dev site (screenshots of 9 pages at 1440 × 900 and 360 × 740) found these four bugs; the owner asked for them to be fixed together with the profile's population fact.

**What changed (frontend):**
- **Explore Apply bar:**
  - `components/explore/FilterDrawer.tsx` sets `data-dirty` once a filter changes, and scrolls the input just used clear of the bar.
  - `app/species/page.tsx`: the bar has the `filter-apply` class.
  - `app/globals.css`: on md+ the bar sits after the filters until something changes, then is pinned. Every filter input has a 6rem bottom scroll margin.
  - The phone drawer is unchanged.
- **Header:**
  - `components/SiteHeader.tsx`: a 12 px column gap.
  - `components/shell/CompareCounter.tsx`: "Comparing" is visually hidden below 380 px (was 360 px); it stays in the accessible name.
- **Map list:**
  - New `components/SpeciesRow.tsx`, a compact row: thumbnail shown whole, status, names, note.
  - `components/map/MapExplorer.tsx` uses it on every screen size, as the owner chose.
  - Below `lg` the list shows 12 rows and a "Show all N species" button, which moves focus to row 13.
- **Filters that cannot narrow anything:**
  - `onlyOneChoice` in `lib/explore-params.ts`, used by `app/species/page.tsx` (the Trend filter goes) and `app/regions/[slug]/page.tsx` (for example Namibia's Origin and Season).
  - Explore's lead names only the filters on offer.
- **Population key fact:**
  - `headlineEstimate` in `lib/labels.ts`.
  - `app/species/[slug]/page.tsx` shows, for example, "19,800 mature individuals / Wild · Global · 2024", plus "and N more estimate(s)" linking to "How many remain?".
- **e2e:**
  - `content.spec.ts`: the population fact (range, wild before captive, qualitative, none).
  - `critical.spec.ts`: the Apply bar, desktop only.
  - `pages.spec.ts`: the counter gap.
  - `geography.spec.ts`: one-choice filters on region pages.
- **Docs:** D-059.

**Commands run, with results:**
| Command | Result |
|---|---|
| Playwright on the dev site `:3000`, before the change | `/species` 1440 × 900: the bar covers the group list on load. Header at 360 px with 2 species in compare: 0 px between logo and counter. `/map` at 360 px: 37,662 px tall |
| same, after | `/species`: bar `static` on load; after ticking "Bird" it is `sticky`, the page moves 83 px and the checkbox ends 9 px above the bar. Phone drawer bar still pinned. Header gap: 50, 90, 105, 28 and 52 px at 320, 360, 375, 390 and 414 px, no overflow. `/map` at 360 px: 4,640 px with 12 rows; "Show all 79 species" reveals 79 rows and focuses row 13; 0 px overflow; thumbnails load the 320 px variant. Desktop `/map` unchanged at 2,254 px, button hidden. No Trend filter on `/species`; `/regions/namibia` offers Animal group and Status only, and Origin returns with `?origin=native`. Profiles: African penguin "19,800 mature individuals / Wild · Global · 2024", axolotl "50–1,000 mature individuals / Wild · Global · date not stated" |
| frontend `npm run typecheck`, `npm run lint`, `npm run build` | pass |
| frontend `npm run test:e2e` with `E2E_DATABASE_URL` → Postgres.app `wild_e2e` on 5432 | **58 passed, 4 skipped** (53 and 3 before; the new Apply bar test is desktop-only, so it is skipped at 360 px) |

**Known gaps:**
- On desktop, Apply is not in view until a filter changes. Applying on every tick is a separate improvement the owner has not asked for.
- Many dev profiles now show "date not stated" under the population figure, because their estimates have no reference year. That is a content gap, not a display one.
- D-058 (smaller home headline) is referenced in the entry below but has no section in `DECISIONS.md`.

## 2026-11-23: A smaller hero headline on the home page (owner request, D-058)

**What changed (frontend):**
- `src/app/globals.css`: `h-hero` is `clamp(2rem, 4.1vw, 3.875rem)` instead of `clamp(2.5rem, 5.4vw, 5rem)`, with `line-height: 1.06` and `letter-spacing: -0.03em` to keep three short lines readable at the smaller size. The headline no longer covers the animals' faces in the collage. Only the home hero uses `h-hero`, so `h-page` and `h-section` are unchanged.
- **Docs:** D-058.

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck` | pass |
| frontend `npm run lint` | pass |
| Headless Chromium at 1440px and 360px | headline 59.0px and 32.0px, no horizontal overflow at either width |

## 2026-11-23: Staff form editor, published photos in the admin pages, fewer mandatory fields (owner request, D-057)

**What changed (backend):**
- `StaffSpeciesDto.publishedPhotos`: the photos of the published revision, each with that revision's alt text, caption, credit and licence snapshot, the asset's review state now, and its pixel size. One extra query per species list, joined from `revision_media`.
- `ChecklistItem`/`ChecklistItemDto` gained `blocking`. `checklistPasses` ignores non-blocking items, and the submit/publish 422 lists only blocking failures.
- The provider identifier item is now `blocking: false` with a longer message saying why it is still worth filling in. Everything else in the checklist is unchanged.
- `openapi.json` re-exported; the frontend contract regenerated.

**What changed (frontend):**
- New `src/components/admin/StaffThumb.tsx`: a thumbnail of a published photo, through the staff preview route (session cookie, any review state), or a "none" box.
- `/admin`: a thumbnail next to every species. `/admin/species/[id]`: a new "Photos on the live version" section with alt text, caption, credit, licence, a warning when the asset is back in review or rejected, and a link to the Media page. The identifier section says it is optional and why it is still useful.
- New `src/components/admin/editor/`: `fields.tsx` (labelled inputs, a tag input, a repeatable row list), `PhotoPicker.tsx` (pick from approved images, alt text, caption, reorder, remove) and `ContentForm.tsx` (photos, names, group, environments, overview, classification, the "Not assessed" and "Unknown" switches, diet and diet tags, climate ranges, measurements, biology, conservation actions), plus `pruneEditorial`/`cleanContent`, which drop blank text and renumber photo positions and roles before saving.
- `/admin/revisions/[id]`: the form replaces the JSON box for that content. The JSON box stays under "Advanced" for the rows that each need a source id, with "Apply this JSON to the form". The checklist marks advice with "recommended, does not block"; "Unsaved changes" is shown, and submit waits until the draft is saved.
- `/admin/media`: the source page and licence deed URLs are labelled "(optional)", a missing source page is no longer coloured as an error, and the required fields are marked. The credit line says why it is required.
- New `e2e/staff-editor.spec.ts` (2 tests × 2 viewports).
- **Docs:** D-057; `ARCHITECTURE.md` (staff area and staff endpoints); `ADMIN_GUIDE.md` (checklist, "Editing a draft", image fields).

**Commands run, with results:**
| Command | Result |
|---|---|
| backend `npm run typecheck`, `npm run lint` | pass |
| backend tests (Docker was not running, so through a scratch Jest config pointing `.env.test` at `wild_test` on Postgres.app 5432, `--runInBand`) | **254/254 pass** (16 suites; 252 before, plus the two new ones) |
| backend `npm run openapi:export`, frontend `npm run contracts:generate` | done |
| frontend `npm run typecheck`, `npm run lint`, `npm run build` | pass |
| frontend `npm run test:e2e` with `E2E_DATABASE_URL` → Postgres.app `wild_e2e` | first run: the new editor test failed on a selector (`getByRole('alert')` also matches Next.js's route announcer). After the fix: **53 passed, 3 skipped** (49 before, plus 2 new tests at desktop and 360 px) |
| Playwright screenshots of `/admin`, `/admin/species/[id]` and the editor against the e2e stack | thumbnail or "none" per species; the live photo with its alt text and credit; the form sections and the tag input render at 1280 px |

**New tests:**
- backend: a species with no identifier publishes and the checklist reports the identifier as `blocking: false` advice; the staff species carries the published photo with its snapshot credit and the asset's current review state; the "blocks submit" test now asserts that the identifier is *not* a reason for the refusal.
- e2e: the staff list shows a real photo; the form saves overview, a diet tag, the two switches and a photo with alt text and reads them back; saving a photo without alt text is refused in the browser.

**Known gaps:**
- Assessments, population estimates, places, habitats, threats, citations and support links are still JSON (D-011). Live preview and the diff against the published version are still not built.
- A photo's credit, licence and creator are still edited only on the Media page, not in the species editor.
- The editor loads the newest 200 images for the picker; a larger library would need paging or a server-side search.
- The import file schema still requires at least one provider identifier per species.
- Checked in headless Chrome against the synthetic e2e fixtures. The pages were not opened against the owner's dev catalogue, because this session had no admin password for it.

## 2026-11-23: The Wildward logo always leads to the home hero (owner request, D-056)

**What changed (frontend):**
- New `src/components/shell/HomeLink.tsx` (client), used by the header and footer logos. From other pages it is a normal link to `/`. On `/` it scrolls back up to the hero (smoothly, or instantly with reduced motion) and focuses the header logo. A modified click (new tab or window) is left to the browser.
- `src/components/SiteHeader.tsx`: the logo uses `HomeLink`.
- `src/components/SiteFooter.tsx`: the footer logo was decorative (`aria-hidden`, not a link). It is now a `HomeLink` named "Wildward".
- `e2e/pages.spec.ts`: new test for both logos on `/` (scroll returns to 0, focus on the header logo) and the footer logo from `/species`.
- **Docs:** D-056.

**Commands run, with results:**
| Command | Result |
|---|---|
| Playwright on the owner's dev server `:3000`, before the fix | `/` header logo after scrolling down: stayed at scrollY 5869; footer logo: not a link |
| same, after the fix | `/`: both logos reach scrollY 0 (about 1.3 s smooth; 12–42 ms with reduced motion), URL `/`, focus on the header logo, by mouse and by Enter. `/species`: both open `/` at the top |
| frontend `npm run typecheck`, `npm run lint` | pass |
| frontend `npm run test:e2e` with `E2E_DATABASE_URL` → Postgres.app `wild_e2e` on 5432 | **49 passed, 3 skipped** (47 before, plus the new test at desktop and 360 px) |

**Known gaps:** none found.

## 2026-11-23: No credit or "pending" text on pictures; a Photo credits page; no Next.js dev badge (owner request, D-055)

**What changed (backend):**
- `GET /api/v1/credits` (`PhotoCreditDto`): the credit, licence and source of every photo on a published profile. It reads through the PUBLISHED set and the revision snapshots only, and leaves out rejected images.
- `src/media/dto.ts`: the credit field's description says where the credit appears now. `openapi.json` re-exported.
- `test/integration/quality.spec.ts`: new test that the list has published photos only, never a draft's photo or a rejected image.

**What changed (frontend):**
- The "Header image: credit and licence pending" caption is gone from the home, Explore, Map, Compare and About headers (`PageHeader.tsx`, `page.tsx` and the four pages). `HeaderImage.caption` is removed.
- No credit line under catalogue photos: `Photo.tsx` (profile photo), `SpeciesCard.tsx`, `GroupTile.tsx`, and the home photo sections. The home captions keep the species name.
- New page `src/app/credits/page.tsx`: "Photo credits", grouped by species, with the licence linked to its deed and the source linked. It is linked as "Photo credits" in the footer's "About our data" column and is in the sitemap. The footer's bottom line now says only "Boundaries: Natural Earth". Each profile keeps its "Photographs" list under Sources.
- `next.config.ts`: `devIndicators: false`, which removes the round "N" Next.js dev-tools badge (shown only in `next dev`).
- Terms and the staff media form now say where credits appear. Contracts regenerated.
- e2e: `content.spec.ts` checks there is no credit line and no "pending" text; the profile's credit is under Sources. `pages.spec.ts` has a new test for `/credits` and checks it is in the sitemap. `/credits` is added to the axe, CSP and reflow lists in `release.spec.ts` and `a11y-extra.spec.ts`.
- **Docs:** D-055; `ARCHITECTURE.md` (page and endpoint); `DATA_SOURCES.md` and `OWNER_REVIEW.md` questions 9–13 (no caption now; the pictures are still launch blockers).

**Commands run, with results:**
| Command | Result |
|---|---|
| backend `npm run typecheck`, `npm run lint`, `npm run build` | pass |
| backend `npm test` (Docker was not running, so through a scratch Jest config that points `.env.test` at `wild_test` on Postgres.app, port 5432) | **252/252 pass** (16 suites) |
| backend `npm run openapi:export`, frontend `npm run contracts:generate` | done |
| frontend `npm run typecheck`, `npm run lint` | pass |
| frontend `npm run test:e2e` with `E2E_DATABASE_URL` → Postgres.app `wild_e2e` on 5432 | first run: the 2 new credits tests failed, because the footer had two "Photo credits" links (strict mode); the bottom-line link was removed. Second run: **47 passed, 3 skipped** |
| `GET :4010/api/v1/credits` on the owner's running dev API | 81 photos for 81 species; licences CC BY 2.0/2.5/3.0/4.0, CC BY-SA 2.0/2.5/3.0/4.0, PDM |
| Playwright screenshots of `:3000` `/`, `/about`, `/credits` and the footer at 1440 × 900 and 360 × 740 | no "pending" text, no "N" badge, 0 px horizontal overflow |

**Known gaps:** the five header pictures are still unlicensed launch blockers (OWNER_REVIEW 9–13). Credits are no longer next to each photo; whether a credits page is enough attribution is the owner's call (D-055).

## 2026-11-23: Hero typography, larger sizes and lime for each page's promise (owner request, D-054)

**What changed (frontend):**
- `src/app/globals.css`: larger `h-hero`, `h-page`, `h-section` with tighter tracking. `strong` inside headings and leads is lime.
- `src/app/page.tsx`: the home headline is three lines with lime verbs (Understand, see, help).
- `src/components/PageHeader.tsx`: over a photo, the title is larger and the lead white and larger.
- Lime key phrases in the leads of Explore, Map, Compare, About, Methodology, Privacy, Terms, Support, Sources and region pages. `InfoPage`'s `lead` accepts markup.
- `src/app/species/[slug]/page.tsx`: the scientific name is lime italic and larger; the common name a step larger.
- **Docs:** D-054.

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck` | pass |
| frontend `npm run lint` | pass |
| frontend `npm run test:e2e` with `E2E_DATABASE_URL` → Postgres.app `wild_e2e` on 5432 | **45 passed, 3 skipped** (as before) |
| Playwright screenshots at 1440 × 900 (home, Explore, Map, Compare, About, Methodology, Support, a profile) and 360 × 740 (home, About, a profile) | larger headings, lime phrases readable over photos and navy. 0 px horizontal overflow at 360 px. The home `h1` text is unchanged ("Understand a species, see where it lives, and find a credible way to help.") |
| weight 700 vs 800 on the home headline, measured and compared in screenshots | 800 left visible gaps before punctuation (the comma advance is 0.35 em), so 700 stays |

**Known gaps:** none found.

## 2026-11-23: Taller picture headers at full colour (owner request, D-053)

**What changed (frontend):**
- `src/components/PageHeader.tsx`: with an image the header is at least `max(34rem, 80svh)` tall, with the text anchored at the bottom. The navy wash and the `light` option are removed. Black gradients now cover only the text area (the bottom on phones; the bottom and left from `md`) and a soft band under the nav. The kicker, title and lead get a text shadow.
- `src/app/map/page.tsx`: `light: true` removed.
- **Docs:** D-053.

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck` | pass |
| frontend `npm run lint` | pass |
| frontend `npm run test:e2e` with `E2E_DATABASE_URL` → Postgres.app `wild_e2e` on 5432 | **45 passed, 3 skipped** (as before) |
| Playwright screenshots at 1440 × 900 (Explore, Map, Compare, About) and 360 × 740 (Map, Compare, About, Explore) | pictures at full colour, headers about 720 px tall on desktop. The first phone pass left the Map lead hard to read over the pale map; the phone gradient now reaches higher, and it reads |

**Known gaps:** the Map lead has less contrast than the others (pale picture); axe cannot check text over images. Upscaling softness shows more on the larger headers.

## 2026-11-23: The photo of turtle hatchlings behind the About page header (owner request, D-052)

**What changed (frontend):**
- `src/components/InfoPage.tsx`: optional `image` prop, passed to `PageHeader`.
- `src/app/about/page.tsx`: passes the photo, cropped at `object-[50%_55%]`, with an alt text and the caption "Header image: credit and licence pending".
- `public/hero/about-turtles.webp`: the owner's photo, converted once with sharp (1280 × 720, quality 82, 68 KB, metadata stripped).
- The owner first chose a flat illustration (740 × 493), then replaced it with this photo. Its file was deleted.
- **Docs:** D-052; a pending row in `DATA_SOURCES.md`; open question 13 in `docs/launch/OWNER_REVIEW.md`.

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck` | pass |
| frontend `npm run lint` | pass |
| frontend `npm run test:e2e` with `E2E_DATABASE_URL` → Postgres.app `wild_e2e` on 5432 | **45 passed, 3 skipped** (as before), with the illustration and again with the photo |
| Playwright screenshots of `:3000/about` at 1440 × 900, 2200 × 1000 and 360 × 780 | title, lead, nav and caption readable; the hatchlings show in the middle of the band |

**Known gaps:** the photo's creator and licence are unknown (OWNER_REVIEW question 13). On desktop the hatchlings sit partly behind the lead text.

## 2026-11-23: The painting of a robot and animals behind the Compare page header (owner request, D-051)

**What changed (frontend):**
- `src/app/compare/page.tsx`: passes the picture to `PageHeader`, cropped at `object-[50%_20%]`, with an alt text and the caption "Header image: credit and licence pending".
- `public/hero/compare-friends.webp`: the owner's picture, converted once with sharp (1260 × 720, quality 82, 121 KB, metadata stripped).
- **Docs:** D-051; a pending row in `DATA_SOURCES.md`; open question 12 in `docs/launch/OWNER_REVIEW.md`.

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck` | pass |
| frontend `npm run lint` | pass |
| frontend `npm run test:e2e` with `E2E_DATABASE_URL` → Postgres.app `wild_e2e` on 5432 | **45 passed, 3 skipped** (as before) |
| Playwright screenshots of `:3000/compare` at 1440 × 900, 2200 × 1000 and 360 × 780 | title, lead, nav and caption readable. Tried with the `light` shade (greyed the colours, dropped) and at a 35 % crop (cut off the bear's head, moved to 20 %) |

**Known gaps:** the picture's creator and licence are unknown (OWNER_REVIEW question 12). It is 1260 px wide, so it is upscaled and a little soft on wide screens.

## 2026-11-23: The illustrated world map behind the Map page header (owner request, D-050)

**What changed (frontend):**
- `src/app/map/page.tsx`: passes the picture to `PageHeader`, cropped at `object-[50%_45%]`, with an alt text, the `light` flag and the caption "Header image: credit and licence pending".
- `src/components/PageHeader.tsx`: optional `light` flag on `HeaderImage`, which adds an even 45 % navy shade for bright pictures.
- `public/hero/world-animals.webp`: the owner's picture, converted once with sharp (2000 × 1400, quality 80, 92 KB, metadata stripped).
- **Docs:** D-050; a pending row in `DATA_SOURCES.md`; open question 11 in `docs/launch/OWNER_REVIEW.md`.

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck` | pass |
| frontend `npm run lint` | pass |
| frontend `npm run test:e2e` with `E2E_DATABASE_URL` → Postgres.app `wild_e2e` on 5432 | **45 passed, 3 skipped** (as before) |
| Playwright screenshots of `:3000/map` at 1440 × 900, 2200 × 1000 and 360 × 780 | title, lead, nav and caption readable; the first try without the extra shade left the nav and caption on the pale right side, so `light` was added |

**Known gaps:** the picture's creator and licence are unknown. It is a launch blocker (OWNER_REVIEW question 11).

## 2026-11-23: The main navigation stays on top of every page (owner request, D-049)

**What changed (frontend):**
- New `src/components/shell/HeaderBar.tsx`: a sticky header, transparent at the top of the page and solid black with a rule once the page scrolls. `SiteHeader.tsx` wraps its unchanged markup in it.
- `NavLinks.tsx` and `CompareCounter.tsx`: unchanged in the end. The links look exactly as before, at the owner's request, after other versions were tried (D-049).
- `src/components/PageHeader.tsx` slides up under the bar like the home hero (`-mt-[var(--nav-h)]`), and its photo gets a dark band at the top.
- `src/app/globals.css`: `scroll-padding-top: var(--nav-h)` on `html`. `--nav-h` itself is unchanged.
- Sticky offsets moved below the bar: `species/[slug]/page.tsx` (in-page navigation), `InfoPage.tsx` (contents list), `page.tsx` (places photo).
- **Docs:** D-049.

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck` | pass |
| frontend `npm run lint` | pass |
| frontend `npm run test:e2e` with `E2E_DATABASE_URL` → Postgres.app `wild_e2e` on 5432 | intermediate versions: one run failed reflow at 320 px (a one-row phone bar), the others passed. Final version: **45 passed, 3 skipped** |
| Playwright at 320 px and 360 px on a profile | 0 px horizontal overflow |
| Playwright screenshots at 1440 px (home at the top, Explore scrolled) and 360 px (Explore) | transparent over the photo at the top, solid once scrolled; links as before |

**Known gaps:** on phones the solid bar is two rows (108 px). Link contrast over photos relies on the scrims (axe cannot check text over images).

## 2026-11-23: The savanna picture behind the Explore species header (owner request, D-048)

**What changed (frontend):**
- `src/components/PageHeader.tsx`: optional `image` prop. The photo replaces the lime arcs, under a navy scrim (an even wash on phones, a left-to-right fade from `md` up), with a caption at the bottom right. Other pages' headers are unchanged.
- `src/app/species/page.tsx`: passes the image, cropped low (`object-[50%_80%]`), with an alt text and the caption "Header image: credit and licence pending".
- `public/hero/savanna.webp`: the owner's picture, converted once with sharp (2400 × 1250, quality 78, 343 KB, metadata stripped).
- **Docs:** D-048; a pending row in `DATA_SOURCES.md`; open question 10 in `docs/launch/OWNER_REVIEW.md`.

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck` | pass |
| frontend `npm run lint` | pass |
| frontend `npm run test:e2e` with `E2E_DATABASE_URL` → Postgres.app `wild_e2e` on 5432 (includes `next build`, axe, CSP, reflow) | **45 passed, 3 skipped** (as before). The first try without `E2E_DATABASE_URL` failed at start-up, because the default points at Docker on 5433 |
| Playwright screenshots of `:3000/species` at 1440 × 900, 2200 × 1000 and 360 × 780 | kicker, title, lead, search and sort readable over the photo; caption shown; no overflow |

**Known gaps:**
- The image's creator and licence are unknown. It is a launch blocker (OWNER_REVIEW question 10).
- On very wide screens the lead text runs over the zebra's stripes. The scrim keeps it readable, but it is busier there than on a 1440 px screen.

## 2026-11-22/23: Catalogue batch 2, 40 more species with photos, places, habitats, diet and threats (owner request, D-047)

**What changed:**
- `catalogue/batch-2.json`: 40 real species, imported as **drafts**.
  - **By group:** 17 mammals, 8 birds, 4 reptiles, 2 amphibians, 4 fish, and one each of insect, arachnid, mollusc, coral and crustacean.
  - **Every profile has:** an overview in our own words, GBIF classification, the Wikidata-cited IUCN category, diet, our own habitat and threat codes, countries and/or seas with a cited note, and a cited population figure (21 species) or an explicit "Unknown" with a note (19).
- `catalogue/media/`: 40 photos **downloaded** from Wikimedia Commons (30 MB folder in total).
  - **Licences:** 3 public domain (PDM), 37 CC BY or CC BY-SA, each with a named creator.
  - **Checks:** each licence was re-read at download and compared with the file's embedded copyright fields. The agent looked at every photo on a contact sheet and fixed the alt texts to match.
- `scripts/publish-drafts.mjs`: new `--approve-media` option (D-047).
- **Docs:** D-047; the Wikipedia row in `DATA_SOURCES.md`.

**How the facts were checked:**
- **Countries:** a script showed the sentence where each country appears in the cited revision. Countries mentioned only in passing were left out. One example: the article says pillar coral is *absent* from Panama and Colombia, so they stay off its map.
- **Descriptions:** every descriptive claim was searched for in the text, and claims the source did not support were removed. For example, the golden frog's adult diet is not in the source, so only the tadpoles' algae diet is stated.
- **Species dropped while preparing:** giraffe (taxonomy split), olm (taxonomy split) and European eel (no range countries in the article). Spares took their places.

**Commands run, with results:**
| Command | Result |
|---|---|
| GBIF, Wikidata (SPARQL), Wikipedia and Commons APIs, through scratch scripts | 46 candidates gathered. Commons returned 429 for a long stretch; originals were throttled harder than resized copies, so photos narrower than 1280 px were fetched as a 960 px or slightly smaller copy |
| `npm run import -- catalogue/batch-2.json --dry-run` | 740 changes, 40 species, no notes |
| `--apply`, then `--apply` again | 740 changes, then **0 changes** |
| dev database | 40 new drafts, 40 images pending review |
| `npm run lint` | pass |

**Published (owner said "start preparing them, and publish them"):** `node scripts/publish-drafts.mjs --approve-media --only-file=catalogue/batch-2.json`, as the owner admin, through the staff API (checklist, audit and revalidation ran). Result: 40 published, 40 images approved, 0 failed. The admin password was typed in chat, so the owner should change it.
| Check | Result |
|---|---|
| `npm run validate:catalogue` | **PASS**: 81 published species, 153 cited numeric claims, 81 approved images, 3,240 compare pairs with zero mixed units |
| `GET :4010/api/v1/species` / `:3000/species` | total 81 / "81 species" |
| new profiles (`panthera-leo`, `latimeria-chalumnae`, `dendrogyra-cylindrus`) | 200 |
| Playwright screenshot of `/species/spheniscus-demersus` at 1400 px | photo, credit, licence link and CR badge shown; 0 broken images |

**Known gaps:**
- All facts are second-hand (Wikidata, Wikipedia revisions). Replace them with primary sources before any public launch.
- Trend is Unknown everywhere. Climate, measurements and conservation actions are empty.
- Maps are country and sea level only. Several country lists are partial, and their notes say so.
- Small places (Comoros, Singapore, Réunion, Mauritius, French Guiana, Cape Verde) are not on our 1:110m map.
- Three photos are smaller than 1280 px: helmeted hornbill 574 px, Sunda pangolin 799 px and coelacanth 963 px.
- `npm test` and `typecheck` were not run (no TypeScript changed). Only one new profile was checked in a browser.

## 2026-11-22: Species without a photo archived in the dev catalogue (owner request, D-046)

**What changed (dev database only, no code):** the 8 published species whose published revision has no photo were archived in one SQL transaction, with one `species.archive` audit row each: `acropora-palmata`, `dryococelus-australis` and the synthetic `fictus-captivus`, `fictus-exemplaris`, `fictus-marinus`, `fictus-occultus`, `fictus-regionalis`, `fictus-walkthrough`. The public catalogue went from 49 to 41 species, all with a photo. The frontend cache was revalidated (`catalogue`, `filters`, `map` and the 8 `species:` tags).

**Docs (backend):** D-046 in `DECISIONS.md`.

**Commands run, with results:**
| Command | Result |
|---|---|
| SQL on the dev database (Postgres.app `wild`) | 8 species archived, 8 audit rows; 41 published and not archived, 8 archived |
| `POST :3000/api/revalidate` | 200, 11 tags revalidated |
| `GET :4010/api/v1/species` | `total` 41; no card on the first page without `image` |
| `GET :4010/api/v1/species/fictus-captivus`, `/acropora-palmata` / `/acinonyx-jubatus` | 404 / 404 / 200 |
| `curl :3000/species` | "41 species"; no "No photo yet" and no fixture names. `/`, `/map`, `/compare` 200 |

**Known gaps:**
- No typecheck, lint or tests were run, because no code changed. The e2e database is untouched.
- The pages were checked with `curl`, not in a browser.
- `catalogue/batch-1.json` still holds the two real photoless profiles (see D-046).
- `docs/launch/status-check.csv` still lists those two. `npm run status:sheet` would drop them, because it only covers species that are not archived.

## 2026-11-22: Leaf mark as the tab icon (owner request, D-045)

**What changed (frontend):** new `src/app/icon.svg` (lime mark on a black rounded tile), `src/app/favicon.ico` (16/32/48 px) and `src/app/apple-icon.png` (180 px). Next.js adds the `<link rel="icon">` and `<link rel="apple-touch-icon">` tags to every page. Before this, `/favicon.ico` returned 404 and the tab showed a generic globe.

**Docs (backend):** D-045 in `DECISIONS.md`.

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck`, `npm run lint`, `npm run build` | pass / pass / pass (the build includes `/icon.svg`, `/apple-icon.png` and `favicon.ico`) |
| frontend `npm run test:e2e` (Postgres.app `wild_e2e`) | **45 passed, 3 skipped** (as before) |
| `curl` on the dev server | `/map` links all three icons. `/favicon.ico`, `/icon.svg` and `/apple-icon.png` return 200 with the right content types |

**Known gaps:** checked only in headless Chrome and with `curl`. The icon in a real browser tab was not seen by the agent (browsers cache favicons, so a hard reload may be needed).

## 2026-11-22: Map page list scrolls in its own box on large screens (owner request, D-044)

**What changed (frontend):** `components/map/MapExplorer.tsx`: from `lg` up, the "Species in this view" list scrolls inside a box as tall as the map column (absolutely positioned in its grid cell, `overflow-y-auto`, a thin dark scrollbar, items pinned to the top), and the map column is no longer sticky. The page no longer grows with the list, so the footer and the filters are a few wheel steps away. Below `lg` nothing changed.

**Docs (backend):** D-044 in `DECISIONS.md`.

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck`, `npm run lint` | pass / pass |
| frontend `npm run test:e2e` (Postgres.app `wild_e2e`) | **45 passed, 3 skipped** (as before; includes the map tests and axe on `/map`) |
| Playwright on `/map` at 1512×862 (dev server, 45 species) | page height 1,951 px, while the list's own content is 22,587 px. Four wheel steps over the legend reach the footer. Three wheel steps over the list scroll the list (scrollTop 1,200) and leave the page at the top |

**Known gaps:** a wheel over the map still zooms the map (MapLibre default), not the page (see D-044).

## 2026-11-22: Rounded wordmark with lime W's (owner request, D-043)

**What changed (frontend):**
- `package.json`: `@fontsource-variable/quicksand` 5.3.0 (SIL OFL 1.1), imported in `app/layout.tsx`.
- `globals.css`: a `--font-logo` token (Quicksand, used only for the wordmark).
- `components/shell/Mark.tsx`: a new `Wordmark` component. The name is set in Quicksand Bold, both W's are lime and the other letters white. `SiteHeader` (1.5rem) and `SiteFooter` (1.875rem) use it in place of the Plus Jakarta Sans text.

**Docs (backend):** D-043 in `DECISIONS.md` (including the font comparison); the font line in `DATA_SOURCES.md`.

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck`, `npm run lint`, `npm run build` | pass / pass / pass (Quicksand files emitted under `.next/static/media`) |
| frontend `npm run test:e2e` (Postgres.app `wild_e2e` via `E2E_DATABASE_URL`) | **45 passed, 3 skipped** (as before; includes CSP and axe on public pages) |
| Playwright screenshots of the header (home, /about, 360 px) and footer (dev server) | rounded wordmark with lime W's; Quicksand loaded; the home link's name is still "Wildward"; 0 px horizontal overflow at 360 px |

**Known gaps:** the image the owner sent does not name its font. Quicksand is the closest free match found, but its capital "W" is wider than the one in the image.

## 2026-11-22: Home hero text and search sit lower (owner request)

**What changed (frontend):** `app/page.tsx`: the hero's headline, search box and "Explore all species" button are anchored to the bottom of the hero (`justify-end`), a fixed distance from the bottom instead of being centred. From 1024 px it is `curve − 2rem`: the button reaches into the dip in the middle of the U-shaped curve (the photo runs almost to the bottom there), stays clear of the curve's lime line, and sits beside the caption. From 640 px it is `curve + 3rem` and on phones `curve + 2.75rem`, where the button must stay above the caption. The animals' eyes in the collage now show above the headline. The dark radial shade behind the text moved down with it (centre at 67% instead of 45%).

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck`, `npm run lint` | pass / pass |
| Playwright measurements and screenshots of `/` (dev server), after two "lower it a bit more" requests | headline top moved from 185 to 371 px at 1512×862, 230 to 460 px at 1920×960, 205 to 355 px at 390×844. Below 1024 px the button ends above the "Header image" caption (19 px at 768 px, where the two would otherwise be 4 px apart side by side); from 1024 px it sits beside the caption, at least 108 px away, and a 1024×768 screenshot shows it inside the curve's dip without touching the lime line. On phones it ends 15 px above the caption |

**Known gaps:** `npm run test:e2e` was not run. Only spacing classes changed, and the hero check looks for the image and caption, not their position.

## 2026-11-22: The help panel's photo fills its curve, no blur (owner request, D-042)

**What changed (frontend):** `app/page.tsx`: the lime help panel shows its photo with `object-cover` (anchored at 50% 30%) instead of `WholePhoto`, so the blurred fill around it is gone. The photo column is 28rem on desktop, and the photo area has a fixed height on phones (`h-80`, `sm:h-96`). Other frames are unchanged (D-039).

**Docs (backend):** D-042 in `DECISIONS.md`.

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck`, `npm run lint` | pass / pass |
| Playwright screenshots of the help panel at 1458, 1920 and 360 px (dev server) | the orangutan fills the curve without blur, and its face is fully in view at every width |

**Known gaps:** `npm run test:e2e` was not run, because no e2e test covers this panel. The 400 px source photo is enlarged to about 28rem, so it is slightly soft on high-density screens.

## 2026-11-22: The owner's collage as the home hero, credit and licence pending (owner request, D-041)

**What changed (frontend):**
- First the hero became seven vertical strips of catalogue photos, each credited, after the owner asked for "the animals' images in the main hero, no blurred edges". The owner then sent a collage of eight animal faces and asked for "the exact image". The agent found no creator or licence (none in the file, none from a web search) and said so. The owner answered "just put the image".
- `public/hero/wild-faces.webp`: the collage as WebP (2200 × 900, quality 80, 468 KB), made once with sharp. The original PNG is not stored.
- `app/page.tsx`: the hero is that one image, sharp and edge to edge (`unoptimized`, `priority`), with the existing scrims. Phones are centred on the spotted cat. The caption reads "Header image: credit and licence pending". The strip code is removed (`HERO_STRIPS`, `STRIP_VISIBILITY`, `stripCredits`), and the threatened fetch is back to 16.
- `globals.css`: `.strip-in` is renamed `.hero-in` (a 1.1 s fade from a slight zoom; reduced motion turns it off).
- `e2e/content.spec.ts`: the home check now looks for the hero image and its pending caption, and for the fixture photo and credit on a threatened card. The card is scrolled into view first, because its photo is lazy.

**Docs (backend):** D-041 in `DECISIONS.md`, including the conflict with PLAN §4 ("hero photograph with credit"); a **pending** row in `DATA_SOURCES.md`; open question 9 in `docs/launch/OWNER_REVIEW.md`.

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck`, `npm run lint` | pass / pass |
| frontend `npm run test:e2e` (Postgres.app `wild_e2e` via `E2E_DATABASE_URL`) | first run: 44 passed, 1 failed (360 px: the home card's lazy photo had not loaded), 3 skipped. After scrolling the card into view: **45 passed, 3 skipped** |
| Playwright screenshots of `/` at 1440×900 and 390×844 | the collage fills the hero without blur. On phones the cat is centred. At 1440 px the lion and owl strips are partly cut off at the sides |

**Known gaps:**
- **Launch blocker:** the hero image's creator and licence are unknown (D-041). Before a public launch, confirm an allowed licence and credit it, or replace the image.
- On screens narrower than about 2.4 times the hero's height, the outer strips are cut off at the sides.

## 2026-11-22: Photos on a dark stage, tried and reverted (owner request, D-040)

**What happened:** the owner asked for every animal to look like the bumble bee profile (an animal on a dark background) and chose an edge-fade effect over cut-outs. It was built (a CSS mask, with photo width and height added to card images in the API), and backend tests (251/251) and e2e (45 passed, 3 skipped) passed. After seeing it the owner said "undo it, it is not looking good".

**Reverted:**
- Backend `src/`, `test/` and `openapi.json` are identical to the last commit (checked with `git diff`).
- The frontend's generated `api.d.ts` is identical to the last commit.
- `WholePhoto`, `Photo`, `SpeciesCard`, `GroupTile`, `app/page.tsx` and `globals.css` are back to their D-039 versions.

**Commands run after the revert, with results:**
| Command | Result |
|---|---|
| backend `npm run typecheck`, `npm run openapi:export` | pass; `openapi.json` unchanged from the last commit |
| frontend `npm run contracts:generate`, `npm run typecheck`, `npm run lint` | contracts unchanged; pass / pass |
| frontend `npm run test:e2e` (Postgres.app `wild_e2e`) | **45 passed, 3 skipped** (as before) |
| Playwright screenshots of `/species` and the bald eagle profile at 1512×861 | the D-039 look: whole photos with a blurred fill; 0 px overflow |

## 2026-11-22: Photos shown whole, never cropped (owner request, D-039)

**Problem (owner's screenshots):** the bald eagle and Atlantic puffin cards cut off the birds' heads, because every frame cropped its photo (`object-cover`).

**Frontend:**
- New `components/WholePhoto.tsx`: the whole photo (`object-contain`) over a blurred, darkened copy of itself that fills the rest of the frame. The photo is downloaded once.
- Used in `SpeciesCard`, `GroupTile` (photo pinned to the top; the scrim only behind the text), the home hero, the Compare banner (photo on the right, on top on phones), the help panel, the home section photos, and `Photo` without `fit`.
- The "Where they live" frame is now 4:3.

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck` / `npm run lint` | pass / pass |
| frontend `npm run test:e2e` (Postgres.app `wild_e2e`) | **45 passed, 3 skipped** (as before) |
| Playwright screenshots of `/species` and `/` at 1512×861 | bald eagle and puffin shown head to feet; 0 px horizontal overflow |

**Known gaps:** portrait photos look narrower in landscape frames, with blurred sides. A per-image focal point would need an editorial field (not R1).

## 2026-11-22: Redesign in the layout of the owner's reference site, keeping our colours (owner request, D-038)

**Request:** seven screenshots of BirdLife DataZone's home page: "keep the colors of our website but make the website look like this one … work on every detail". Only the frontend's look changed. Routes, data, wording rules and the accessibility target are as before. No API change, so no `openapi:export` or `contracts:generate`.

**Frontend (`RedList-frontend`):**
- **Type:** one family, Plus Jakarta Sans (`@fontsource-variable/plus-jakarta-sans` 5.3.0, OFL, upright and italic), self-hosted. Anton, Space Mono and Inter uninstalled. Sentence-case bold headings; small bold uppercase buttons with a CSS chevron; body weight 450.
- **`globals.css`:** same colour tokens; new classes `h-hero`, `h-card`, `more`, `go`, `btn-soft`, `btn-dark`, `searchbox` (white box with the button inside), `tag`, `figures`; the load animation is now `rise` on the hero's headline, search and button.
- **Shell:**
  - lime announcement bar removed
  - header: logo; Map, Compare, About as text; Explore as the solid lime button (white on `/species`); the compare counter is an outlined button
  - footer: brand and statement, three link columns, then the rising lines (D-036) as a thin band above the bottom row. The giant wordmark is gone.
- **New components:** `PageHeader` (navy title band for inner pages), `shell/Curves.tsx` (hero curve and corner arcs), `shell/Icons.tsx`, `home/StatIcons.tsx` (four original line icons).
- **Home** (`app/page.tsx`), rebuilt in the reference's order:
  1. photo hero with the promise as h1, a white search box, "Explore all species" and a curved lower edge with lime arcs
  2. catalogue numbers: species, threatened, countries/seas/oceans and animal groups, each with an icon and "in this catalogue" wording
  3. "How we source facts": photo beside text
  4. three threatened species as article cards
  5. group photo tiles on navy
  6. a full-width photo banner for Compare
  7. "Where they live": environment rows and places beside a photo
  8. the lime help panel with a curved-edge photo
  Section photos come from the threatened list and never repeat on the page (`photoPicker`). Each one carries the species name and its credit.
- **Other pages:**
  - Explore, Compare, Map, regions, Support, Sources and the four information pages open with the `PageHeader` band; Explore's search is the same white search box, with the sort control beside it
  - profile: a breadcrumb, sentence-case headings, numbered sections with a hairline, and related species on a navy band
  - `SpeciesCard` is article-style: photo, status badge as tag, name, context line, credit
  - `GroupTile`: name, count and "See species" at the lower left; the caption is under the tile
  - 404, error and the staff area use the new type; the staff JSON editor and image ids keep system monospace
- `lib/labels.ts`: `GROUP_PLURAL`.

**Backend docs:** D-038 in DECISIONS; PLAN §4 "Style" points to it; DATA_SOURCES lists the new font; STITCH_PROMPT.md is marked as superseded for type and layout.

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck` / `npm run lint` | pass / pass |
| frontend `npm run test:e2e`, `E2E_DATABASE_URL` → Postgres.app `wild_e2e` on 5432 (includes `next build`, axe, CSP, keyboard, reflow, desktop + 360px) | **45 passed, 3 skipped** (skips by design, as before) |
| Playwright screenshots of the dev site (`:3000`, real catalogue): every public page plus `/admin` and 404 at 1512×861; home at 1280×800, 768 and 360; Explore and a profile at 360; the header at 768, 900, 1024 and 1280 with the compare counter showing | 0 px horizontal overflow everywhere; the header stays one 88 px row from 768 px up |
| WCAG contrast of the new colour pairs, computed | see D-038 (lowest: muted on navy 6.7:1, placeholder on white 6.0:1) |
| Reduced motion and focus, Playwright | hero text fully visible at once with `reduce`; the search button shows a black inset ring inside the white box |

**Known gaps:**
- Checked in headless Chrome only, at device pixel ratio 1; not in Safari or Firefox, or on a Retina screen.
- The home page shows up to 16 photos. Below the first screen they lazy-load, but the page is heavier than before.
- Text over photos relies on dark scrims. axe cannot measure contrast over images, so the hero, banner and tiles were checked by eye on the current photos only.
- Section photos are cropped (`object-cover`) to fixed shapes; a portrait photo in the wide Compare banner can show only part of the animal.
- Nav order is now Map · Compare · About · Explore (PLAN lists Explore first); recorded in D-038.

## 2026-11-22: A photo on each home-page group tile (owner request, D-037)

**Backend (`RedList-backent`):**
- `GET /filters`: each group is now a `GroupFacetDto` with `example` (`slug`, `scientificName`, `commonName`, `image`) or `null`. Pick order:
  1. photos at least 800 px wide
  2. the group's most widespread species (most countries and seas; a location-sensitive species counts as none)
  3. name
- `catalogue-sql.ts`: the card photo choice is one shared fragment, `CARD_IMAGE`. Species cards and group tiles use it, so they always show the same photo, and a takedown removes it from both.
- New integration test: the tile gets the same photo as its species card, groups without a photo get `null`, and a rejected photo drops off the tile.
- `openapi.json` re-exported.

**Frontend (`RedList-frontend`):**
- `contracts:generate` run.
- New `components/GroupTile.tsx`:
  - the photo is full-bleed and decorative (`alt=""`) behind the group name and count, with dark scrims; the scrim starts higher below `lg`, where the credit wraps onto more lines
  - a caption names the species shown and gives its credit
  - the whole tile is the link, and the caption sits above the link overlay
  - without a photo the tile is the plain panel
- `app/page.tsx`: the grid is 2 columns, then 3 from `sm` (was 6 on desktop).

**Commands run, with results:**
| Command | Result |
|---|---|
| backend `npm run typecheck` / `npm run lint` | pass / pass |
| backend `npm test` (`.env.test` pointed at a new `wild_test` on Postgres.app 5432 for this run, then restored to 5433; Docker was not running) | **251/251 pass**, 16 suites (250 before + 1 new) |
| backend `npm run openapi:export`, frontend `npm run contracts:generate` | written |
| frontend `npm run typecheck` / `npm run lint` | pass / pass |
| frontend `npm run test:e2e` with `E2E_DATABASE_URL` → Postgres.app `wild_e2e` (includes build, axe, reflow) | **45 passed, 3 skipped** (as before) |
| Playwright on the dev site (`/`) at 1512×861, 800×1000 and 360×780, after revalidating `catalogue` | 8 photos load (coral has none), 0 px horizontal overflow; names, counts and credits readable over the white-background frog and butterfly photos |

**Known gaps:**
- Editors cannot choose a tile photo; the rule picks it.
- No e2e test checks the tile photos; the synthetic e2e catalogue has only one photo.
- On phones a long credit takes four lines and covers the lower half of the photo.

## 2026-11-22: Footer "rising lines" decoration (owner request, D-036)

**Request:** add React Bits Pro's "Rising Lines" component to the footer. **Not installed:** React Bits Pro is paid and needs a licence key (none is configured). The frontend has no shadcn `components.json`. Its licence (v2.2 §2.4) forbids publishing the code in open-source repositories, and both repos are public. Written instead as our own component, without the Pro source (D-036).

**Frontend (`RedList-frontend`):**
- New `components/shell/RisingLines.tsx` (client component, 2D canvas, no dependency):
  - thin lime lines rise from a hairline horizon at the bottom edge, with a soft elliptical glow, brighter in the middle and fading as they climb
  - colour from `--color-lime`; device pixel ratio capped at 2
  - animates only while on screen; `prefers-reduced-motion` draws one still frame
  - `aria-hidden`, ignores the pointer
- `components/SiteFooter.tsx`: the canvas sits behind the cropped WILDWARD wordmark. The wordmark block gets `clamp(4rem, 9vw, 8rem)` top padding so the lines show above the letters, and they fade out before any text.
- No API change, so no `openapi:export` or `contracts:generate`. No new package, no CSP change.

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck` / `npm run lint` | pass / pass |
| frontend `npm run test:e2e` with `E2E_DATABASE_URL` → Postgres.app `wild_e2e` on 5432 (includes `next build`, axe, CSP, reflow) | **45 passed, 3 skipped** (skips by design, as before). The first try without `E2E_DATABASE_URL` failed at start-up because the default points at Docker on 5433, which was not running. |
| Playwright on the dev site (`/about` footer) at 1512×861, 360×780, and 1280×800 with reduced motion | canvas draws at all three. The frames differ after 0.7 s with normal motion and are identical with reduced motion. 0 px horizontal overflow, no console errors from the footer. |

**Known gaps:**
- The look was checked in headless Chrome only (device pixel ratio 1), not on a Retina screen or in Safari/Firefox.
- One run logged a single unrelated 404 on `/about`, which did not happen again on a second load (the canvas makes no requests).

## 2026-11-22: Profile hero: name and whole photo on one screen (owner request, D-035)

**Problem (owner's screenshot, 1512×861 window):** the photo started below the fold, was cropped to 21:9 (a portrait orangutan became a blurry close-up), and the name scrolled away before the photo was in view.

**Frontend (`RedList-frontend`):**
- `components/Photo.tsx`: new optional `fit` (the photo's own width and height) and `className`. With `fit` the photo is drawn uncropped at its own aspect ratio, no wider than its column and no taller than `--photo-max-h`. Without it nothing changes, so cards and the home hero are unaffected.
- `app/species/[slug]/page.tsx`: the hero is a grid. From `lg`: name, scientific name, compare and key facts on the left (5fr), the photo on the right (7fr), right-aligned. Key facts become label/value rows there. Below `lg` it stacks (name, photo, facts) as before. Display name at most 5.5rem stacked and 6rem side by side (was 7.5rem). No-photo placeholder is capped to the same height.
- `globals.css`: `.profile-hero` sets `--photo-max-h`: `min(45svh, 40rem)` stacked; `max(18rem, 100svh − nav − 10rem)` from `lg`.
- No API change, so no `openapi:export` or `contracts:generate`.

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck` / `npm run lint` | pass / pass |
| frontend `npm run test:e2e` (includes `next build`; Postgres.app `wild_e2e` on 5432) | **45 passed, 3 skipped** (skips by design, as before) |
| Playwright screenshots of the dev site (`:3000`) for orangutan, emperor penguin, whale shark, tiger and elkhorn coral (no photo), at 1512×861, 1280×680 and 390×750 | 0 px horizontal overflow everywhere. At 1512×861 and 1280×680 the name and the whole photo with its credit are inside the first screen for all five. At 390×750 the whole photo fits for 4 of 5; the orangutan (two-line name) overshoots by about 10 px. |

**Known gaps:**
- On small phones a two-line name plus a portrait photo can still need a short scroll to see the photo's bottom edge.
- Small source photos are enlarged somewhat (orangutan original 400×518, shown about 486 px wide on desktop). A larger licensed photo would fix that.

## 2026-11-22: "Signal" visual redesign of the web app (owner request, D-034)

**Scope:** the frontend's look, rebuilt from `docs/STITCH_PROMPT.md` and the owner's reference screenshot. Black canvas, navy panels, acid lime `#D9FE8F`, Anton display type, Space Mono UI text, Inter body text, square corners. Only the look changed: routes, data, wording rules and the accessibility target are as before. No API change, so no `openapi:export` or `contracts:generate`.

**Frontend (`RedList-frontend`):**
- `globals.css`: new tokens (`canvas`, `panel`, `raised`, `rule`, `lime`, `fog`, `muted`, `alert`), a `type-display` utility, and shared classes (`btn-*`, `field`, `panel`, `chip`, `notice`, `kicker`, `h-page`, `h-section`, `info-body`). MapLibre controls are restyled. One load animation: the hero's WILD / WARD rise in, and `prefers-reduced-motion` turns it off.
- **Fonts:** self-hosted from npm (`@fontsource/anton`, `@fontsource/space-mono`, `@fontsource-variable/inter` 5.3.0, OFL), imported in `layout.tsx`. The CSP is unchanged (`font-src 'self'`).
- **Shell:**
  - lime announcement bar linking to the methodology
  - header: an original line-art mark, the four nav links with the current page underlined (`aria-current`), and a "Comparing 2 of 3" counter while species are picked
  - footer: three columns and a cropped giant wordmark (decorative, `aria-hidden`)
- **Pages:**
  - home: full-bleed hero, where the catalogue's own licensed photo with its credit sits between giant WILD / WARD; the threatened grid now loads 5 cards so the large first card fills the grid
  - explore (sidebar filters with status swatches, sticky Apply), profile (sticky numbered list of the eight questions, 21:9 photo, key-facts strip, assessment rows with a status-coloured edge, population cards), compare (lime "not directly comparable" band, giant 0/3 empty state), map (dark basemap, lime country shading, white hatched ranges, sticky map on desktop)
  - regions, support, sources (numbered ledger), the four information pages (shared long-reading layout with an "On this page" list; methodology shows the nine badges), 404, error
  - staff: "Staff area" strip, sign-in panel, staff tabs, state chips, checklist ticks
- New components: `SectionHead`, `Pagination`, `shell/Mark`, `shell/NavLinks`, `shell/CompareCounter`.
- `e2e/release.spec.ts`: `tabTo()` reads `textContent` instead of `innerText`, because `innerText` applies CSS `text-transform` (nav and buttons are uppercase only in CSS).

**Backend docs:** D-034 in DECISIONS; PLAN §4 "Style" points to it; DATA_SOURCES lists the fonts.

**Commands run, with results:**
| Command | Result |
|---|---|
| frontend `npm run typecheck` / `npm run lint` | pass / pass |
| frontend `npm run test:e2e`, first run | **42 passed, 3 failed, 3 skipped.** Failures: axe `label-content-name-mismatch` on the header counter (its `aria-label` did not contain the visible "[2/3]"), on 11 pages in both projects; reflow on `/` at 320 px (9 px overflow: an environment row could not shrink). Both fixed. |
| frontend `npm run test:e2e`, second run (includes `next build`) | **45 passed, 3 skipped** (the skips are by design, as before) |
| Playwright screenshots of the dev site (`:3000`, real catalogue) at 1440, 640, 360 and 320 px | every public page and `/admin` at 0 px horizontal overflow; one earlier 1170 px overflow on the mobile profile (grid track widened by the section bar) was fixed with `minmax(0,1fr)` |
| WCAG contrast, computed | on black: body 15.3:1, secondary 8.3:1, lime 18.5:1, errors 9.2:1; secondary on navy 6.7:1 |

The e2e suite ran against Postgres.app (`E2E_DATABASE_URL` pointing at a new `wild_e2e` database on port 5432), not Docker, because Docker was not running. `e2e:prepare` creates and wipes only a database whose name contains `e2e`.

**Known gaps:**
- The signed-in staff screens were checked by axe (`a11y-extra`), not by eye; only the sign-in screen was screenshotted.
- No scroll-spy on the profile's section list: it shows all eight, not the one in view.
- The previous style exists only outside the repo (owner's copy) and in git history.
- Manual checks are still open: VoiceOver and zoom (`docs/launch/A11Y_MANUAL_CHECK.md`).

## 2026-11-22: Ecology and geography for all 40 batch-1 species (owner request, web search)

**Scope:** at the owner's request the agent searched the web (no approved-site list) for where each species lives, its habitat, diet, threats and a population figure, and loaded them as **drafts** through the normal import. Nothing was published; no IUCN page was read.
- `catalogue/batch-1.json`: per species a `facts-<slug>` source (URL of the page used, licence "not stated", facts restated in our own words), country or ocean rows, habitats, threats, `editorial.diet`, citations, and a population estimate where a source gave a clear figure. 7 species first got country rows with their own `range-*` sources earlier the same day.
- `src/cli/seed-vocab.ts` and `npm run db:seed:vocab`: our own habitat (21) and threat (18) lists, codes start with `w-`. **They are not the IUCN schemes** (licence still pending). Run it on every database before importing.
- Maps: no range polygons. The map shows country- and ocean-level presence from the region rows, labelled as such.
- Import dry-run then apply: 255 changes, 40 species, drafts only.
- `npm run typecheck` and `npm run lint` pass. `npm test`, `validate:catalogue` and the browser were not run.

**Second pass (same day, owner asked for no empty fields):** every one of the 40 drafts now has countries or oceans, habitats, threats, diet and at least one population estimate. Where sources disagree the estimate is a range of their lowest and highest figures (elephant, gorilla, red panda, condor, koala); where nobody publishes a count it is a `qualitative` estimate in words (sharks, bluefin, monarch, bumble bee, amphibians, coral, giant clam, coconut crab, sturgeon). Nothing was invented. `validate:catalogue` passes on the published records.

**Published (same day, owner said "yes publish"):** `scripts/publish-drafts.mjs --only=<the 40 batch-1 slugs>` submitted and published all 40 through the staff API as the owner admin (self-review): 40 published, 0 failed. `validate:catalogue` passes. Three older drafts not made in this task (ambystoma-mexicanum, eretmochelys-imbricata, panthera-uncia) were left unpublished for the owner to check. The admin password was typed in chat; the owner should change it.

**Known gaps / caveats**
- Facts are second-hand from web search and not checked against IUCN. Where sources disagree the list is partial and the source note says so (elephant, cheetah, black rhino, snowy owl). Unknown stays unknown: no population figure for elephant, gorilla, red panda, polar bear (existing), sharks, bluefin, monarch, bumble bee, condor and others.
- Nesting-female and breeding-pair figures use basis `other` or `breeding_pairs`, so compare may not mix them with whole-population counts.
- Climate is still empty for all 40. Replace web-search sources with primary ones before any public launch.

## 2026-11-21: R1-L Launch readiness
**Scope:** the R1 launch-readiness task (CLAUDE_TASKS "R1-L"): status-check sheet and import, CI, the manual accessibility checklist, the user-testing script, and the owner review list. **Nothing was deployed or pushed, and no IUCN page was read.** Decisions: D-032 (status check), D-033 (CI).

### What changed
**Backend:**
- **Status check** (`src/import/status-check.ts`, `src/cli/status-check.ts`):
  - `npm run status:sheet` builds `docs/launch/status-check.csv`. It keeps any values already filled in and refreshes the table in `STATUS_CHECK.md`.
  - `npm run status:import -- <csv> --dry-run | --apply` writes checked rows into **drafts only**, citing "IUCN Red List, checked by hand". The tool never fills in a value.
- `e2e:prepare` creates an e2e-only admin when `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` are set. This happens only in a database named `*e2e*`.
- `.github/workflows/ci.yml`: job `checks` (install, typecheck, lint, openapi drift, tests against a PostGIS service, build) and job `e2e` (clones the frontend, runs its contracts drift check and Playwright).
- New test file `test/integration/status-check.spec.ts`: 9 tests.

**Frontend:**
- `.github/workflows/ci.yml`: one job. It clones the API, then runs install, typecheck, lint, the contracts drift check, build and Playwright.
- New `e2e/a11y-extra.spec.ts`:
  - reflow at 320 and 640 px
  - axe structure rules
  - keyboard sign-in, then axe on the five staff pages
- New `e2e/staff.ts` holds the test-only credentials; `playwright.config.ts` passes them to the e2e API.
- **Accessibility fix found by the new check:** the scrollable "Reference ids" list in the revision editor could not be reached by keyboard (axe `scrollable-region-focusable`, serious). It now takes focus and has a label.
- `/privacy`: staff sessions also store session times and the user-agent; the draft text omitted them.

**Docs:**
- New `docs/launch/`:
  - `STATUS_CHECK.md` and `status-check.csv`: **43 rows**, one per real published species, all with an IUCN taxon ID. Editions cited: 2022.2 ×34, 2021.3 ×7, 2025.2 ×1, not stated ×1 (emperor penguin). Owner columns are empty.
  - `A11Y_MANUAL_CHECK.md`, `USER_TASKS.md`, `OWNER_REVIEW.md`
- Updated: DECISIONS (D-032, D-033), TESTING, ARCHITECTURE, DATA_SOURCES, BACKLOG (CI removed), AGENTS.md commands, both READMEs.

### GitHub free-minutes check (D-033)
- **Source:** GitHub Docs, "GitHub Actions billing", read 2026-11-21.
- **Free for public repositories:** standard GitHub-hosted runners are free in public repositories. Larger runners are billed.
- **Without a payment method,** usage beyond the allowance is blocked, not charged.
- **Both repositories are public** (public GitHub API, same day).
- **Result:** no cost, so no need to stop and ask. If a repo becomes private, re-check.

### Commands run, with results
| Command | Result |
|---|---|
| backend `npm run typecheck` / `lint` / `build` | pass / pass / pass |
| backend `npm test` | **250/250 pass**, 16 suites (241 before + 9 new) |
| first `status-check.spec.ts` runs | failed twice, both on test setup: an estimate together with `population.unknown` failed the checklist; a raw `pg` date compared as a string. Fixed the tests; then 9/9 |
| backend `openapi:export` + `git diff --exit-code openapi.json` | no drift |
| frontend `contracts:generate` + `git diff --exit-code src/contracts/api.d.ts` | no drift |
| `npm run status:sheet` (local `wild` database; read-only) | 43 rows written, 0 filled in |
| `npm run validate:catalogue` (local `wild`) | **PASS**: 49 published (43 real + 6 fixtures), 78 cited numeric claims, 41 approved images, 1176 compare pairs |
| frontend `npm run typecheck` / `lint` | pass / pass |
| first `a11y-extra.spec.ts` run | 2 pass, 1 fail as intended (the scrollable list above); fixed, then 3/3 |
| frontend `npm run test:e2e` (full) | **45 passed, 3 skipped**. The skips are by design: `a11y-extra` sets its own viewports and runs only in the desktop project. |
| **CI rehearsal:** fresh `git clone` of both repos plus this session's uncommitted files, running the workflow commands in order | `npm ci`, typecheck, lint, test (250/250), build: pass (backend). `npm ci`, typecheck, lint, contracts drift, build, `test:e2e` (45 passed, 3 skipped): pass (frontend). The openapi drift step first failed with "DATABASE_URL undefined" because the rehearsal script did not set the job-level `DATABASE_URL` that the workflow sets; re-run with it: pass. |
| YAML parse of both workflows | ok (backend: 2 jobs; frontend: 1 job) |

**Gate status:**
- **CI on a pushed branch: not run.** The owner commits and pushes (AGENTS.md), and the agent has no `gh` CLI. The same commands pass in the local rehearsal above.
- **First real run:** on the owner's push to `develop`. Things that could still differ on GitHub:
  - pulling `imresamu/postgis:16-3.4` as a service
  - whether the runner image already has Google Chrome (the step installs it if not)
- The four launch documents exist, and the gate commands pass.

### Owner actions still open
1. **Status check:** fill in `docs/launch/status-check.csv` from the IUCN pages. Then run `status:import --dry-run`, then `--apply`. Review and publish each draft.
2. **Push both repos,** so CI runs for the first time. Report the result; it has not been recorded.
3. **Run `docs/launch/A11Y_MANUAL_CHECK.md`** (VoiceOver, zoom, reading order). Results are not recorded.
4. **Run `docs/launch/USER_TASKS.md`** with 3–5 testers. Results are not recorded. Preconditions:
   - task 5 needs at least one reviewed support link, and the local directory is **empty**
   - only the hawksbill sea turtle has country rows, so task 3 uses it
5. **Approve `docs/launch/OWNER_REVIEW.md`:**
   - the texts: support criteria, privacy, terms, about, methodology, status-check note
   - operator and contact (`NEXT_PUBLIC_CONTACT_URL`), name, domain and trademark check
   - jurisdiction and privacy law, log retention, licence of our own text, a corrections route, IUCN terms
   - rotating `REVALIDATE_SECRET`

### Known gaps
- 42 of 43 real species have no country or ocean rows, so "where does it live" shows nothing for them. Habitats, threats and ranges are still empty (licences pending).
- The `iucn_search_url` format is untested, because the agent cannot open iucnredlist.org. The owner pastes the real assessment URL they read.
- Admin editing and publishing are still not driven end to end in the browser; only accessibility and keyboard sign-in are.
- Restart any dev API that runs from `dist/`, because it was rebuilt.

**Next:** finish the owner actions above. Public deployment needs separate, explicit authorization. R2 starts only when asked.

## 2026-11-21: M5 Release verification (final R1 report)
**Scope:**
- accessibility pass: axe plus a keyboard-only walkthrough
- security headers and a nonce-based CSP
- production Docker stack with a private database network, Nginx and health checks
- backup and restore scripts for PostgreSQL and media, with a backup → wipe → restore rehearsal
- the PLAN §13 documents
- a fresh-clone check of both repos

SEO (metadata, sitemap, robots, canonical URLs, JSON-LD) was already done before M5 (D-028), and the suite re-verified it. Decisions: D-029 to D-031. **Nothing was deployed publicly.**

### What changed
**Frontend:**
- `src/proxy.ts`: a CSP with a per-request nonce (`script-src 'self' 'nonce-…' 'strict-dynamic'`). The root layout calls `connection()`, so every page renders per request.
- `next.config.ts`: adds `Cross-Origin-Opener-Policy` and a tighter `Permissions-Policy`.
- **Accessibility fixes found by axe:**
  - status badge year and scope text used `opacity-90`, which fell below AA contrast
  - citation markers `[n]` and region links on profiles were under the 24 px target size (WCAG 2.5.8)
- `e2e/release.spec.ts` (new):
  - axe on 18 core pages
  - CSP checks, including the map rendering under the policy
  - a keyboard-only journey
- `Dockerfile` (standalone output) and `.dockerignore`.
- `.env.example`:
  - **it held a 64-hex `REVALIDATE_SECRET` that equals the owner's local `.env.local`**; now a placeholder
  - `API_INTERNAL_URL` port 4010 → 4000, which the README needs
- New dev dependency `@axe-core/playwright` 4.14.0 (MPL-2.0, free).

**Backend:**
- `apiHelmetOptions()`: in production a deny-all CSP and `X-Frame-Options: DENY`; HSTS is removed from the API (Nginx owns it).
- `TRUST_PROXY` setting (keywords only, validated).
- `src/common/load-env.ts` replaces every direct dotenv call (D-031).
- `Dockerfile`, `.dockerignore`.
- `deploy/`: `docker-compose.prod.yml`, `compose.sh`, `.env.prod.example`, `nginx/` (`http.conf`, `https.conf`, shared snippets).
- `scripts/backup.sh` and `scripts/restore.sh`.
- `test/unit/security-headers.spec.ts` (8 tests).

**Docs:**
- new: `DEPLOYMENT.md` (with the restore runbook and migration rollback limits), `TESTING.md`, `ADMIN_GUIDE.md`, `METHODOLOGY.md`
- updated: README (both repos), AGENTS.md commands, ARCHITECTURE, DATABASE (M5 measurements), DECISIONS, BACKLOG, CLAUDE_TASKS
- every PLAN §13 document now exists: README, ARCHITECTURE, DATABASE, DATA_SOURCES, METHODOLOGY, ADMIN_GUIDE, DEPLOYMENT, TESTING, DECISIONS, COMPLETED_TASKS, BACKLOG, `.env.example` (plus `deploy/.env.prod.example`)

### Commands run, with results
Environment: macOS arm64, Docker Desktop 29.9.3, Node 24.19, Chrome stable.

**In the working repos:**
| Command | Result |
|---|---|
| backend `npm run typecheck` / `lint` / `build` | pass / pass / pass |
| backend `npm test` | **241/241 pass**, 15 suites |
| frontend `npm run typecheck` / `lint` | pass / pass |
| frontend `npm run test:e2e` (includes `npm run build`) | **42/42 pass** (21 tests × desktop and 360px) |
| first `release.spec.ts` run | failed, as intended: axe found serious contrast and target-size violations on 7 pages; fixed, then 6/6 pass |

**Production stack** (throwaway project `wildward-rehearsal` on `127.0.0.1:8088`, random secrets never printed):
| Command | Result |
|---|---|
| `./deploy/compose.sh build`, then `up -d --wait` | the first try failed: `migrate` could not read `drizzle/meta`, which is `0700` in the working copy. Fixed with `COPY --chmod=755`. A second issue was a wrong Nginx mount path. After both fixes, db, api, web and nginx were healthy and migrate exited 0. |
| network checks | `db_net` and `app_net` internal; db has no published port and no DNS or route out; the web container cannot resolve `db`; the api reaches it; only nginx publishes a port |
| through Nginx | `/`, `/species`, health, robots, sitemap 200; `/api/docs` and `/api/revalidate` 404; page CSP with nonce; API deny-all CSP; basemap gzip 573 kB → 198 kB |
| `nginx -t` with `https.conf` and a throwaway self-signed certificate | syntax ok (not tested with a real certificate) |
| content | in the container: `seed-regions` (177 + 29) and `admin-create`. Imported `catalogue/pilot.json` (45 changes) and `batch-1.json` (562). Over HTTP through Nginx: no CSRF → 403, foreign Origin → 403; 41 images approved and 43 drafts published (rehearsal data only, deleted afterwards). The first publish attempt hit Nginx's 429 at 20 r/s; the limits were raised and images exempted (D-030). |
| `validate-catalogue.js` in the container | **PASS**: 43 species, 64 numeric claims, 41 images, 903 compare pairs |

**Backup → wipe → restore rehearsal:**
| Step | Result |
|---|---|
| `scripts/backup.sh` | 2 s; `db.dump` 0.7 MB and `media.tar.gz` 15 MB, both verified; manifest: 43 published, 43 revisions, 41 media, 206 regions, 2 staff users, 474 audit events, 156 WebP files |
| `./deploy/compose.sh down -v` | both volumes removed; the fresh stack had 0 species and 0 files, and the snow leopard profile gave 404 |
| `scripts/restore.sh <dir>` without `--yes` | refused, exit 2 |
| `scripts/restore.sh <dir> --yes` | 30 s; checksums OK; every count equal to the manifest |
| after the restore | all services healthy; `validate-catalogue` PASS; `/species/panthera-uncia` renders and its photo is 200 `image/webp`; the API lists 43; staff login 200 |
| second restore | added `ANALYZE` after seeing the planner estimate 1 row per table; a re-run gave correct statistics (43 rows) and identical counts |
| teardown | rehearsal stack and volumes removed, `deploy/.env.rehearsal` deleted. The backup stays in this session's scratchpad. |

**Measurements:** p50/p95/p99 for 9 public endpoints on the 43-species catalogue. Every p95 is ≤ 10.1 ms, single client and no load. Conditions are in DATABASE.md "M5 measurements". This is not a load test.

**Fresh-clone check:**
- **Method:** `git clone` of both repos into the scratchpad, plus this session's uncommitted files, so it matches the commit the owner will make. Set up from the READMEs only.
- **Deviations:** a separate `wild_fresh` database, and ports 4020/3020, because 3000 and 4000 were already in use on this machine.

| Step | Result |
|---|---|
| backend: `npm install`, `db:up`, `db:migrate`, `db:check`, `db:seed:regions`, `db:seed:fixtures`, `admin:create`, `typecheck`, `lint`, `build` | all pass |
| backend `npm test`, first run | **51 failed**: the clone's `.env` leaked into the tests (D-031) |
| backend `npm test` after the fix | **241/241** |
| backend `openapi:export` | no drift |
| frontend: `npm install`, `contracts:generate` (no drift), `typecheck`, `lint`, `build` | all pass |
| `npm start` / `next start` | every page 200; fixture species listed |
| frontend `npm run test:e2e` from the clone | **42/42** |
| cleanup | `wild_fresh` dropped |

### Working features (R1)
- **Public site:**
  - home, Explore (search, filters, URL state), profiles (eight sections, Unknown states, citations, photo credits), compare (up to 3, no scores, "Not directly comparable")
  - map (list first, works without tiles), region pages, support directory
  - about, methodology, sources, privacy and terms pages
  - sitemap, robots, Open Graph, JSON-LD
- **Staff area:**
  - sign-in with sessions, CSRF, Origin checks and throttling
  - draft → submit → publish with the checklist and optimistic concurrency
  - rollback, source edits, media upload and review, support directory admin
- **Tools:** import CLI (idempotent, `--reconcile`), `links:check`, `validate:catalogue`.
- **Operations:** production compose, Nginx, health checks, CSP and headers, backup and restore (rehearsed).
- **Accessibility:** axe finds no serious or critical violations on 18 core pages, and the core journey works by keyboard, at desktop and 360px.

### Remaining issues
- **Owner actions:**
  - rotate the local `REVALIDATE_SECRET`. The old value is in the frontend repo's git history; it only ever protected local revalidation, but never reuse it.
  - confirm the `/support` review criteria (D-018) and the privacy and terms wording (D-028)
  - decide whether to name an operator
- **Content:**
  - the status of all 43 species comes second-hand from Wikidata (D-027)
  - some population figures come from Wikipedia
  - trend is Unknown everywhere
  - Replace these with checked primary sources before any launch.
- **Untested or missing:**
  - TLS has not served real traffic (only `nginx -t`)
  - no CI; every result above was run by hand
  - no admin end-to-end tests
  - no screen-reader or zoom pass by a person (TESTING.md "Manual checks")
  - no load test
- **Known limits:**
  - styles allow `'unsafe-inline'` (D-029)
  - the login throttle is in memory, which is fine with one API process
  - media lives on a local volume only (no S3 adapter)
- **Not built (open in ARCHITECTURE):** the form-based draft editor (D-011), staff invites and management, a screen for the audit log.
- **Editorial JSONB:** the migration hook exists, but there is no v2 yet, so the migration path itself is untested (TESTING.md).
- The local `dist/` was rebuilt; restart any dev API that runs from `dist/` (for example the one on :4010).

### Unavailable data or integrations
| Data | Status |
|---|---|
| IUCN Red List pages and API | not read by the agent (`robots.txt` disallows it; 403); permission pending |
| IUCN habitat and threat classification lists, IUCN range polygons | licences pending, so empty in production |
| Marine Regions | licence pending, not imported (D-020) |
| Paid services (tile providers, storage, monitoring) | none used; the owner's rule is free and legal only |

### Recommended next milestone
- **Before R2, an R1 launch-readiness task:**
  1. replace the second-hand status citations with hand-checked IUCN citations
  2. add a CI pipeline (BACKLOG)
  3. run the manual screen-reader pass and user tasks with 3–5 testers (PLAN §11)
  4. have the owner review the legal and policy texts
- **Only after that,** and with the owner's explicit authorization: a public deployment on a host following DEPLOYMENT.md.
- **R2** (accounts, collections) starts only when the owner explicitly asks (PLAN §12).

## 2026-11-21: Real catalogue batch 1 (40 species, owner request, after M4)
**Scope:** 40 more real species, gathered and published the same way as the pilot (`catalogue/batch-1.json`, photos in `catalogue/media/`).
- **Sources per species:**
  - GBIF Backbone: accepted name, taxonKey and rank
  - Wikidata: IUCN category from P141 with the edition it references; trend stays Unknown
  - WoRMS through GBIF: environments, where listed
  - Wikimedia Commons: one photo, with licence and creator checked through the API `extmetadata`
  - English Wikipedia: population figures, approved by the owner for this portfolio (see DATA_SOURCES)
  - Overviews are written in our own words.
- **Published:** 40 of 40 drafts submitted and published as the owner admin, through the normal workflow and checklist. 38 images were approved.
- **No photo:** Elkhorn coral (*Acropora palmata*) and Lord Howe Island stick insect (*Dryococelus australis*). No allow-listed Commons file names a creator.
- **Population figures (13):**
  - giant panda, eastern gorilla, red panda, polar bear, cheetah, black rhinoceros, vaquita
  - whooping crane, Philippine eagle (Philippines, breeding pairs), snowy owl, Atlantic puffin (Europe, qualitative)
  - Komodo dragon, kakapo
  - The other 27 species show population Unknown.
- **Other notes:**
  - The emperor penguin's Wikidata status statement has no reference; its source note says so.
  - The kakapo uses the GBIF accepted name *Strigops habroptila*.
  - Green turtle, tuatara, Atlantic bluefin tuna and monarch butterfly show Least Concern, because that is what Wikidata cites.
- **Commands run:**
  - `npm run import -- catalogue/batch-1.json --dry-run`: 562 changes
  - `--apply`: 562 changes; `--apply` again: **0 changes**
  - one-off approve/submit/publish script (deleted): 38 images approved, 40/40 published
  - `npm run validate:catalogue`: **PASS**. 49 published species, 78 cited numeric claims, 41 approved images, 1176 compare pairs with zero mixed units.
- **Known gaps:**
  - Population trend is Unknown everywhere.
  - Habitats, threats and range maps are empty (licences pending).
  - Wikidata and Wikipedia are second-hand citations, to be replaced by primary sources before any public launch.

## 2026-11-21: Information pages and SEO (owner request, after M4)
**Scope:** the five missing information pages and SEO (D-028).
- **Backend:** public `GET /api/v1/sources` and `GET /api/v1/sitemap`, published content only. Two new tests in `quality.spec.ts` check that drafts never appear and that a hidden species' region (Peru) is left out of the sitemap.
- **Frontend:**
  - `/about`, `/methodology`, `/sources`, `/privacy` and `/terms`, using a shared `InfoPage` layout
  - `sitemap.xml` and `robots.txt`
  - Open Graph and Twitter defaults; profiles use their licensed photo
  - JSON-LD `Taxon` and `BreadcrumbList` on profiles, `WebSite` + `SearchAction` on the home page
  - canonical link on the home page
- **Commands run:**
  - backend `npm run typecheck` / `lint` / `build`: pass; `npm test`: **233/233** (14 suites)
  - `openapi:export` → frontend `contracts:generate`
  - frontend `typecheck` / `lint`: pass; `npm run test:e2e`: **36/36** (new `pages.spec.ts`: 4 tests × desktop and 360px)
- **Known gaps:**
  - No operator name or contact: set `NEXT_PUBLIC_CONTACT_URL` for a contact link.
  - The privacy and terms texts are the agent's drafts for the owner to review before any public launch.
  - The dev API on :4010 runs `dist/`; restart it so `/sources` works locally.

## 2026-11-21: M4 Content operations (tooling and a 3-species real pilot)
**Scope:** media upload and review, import CLI, rollback, source editing, `links:check`, `validate:catalogue`, photos on public pages, and a real-catalogue pilot. Decisions D-022 to D-027.

**Owner decisions this session:**
- Build the tooling now and prove it with a 2–3 species real pilot; the 20–30 profile catalogue is the next session.
- IUCN pages could be summarized by hand. In practice the agent could not read them (below), so the owner chose Wikidata as a cited, second-hand source for the status.
- The standing rule still holds: nothing that costs money or risks the law.

**Backend:**
- **Migrations:**
  - `0004_media_import.sql` (generated): media sha256, variants, licence URL, modifications, uploader and reviewer; table `import_records`
  - `0005_media_rules.sql` (hand-written): an approved image must have a creator, a credit and an allow-listed licence
- **`src/media/`:**
  - `StorageAdapter` with local disk (`MEDIA_DIR`)
  - `sharp` pipeline: magic bytes, decoder agreement, pixel cap, auto-rotate, WebP variants, metadata stripped, original not kept
  - staff routes: upload (multipart), list, get, preview, edit, approve and reject (admin)
  - public `GET /media/:key/:width.webp`
  - rejected images disappear from profiles and cards at once (D-022)
- **Rollback:** `POST /staff/species/:id/rollback` (admin, optimistic check, audited, revalidates; D-024).
- **Source editing:** `PUT /staff/sources/:id`; a source cited by a non-draft revision becomes a new row (D-025).
- **`src/common/safe-fetch.ts`:** SSRF-safe fetcher (D-026), used by the import downloads and the link checker. Optional `FETCH_CONTACT` for the User-Agent.
- **`npm run import`** (`src/import/`): zod-validated JSON, drafts only, one transaction per file, Markdown report, idempotent per section, manual edits protected unless `--reconcile` (D-023). The `EditorialService` write methods now accept an outer transaction.
- **`npm run links:check`:** records status, retries HEAD with GET, never disables a link, one audit event per run.
- **`npm run validate:catalogue`** (`src/quality/`) checks:
  - no drafts reachable
  - the checklist re-run on every live revision
  - numeric claims cited
  - images approved, allow-listed and present on disk
  - compare units
  - no fixtures in production
- **Fixtures:** a generated CC0 test pattern (not a photograph) is uploaded and approved through the real media workflow and attached to *Fictus captivus*. `e2e:prepare` wipes its own `storage/media-e2e`.
- `openapi.json` re-exported; frontend contracts regenerated.

**Frontend:**
- `next/image` with a custom loader that only builds same-origin `/api/v1/media/…` URLs (no optimizer, no remote hosts).
- `Photo` component with credit, a licence deed link and a source link. Used on the profile hero, the cards (with a credit line) and the home hero (first threatened species with an approved photo).
- `/admin/media`:
  - upload form with an allow-list licence picker
  - review queue filtered by state, with staff previews
  - Approve / Reject (admins), and edit credit or licence (sends it back to review)
- `/admin/species/[id]`: "Make this version live again" (admin, asks for a reason). A "Media" link in the staff nav.
- `staff-api.ts`: multipart upload with the CSRF header, plus media, rollback and source-edit methods.

**Real-catalogue pilot** (`catalogue/pilot.json`, 3 species):
| Species | Status (cited) | Population | Environment | Photo (checked on Commons, 2026-11-21) |
|---|---|---|---|---|
| Snow leopard, *Panthera uncia* (GBIF accepts *Uncia uncia*; both names shown) | VU, via Wikidata Q30197 → IUCN Red List 2022.2 | Unknown | **not set**: no checked source | Bernard Landgraf, CC BY-SA 3.0, own work; EXIF artist matches |
| Axolotl, *Ambystoma mexicanum* | CR, via Wikidata Q22718 → IUCN 2022.2 | Unknown | freshwater (WoRMS via GBIF) | Monika Korzeniec, CC BY-SA 3.0, own work. "Axolotl Wild Type.jpg" was **rejected**: its EXIF says "Alle Rechte vorbehalten" against its CC BY-SA declaration |
| Hawksbill sea turtle, *Eretmochelys imbricata* | CR, via Wikidata Q203538 → IUCN 2022.2 | Unknown | marine (WoRMS via GBIF) | Diego Delso, CC BY-SA 4.0, own work; EXIF says CC-BY-SA |

- **Facts and their sources:** the classification comes from the GBIF Backbone Taxonomy (CC BY 4.0, DOI 10.15468/39omei, read from the GBIF API). The overviews are our own short sentences, built only from those cited facts.
- **Not verified, so left empty or Unknown:**
  - population for all three
  - trend for all three (Wikidata gives none)
  - assessment dates
  - countries and regions for all three
  - habitats and threats (IUCN classification licence pending)
  - diet and climate
  - the snow leopard's environment
- **Second-hand:** every status is cited via Wikidata, not IUCN. The IUCN taxon IDs (22732, 1095, 8005) also come from Wikidata.
- **Where it stands:**
  - In the dev database the pilot exists as **three drafts, not published**, each passing the publication checklist.
  - It was imported from a text-only copy because Wikimedia answered HTTP 429 to image downloads (see below).
  - Publishing is left to the owner: the agent would otherwise be recorded as an independent reviewer of its own work.

**Why IUCN was not read:** `www.iucnredlist.org` returned 403, and its `robots.txt` disallows `ClaudeBot`, `anthropic-ai` and `Claude-Web`. The agent did not try to get around it (D-027).

**Commands run, with results** (macOS arm64, Docker PostGIS 16.4 / 3.4, Node 24.19, Chrome stable):
| Command | Result |
|---|---|
| backend `npm install sharp --save-exact` (0.35.5) and `-D @types/multer` | installed; sharp loads (libvips 8.18.7) |
| backend `npm run db:generate` → `0004_media_import.sql` (renamed, SQL reviewed); `drizzle-kit generate --custom` → `0005_media_rules.sql`; `npm run db:migrate` (dev) | applied |
| backend `npm run typecheck` / `lint` / `build` | pass / pass / pass |
| backend `npm test` | **231/231 pass**, 14 suites. New: content-ops (14), import (12), quality (4), safe-fetch unit (53). Two older attribution tests changed, because the database now refuses an *approved* NC image. |
| backend `npm run openapi:export`; frontend `npm run contracts:generate` | written |
| frontend `npm run typecheck` / `lint` | pass / pass |
| frontend `npm run test:e2e` (includes `npm run build`) | **28/28 pass** (14 tests × desktop and 360px). New `content.spec.ts`: 3 tests, outbound network blocked. |
| `npm run import -- catalogue/pilot.json --dry-run` | **failed**: HTTP 429 from upload.wikimedia.org (`Retry-After: 120`), also after waiting and retrying |
| `npm run import -- <scratch text-only copy of pilot.json>` `--dry-run` → `--apply` → `--apply` | 38 changes (nothing written) → 38 changes → **0 changes** |
| pilot draft checklists (one-off script, deleted) | 3/3 PASS |
| `npm run validate:catalogue` (dev) | **PASS**: 6 published species; drafts 6, checklist 6, numeric claims 14, images 0, compare pairs 15 |
| `npm run links:check` (dev) | ran; the dev database has no support links (fixture links are only in fresh databases). Logic covered by `quality.spec.ts`. |

**Gate evidence:**
- **Re-importing produces no changes:**
  - `import.spec.ts`: a second run changes nothing, including after review and publication; the same rows and `updated_at`, no new audit events
  - a section edited by hand is skipped and reported; `--reconcile` overwrites it and lists it
  - against real data: the pilot re-apply made 0 changes
- **Rollback works and is audited:** `content-ops.spec.ts`:
  - v2 → v1 on the profile and in the catalogue
  - one `species.rollback` audit event with from, to and the reason
  - revalidation of `species:<slug>` and `catalogue`
  - editors get 403 and requests without CSRF 403; drafts, other species and stale views are refused; a draft started before the rollback cannot be published over it
- **Credits and licences survive edits:** after editing the image (licence → CC BY-SA, credit changed) and the source (a new edition), the published profile still shows the original credit, licence and source. The edited source became a new row. A new draft snapshots the new credit and cannot be published until the image is reviewed again.
- **Profiles render with outbound network blocked:**
  - backend: profile, list, search, filters, compare, map ×2, basemap, region, support and an image are served with `fetch`, `https.request`/`get` and DNS lookups all throwing, and none of them was called
  - Playwright: on every fixture profile, the home page and Explore, every request that left `localhost:3110` was aborted, nothing tried to leave, photos loaded from `/api/v1/media/…`, credits were visible, and there was no overflow at 360px
- **Uploads:** SVG, HTML renamed `.jpg`, fake JPEG bytes, files over 15 MB, and NC, ND and all-rights-reserved licences are all refused. EXIF and GPS are gone from the variants (checked with sharp). Pending images give 404 publicly, approved 200, rejected 404 and gone from profiles and cards.
- **`validate:catalogue` passes** (dev and test). It fails as designed when a live image goes back to pending or a variant file is missing.

**Known gaps:**
- **Pilot photos:** resolved later the same day. The three verified Commons files were downloaded unchanged (HTTP 200 once the rate limit had cleared) into `catalogue/media/`, and `pilot.json` now points at them with `path`. `--apply` made 6 changes (3 images, 3 drafts' photo sections); a re-apply made 0. The images are **pending review**: approve them in `/admin/media`, then review and publish the three drafts.
- **Pilot population figures** (added later the same day, at the owner's request, from pages read on 2026-11-21):
  - snow leopard: 2,710–3,386 mature individuals and 7,446–7,996 in total (IUCN/SSC Cat Specialist Group page; no year given)
  - axolotl: about 50–1,000 adults (Wikipedia, citing CITES; second-hand)
  - hawksbill: no global total found; females nesting per year in Australia (8,000–10,000), Mexico (about 700) and Indonesia (1,000), from the U.S. National Park Service page (updated 2025-02-18), plus those three countries as nesting regions. The Seychelles figure was left out because the country is not in the 1:110m data. WWF's page refused access (403) and was not used.
  - The snow leopard's figures went into draft **v2**, which an admin had created empty, using `--reconcile`. v1 is now a stale draft. Publish v2.
- **Pilot content is still second-hand in places:** no population, trend, countries, habitats, threats, diet or climate; status via Wikidata. A person should check each status against IUCN by hand before launch (D-027).
- **The remaining 17–27 real profiles** (the next session): they need a primary source for status and population that the agent may read, or the owner's hand-checked notes.
- No S3 storage adapter (M5, D-022). Back up `MEDIA_DIR` with the database.
- Not built: staff invites and staff management (ARCHITECTURE lists them as open), the species archive endpoint, the form-based draft editor (D-011), CSV import (BACKLOG).
- No admin end-to-end test: the e2e stack has no staff login. The admin pages are covered only by typecheck, lint and the API tests.
- Query plans not re-measured (DATABASE.md).

**Next:** finish the pilot photos (above), then the real catalogue, then M5 (docs/CLAUDE_TASKS.md).

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
